/**
 * Dan-i dojo (段位道場) overlay: exam panel, section curtain and song titles.
 * Follows OpenTaiko's Dan_Cert.Draw/DrawExam with its 17_DanC textures.
 */
import {
  DAN_CURTAIN_IN_MS,
  DAN_CURTAIN_OUT_MS,
  DAN_CURTAIN_WAIT_MS,
  DAN_EXAM_SWITCH_MS,
  DAN_TEXT_MS,
  Reach,
  danSongAt,
  examDisplayed,
  examPercent,
  flashSpeed,
  gaugeTextureIndex,
  snapAt,
  type DanPlay,
  type ExamSnapshot,
  type ExamTrack,
  type ReachStatus,
} from '../sim/dan';
import type { DanLayout, ImageKey, ImageSource, LoadedSkin } from '../skin/types';
import { EXAM_TYPES, type DanExam } from '../tja/types';
import type { Ctx2D } from './renderer';

/** OpenTaiko's 720p Game_DanC_* defaults. */
const DAN_LAYOUT_720: DanLayout = {
  gaugeExam: [807, 116],
  panel: [70, 292],
  size: [1006, 92],
  padding: 9,
  baseOffsetX: [0, 503],
  baseOffsetY: [0, 0],
  smallBaseOffsetX: [745, 410],
  smallBaseOffsetY: [119, 119],
  offset: [259, 27],
  numberSize: [48, 58],
  smallNumberSize: [24, 29],
  miniNumberSize: [23, 28],
  numberPadding: 35,
  numberSmallScale: 0.92,
  numberSmallPadding: 41,
  examNumberScale: 0.47,
  numberOffset: [285, 38],
  examTypeSize: [247, 28],
  examRangeSize: [54, 30],
  examRangePadding: 49,
  examOffset: [222, 27],
  title: [
    [806, 257],
    [806, 237],
  ],
  subtitle: [806, 277],
  titleSize: 40,
  subtitleSize: 29,
  titleMaxWidth: 710,
  plate: [1120, 535],
};
const UNSCALED: (keyof DanLayout)[] = ['numberSmallScale', 'examNumberScale'];

export function danLayoutFor(skin: LoadedSkin): DanLayout {
  const k = skin.manifest.resolution[1] / 720;
  const scale = (v: unknown): unknown =>
    typeof v === 'number' ? v * k : Array.isArray(v) ? v.map((x) => scale(x)) : v;
  const out = {} as Record<string, unknown>;
  for (const [key, v] of Object.entries(DAN_LAYOUT_720)) out[key] = UNSCALED.includes(key as keyof DanLayout) ? v : scale(v);
  return { ...(out as unknown as DanLayout), ...(skin.manifest.layout.dan ?? {}) };
}

/** Number bounce after an amount change (OpenTaiko Dan_Cert.ScoreScale, 12ms steps). */
const SCORE_SCALE = [0, 0.111, 0.222, 0.185, 0.148, 0.129, 0.111, 0.074, 0.065, 0.033, 0.015, 0];

/** Exam names (OpenTaiko ja lang), for skins whose ExamType.png has no baked label. */
export const EXAM_NAMES: Record<DanExam['type'], string> = {
  gauge: '魂ゲージ',
  judgePerfect: '良の数',
  judgeGood: '可の数',
  judgeBad: '不可の数',
  score: 'スコア',
  roll: '連打数',
  hit: '叩けた数',
  combo: 'コンボ数',
  accuracy: '精度',
  judgeAdlib: 'アドリブ',
  judgeMine: '爆弾',
};

interface SectionClock {
  /** Song showing (OpenTaiko NowShowingNumber). */
  n: number;
  /** Song whose individual exams are displayed (NowCymbolShowingNumber). */
  cymbol: number;
  /** ms into the curtain counters (null = not running). */
  inMs: number | null;
  waitMs: number | null;
  outMs: number | null;
  textMs: number | null;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v)) / 255;

export class DanOverlay {
  readonly L: DanLayout;
  private readonly k: number;
  private readonly whites = new Map<ImageSource, OffscreenCanvas | null>();
  /** Plain, unbaked exam type pill: the ExamType.png has one row per exam type when it has ≥ 8 rows. */
  private readonly bakedTypes: boolean;

  private plateCache: OffscreenCanvas | null | undefined;

  constructor(
    private readonly skin: LoadedSkin,
    private readonly dan: DanPlay,
    private readonly gaugeCellW: number,
    private readonly gaugeX: number,
    /** Dan name for the plate (TJA TITLE, e.g. 十段). */
    private readonly danTitle = '',
    /** Dan_Plate.png from the song folder, drawn instead of the generated plate. */
    private readonly plateImage?: ImageSource,
  ) {
    this.L = danLayoutFor(skin);
    this.k = skin.manifest.resolution[1] / 720;
    const et = skin.images.danExamType;
    this.bakedTypes = !!et && et.height >= this.L.examTypeSize[1] * 8 - 2;
  }

  private img(key: ImageKey) {
    return this.skin.images[key];
  }

  get songs() {
    return this.dan.info.songs;
  }

  songAt(t: number): number {
    return danSongAt(this.dan, t);
  }

  clock(t: number): SectionClock {
    const n = this.songAt(t);
    const start = this.dan.sections[n].start;
    const e = t - start;
    let inMs: number | null = null;
    let waitStart = start;
    if (n > 0) {
      if (e < DAN_CURTAIN_IN_MS) inMs = e;
      waitStart = start + DAN_CURTAIN_IN_MS;
    }
    const w = t - waitStart;
    const waitMs = inMs === null && w >= 0 && w < DAN_CURTAIN_WAIT_MS ? w : null;
    const o = t - (waitStart + DAN_CURTAIN_WAIT_MS);
    const outMs = o >= 0 && o < DAN_CURTAIN_OUT_MS ? o : null;
    const textMs = o >= 0 && o < DAN_TEXT_MS ? o : null;
    const switched = n === 0 || (inMs === null && (waitMs === null || waitMs >= DAN_EXAM_SWITCH_MS));
    return { n, cymbol: switched ? n : n - 1, inMs, waitMs, outMs, textMs };
  }

  /** White silhouette of an image, for the bar flash. */
  private white(im: ImageSource): OffscreenCanvas | null {
    if (!this.whites.has(im)) {
      let c: OffscreenCanvas | null = null;
      if (typeof OffscreenCanvas !== 'undefined') {
        c = new OffscreenCanvas(im.width, im.height);
        const x = c.getContext('2d');
        if (x) {
          x.drawImage(im, 0, 0);
          x.globalCompositeOperation = 'source-in';
          x.fillStyle = '#fff';
          x.fillRect(0, 0, im.width, im.height);
        } else c = null;
      }
      this.whites.set(im, c);
    }
    return this.whites.get(im) ?? null;
  }

  // ------------------------------------------------------------- background + exams

  /** DanC background, exam bars and the soul gauge exam tab (OpenTaiko actDan.Draw minus the curtain). */
  drawPanel(ctx: Ctx2D, t: number, fontFamily: string): void {
    const bg = this.img('danBackground');
    if (bg) ctx.drawImage(bg, 0, 0);
    const c = this.clock(t);

    const slots = this.dan.slots;
    const countNoGauge = slots.filter((s) => this.examOf(s.tracks, c)?.type !== 'gauge').length;
    let pos = -1;
    for (const slot of slots) {
      const track = slot.individual ? slot.tracks[c.cymbol] : slot.tracks[0];
      if (!track) continue;
      if (track.exam.type === 'gauge') {
        this.drawGaugeExam(ctx, track, t, fontFamily);
        continue;
      }
      pos++;
      this.drawBar(ctx, t, c, slot.individual, slot.tracks, track, pos, countNoGauge, fontFamily);
    }
    this.drawPlate(ctx, fontFamily);
  }

  /** Dan plate right of the exams (Dan_Plate.png, or a generated wooden plaque with the dan name). */
  private drawPlate(ctx: Ctx2D, fontFamily: string): void {
    const [cx, cy] = this.L.plate;
    const im = this.plateImage ?? this.generatedPlate(fontFamily);
    if (!im) return;
    ctx.drawImage(im, cx - im.width / 2, cy - im.height / 2);
  }

  private generatedPlate(fontFamily: string): OffscreenCanvas | null {
    if (this.plateCache !== undefined) return this.plateCache;
    this.plateCache = null;
    const name = this.danTitle.trim();
    if (!name || typeof OffscreenCanvas === 'undefined') return null;
    this.plateCache = drawDanPlate(name, this.k, fontFamily);
    return this.plateCache;
  }

  private examOf(tracks: (ExamTrack | null)[], c: SectionClock): DanExam | undefined {
    return (tracks[c.cymbol] ?? tracks[0] ?? tracks.find((x) => x))?.exam;
  }

  private drawGaugeExam(ctx: Ctx2D, track: ExamTrack, t: number, fontFamily: string): void {
    const L = this.L;
    const k = this.k;
    const v = track.exam.values[0];
    const s = snapAt(track, t);
    const x0 = L.gaugeExam[0] - (50 - Math.trunc(v / 2)) * this.gaugeCellW + 4 * k;
    const y0 = L.gaugeExam[1];
    const base = this.img('danGaugeBase');
    if (base) ctx.drawImage(base, x0, y0);
    this.text(ctx, EXAM_NAMES.gauge, x0 + 104 * k, y0 + 21 * k, fontFamily);
    const pad = Math.trunc(L.numberSmallPadding * L.examNumberScale);
    const str = String(v);
    this.number(ctx, 'danSmallNumber', L.smallNumberSize, v, x0 + 292 * k - str.length * pad, y0 - L.examOffset[1] + 64 * k, pad, s.status, 0);
  }

  private drawBar(
    ctx: Ctx2D,
    t: number,
    c: SectionClock,
    individual: boolean,
    tracks: (ExamTrack | null)[],
    track: ExamTrack,
    pos: number,
    countNoGauge: number,
    fontFamily: string,
  ): void {
    const L = this.L;
    const k = this.k;
    const small = pos >= 3 || (countNoGauge > 3 && countNoGauge % 3 > pos) || countNoGauge === 6;
    const yIndex = (pos % 3) + 1;
    const barX = L.panel[0] + (pos >= 3 ? L.baseOffsetX[1] : L.baseOffsetX[0]);
    const barY = L.panel[1] + (pos >= 3 ? L.baseOffsetY[1] : L.baseOffsetY[0]) + L.size[1] * yIndex + yIndex * L.padding;
    const lowerY = barY + L.size[1] + L.padding;

    // Base (individual exams use the lower half).
    const base = this.img(small ? 'danBaseSmall' : 'danBase');
    if (base) {
      const h = base.height / 2;
      ctx.drawImage(base, 0, individual ? h : 0, base.width, h, barX, barY, base.width, h);
    }

    const wait = c.waitMs;
    const fadeIn = wait !== null ? clamp255(wait - DAN_EXAM_SWITCH_MS) : 0;
    const fadeOut = wait !== null ? clamp255(255 - (wait - (DAN_EXAM_SWITCH_MS - 255))) : 0;

    // Small bars: results of the previous one or two songs.
    if (individual) {
      for (let j = 0; j < this.songs.length - 1; j++) {
        const tj = tracks[j];
        if (!tj || !tracks[c.cymbol]) continue;
        let op = j > c.n - 3 && j <= c.n - 1 ? 1 : 0;
        if (j === c.n - 1) {
          if (c.inMs !== null || (wait !== null && wait < DAN_EXAM_SWITCH_MS)) op = 0;
          else if (wait !== null) op = fadeIn;
        } else if (j === c.n - 3) {
          if (c.inMs !== null) op = 1;
          else if (wait !== null && wait < DAN_EXAM_SWITCH_MS) op = fadeOut;
        }
        if (op <= 0) continue;
        this.drawSmallBar(ctx, t, tj, j, barX, barY, small, op);
      }
    }

    // 1st/2nd/3rd badge.
    let cymOp = 1;
    if (individual && c.n !== 0 && wait !== null) {
      if (wait >= DAN_EXAM_SWITCH_MS) cymOp = fadeIn;
      else if (wait >= DAN_EXAM_SWITCH_MS - 255) cymOp = fadeOut;
    }
    if (individual) {
      const cym = this.img('danExamCymbol');
      if (cym) {
        const ch = 41 * k;
        ctx.globalAlpha = cymOp;
        ctx.drawImage(cym, 0, ch * c.cymbol, 197 * k, ch, barX + 5 * k, lowerY - 64 * k, 197 * k, ch);
        ctx.globalAlpha = 1;
      }
    }

    const s = snapAt(track, t);
    let opacity = 1;
    if (individual && c.n !== 0 && wait !== null) {
      if (wait >= DAN_EXAM_SWITCH_MS) opacity = fadeIn;
      else if (wait >= DAN_EXAM_SWITCH_MS - 255) opacity = fadeOut;
    }

    // Flashes: 400ms white flash on a status change, plus the blink loop.
    let white = 0;
    if (Number.isFinite(s.statusChanged) && t - s.statusChanged < 400) white = Math.min(1, (400 - (t - s.statusChanged)) / 315);
    let gaugeOp = opacity;
    const speed = flashSpeed(s.status);
    if (s.status === Reach.Failure) gaugeOp = 0;
    else if (speed && Number.isFinite(s.flashStart)) {
      const delay = s.status === Reach.Danger ? 400 : 0;
      const v = (((t - s.flashStart) * speed) % (1000 + delay)) - delay;
      const loop = (1 + Math.cos((2 * Math.PI * Math.max(0, v)) / 1000)) / 2;
      if (s.status === Reach.Danger) gaugeOp = opacity * loop;
      else white = Math.max(white, loop);
    }

    const xExtend = individual ? (small ? 0.215 * 0.663333333 : 0.663333333) : small ? 0.32154 : 1;
    const pct = examPercent(track.exam, s.amount);
    const gx = barX + L.offset[0];
    const gBottom = lowerY - L.offset[1];
    const drawFill = (im: ImageSource | undefined, alpha: number) => {
      if (!im || pct <= 0) return;
      const sw = Math.trunc((pct * im.width) / 100);
      if (sw <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, 0, 0, sw, im.height, gx, gBottom - im.height, sw * xExtend, im.height);
      const w = white > 0 ? this.white(im) : null;
      if (w) {
        ctx.globalAlpha = white * opacity;
        ctx.drawImage(w, 0, 0, sw, im.height, gx, gBottom - im.height, sw * xExtend, im.height);
      }
      ctx.globalAlpha = 1;
    };
    if (s.status === Reach.BetterSuccess && this.skin.danRainbow?.frames.length) {
      const rb = this.skin.danRainbow;
      const n = rb.frames.length;
      const p = t / rb.frameMs;
      const cur = ((Math.floor(p) % n) + n) % n;
      drawFill(rb.frames[cur], gaugeOp);
      drawFill(rb.frames[(cur + 1) % n], gaugeOp * (p - Math.floor(p)));
    } else {
      drawFill(this.gaugeImage(gaugeTextureIndex(s.status, track.exam.range === 'less')), gaugeOp);
    }

    // Current amount.
    const nsx = small ? L.numberSmallScale * 0.6 : L.numberSmallScale;
    const nsy = small ? L.numberSmallScale * 0.8 : L.numberSmallScale;
    const npad = Math.trunc(L.numberPadding * (small ? 0.6 : 1));
    const bounceIdx = Number.isFinite(s.amountChanged) ? Math.floor((t - s.amountChanged) / 12) : 99;
    const bounce = bounceIdx >= 0 && bounceIdx < SCORE_SCALE.length ? SCORE_SCALE[bounceIdx] : 0;
    ctx.globalAlpha = opacity;
    this.number(
      ctx,
      'danNumber',
      L.numberSize,
      examDisplayed(track.exam, s.amount),
      barX + L.numberOffset[0],
      lowerY - L.numberOffset[1],
      npad,
      s.status,
      s.status === Reach.BetterSuccess ? 1 : 0,
      nsx,
      nsy + bounce,
    );

    // Condition: "N 以上/未満" and the exam type label.
    let off = L.examOffset[0];
    const range = this.img('danExamRange');
    if (range) {
      const [rw, rh] = L.examRangeSize;
      const row = track.exam.range === 'less' ? 1 : 0;
      ctx.drawImage(range, 0, rh * row, rw, rh, barX + off - range.width, lowerY - L.examOffset[1] - rh, rw, rh);
    }
    off -= L.examRangePadding;
    const v0 = track.exam.values[0];
    const pad = Math.trunc(L.numberSmallPadding * L.examNumberScale);
    this.number(ctx, 'danSmallNumber', L.smallNumberSize, v0, barX + off - String(v0).length * pad, lowerY - L.examOffset[1] - 1, pad, s.status, 0);

    const et = this.img('danExamType');
    const [tw, th] = L.examTypeSize;
    const ex = barX + L.examOffset[0] - (et?.width ?? tw) + 22 * k;
    const ey = lowerY - L.examOffset[1] - 48 * k;
    const typeRow = EXAM_TYPES.indexOf(track.exam.type);
    const baked = this.bakedTypes && typeRow < Math.floor((et?.height ?? 0) / th);
    if (et) ctx.drawImage(et, 0, baked ? typeRow * th : 0, tw, th, ex, ey - th, tw, th);
    if (!baked) this.text(ctx, EXAM_NAMES[track.exam.type], ex + tw / 2, ey - th / 2, fontFamily);

    // 達成失敗
    if (s.status === Reach.Failure) {
      const f = this.img('danFailed');
      if (f) {
        ctx.globalAlpha = opacity * Math.min(1, Number.isFinite(s.statusChanged) ? (t - s.statusChanged) / 85 : 1);
        const fw = f.width * (small ? 0.33 : 1);
        ctx.drawImage(f, gx, gBottom - f.height, fw, f.height);
      }
    }
    ctx.globalAlpha = 1;
  }

  private gaugeImage(idx: number): ImageSource | undefined {
    return this.img((['danGaugeNormal', 'danGaugeReach', 'danGaugeClear', 'danGaugeFlush'] as const)[idx]);
  }

  private drawSmallBar(
    ctx: Ctx2D,
    t: number,
    track: ExamTrack,
    j: number,
    barX: number,
    barY: number,
    small: boolean,
    op: number,
  ): void {
    const L = this.L;
    const k = this.k;
    const s: ExamSnapshot = snapAt(track, t);
    const sx = small ? 0.34 : 1;
    const mx = barX + (small ? L.smallBaseOffsetX[1] : L.smallBaseOffsetX[0]);
    const my = barY + (small ? L.smallBaseOffsetY[1] : L.smallBaseOffsetY[0]) + (j % 2) * 33 * k - (L.size[1] + L.padding);
    ctx.globalAlpha = op;
    const sb = this.img('danSmallBase');
    if (sb) ctx.drawImage(sb, mx, my, sb.width * sx, sb.height);
    const sc = this.img('danSmallExamCymbol');
    if (sc) ctx.drawImage(sc, 0, j * 28 * k, 30 * k, 28 * k, mx - 30 * k, my - 3 * k, 30 * k, 28 * k);
    const pct = examPercent(track.exam, s.amount);
    const im =
      s.status === Reach.BetterSuccess && this.skin.danRainbow?.frames.length
        ? this.skin.danRainbow.frames[0]
        : this.gaugeImage(gaugeTextureIndex(s.status, track.exam.range === 'less'));
    if (im && pct > 0) {
      const sw = Math.trunc((pct * im.width) / 100);
      const scx = 0.23875 * sx * (small ? 0.94 : 1);
      if (sw > 0) ctx.drawImage(im, 0, 0, sw, im.height, mx + 3 * k, my + 2 * k, sw * scx, im.height * 0.35185);
    }
    const mini = this.img('danMiniNumber');
    if (mini) {
      const [dw, dh] = L.miniNumberSize;
      const str = String(examDisplayed(track.exam, s.amount));
      const row = s.status === Reach.BetterSuccess && mini.height >= dh * 2 - 1 ? 1 : 0;
      for (let i = 0; i < str.length; i++) {
        const d = str.charCodeAt(i) - 48;
        const cx = mx + 11 * k + i * 14 * k;
        ctx.drawImage(mini, dw * d, dh * row, dw, dh, cx - dw / 2, my + 20 * k - dh, dw, dh);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Digits left to right from x (first digit's centre), bottom-anchored; grey when 0 or failed. */
  private number(
    ctx: Ctx2D,
    key: ImageKey,
    size: [number, number],
    value: number,
    x: number,
    bottom: number,
    padding: number,
    status: ReachStatus,
    row: number,
    scaleX = 1,
    scaleY = 1,
  ): void {
    const im = this.img(key);
    if (!im || value < 0) return;
    const str = String(Math.trunc(value));
    const [dw, dh] = size;
    const r = row && im.height >= dh * 2 - 1 ? row : 0;
    const grey = value === 0 || status === Reach.Failure;
    const prevFilter = ctx.filter;
    if (grey) ctx.filter = 'brightness(0.5)';
    for (let i = 0; i < str.length; i++) {
      const d = str.charCodeAt(i) - 48;
      const cx = x + i * padding;
      const w = dw * scaleX;
      const h = dh * scaleY;
      ctx.drawImage(im, dw * d, dh * r, dw, dh, cx - w / 2, bottom - h, w, h);
    }
    if (grey) ctx.filter = prevFilter;
  }

  private text(ctx: Ctx2D, s: string, cx: number, cy: number, fontFamily: string): void {
    const size = Math.round(14 * (4 / 3) * this.k);
    ctx.save();
    ctx.font = `bold ${size}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 4;
    ctx.strokeStyle = '#8b4513';
    ctx.fillStyle = '#fff';
    ctx.strokeText(s, cx, cy);
    ctx.fillText(s, cx, cy);
    ctx.restore();
  }

  // ------------------------------------------------------------- curtain

  /** Section curtain over the lane (drawn before the notes, like OpenTaiko) and the song title. */
  drawCurtain(ctx: Ctx2D, t: number, lane: [number, number], width: number, fontFamily: string): void {
    const c = this.clock(t);
    const scr = this.img('danScreen');
    const a0 = lane[0];
    const a2 = width;
    const a1 = a0 + (a2 - a0) / 2;
    const halves = (p0: number, p1: number) => {
      if (!scr) return;
      const hw = scr.width / 2;
      ctx.drawImage(scr, 0, 0, hw, scr.height, Math.ceil(p0) - hw, lane[1], hw, scr.height);
      ctx.drawImage(scr, hw, 0, hw, scr.height, Math.floor(p1), lane[1], hw, scr.height);
    };
    if (c.inMs !== null) {
      const smooth = 1 - 1 / 180;
      const linOff = DAN_CURTAIN_IN_MS - 150;
      let r = 1 - Math.pow(smooth, Math.min(linOff, c.inMs));
      if (c.inMs > linOff) r += ((1 - r) * (c.inMs - linOff)) / 150;
      halves(r * a1 + (1 - r) * a0, r * a1 + (1 - r) * a2);
    } else if (c.waitMs !== null) {
      if (scr) ctx.drawImage(scr, lane[0], lane[1]);
    } else if (c.outMs !== null) {
      const deg = Math.min(90, c.outMs / 3);
      const open = (Math.sin((deg * Math.PI) / 180) * (a2 - a0)) / 2;
      halves(a1 - open, a1 + open);
    }

    if (c.textMs !== null) {
      const song = this.songs[c.cymbol];
      const a = c.textMs >= 2000 ? Math.max(0, 255 - (c.textMs - 2000) / 2) / 255 : 1;
      if (song && a > 0) {
        const L = this.L;
        ctx.globalAlpha = a;
        if (!song.subtitle) this.titleText(ctx, song.title, L.title[0], L.titleSize, fontFamily);
        else {
          this.titleText(ctx, song.title, L.title[1], L.titleSize, fontFamily);
          this.titleText(ctx, song.subtitle, L.subtitle, L.subtitleSize, fontFamily);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private titleText(ctx: Ctx2D, s: string, [x, y]: [number, number], size: number, fontFamily: string): void {
    ctx.save();
    ctx.font = `${size}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    const w = ctx.measureText(s).width;
    ctx.translate(x, y);
    if (w > this.L.titleMaxWidth) ctx.scale(this.L.titleMaxWidth / w, 1);
    ctx.strokeText(s, 0, 0);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }

  /** Song title for the panel at time t. */
  titleAt(t: number): string {
    return this.songs[this.songAt(t)]?.title ?? '';
  }

  // ------------------------------------------------------------- soul gauge

  /** Soul gauge exam value (for the dan gauge clear marker), if any. */
  gaugeExamValue(t: number): number | undefined {
    const c = this.clock(t);
    for (const slot of this.dan.slots) {
      const tr = slot.individual ? slot.tracks[c.cymbol] : slot.tracks[0];
      if (tr?.exam.type === 'gauge') return tr.exam.values[0];
    }
    return undefined;
  }

  get gaugeLeft(): number {
    return this.gaugeX;
  }
}

const KANJI_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const EN_NUM = ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH'];
const SPECIAL: Record<string, [string, string, string]> = {
  // name: [English, plate colour, edge colour]
  玄人: ['KUROTO', '#9aa3ad', '#4b525a'],
  名人: ['MEIJIN', '#c9ced6', '#5d646e'],
  超人: ['CHOJIN', '#f2c84b', '#8a6410'],
  達人: ['TATSUJIN', '#f7d35a', '#8a6410'],
};

/** English name and plate colours for a dan title like 十段, 五級, 初段 or 達人. */
export function danPlateStyle(name: string): { en: string; fill: string; edge: string } {
  for (const [k, [en, fill, edge]] of Object.entries(SPECIAL)) if (name.includes(k)) return { en, fill, edge };
  const m = /([一二三四五六七八九十初])(段|級)/.exec(name);
  if (m) {
    const n = m[1] === '初' ? 1 : KANJI_NUM.indexOf(m[1]);
    const dan = m[2] === '段';
    const en = `${EN_NUM[n] ?? ''} ${dan ? 'DAN' : 'KYU'}`.trim();
    if (!dan) return { en, fill: '#5cc3e8', edge: '#1f6488' };
    return n >= 6 ? { en, fill: '#e8452c', edge: '#7a1607' } : { en, fill: '#3f7fe0', edge: '#163a7a' };
  }
  return { en: '', fill: '#e8452c', edge: '#7a1607' };
}

/** A wooden plaque with the dan name written vertically (arcade-style dan plate). */
export function drawDanPlate(name: string, k: number, fontFamily: string): OffscreenCanvas {
  const W = Math.round(150 * k);
  const H = Math.round(330 * k);
  const c = new OffscreenCanvas(W, H);
  const x = c.getContext('2d')!;
  const { en, fill, edge } = danPlateStyle(name);
  const pad = 6 * k;
  // Slightly wavy top and bottom edges, like a painted wooden board.
  const shape = () => {
    x.beginPath();
    x.moveTo(pad, pad + 10 * k);
    x.quadraticCurveTo(W * 0.3, pad - 2 * k, W * 0.55, pad + 6 * k);
    x.quadraticCurveTo(W * 0.8, pad + 12 * k, W - pad, pad);
    x.lineTo(W - pad - 4 * k, H - pad - 12 * k);
    x.quadraticCurveTo(W * 0.7, H - pad + 2 * k, W * 0.45, H - pad - 6 * k);
    x.quadraticCurveTo(W * 0.2, H - pad - 12 * k, pad + 4 * k, H - pad);
    x.closePath();
  };
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.35)';
  x.shadowBlur = 6 * k;
  x.shadowOffsetX = 3 * k;
  x.shadowOffsetY = 3 * k;
  shape();
  x.fillStyle = edge;
  x.fill();
  x.restore();
  x.save();
  x.translate(W / 2, H / 2);
  x.scale(0.93, 0.95);
  x.translate(-W / 2, -H / 2);
  shape();
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, fill);
  g.addColorStop(1, edge);
  x.fillStyle = fill;
  x.fill();
  // Wood grain.
  x.clip();
  x.globalAlpha = 0.18;
  x.strokeStyle = edge;
  x.lineWidth = 2 * k;
  for (let i = 0; i < 9; i++) {
    const yy = (H / 9) * i + 12 * k;
    x.beginPath();
    x.moveTo(0, yy);
    x.bezierCurveTo(W * 0.3, yy - 8 * k, W * 0.6, yy + 10 * k, W, yy - 4 * k);
    x.stroke();
  }
  x.globalAlpha = 0.25;
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.restore();

  // Vertical dan name.
  const chars = [...name.replace(/\s+/g, '')].slice(0, 4);
  const areaH = H - (en ? 90 : 50) * k;
  const size = Math.min(92 * k, areaH / Math.max(1, chars.length));
  x.font = `900 ${size}px ${fontFamily}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  const top = 24 * k + (areaH - size * chars.length) / 2;
  chars.forEach((ch, i) => {
    const cy = top + size * (i + 0.5);
    x.lineWidth = size * 0.22;
    x.strokeStyle = '#1a0d08';
    x.strokeText(ch, W / 2, cy);
    x.fillStyle = '#fff';
    x.fillText(ch, W / 2, cy);
  });
  if (en) {
    const words = en.split(' ');
    const es = 21 * k;
    x.font = `800 ${es}px ${fontFamily}`;
    x.fillStyle = '#111';
    words.forEach((w, i) => {
      const yy = H - (36 + (words.length - 1 - i) * 24) * k;
      const mw = W - 30 * k;
      const tw = x.measureText(w).width;
      x.save();
      x.translate(W / 2, yy);
      if (tw > mw) x.scale(mw / tw, 1);
      x.fillText(w, 0, 0);
      x.restore();
    });
  }
  return c;
}
