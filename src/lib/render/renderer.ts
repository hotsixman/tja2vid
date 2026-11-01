import { lowerBound, stepAt, type Hit, type Judgement, type Playthrough, type RollState } from '../sim/autoplay';
import type { CharaState, ImageKey, ImageSource, LoadedSkin } from '../skin/types';
import type { Note, NoteType } from '../tja/types';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  /** Draw the song title in the top-right corner. */
  showTitle: boolean;
  /** Draw the skin's dancers (if it has any). Defaults to true. */
  showDancer?: boolean;
  /** Player nameplate; omitted = not drawn. */
  nameplate?: NameplateInfo;
  /** Max judgement texts on screen at once (newest kept). Defaults to 2. */
  maxJudgeTexts?: number;
  /** Max "+score" popups on screen at once (newest kept). Defaults to 10, like OpenTaiko. */
  maxScoreAdds?: number;
  /** Max hit explosions on screen at once (newest kept). Defaults to 1. */
  maxHitEffects?: number;
  /** Draw the skin's character (if it has one). Defaults to true. */
  showCharacter?: boolean;
  /**
   * Song loading screen shown before play, as a song-time range [start, end).
   * Play fades in over the loading screen right after `end`.
   */
  intro?: { start: number; end: number };
  title: string;
  subtitle: string;
}

export interface NameplateInfo {
  /** Player name shown on the plate. */
  name: string;
}

/** Anything that can draw one frame of the play at a given song time. */
export interface FrameRenderer {
  readonly width: number;
  readonly height: number;
  render(ctx: Ctx2D, songTimeMs: number): void;
}

// Timings (ms) for effects, roughly matching OpenTaiko's counters.
const JUDGE_MS = 410;
const EXPLOSION_FRAME_MS = 32;
const LANE_FLASH_MS = 160;
const DRUM_FLASH_MS = 150;
const FLY_MS = 420;
const SOUL_FLASH_FRAME_MS = 19;
const COMBO_POP_MS = 90;
const ROLL_LINGER_MS = 1000;
const MIN_COMBO_SHOWN = 10;
const INTRO_TRANSITION_MS = 450;
/** OpenTaiko's score bounce (13ms per step). */
const SCORE_SCALE = [1, 1.05, 1.1, 1.11, 1.12, 1.125, 1.12, 1.08, 1.065, 1.03, 1.015, 1];

interface CharaSegment {
  start: number;
  /** Ends at whichever comes first: `end` (ms) or `endBeat` (beat clock). */
  end: number;
  endBeat: number;
  state: CharaState;
  loop: boolean;
}

/** Column in Notes.png for each note kind. */
const NOTE_COL: Record<NoteType, number> = {
  don: 1,
  ka: 2,
  bigDon: 3,
  bigKa: 4,
  roll: 5,
  bigRoll: 8,
  balloon: 11,
  mine: 0,
};

/** Rows in SENotes.png. */
const SE = { Don: 0, Do: 1, Ko: 2, Kat: 3, Ka: 4, DON: 5, KAT: 6, Drumroll: 7, DRUMROLL: 10, Balloon: 11 } as const;

const COURSE_KEY: Record<string, ImageKey> = {
  Easy: 'courseEasy',
  Normal: 'courseNormal',
  Hard: 'courseHard',
  Oni: 'courseOni',
  Edit: 'courseEdit',
};

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** Picks the "Don/Do/Ko/Ka/Kat" text under each note, like the arcade does. */
function computeSeLabels(notes: Note[]): number[] {
  const labels = new Array<number>(notes.length).fill(-1);
  const hittable = notes.map((n, i) => ({ n, i })).filter(({ n }) => n.type !== 'mine');
  let doKoToggle = false;
  for (let k = 0; k < hittable.length; k++) {
    const { n, i } = hittable[k];
    const prev = hittable[k - 1]?.n;
    const next = hittable[k + 1]?.n;
    const halfBeat = 60000 / n.bpm / 2 - 1;
    const fastNext = next !== undefined && next.time - n.time < halfBeat;
    const fastPrev = prev !== undefined && n.time - (prev.endTime ?? prev.time) < halfBeat;
    switch (n.type) {
      case 'don':
        if (fastNext) {
          labels[i] = doKoToggle ? SE.Ko : SE.Do;
          doKoToggle = !doKoToggle;
        } else {
          labels[i] = SE.Don;
          doKoToggle = false;
        }
        break;
      case 'ka':
        labels[i] = fastNext || fastPrev ? SE.Ka : SE.Kat;
        doKoToggle = false;
        break;
      case 'bigDon':
        labels[i] = SE.DON;
        break;
      case 'bigKa':
        labels[i] = SE.KAT;
        break;
      case 'roll':
        labels[i] = SE.Drumroll;
        break;
      case 'bigRoll':
        labels[i] = SE.DRUMROLL;
        break;
      case 'balloon':
        labels[i] = SE.Balloon;
        break;
    }
    if (n.type !== 'don') doKoToggle = false;
  }
  return labels;
}

/**
 * OpenTaiko-style single-player renderer. Draws in the skin's native coordinate
 * space; callers scale the context to the output resolution.
 */
export class TaikoRenderer implements FrameRenderer {
  readonly width: number;
  readonly height: number;
  private readonly seLabels: number[];
  private readonly donHits: Hit[];
  private readonly kaHits: Hit[];
  private readonly laneFlashes: { hits: Hit[]; key: ImageKey }[];
  private readonly rollByNote = new Map<number, RollState>();
  private readonly clearTime: number;
  private readonly strips = new Map<string, OffscreenCanvas | null>();
  /** BPM change points with cumulative beat count, for beat-synced animation. */
  private readonly beatPoints: { time: number; bpm: number; beats: number }[];

  constructor(
    private readonly skin: LoadedSkin,
    private readonly play: Playthrough,
    private readonly opts: RenderOptions,
  ) {
    [this.width, this.height] = skin.manifest.resolution;
    this.seLabels = computeSeLabels(play.course.notes);
    this.donHits = play.hits.filter((h) => h.color === 'don');
    this.kaHits = play.hits.filter((h) => h.color === 'ka');
    this.laneFlashes = [
      { hits: this.donHits.filter((h) => h.source === 'note'), key: 'laneRed' },
      { hits: this.kaHits.filter((h) => h.source === 'note'), key: 'laneBlue' },
      { hits: play.hits.filter((h) => h.source !== 'note'), key: 'laneYellow' },
    ];
    for (const r of play.rolls) this.rollByNote.set(r.noteIndex, r);
    this.beatPoints = buildBeatPoints(play);
    const g = play.gauge.find((s) => s.value >= play.clearThreshold);
    this.clearTime = g ? g.time : Infinity;
    play.judgements.forEach((j, k) => {
      if (k + 1 === 50 || k + 1 === 300) this.faceLagStarts.push(j.time);
    });
    // Needs beatPoints and clearTime.
    this.charaSegments = this.buildCharaSegments();
  }

  // ---------------------------------------------------------------- helpers

  private img(key: ImageKey): ImageSource | undefined {
    return this.skin.images[key];
  }

  private draw(ctx: Ctx2D, key: ImageKey, dx: number, dy: number): void {
    const im = this.img(key);
    if (im) ctx.drawImage(im, dx, dy);
  }

  private drawRect(
    ctx: Ctx2D,
    key: ImageKey,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw = sw,
    dh = sh,
  ): void {
    const im = this.img(key);
    if (!im || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  /**
   * A texture pre-tiled into a canvas one tile larger than (w, h), so a scrolling
   * tiled fill becomes a single blit. Much cheaper than pattern fills per frame.
   */
  private strip(key: ImageKey, w: number, h: number): OffscreenCanvas | null {
    return this.stripOf(key, this.img(key), w, h);
  }

  private stripOf(name: string, im: ImageSource | undefined, w: number, h: number): OffscreenCanvas | null {
    const id = `${name}:${w}x${h}`;
    if (!this.strips.has(id)) {
      let c: OffscreenCanvas | null = null;
      if (im && typeof OffscreenCanvas !== 'undefined') {
        c = new OffscreenCanvas(Math.ceil(w + im.width), Math.ceil(h + im.height));
        const cctx = c.getContext('2d');
        if (cctx) {
          for (let y = 0; y < c.height; y += im.height) for (let x = 0; x < c.width; x += im.width) cctx.drawImage(im, x, y);
        } else c = null;
      }
      this.strips.set(id, c);
    }
    return this.strips.get(id) ?? null;
  }

  /** Fills a rect with a repeating texture, sampling it from (ox, oy). */
  private fillPattern(ctx: Ctx2D, key: ImageKey, x: number, y: number, w: number, h: number, ox = 0, oy = 0): void {
    const im = this.img(key);
    const s = this.strip(key, w, h);
    if (!im || !s) return;
    const sx = ((ox % im.width) + im.width) % im.width;
    const sy = ((oy % im.height) + im.height) % im.height;
    ctx.drawImage(s, sx, sy, w, h, x, y, w, h);
  }

  /** Horizontal distance (px) of an object at `time` from the judge position. */
  private dx(time: number, bpm: number, scroll: number, now: number): number {
    return ((time - now) * bpm * scroll * this.skin.manifest.layout.pxPer4Beats) / 240000;
  }

  private lastHitBefore(hits: { time: number }[], t: number): number {
    const i = lowerBound(hits, t + 0.0001) - 1;
    return i >= 0 ? hits[i].time : -Infinity;
  }

  /** Draws digits from a horizontal strip of 10 glyphs. */
  private drawDigits(
    ctx: Ctx2D,
    key: ImageKey,
    value: number,
    centerX: number,
    bottomY: number,
    spacing: number,
    scaleY = 1,
  ): void {
    const im = this.img(key);
    if (!im) return;
    const s = String(value);
    const w = im.width / 10;
    const h = im.height;
    const total = spacing * (s.length - 1);
    for (let i = 0; i < s.length; i++) {
      const d = s.charCodeAt(i) - 48;
      const cx = centerX - total / 2 + spacing * i;
      ctx.drawImage(im, d * w, 0, w, h, cx - w / 2, bottomY - h * scaleY, w, h * scaleY);
    }
  }

  // ---------------------------------------------------------------- frame

  render(ctx: Ctx2D, t: number): void {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // Bilinear: ~3x faster than 'high' on software canvases; identical at native resolution.
    ctx.imageSmoothingQuality = 'low';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const intro = this.opts.intro;
    if (intro && t < intro.end) {
      this.drawLoading(ctx, t);
      ctx.restore();
      return;
    }

    this.drawPlay(ctx, t);

    if (intro && t < intro.end + INTRO_TRANSITION_MS) {
      const p = (t - intro.end) / INTRO_TRANSITION_MS;
      if (this.skin.manifest.layout.loadingTransition === 'curtain') this.drawCurtain(ctx, easeOutCubic(p));
      else {
        ctx.globalAlpha = 1 - p;
        this.drawLoading(ctx, t);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  private drawPlay(ctx: Ctx2D, t: number): void {
    this.drawBackground(ctx, t);
    this.drawLane(ctx, t);
    // Lane frame (black borders) goes under bar lines, effects and notes, so hit effects overlap it.
    this.draw(ctx, 'taikoFrame', this.skin.manifest.layout.taikoFrame[0], this.skin.manifest.layout.taikoFrame[1]);
    this.drawBars(ctx, t);
    this.drawJudgeCircle(ctx);
    this.drawGogoFire(ctx, t);
    this.drawExplosions(ctx, t);
    this.drawHitEffect(ctx, t);
    this.drawNotes(ctx, t);
    this.drawTaikoPanel(ctx, t);
    this.drawGogoSplash(ctx, t);
    this.drawGauge(ctx, t);
    // Above the lane and gauge (the balloon pose overlaps the lane), below the counters.
    if (this.opts.showCharacter !== false) this.drawCharacter(ctx, t);
    this.drawScoreAdds(ctx, t); // over the character, like the arcade
    this.drawRollAndBalloon(ctx, t);
    this.drawJudgeText(ctx, t);
    this.drawFlyingNotes(ctx, t);
    if (this.opts.showTitle) this.drawTitle(ctx);
  }

  // ---------------------------------------------------------------- loading screen

  /**
   * Song loading screen, timed like the arcade: the chara slides in, the plate
   * and title fade in, then near the end the title, plate and chara fade out
   * leaving only the background (which the curtain transition then opens).
   */
  private drawLoading(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const intro = this.opts.intro!;
    const D = intro.end - intro.start;
    const e = t - intro.start;
    const k = Math.min(1, D / 3000); // compress the timings for short intros
    const ramp = (from: number, len: number) => Math.min(1, Math.max(0, (e - from) / Math.max(1, len)));
    const curtain = L.loadingTransition === 'curtain';
    const base = ctx.globalAlpha;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = base * ramp(0, 250 * k);
    this.drawLoadingBackground(ctx, 0, this.width);

    // When the curtain follows, everything but the background fades out first.
    const outro = curtain ? 1 - ramp(D - 650 * k, 300 * k) : 1;
    const charaOut = curtain ? 1 - ramp(D - 450 * k, 300 * k) : 1;

    const chara = this.img('loadingChara');
    if (chara && charaOut > 0) {
      const slide = 1 - easeOutCubic(ramp(0, 450 * k));
      const [mx, my] = L.loadingCharaMove;
      const half = chara.width / 2;
      ctx.globalAlpha = base * charaOut;
      // Left half slides in from the left, right half from the right.
      ctx.drawImage(chara, 0, 0, half, chara.height, -mx * slide, my * slide, half, chara.height);
      ctx.drawImage(chara, half, 0, half, chara.height, half + mx * slide, my * slide, half, chara.height);
    }

    const plateIn = ramp(200 * k, 300 * k);
    const plate = this.img('loadingPlate');
    if (plate && plateIn * outro > 0) {
      ctx.globalAlpha = base * plateIn * outro;
      ctx.drawImage(plate, L.loadingPlate[0] - plate.width / 2, L.loadingPlate[1] - plate.height / 2);
    }

    const textAlpha = ramp(350 * k, 300 * k) * (curtain ? 1 - ramp(D - 800 * k, 200 * k) : 1);
    if (textAlpha > 0) {
      ctx.globalAlpha = base * textAlpha;
      // Like OpenTaiko: without a subtitle the title moves down 15px (720p).
      const noSub = this.opts.subtitle ? 0 : 15 * (this.height / 720);
      this.drawCenteredText(
        ctx,
        this.opts.title,
        [L.loadingTitle[0], L.loadingTitle[1] + noSub],
        L.loadingTitleFontSize,
        L.loadingTitleColor,
        L.loadingTitleStroke,
        L.loadingTitleMaxWidth,
      );
      this.drawCenteredText(
        ctx,
        this.opts.subtitle,
        L.loadingSubtitle,
        L.loadingSubtitleFontSize,
        L.loadingSubtitleColor,
        L.loadingSubtitleStroke,
        L.loadingSubtitleMaxWidth,
      );
    }
    ctx.globalAlpha = base;
  }

  /** Loading background (or a plain gradient), shifted horizontally by dx. */
  private drawLoadingBackground(ctx: Ctx2D, dx: number, _w: number): void {
    const bg = this.img('loadingBackground');
    if (bg) ctx.drawImage(bg, dx, 0, this.width, this.height);
    else {
      const g = ctx.createLinearGradient(0, 0, 0, this.height);
      g.addColorStop(0, '#222');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.fillRect(dx, 0, this.width, this.height);
    }
  }

  /**
   * Arcade-style transition: the loading background splits at the centre into
   * two curtains with curved inner edges that slide apart (p: 0 closed → 1 open).
   */
  private drawCurtain(ctx: Ctx2D, p: number): void {
    const W = this.width;
    const H = this.height;
    const shift = (W / 2) * p;
    const bulge = W * 0.14 * Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5);
    for (const side of [-1, 1] as const) {
      ctx.save();
      ctx.beginPath();
      const steps = 24;
      const edge = (y: number) => {
        // Inner edge: gathered at the bottom, like a drape being pulled aside.
        const f = (y / H) ** 1.6;
        return W / 2 - shift - bulge * f;
      };
      if (side === -1) {
        ctx.moveTo(0, 0);
        for (let i = 0; i <= steps; i++) ctx.lineTo(edge((i / steps) * H), (i / steps) * H);
        ctx.lineTo(0, H);
      } else {
        ctx.moveTo(W, 0);
        for (let i = 0; i <= steps; i++) ctx.lineTo(W - edge((i / steps) * H), (i / steps) * H);
        ctx.lineTo(W, H);
      }
      ctx.closePath();
      ctx.clip();
      this.drawLoadingBackground(ctx, side * shift, W);
      // Soft shadow along the inner edge for depth.
      ctx.lineWidth = 18;
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCenteredText(
    ctx: Ctx2D,
    text: string,
    [x, y]: [number, number],
    size: number,
    fill: string,
    stroke: string,
    maxW = this.width * 0.8,
  ) {
    if (!text) return;
    ctx.save();
    ctx.font = `${size}px ${this.skin.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const w = ctx.measureText(text).width;
    ctx.translate(x, y);
    if (w > maxW) ctx.scale(maxW / w, 1);
    if (stroke) {
      ctx.lineWidth = size / 5;
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------- character

  private readonly charaSegments: CharaSegment[];
  /** Times combo reached 50 or 300 (start of OpenTaiko's 664ms face-animation lag). */
  private readonly faceLagStarts: number[] = [];

  /**
   * One-shot character animations as time segments, following OpenTaiko's
   * triggers: 10combo (every 10 combo outside GoGo), GoGoStart, Clearin, Soulin,
   * and the balloon animations. A new one-shot interrupts the current one,
   * except that 10combo doesn't restart itself.
   */
  private buildCharaSegments(): CharaSegment[] {
    const ch = this.skin.character;
    if (!ch) return [];
    const has = (s: CharaState) => !!ch.states[s];
    const maxTime = this.play.gauge.find((s) => s.value >= 100)?.time ?? Infinity;
    const isMax = (t: number) => t >= maxTime;
    const events: { time: number; state: CharaState; loopUntil?: number; priority: number }[] = [];
    const pick = (base: CharaState, max: CharaState, t: number): CharaState | null =>
      isMax(t) && has(max) ? max : has(base) ? base : null;

    const notes = this.play.course.notes;
    this.play.judgements.forEach((j, k) => {
      const combo = k + 1;
      if (combo % 10 === 0 && !notes[j.noteIndex].gogo) {
        const s = pick('10combo', '10combo_Max', j.time);
        if (s) events.push({ time: j.time, state: s, priority: 0 });
      }
    });
    for (const g of this.play.course.gogo) {
      const s = pick('GoGoStart', 'GoGoStart_Max', g.start);
      if (s) events.push({ time: g.start, state: s, priority: 1 });
    }
    if (Number.isFinite(this.clearTime) && has('Clearin')) events.push({ time: this.clearTime, state: 'Clearin', priority: 1 });
    if (Number.isFinite(maxTime) && has('Soulin')) events.push({ time: maxTime, state: 'Soulin', priority: 1 });
    for (const r of this.play.rolls) {
      if (notes[r.noteIndex].type !== 'balloon' || !r.hitTimes.length) continue;
      const end = r.popTime ?? r.end;
      if (has('Balloon_Breaking')) events.push({ time: r.hitTimes[0], state: 'Balloon_Breaking', loopUntil: end, priority: 2 });
      const after: CharaState = r.popTime !== undefined ? 'Balloon_Broke' : 'Balloon_Miss';
      if (has(after)) events.push({ time: end, state: after, priority: 2 });
    }
    events.sort((a, b) => a.time - b.time || a.priority - b.priority);

    const segs: CharaSegment[] = [];
    for (const e of events) {
      const st = ch.states[e.state]!;
      const balloon = e.state.startsWith('Balloon_');
      const seg: CharaSegment = {
        start: e.time,
        state: e.state,
        // Balloon states run in seconds, others in beats (as in OpenTaiko).
        end: e.loopUntil ?? (balloon ? e.time + st.beat * 1000 : Infinity),
        endBeat: balloon || e.loopUntil !== undefined ? Infinity : this.beatsAt(e.time) + st.beat,
        loop: e.loopUntil !== undefined,
      };
      const prev = segs[segs.length - 1];
      if (prev && this.segmentActive(prev, e.time)) {
        if (prev.state === e.state && e.state.startsWith('10combo')) continue; // don't restart 10combo
        if (prev.loop && !e.state.startsWith('Balloon_')) continue; // balloon pumping has priority
        prev.end = Math.min(prev.end, e.time);
      }
      segs.push(seg);
    }
    return segs;
  }

  private segmentActive(s: CharaSegment, t: number): boolean {
    return t >= s.start && t < s.end && this.beatsAt(t) < s.endBeat;
  }

  private drawCharacter(ctx: Ctx2D, t: number): void {
    const ch = this.skin.character;
    if (!ch) return;
    let state: CharaState | null = null;
    let progress = 0;
    let balloon = false;

    const segs = this.charaSegments;
    let lo = 0;
    let hi = segs.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].start <= t) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const seg = idx >= 0 ? segs[idx] : undefined;
    if (seg && this.segmentActive(seg, t)) {
      const st = ch.states[seg.state]!;
      state = seg.state;
      balloon = seg.state.startsWith('Balloon_');
      if (seg.loop) progress = (((t - seg.start) / 1000 / st.beat) % 1 + 1) % 1;
      else if (balloon) progress = (t - seg.start) / (st.beat * 1000);
      else progress = (this.beatsAt(t) - (seg.endBeat - st.beat)) / st.beat;
    } else {
      const gauge = stepAt(this.play.gauge, t);
      const max = gauge >= 100;
      const cleared = gauge >= this.play.clearThreshold;
      const candidates: CharaState[] = this.isGogo(t)
        ? max
          ? ['GoGo_Max', 'GoGo', 'Normal']
          : ['GoGo', 'Normal']
        : max
          ? ['Clear_Max', 'Clear', 'Normal']
          : cleared
            ? ['Clear', 'Normal']
            : ['Normal'];
      state = candidates.find((s) => ch.states[s]) ?? null;
      if (!state) return;
      const cycle = this.beatsAt(t) / Math.max(1e-6, ch.states[state]!.beat);
      progress = cycle - Math.floor(cycle);
    }

    const st = ch.states[state!]!;
    const m = st.motion;
    const frame = st.frames[m[Math.max(0, Math.min(m.length - 1, Math.floor(progress * m.length)))]];
    if (!frame) return;
    const x = balloon ? ch.balloonX : ch.x;
    const y = balloon ? ch.balloonY : ch.y;
    ctx.drawImage(frame, x, y, frame.width * ch.scale, frame.height * ch.scale);
  }

  private isGogo(t: number): boolean {
    return this.play.course.gogo.some((g) => t >= g.start && t < g.end);
  }

  /** Data-driven background (manifest.background). */
  private drawBackgroundLayers(ctx: Ctx2D, t: number): void {
    const spec = this.skin.manifest.background!;
    ctx.fillStyle = spec.color ?? '#000';
    ctx.fillRect(0, 0, this.width, this.height);
    const clearFade = Math.max(0, Math.min(1, (t - this.clearTime) / 300));
    const sec = t / 1000;
    for (const layer of spec.layers) {
      const im = this.skin.layerImages[layer.image];
      if (!im) continue;
      const show = layer.show ?? 'always';
      const alpha = (layer.opacity ?? 1) * (show === 'clear' ? clearFade : show === 'normal' ? 1 - clearFade : 1);
      if (alpha <= 0) continue;
      let y = layer.y ?? 0;
      if (layer.bob) y += Math.sin((this.beatsAt(t) / layer.bob[1]) * Math.PI * 2) * layer.bob[0];
      const x = layer.x ?? 0;
      const w = layer.width ?? (layer.tileX ? this.width - x : im.width);
      const h = layer.height ?? (layer.tileY ? this.height - y : im.height);
      ctx.globalAlpha = alpha;
      if (layer.tileX || layer.tileY || layer.scrollX || layer.scrollY) {
        const strip = this.stripOf(layer.image, im, w, h);
        if (strip) {
          const ox = (((sec * (layer.scrollX ?? 0)) % im.width) + im.width) % im.width;
          const oy = (((sec * (layer.scrollY ?? 0)) % im.height) + im.height) % im.height;
          ctx.drawImage(strip, layer.tileX || layer.scrollX ? ox : 0, layer.tileY || layer.scrollY ? oy : 0, w, h, x, y, w, h);
        }
      } else {
        ctx.drawImage(im, 0, 0, im.width, im.height, x, y, w, h);
      }
      ctx.globalAlpha = 1;
    }
    if (this.opts.showDancer !== false) this.drawDancers(ctx, t);
    const footer = this.img('footer');
    if (footer) ctx.drawImage(footer, 0, this.height - footer.height);
  }

  private drawBackground(ctx: Ctx2D, t: number): void {
    if (this.skin.manifest.background) {
      this.drawBackgroundLayers(ctx, t);
      return;
    }
    const L = this.skin.manifest.layout;
    const W = this.width;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, this.height);

    const sec = t / 1000;
    const clearFade = Math.max(0, Math.min(1, (t - this.clearTime) / 128));

    // Upper band: base colour + scrolling dots + scrolling dango.
    const upH = L.bgUpHeight;
    const scrollX = ((sec * 59) % 1e6 + 1e6) % 1e6;
    const scrollY = ((sec * 14) % 1e6 + 1e6) % 1e6;
    this.fillPattern(ctx, 'bgUpBase', 0, 0, W, upH);
    this.fillPattern(ctx, 'bgUpDot', 0, 0, W, upH, scrollX, scrollY);
    this.fillPattern(ctx, 'bgUpDango', 0, 0, W, upH, scrollX, 0);
    if (clearFade > 0) {
      ctx.globalAlpha = clearFade;
      this.fillPattern(ctx, 'bgUpBaseClear', 0, 0, W, upH);
      this.fillPattern(ctx, 'bgUpDotClear', 0, 0, W, upH, scrollX, scrollY);
      this.fillPattern(ctx, 'bgUpDangoClear', 0, 0, W, upH, scrollX, 0);
      ctx.globalAlpha = 1;
    }

    // Lower band.
    const y = L.bgDownY;
    this.draw(ctx, 'bgDown', 0, y);
    if (clearFade > 0) {
      ctx.globalAlpha = clearFade;
      this.draw(ctx, 'bgDownClear', 0, y);
      const scroll = this.img('bgDownScroll');
      if (scroll) {
        const a = Math.max(0, Math.min(1, ((t - this.clearTime) / 1000) * 2));
        const h = scroll.height;
        const moveY = h - a * h - Math.sin(a * Math.PI) * 250;
        const sx = (((t - this.clearTime) / 1000) * 250) % scroll.width;
        for (let i = 0; i < 3; i++) ctx.drawImage(scroll, scroll.width * i - sx, y + moveY);
      }
      ctx.globalAlpha = 1;
    }

    if (this.opts.showDancer !== false) this.drawDancers(ctx, t);

    // Footer, bottom-aligned.
    const footer = this.img('footer');
    if (footer) ctx.drawImage(footer, 0, this.height - footer.height);
  }

  /** Number of beats elapsed at song time t (follows BPM changes). */
  private beatsAt(t: number): number {
    const pts = this.beatPoints;
    if (!pts.length) return (t * 120) / 60000;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].time <= t) lo = mid;
      else hi = mid - 1;
    }
    const p = pts[lo];
    return p.beats + ((t - p.time) * Math.abs(p.bpm)) / 60000;
  }

  /** OpenTaiko dancers: one motion cycle every `beat` beats, shown once the gauge reaches their threshold. */
  private drawDancers(ctx: Ctx2D, t: number): void {
    const d = this.skin.dancer;
    if (!d || d.config.motion.length < 2) return;
    const { config, frames } = d;
    const cycle = this.beatsAt(t) / Math.max(1e-6, config.beat);
    const phase = cycle - Math.floor(cycle);
    const motionFrame = config.motion[Math.floor(phase * (config.motion.length - 1))] ?? 0;
    const gauge = stepAt(this.play.gauge, t);
    for (let i = 0; i < config.count; i++) {
      if (gauge < (config.gauge[i] ?? config.gauge[0] ?? 0)) continue;
      const im = frames[i]?.[motionFrame];
      if (!im) continue;
      const x = config.x[i] ?? config.x[0];
      const y = config.y[i] ?? config.y[0];
      ctx.drawImage(im, x - im.width / 2, y - im.height / 2);
    }
  }

  private drawLane(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const [lx, ly] = L.lane;
    const course = this.play.course;
    if (course.hasBranches) {
      const b = course.branch;
      const base: ImageKey = b === 'master' ? 'laneBaseMaster' : b === 'expert' ? 'laneBaseExpert' : 'laneBaseNormal';
      const text: ImageKey = b === 'master' ? 'laneTextMaster' : b === 'expert' ? 'laneTextExpert' : 'laneTextNormal';
      if (this.img(base)) this.draw(ctx, base, lx, ly);
      else this.draw(ctx, 'laneBackground', lx, ly);
      this.draw(ctx, text, lx, ly);
    } else {
      this.draw(ctx, 'laneBackground', lx, ly);
    }

    // GoGo lane tint (fades in/out over 100ms).
    const g = course.gogo.find((r) => t >= r.start - 100 && t < r.end + 100);
    if (g) {
      const a = Math.min(1, (t - g.start) / 100, (g.end - t) / 100);
      if (a > 0) {
        ctx.globalAlpha = a;
        this.draw(ctx, 'laneGogo', lx, ly);
        ctx.globalAlpha = 1;
      }
    }

    // Hit flashes.
    for (const { hits, key } of this.laneFlashes) {
      const dt = t - this.lastHitBefore(hits, t);
      if (dt >= 0 && dt < LANE_FLASH_MS) {
        ctx.globalAlpha = 1 - dt / LANE_FLASH_MS;
        this.draw(ctx, key, lx, ly);
        ctx.globalAlpha = 1;
      }
    }

    this.draw(ctx, 'laneSub', L.laneSub[0], L.laneSub[1]);
  }

  private drawBars(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const [sx] = L.scrollField;
    const [lx, ly] = L.lane;
    const laneH = this.img('laneBackground')?.height ?? L.noteSize[1];
    const bar = this.img('bar');
    if (!bar) return;
    for (const b of this.play.course.bars) {
      if (!b.visible) continue;
      const x = sx + this.dx(b.time, b.bpm, b.scroll, t) + L.noteSize[0] / 2 - bar.width / 2;
      if (x < lx || x > this.width) continue;
      const key: ImageKey = b.branch && this.img('barBranch') ? 'barBranch' : 'bar';
      const im = this.img(key)!;
      ctx.drawImage(im, 0, 0, im.width, im.height, x, ly, im.width, laneH);
    }
  }

  private drawJudgeCircle(ctx: Ctx2D): void {
    const L = this.skin.manifest.layout;
    const [w, h] = L.noteSize;
    this.drawRect(ctx, 'notes', 0, 0, w, h, L.scrollField[0], L.scrollField[1]);
  }

  private drawGogoFire(ctx: Ctx2D, t: number): void {
    if (!this.isGogo(t)) return;
    const L = this.skin.manifest.layout;
    const im = this.img('gogoFire');
    if (!im) return;
    const fw = im.width / L.gogoFireFrames;
    const frame = Math.floor(t / 50) % L.gogoFireFrames;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(im, frame * fw, 0, fw, im.height, L.gogoFire[0], L.gogoFire[1], fw, im.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawExplosions(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const im = this.img('hitExplosion');
    if (!im) return;
    const frames = L.hitExplosionFrames;
    const fw = im.width / frames;
    const fh = im.height / 4;
    const dur = frames * EXPLOSION_FRAME_MS;
    const js = this.play.judgements;
    ctx.globalCompositeOperation = 'lighter';
    const [from, to] = this.newest(js, t, dur, this.opts.maxHitEffects ?? 1);
    for (let i = from; i < to; i++) {
      const j = js[i];
      const frame = Math.floor((t - j.time) / EXPLOSION_FRAME_MS);
      if (frame >= frames) continue;
      const row = j.big ? 2 : 0;
      ctx.drawImage(im, frame * fw, row * fh, fw, fh, L.hitExplosion[0], L.hitExplosion[1], fw, fh);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Notes.png row for the current face animation frame (OpenTaiko's
   * GetPxFaceTextureOffset): the face changes every quarter beat from 50 combo,
   * with a third face from 300 combo, after a short lag once 50/300 is reached.
   */
  private faceRow(t: number): number {
    const L = this.skin.manifest.layout;
    const notes = this.img('notes');
    if (!L.notesAnime || !notes) return 0;
    const rows = Math.floor(notes.height / L.noteSize[1]);
    const combo = stepAt(this.play.combo, t);
    if (combo < 50) return 0;
    const b = this.beatsAt(t);
    const v = Math.floor((b - Math.floor(b)) * 4); // 0..3, one step per quarter beat
    const lagStart = this.faceLagStarts.filter((s) => s <= t).pop();
    const lagEnded = lagStart === undefined || t >= lagStart + 664;
    let row = 0;
    if (combo >= 300) row = v % 2 === 1 ? (lagEnded ? 2 : 1) : 0;
    else if (combo >= 150) row = v % 2 === 1 ? 1 : 0;
    else row = v <= 1 && lagEnded ? 1 : 0;
    return row < rows ? row : 0;
  }

  /** OpenTaiko 10_Effects/Hit sequence: the hit note glows at the judge circle and fades (restarts on every hit). */
  private drawHitEffect(ctx: Ctx2D, t: number): void {
    const fx = this.skin.hitEffect;
    if (!fx) return;
    const js = this.play.judgements;
    const i = lowerBound(js, t + 0.0001) - 1;
    if (i < 0) return;
    const j = js[i];
    const frames = j.big ? fx.greatBig : fx.great;
    const frame = Math.floor((t - j.time) / fx.frameMs);
    const im = frames[frame];
    if (!im) return;
    const L = this.skin.manifest.layout;
    ctx.drawImage(im, L.hitExplosion[0], L.hitExplosion[1]);
  }

  private drawNotes(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const [sx, sy] = L.scrollField;
    const [nw, nh] = L.noteSize;
    const notes = this.play.course.notes;
    const W = this.width;
    const [seW, seH] = L.seNoteSize;
    const se = this.img('seNotes');
    const seRowH = se ? se.height / 12 : seH;
    const faceY = this.faceRow(t) * nh;

    // Later notes first so earlier ones end up on top.
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const long = n.type === 'roll' || n.type === 'bigRoll' || n.type === 'balloon';
      const end = n.endTime ?? n.time;

      if (!long) {
        if (n.type !== 'mine' && n.time <= t) continue; // already hit
        const x = sx + this.dx(n.time, n.bpm, n.scroll, t);
        if (x > W || x < -nw) continue;
        if (n.type === 'mine') {
          const mine = this.img('mine');
          if (mine) ctx.drawImage(mine, x, sy, nw, nh);
          continue;
        }
        this.drawRect(ctx, 'notes', NOTE_COL[n.type] * nw, faceY, nw, nh, x, sy);
        this.drawSe(ctx, se, i, x, sy, seW, seRowH);
        continue;
      }

      if (t >= end) continue;
      const roll = this.rollByNote.get(i);
      let x = sx + this.dx(n.time, n.bpm, n.scroll, t);
      let xEnd = sx + this.dx(end, n.endBpm ?? n.bpm, n.endScroll ?? n.scroll, t);

      if (n.type === 'balloon') {
        if (roll?.popTime !== undefined && t >= roll.popTime) continue;
        if (t >= n.time) {
          x = sx;
          xEnd = sx;
        }
        if (x > W || x < -nw * 2) continue;
        const col = NOTE_COL.balloon;
        this.drawRect(ctx, 'notes', (col + 1) * nw, faceY, nw, nh, x + nw, sy);
        this.drawRect(ctx, 'notes', col * nw, faceY, nw, nh, x, sy);
        this.drawSe(ctx, se, i, x, sy, seW, seRowH);
        continue;
      }

      if (Math.min(x, xEnd) > W || Math.max(x, xEnd) < -nw) continue;
      const head = NOTE_COL[n.type];
      const bodyStart = x + nw / 2;
      const bodyLen = xEnd - bodyStart + nw / 2;
      // Body (stretched), end cap, then head.
      if (bodyLen > 0) this.drawRect(ctx, 'notes', (head + 1) * nw, faceY, nw, nh, bodyStart, sy, bodyLen, nh);
      this.drawRect(ctx, 'notes', (head + 2) * nw, faceY, nw, nh, xEnd + nw / 2, sy);
      this.drawRect(ctx, 'notes', head * nw, faceY, nw, nh, x, sy);
      // SE text: label at head, "—" stretched to the end.
      if (se) {
        const [ox, oy] = L.seNotesOffset;
        const lineRow = 8;
        const lineStart = x + ox + seW;
        const lineLen = xEnd + ox + seW / 2 - lineStart;
        if (lineLen > 0) ctx.drawImage(se, 0, lineRow * seRowH, seW, seRowH, lineStart, sy + oy, lineLen, seRowH);
      }
      this.drawSe(ctx, se, i, x, sy, seW, seRowH);
    }
  }

  private drawSe(ctx: Ctx2D, se: ImageSource | undefined, i: number, x: number, sy: number, seW: number, rowH: number) {
    const row = this.seLabels[i];
    if (!se || row < 0) return;
    const [ox, oy] = this.skin.manifest.layout.seNotesOffset;
    ctx.drawImage(se, 0, row * rowH, seW, rowH, x + ox, sy + oy, seW, rowH);
  }

  private drawTaikoPanel(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    this.draw(ctx, 'taikoBackground', L.taikoBackground[0], L.taikoBackground[1]);
    this.drawNameplate(ctx); // under the drum

    // Drum + per-side flashes.
    const [tx, ty] = L.taiko;
    this.draw(ctx, 'taikoBase', tx, ty);
    for (const [hits, key] of [
      [this.kaHits, 'taikoKa'],
      [this.donHits, 'taikoDon'],
    ] as const) {
      const im = this.img(key);
      if (!im) continue;
      const half = im.width / 2;
      for (const side of ['L', 'R'] as const) {
        // Find the most recent hit on this side.
        let last = -Infinity;
        for (let i = lowerBound(hits, t + 0.0001) - 1; i >= 0 && t - hits[i].time < DRUM_FLASH_MS; i--) {
          if (hits[i].hand === side || hits[i].hand === 'both') {
            last = hits[i].time;
            break;
          }
        }
        const dt = t - last;
        if (dt < 0 || dt >= DRUM_FLASH_MS) continue;
        ctx.globalAlpha = 1 - dt / DRUM_FLASH_MS;
        const sxo = side === 'L' ? 0 : half;
        ctx.drawImage(im, sxo, 0, half, im.height, tx + sxo, ty, half, im.height);
        ctx.globalAlpha = 1;
      }
    }

    // Course symbol.
    const ck = COURSE_KEY[this.play.course.course];
    if (ck) this.draw(ctx, ck, L.courseSymbol[0], L.courseSymbol[1]);

    // Score: right-aligned over 7 slots, bottom anchored, with a bounce on every gain.
    const score = stepAt(this.play.score, t);
    const sc = this.play.score;
    const lastGain = sc[Math.max(0, lowerBound(sc, t + 0.0001) - 1)].time;
    const bounce = SCORE_SCALE[Math.floor((t - lastGain) / 13)] ?? 1;
    this.drawScoreDigits(ctx, 'score', score, L.score[0], L.score[1], bounce);

    // Combo.
    const combo = stepAt(this.play.combo, t);
    if (combo >= MIN_COMBO_SHOWN) {
      // Bottom-centred at comboText, like OpenTaiko.
      const ct = this.img('comboText');
      if (ct) ctx.drawImage(ct, L.comboText[0] - ct.width / 2, L.comboText[1] - ct.height);
      const js = this.play.judgements;
      const last = this.lastHitBefore(js, t);
      const pop = t - last < COMBO_POP_MS ? 1 + 0.25 * (1 - (t - last) / COMBO_POP_MS) : 1;
      const digits = String(combo).length;
      const key: ImageKey =
        combo >= 300 && this.img('comboHuge')
          ? 'comboHuge'
          : combo >= 100 && this.img('comboBig')
            ? 'comboBig'
            : combo >= 50 && this.img('comboMedium')
              ? 'comboMedium'
              : 'combo';
      const [cx, cy] = digits >= 4 ? L.comboEx4 : digits === 3 ? L.comboEx : L.combo;
      const pad = digits >= 4 ? L.comboPadding[2] : digits === 3 ? L.comboPadding[1] : L.comboPadding[0];
      const im = this.img(key);
      if (im) {
        const [dw, dh] = L.comboSize;
        const scaleX = digits >= 4 ? 0.85 : 1;
        const s = String(combo);
        const total = pad * (digits - 1);
        for (let i = 0; i < digits; i++) {
          const d = s.charCodeAt(i) - 48;
          const x = cx - total / 2 + pad * i;
          ctx.drawImage(im, d * dw, 0, dw, dh, x - (dw * scaleX) / 2, cy - dh * pop, dw * scaleX, dh * pop);
        }
      }
    }
  }

  /**
   * GoGo-start fireworks (OpenTaiko GoGoSplash, single player): one sheet
   * animation per position, bottom-centre anchored; with `rotate` the two
   * outermost on each side tilt outwards by 8° and 16°.
   */
  private drawGogoSplash(ctx: Ctx2D, t: number): void {
    const im = this.img('gogoSplash');
    if (!im) return;
    const G = this.skin.manifest.layout.gogoSplash;
    const [fw, fh, n0] = G.frame;
    const n = Math.min(n0, Math.floor(im.width / fw)); // skins sometimes declare more frames than they have
    const start = this.play.course.gogo.map((g) => g.start).filter((s) => s <= t).pop();
    if (start === undefined) return;
    const frame = Math.floor((t - start) / G.frameMs);
    if (frame >= n) return;
    const count = Math.min(G.x.length, G.y.length);
    const deg = Math.PI / 180;
    for (let i = 0; i < count; i++) {
      let rot = 0;
      if (G.rotate) {
        if (i === 0) rot = -16 * deg;
        else if (i === 1) rot = -8 * deg;
        else if (i === count - 2) rot = 8 * deg;
        else if (i === count - 1) rot = 16 * deg;
      }
      // Bottom-centre anchored, rotated about the image centre.
      const cx = G.x[i];
      const cy = G.y[i] - fh / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(im, frame * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    }
  }

  /** Player nameplate: "1P" badge + plate + name (12-row NamePlate sheet, see SkinLayout.nameplate). */
  private drawNameplate(ctx: Ctx2D): void {
    const info = this.opts.nameplate;
    const im = this.img('nameplate');
    if (!info || !im) return;
    const L = this.skin.manifest.layout;
    if (L.nameplateStyle === 'arcade') {
      this.drawArcadeNameplate(ctx, info, im);
      return;
    }
    const rowH = im.height / 12;
    const s = L.nameplateScale;
    const sy = L.nameplateScaleY || s;
    const k = (rowH / 54) * s; // sheet is authored with 54px rows at 720p
    const ky = (rowH / 54) * sy;
    const w = im.width;
    const bs = L.nameplateBadgeScale;
    const [x, by] = L.nameplate;
    const px = x + L.nameplatePlateOffset * k; // plate starts right of the badge's centre
    const y = by + (rowH * bs - rowH * sy) / 2; // plate vertically centred on the badge
    const row = (r: number) => ctx.drawImage(im, 0, r * rowH, w, rowH, px, y, w * s, rowH * sy);

    row(3); // plate
    if (L.nameplateOutline) row(4); // outline
    ctx.drawImage(im, 0, 0, rowH, rowH, x, by, rowH * bs, rowH * bs); // "1P" badge
    this.drawNameText(ctx, info.name, px + 110 * k, y + 28 * ky, 22 * ky, 190 * k, 4 * ky);
  }

  private drawNameText(ctx: Ctx2D, s: string, cx: number, cy: number, size: number, maxW: number, stroke: number) {
    if (!s) return;
    ctx.save();
    ctx.font = `${size}px ${this.skin.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const mw = ctx.measureText(s).width;
    ctx.translate(cx, cy);
    if (mw > maxW) ctx.scale(maxW / mw, 1);
    ctx.lineWidth = stroke;
    ctx.strokeStyle = '#000';
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }

  /**
   * Nijiiro arcade nameplate, measured from arcade footage at 720p (numbers are
   * 720p pixels relative to the badge's top-left): white rounded plate
   * 31..213 × 0..47 with a 2px border, the name centred, the "1P" badge from
   * the NamePlate sheet on top.
   */
  private drawArcadeNameplate(ctx: Ctx2D, info: NameplateInfo, sheet: ImageSource): void {
    const L = this.skin.manifest.layout;
    const u = this.height / 720;
    const [bx, by] = L.nameplate;
    const h = 47 * u;
    ctx.beginPath();
    ctx.roundRect(bx + 31 * u, by, 182 * u, h, h / 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    this.drawNameText(ctx, info.name, bx + 122 * u, by + 24 * u, 21 * u, 160 * u, 4 * u);
    const rowH = sheet.height / 12;
    const bs = L.nameplateBadgeScale;
    ctx.drawImage(sheet, 0, 0, rowH, rowH, bx, by, rowH * bs, rowH * bs); // "1P" badge
  }

  private drawScoreDigits(ctx: Ctx2D, key: ImageKey, value: number, x0: number, bottom: number, scaleY = 1) {
    const im = this.img(key) ?? this.img('score');
    if (!im) return;
    const L = this.skin.manifest.layout;
    const s = String(value);
    const [dw, dh] = L.scoreSize;
    const slots = Math.max(7, s.length);
    for (let i = 0; i < s.length; i++) {
      const d = s.charCodeAt(i) - 48;
      const x = x0 + L.scorePadding * (slots - s.length + i);
      ctx.drawImage(im, d * dw, 0, dw, dh, x, bottom - dh * scaleY, dw, dh * scaleY);
    }
  }

  /**
   * "+score" popups (OpenTaiko CActImplScore): each gain slides in from the
   * right while fading in, lifts a little, then drops into the score and
   * vanishes (~420ms). Up to maxScoreAdds are shown.
   */
  private drawScoreAdds(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const sc = this.play.score;
    const DUR = 420;
    const [from, to] = this.newest(sc, t, DUR, this.opts.maxScoreAdds ?? 10);
    for (let i = Math.max(1, from); i < to; i++) {
      const delta = sc[i].value - sc[i - 1].value;
      if (delta <= 0) continue;
      const v = (t - sc[i].time) / 2; // OpenTaiko counter: 2ms per step
      let xAdd = 0;
      let alpha = 1;
      if (v < 10) [xAdd, alpha] = [25, 150 / 255];
      else if (v < 20) [xAdd, alpha] = [10, 200 / 255];
      else if (v < 30) [xAdd, alpha] = [-5, 250 / 255];
      else if (v < 40) xAdd = -9;
      else if (v < 50) xAdd = -10;
      else if (v < 60) xAdd = -9;
      else if (v < 70) xAdd = -5;
      else if (v < 80) xAdd = -3;
      let yAdd = 0;
      if (v > 210) [yAdd, alpha] = [20, 0];
      else if (v > 200) [yAdd, alpha] = [12, 150 / 255];
      else if (v > 190) [yAdd, alpha] = [5, 200 / 255];
      else if (v > 180) yAdd = 0;
      else if (v > 170) yAdd = -6;
      else if (v > 150) yAdd = -8;
      else if (v > 140) yAdd = -7;
      else if (v > 130) yAdd = -5;
      else if (v > 120) yAdd = -1;
      if (alpha <= 0) continue;
      // Offsets are in 720p pixels.
      const k = this.height / 720;
      ctx.globalAlpha = alpha;
      this.drawScoreDigits(ctx, 'scoreAdd', delta, L.scoreAdd[0] + xAdd * k, L.scoreAdd[1] + yAdd * k);
      ctx.globalAlpha = 1;
    }
  }

  private drawGauge(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const [gx, gy] = L.gauge;
    const [rx, ry, rw, rh] = L.gaugeRect;
    const value = stepAt(this.play.gauge, t);
    const cellW = rw / L.gaugeCells;
    const cells = Math.floor((value / 100) * L.gaugeCells + 1e-6);
    const clearCell = Math.round((this.play.clearThreshold / 100) * L.gaugeCells);
    const filledW = cells * cellW;
    const clearW = clearCell * cellW;

    this.drawRect(ctx, 'gaugeBase', rx, ry, rw, rh, gx, gy);
    // Skins without a separate Clear.png (TJAPlayer3 style) keep the whole bar in the fill image.
    const clearKey: ImageKey = this.img('gaugeClear') ? 'gaugeClear' : 'gaugeFill';
    this.drawRect(ctx, 'gaugeFill', rx, ry, Math.min(filledW, clearW), rh, gx, gy);
    if (filledW > clearW) this.drawRect(ctx, clearKey, rx + clearW, ry, filledW - clearW, rh, gx + clearW, gy);

    // Full gauge: rainbow overlay, each frame crossfading into the next (OpenTaiko 7_Gauge/Rainbow).
    const rb = this.skin.gaugeRainbow;
    if (value >= 100 && rb && rb.frames.length) {
      const n = rb.frames.length;
      const pos = t / rb.frameMs;
      const cur = ((Math.floor(pos) % n) + n) % n;
      const next = (cur + 1) % n;
      const a = pos - Math.floor(pos);
      const f0 = rb.frames[cur];
      ctx.drawImage(f0, gx, gy, f0.width, f0.height);
      ctx.globalAlpha = a;
      const f1 = rb.frames[next];
      ctx.drawImage(f1, gx, gy, f1.width, f1.height);
      ctx.globalAlpha = 1;
    }

    const cleared = value >= this.play.clearThreshold;
    const [cx, cy, cw, ch] = cleared ? L.gaugeClearTextClearRect : L.gaugeClearTextRect;
    this.drawRect(ctx, 'gaugeFill', cx, cy, cw, ch, L.gaugeClearText[0], L.gaugeClearText[1]);

    // Soul fire when full.
    if (value >= 100) {
      const fire = this.img('soulFire');
      if (fire) {
        const fw = fire.width / L.soulFireFrames;
        const frame = Math.floor(t / 40) % L.soulFireFrames;
        ctx.drawImage(fire, frame * fw, 0, fw, fire.height, L.soulFire[0], L.soulFire[1], fw, fire.height);
      }
    }
    const soul = this.img('soul');
    if (soul) {
      const h = soul.height / 2;
      ctx.drawImage(soul, 0, cleared ? 0 : h, soul.width, h, L.soul[0], L.soul[1], soul.width, h);
    }
  }

  private drawRollAndBalloon(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    for (const r of this.play.rolls) {
      if (!r.hitTimes.length) continue;
      const first = r.hitTimes[0];
      const note = this.play.course.notes[r.noteIndex];
      const hitsSoFar = countBefore(r.hitTimes, t);

      if (note.type === 'balloon') {
        const endVisible = r.popTime ?? r.end;
        if (t < first || t >= endVisible || hitsSoFar === 0) continue;
        const remaining = Math.max(0, (r.required ?? 0) - hitsSoFar);
        const progress = r.required ? hitsSoFar / r.required : 0;
        const stage = Math.min(5, Math.floor(progress * 6));
        const bk = `balloonBreaking${stage}` as ImageKey;
        const shake = Math.floor(t / 30) % 2 ? 3 : 0;
        this.draw(ctx, bk, L.balloon[0] + shake, L.balloon[1]);
        const frame = this.img('balloon');
        this.draw(ctx, 'balloon', L.balloonFrame[0], L.balloonFrame[1]);
        const centerX = L.balloonFrame[0] + (frame ? frame.width / 2 : 150) + 8;
        this.drawDigits(ctx, 'rollNumber', remaining, centerX, L.balloonNumber[1], L.balloonNumberInterval[0]);
        continue;
      }

      // Drumroll counter bubble.
      const lastHit = r.hitTimes[r.hitTimes.length - 1];
      if (t < first || t > lastHit + ROLL_LINGER_MS) continue;
      const im = this.img('rollFrame');
      const elapsed = t - first;
      const fade = t > lastHit + ROLL_LINGER_MS - 200 ? (lastHit + ROLL_LINGER_MS - t) / 200 : 1;
      ctx.globalAlpha = Math.max(0, fade);
      let fw = 501;
      if (im) {
        fw = im.width / L.rollFrameFrames;
        const frame = Math.min(L.rollFrameFrames - 1, Math.floor(elapsed / 40));
        ctx.drawImage(im, frame * fw, 0, fw, im.height, L.rollFrame[0], L.rollFrame[1], fw, im.height);
      }
      if (elapsed >= 120) {
        const sinceHit = t - (r.hitTimes[hitsSoFar - 1] ?? first);
        const pop = sinceHit < 60 ? 1 + 0.15 * (1 - sinceHit / 60) : 1;
        this.drawDigits(ctx, 'rollNumber', hitsSoFar, L.rollFrame[0] + fw / 2, L.rollNumber[1], L.balloonNumberInterval[0], pop);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Index range [from, to) of the newest `max` items that started within `windowMs` before t. */
  private newest<T extends { time: number }>(arr: T[], t: number, windowMs: number, max: number): [number, number] {
    const to = lowerBound(arr, t + 0.0001);
    const from = Math.max(lowerBound(arr, t - windowMs), to - Math.max(0, Math.floor(max)));
    return [from, to];
  }

  private drawJudgeText(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const im = this.img('judge');
    if (!im) return;
    const rowH = im.height / Math.max(1, this.skin.manifest.layout.judgeRows);
    const js = this.play.judgements;
    const [from, to] = this.newest(js, t, JUDGE_MS, this.opts.maxJudgeTexts ?? 2);
    for (let i = from; i < to; i++) {
      const e = t - js[i].time;
      const move = easeOutCubic(e / JUDGE_MS) - 1;
      const x = L.judge[0] + move * L.judgeMove[0];
      const y = L.judge[1] + move * L.judgeMove[1];
      ctx.globalAlpha = e >= 360 ? Math.max(0, 1 - (e - 360) / 50) : 1;
      ctx.drawImage(im, 0, 0, im.width, rowH, x, y, im.width, rowH);
    }
    ctx.globalAlpha = 1;
  }

  private drawFlyingNotes(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const [nw, nh] = L.noteSize;
    const [x0, y0] = L.flyingStart;
    const [x1, y1] = L.flyingEnd;
    const js: Judgement[] = this.play.judgements;
    const notes = this.play.course.notes;

    // Soul flash on arrival.
    const flash = this.img('soulExplosion');
    if (flash) {
      const [fw, fh, frames] = L.notesFlash;
      const dur = frames * SOUL_FLASH_FRAME_MS;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = lowerBound(js, t - FLY_MS - dur); i < js.length && js[i].time <= t - FLY_MS; i++) {
        const frame = Math.floor((t - FLY_MS - js[i].time) / SOUL_FLASH_FRAME_MS);
        if (frame < 0 || frame >= frames) continue;
        ctx.drawImage(flash, frame * fw, 0, fw, fh, x1 - fw / 2, y1 - fh / 2, fw, fh);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    for (let i = lowerBound(js, t - FLY_MS); i < js.length && js[i].time <= t; i++) {
      const p = (t - js[i].time) / FLY_MS;
      const x = x0 + (x1 - x0) * p;
      const y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * L.flyingSine;
      const col = NOTE_COL[notes[js[i].noteIndex].type];
      this.drawRect(ctx, 'notes', col * nw, 0, nw, nh, x - nw / 2, y - nh / 2);
    }
  }

  /** In-game song title (no subtitle), right-aligned and vertically centred at layout.title. */
  private drawTitle(ctx: Ctx2D): void {
    const L = this.skin.manifest.layout;
    const text = this.opts.title;
    if (!text) return;
    const size = L.titleFontSize;
    ctx.save();
    ctx.font = `${size}px ${this.skin.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    // Like OpenTaiko: titles wider than the max width are squeezed horizontally.
    const maxW = L.titleMaxWidth;
    const w = ctx.measureText(text).width;
    ctx.translate(L.title[0], L.title[1]);
    if (w > maxW) ctx.scale(maxW / w, 1);
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

}

function buildBeatPoints(play: Playthrough): { time: number; bpm: number; beats: number }[] {
  const raw = [...play.course.bars, ...play.course.notes]
    .map((x) => ({ time: x.time, bpm: x.bpm }))
    .sort((a, b) => a.time - b.time);
  const pts: { time: number; bpm: number; beats: number }[] = [];
  for (const r of raw) {
    const last = pts[pts.length - 1];
    if (last && last.bpm === r.bpm) continue;
    const beats = last ? last.beats + ((r.time - last.time) * Math.abs(last.bpm)) / 60000 : 0;
    pts.push({ time: r.time, bpm: r.bpm, beats });
  }
  // Times before the first point extrapolate from it (negative beats), so the dancer moves during the lead-in.
  return pts;
}

function countBefore(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
