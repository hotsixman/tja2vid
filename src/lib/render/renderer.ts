import { lowerBound, stepAt, type Hit, type Judgement, type Playthrough, type RollState } from '../sim/autoplay';
import type { ImageKey, ImageSource, LoadedSkin } from '../skin/types';
import type { Note, NoteType } from '../tja/types';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  /** Draw the song title in the top-right corner. */
  showTitle: boolean;
  title: string;
  subtitle: string;
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
    const g = play.gauge.find((s) => s.value >= play.clearThreshold);
    this.clearTime = g ? g.time : Infinity;
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
    const id = `${key}:${w}x${h}`;
    if (!this.strips.has(id)) {
      const im = this.img(key);
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

    this.drawBackground(ctx, t);
    this.drawLane(ctx, t);
    this.drawBars(ctx, t);
    this.drawJudgeCircle(ctx);
    this.drawGogoFire(ctx, t);
    this.drawExplosions(ctx, t);
    this.drawNotes(ctx, t);
    this.drawTaikoPanel(ctx, t);
    this.drawGauge(ctx, t);
    this.drawRollAndBalloon(ctx, t);
    this.drawJudgeText(ctx, t);
    this.drawFlyingNotes(ctx, t);
    if (this.opts.showTitle) this.drawTitle(ctx);

    ctx.restore();
  }

  private isGogo(t: number): boolean {
    return this.play.course.gogo.some((g) => t >= g.start && t < g.end);
  }

  private drawBackground(ctx: Ctx2D, t: number): void {
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

    // Footer, bottom-aligned.
    const footer = this.img('footer');
    if (footer) ctx.drawImage(footer, 0, this.height - footer.height);
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
    for (let i = lowerBound(js, t - dur); i < js.length && js[i].time <= t; i++) {
      const j = js[i];
      const frame = Math.floor((t - j.time) / EXPLOSION_FRAME_MS);
      if (frame >= frames) continue;
      const row = j.big ? 2 : 0;
      ctx.drawImage(im, frame * fw, row * fh, fw, fh, L.hitExplosion[0], L.hitExplosion[1], fw, fh);
    }
    ctx.globalCompositeOperation = 'source-over';
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
        this.drawRect(ctx, 'notes', NOTE_COL[n.type] * nw, 0, nw, nh, x, sy);
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
        this.drawRect(ctx, 'notes', (col + 1) * nw, 0, nw, nh, x + nw, sy);
        this.drawRect(ctx, 'notes', col * nw, 0, nw, nh, x, sy);
        this.drawSe(ctx, se, i, x, sy, seW, seRowH);
        continue;
      }

      if (Math.min(x, xEnd) > W || Math.max(x, xEnd) < -nw) continue;
      const head = NOTE_COL[n.type];
      const bodyStart = x + nw / 2;
      const bodyLen = xEnd - bodyStart + nw / 2;
      // Body (stretched), end cap, then head.
      if (bodyLen > 0) this.drawRect(ctx, 'notes', (head + 1) * nw, 0, nw, nh, bodyStart, sy, bodyLen, nh);
      this.drawRect(ctx, 'notes', (head + 2) * nw, 0, nw, nh, xEnd + nw / 2, sy);
      this.drawRect(ctx, 'notes', head * nw, 0, nw, nh, x, sy);
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
    this.draw(ctx, 'taikoFrame', L.taikoFrame[0], L.taikoFrame[1]);

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

    // Score: right-aligned over 7 slots, bottom anchored.
    const score = stepAt(this.play.score, t);
    const sIm = this.img('score');
    if (sIm) {
      const s = String(score);
      const [dw, dh] = L.scoreSize;
      const slots = Math.max(7, s.length);
      for (let i = 0; i < s.length; i++) {
        const d = s.charCodeAt(i) - 48;
        const x = L.score[0] + L.scorePadding * (slots - s.length + i);
        ctx.drawImage(sIm, d * dw, 0, dw, dh, x, L.score[1] - dh, dw, dh);
      }
    }

    // Combo.
    const combo = stepAt(this.play.combo, t);
    if (combo >= MIN_COMBO_SHOWN) {
      this.draw(ctx, 'comboText', L.comboText[0] - 75, L.comboText[1] - 150);
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
    this.drawRect(ctx, 'gaugeFill', rx, ry, Math.min(filledW, clearW), rh, gx, gy);
    if (filledW > clearW) this.drawRect(ctx, 'gaugeClear', rx + clearW, ry, filledW - clearW, rh, gx + clearW, gy);

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

  private drawJudgeText(ctx: Ctx2D, t: number): void {
    const L = this.skin.manifest.layout;
    const im = this.img('judge');
    if (!im) return;
    const rowH = im.height / 5;
    const js = this.play.judgements;
    for (let i = lowerBound(js, t - JUDGE_MS); i < js.length && js[i].time <= t; i++) {
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

  private drawTitle(ctx: Ctx2D): void {
    const L = this.skin.manifest.layout;
    const font = this.skin.fontFamily;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const drawText = (text: string, size: number, y: number) => {
      if (!text) return;
      ctx.font = `${size}px ${font}`;
      ctx.lineWidth = size / 5;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      const maxW = this.width * 0.6;
      const w = ctx.measureText(text).width;
      ctx.save();
      if (w > maxW) {
        ctx.translate(L.title[0], 0);
        ctx.scale(maxW / w, 1);
        ctx.translate(-L.title[0], 0);
      }
      ctx.strokeText(text, L.title[0], y);
      ctx.fillText(text, L.title[0], y);
      ctx.restore();
    };
    drawText(this.opts.title, L.titleFontSize, L.title[1]);
    drawText(this.opts.subtitle, L.subtitleFontSize, L.title[1] + L.subtitleFontSize + 14);
  }
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
