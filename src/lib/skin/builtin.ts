/**
 * "Neon Night" — tja2vid's built-in skin.
 *
 * Everything here is drawn procedurally at load time (no image or audio
 * files), so the app ships with an original look and no third-party assets.
 * It produces the same sprite-sheet formats an OpenTaiko-style skin uses, so
 * the renderer treats it like any other skin.
 */
import type {
  CharaState,
  LoadedCharacter,
  BackgroundSpec,
  ImageKey,
  ImageSource,
  LoadedDancer,
  LoadedSkin,
  SkinLayout,
  SkinManifest,
} from './types';

type C2D = OffscreenCanvasRenderingContext2D;

const W = 1920;
const H = 1080;
const FONT = '"Segoe UI", "Noto Sans", "Noto Sans KR", system-ui, sans-serif';

const COLOR = {
  don: '#ff4f5e',
  donDark: '#b3123a',
  ka: '#35c3ff',
  kaDark: '#0b6fa8',
  roll: '#ffc83d',
  rollDark: '#b67c00',
  balloon: '#ff8a3d',
  balloonDark: '#b04a0c',
  outline: '#15121f',
  rim: '#fff6e8',
  lane: '#1b1830',
  laneLine: '#2a2547',
  accent: '#ff5fa2',
  gold: '#ffd25e',
};

export const BUILTIN_LAYOUT: SkinLayout = {
  noteSize: [194, 194],
  scrollField: [560, 293],
  pxPer4Beats: 1440,
  seNotesOffset: [-5, 199],
  seNoteSize: [204, 40],
  lane: [520, 290],
  laneSub: [520, 490],
  judge: [527, 210],
  judgeMove: [0, 22],
  judgeRows: 5,
  notesAnime: false,
  taikoBackground: [0, 282],
  taikoFrame: [512, 282],
  taiko: [320, 320],
  combo: [410, 432],
  comboEx: [410, 432],
  comboEx4: [410, 432],
  comboPadding: [54, 50, 44],
  comboSize: [60, 72],
  comboText: [410, 492],
  courseSymbol: [18, 300],
  score: [24, 506],
  scorePadding: 34,
  scoreSize: [39, 51],
  gauge: [800, 214],
  gaugeRect: [0, 0, 1040, 60],
  gaugeClearText: [1640, 276],
  gaugeClearTextRect: [0, 70, 120, 34],
  gaugeClearTextClearRect: [130, 70, 120, 34],
  gaugeCells: 50,
  soul: [1790, 189],
  soulFire: [1695, 94],
  soulFireFrames: 8,
  flyingStart: [657, 390],
  flyingEnd: [1845, 244],
  flyingSine: 300,
  notesFlash: [240, 240, 16],
  hitExplosion: [507, 240],
  hitExplosionFrames: 7,
  gogoFire: [447, 180],
  gogoFireFrames: 7,
  balloon: [560, 96],
  balloonFrame: [700, 36],
  balloonNumber: [0, 196],
  balloonNumberSize: [95, 113],
  balloonNumberInterval: [80, 0],
  rollFrame: [250, 20],
  rollFrameFrames: 5,
  rollNumber: [0, 196],
  title: [1890, 52],
  titleMaxWidth: 960,
  titleFontSize: 52,
  subtitleFontSize: 30,
  bgUpHeight: 282,
  bgDownY: 542,
  loadingPlate: [960, 540],
  loadingTitle: [960, 512],
  loadingSubtitle: [960, 590],
  loadingTitleFontSize: 68,
  loadingSubtitleFontSize: 36,
  loadingCharaMove: [0, 140],
  loadingTitleColor: '#ffffff',
  loadingTitleStroke: '#15121f',
  loadingSubtitleColor: '#ffd2ec',
  loadingSubtitleStroke: '#15121f',
  loadingTransition: 'fade',
  nameplate: [12, 552],
  nameplateScale: 1,
  nameplateBadgeScale: 1,
  nameplatePlateOffset: 38,
  scoreAdd: [24, 440],
};

const BACKGROUND: BackgroundSpec = {
  color: '#0b0a18',
  layers: [
    { image: 'gen:sky', width: W, height: 282 },
    { image: 'gen:skyClear', width: W, height: 282, show: 'clear' },
    { image: 'gen:stars', width: W, height: 282, tileX: true, tileY: true, scrollX: 24, scrollY: 6 },
    { image: 'gen:hills', y: 150, width: W, tileX: true, scrollX: 40 },
    { image: 'gen:stage', y: 542 },
    { image: 'gen:stageClear', y: 542, show: 'clear' },
    { image: 'gen:lights', y: 542, width: W, tileX: true, scrollX: 90 },
    { image: 'gen:confetti', y: 542, width: W, height: 498, tileX: true, tileY: true, scrollX: 40, scrollY: -60, show: 'clear' },
  ],
};

export const BUILTIN_MANIFEST: SkinManifest = {
  id: 'builtin-neon-night',
  name: 'Neon Night (기본)',
  resolution: [W, H],
  images: {},
  sounds: {},
  layout: BUILTIN_LAYOUT,
  background: BACKGROUND,
  credits: 'tja2vid 기본 스킨 — 코드로 생성된 오리지널 그래픽과 합성 타격음.',
};

// ------------------------------------------------------------------ helpers

function canvas(w: number, h: number): [OffscreenCanvas, C2D] {
  const c = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function circle(ctx: C2D, x: number, y: number, r: number, fill: string | CanvasGradient, stroke?: string, lw = 0) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke && lw) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function roundRect(ctx: C2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(
  ctx: C2D,
  s: string,
  x: number,
  y: number,
  size: number,
  fill: string | CanvasGradient,
  stroke = COLOR.outline,
  align: CanvasTextAlign = 'center',
  weight = 800,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.lineWidth = size / 4.5;
    ctx.strokeStyle = stroke;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}

/** A glossy note face: outline, white rim, coloured body, soft highlight and a ring motif. */
function noteFace(ctx: C2D, cx: number, cy: number, r: number, color: string, dark: string) {
  circle(ctx, cx, cy + r * 0.06, r + 4, 'rgba(0,0,0,0.35)');
  circle(ctx, cx, cy, r, COLOR.outline);
  circle(ctx, cx, cy, r * 0.9, COLOR.rim);
  const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r * 0.75);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, dark);
  circle(ctx, cx, cy, r * 0.74, g);
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  // gloss
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.2, cy - r * 0.38, r * 0.34, r * 0.16, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function digitsSheet(cw: number, ch: number, fill: (ctx: C2D) => string | CanvasGradient, stroke: string): OffscreenCanvas {
  const [c, ctx] = canvas(cw * 10, ch);
  for (let d = 0; d < 10; d++) {
    text(ctx, String(d), cw * d + cw / 2, ch / 2 + 2, ch * 0.92, fill(ctx), stroke, 'center', 900);
  }
  return c;
}

// ------------------------------------------------------------------ sprites

function notesSheet(): OffscreenCanvas {
  const S = 194;
  const [c, ctx] = canvas(S * 13, S);
  const cy = S / 2;
  const small = 50;
  const big = 76;

  // 0: judge circle
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(S / 2, cy, big + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(S / 2, cy, small + 2, 0, Math.PI * 2);
  ctx.stroke();
  circle(ctx, S / 2, cy, small - 6, 'rgba(255,255,255,0.12)');

  noteFace(ctx, S * 1 + S / 2, cy, small, COLOR.don, COLOR.donDark);
  noteFace(ctx, S * 2 + S / 2, cy, small, COLOR.ka, COLOR.kaDark);
  noteFace(ctx, S * 3 + S / 2, cy, big, COLOR.don, COLOR.donDark);
  noteFace(ctx, S * 4 + S / 2, cy, big, COLOR.ka, COLOR.kaDark);

  const rollParts = (col: number, r: number) => {
    // head
    noteFace(ctx, S * col + S / 2, cy, r, COLOR.roll, COLOR.rollDark);
    // body: a uniform horizontal band (stretched by the renderer)
    const bx = S * (col + 1);
    ctx.fillStyle = COLOR.outline;
    ctx.fillRect(bx, cy - r, S, r * 2);
    ctx.fillStyle = COLOR.rim;
    ctx.fillRect(bx, cy - r * 0.9, S, r * 1.8);
    const g = ctx.createLinearGradient(0, cy - r * 0.74, 0, cy + r * 0.74);
    g.addColorStop(0, '#fff1b8');
    g.addColorStop(0.4, COLOR.roll);
    g.addColorStop(1, COLOR.rollDark);
    ctx.fillStyle = g;
    ctx.fillRect(bx, cy - r * 0.74, S, r * 1.48);
    // end cap: right half-disc centred on the cell's left edge
    const ex = S * (col + 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex, 0, S, S);
    ctx.clip();
    circle(ctx, ex, cy, r, COLOR.outline);
    circle(ctx, ex, cy, r * 0.9, COLOR.rim);
    circle(ctx, ex, cy, r * 0.74, g);
    ctx.restore();
  };
  rollParts(5, small);
  rollParts(8, big);

  // 11: balloon head, 12: balloon tail
  noteFace(ctx, S * 11 + S / 2, cy, small, COLOR.balloon, COLOR.balloonDark);
  const tx = S * 12;
  ctx.fillStyle = COLOR.outline;
  ctx.beginPath();
  ctx.moveTo(tx - 50, cy - 16);
  ctx.quadraticCurveTo(tx + 10, cy - 10, tx + 40, cy - 38);
  ctx.arc(tx + 90, cy, 56, Math.PI * 1.15, Math.PI * 0.85);
  ctx.quadraticCurveTo(tx + 10, cy + 10, tx - 50, cy + 16);
  ctx.closePath();
  ctx.fill();
  const bg = ctx.createRadialGradient(tx + 80, cy - 20, 6, tx + 90, cy, 50);
  bg.addColorStop(0, '#ffd7b0');
  bg.addColorStop(1, COLOR.balloon);
  circle(ctx, tx + 90, cy, 48, bg);
  ctx.fillStyle = COLOR.balloon;
  ctx.fillRect(tx - 48, cy - 9, 92, 18);
  return c;
}

function seNotesSheet(): OffscreenCanvas {
  const labels = ['Don', 'Do', 'Ko', 'Kat', 'Ka', 'DON!', 'KAT!', 'Drumroll', '—', '—!!', 'DRUMROLL', 'Balloon'];
  const [c, ctx] = canvas(204, 40 * 12);
  labels.forEach((s, i) => {
    if (s === '—') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, i * 40 + 17, 204, 6);
      return;
    }
    text(ctx, s, 102, i * 40 + 21, 27, '#fff', COLOR.outline, 'center', 800);
  });
  return c;
}

function judgeSheet(): OffscreenCanvas {
  const [c, ctx] = canvas(260, 80 * 5);
  const rows: [string, string, string][] = [
    ['GREAT', '#fff4a8', '#ff9d00'],
    ['GOOD', '#ffffff', '#9aa7b8'],
    ['MISS', '#b8c0ff', '#3b3f8c'],
    ['ADLIB', '#ffd0f0', '#c13f9a'],
    ['BOOM', '#ffb1a0', '#a3271a'],
  ];
  rows.forEach(([s, top, bottom], i) => {
    const g = ctx.createLinearGradient(0, i * 80 + 14, 0, i * 80 + 66);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    text(ctx, s, 130, i * 80 + 42, 56, g, COLOR.outline, 'center', 900);
  });
  return c;
}

function laneImage(tint: string, alpha = 1): OffscreenCanvas {
  const [c, ctx] = canvas(1400, 200);
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#24203d');
  g.addColorStop(0.5, tint);
  g.addColorStop(1, '#15122a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1400, 200);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let y = 25; y < 200; y += 25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1400, y);
    ctx.stroke();
  }
  return c;
}

function laneFlash(color: string): OffscreenCanvas {
  const [c, ctx] = canvas(1400, 200);
  const g = ctx.createLinearGradient(0, 0, 900, 0);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1400, 200);
  return c;
}

function laneText(label: string, color: string): OffscreenCanvas {
  const [c, ctx] = canvas(1400, 200);
  ctx.globalAlpha = 0.18;
  text(ctx, label, 1370, 100, 120, color, '', 'right', 900);
  return c;
}

function laneSub(): OffscreenCanvas {
  const [c, ctx] = canvas(1400, 44);
  const g = ctx.createLinearGradient(0, 0, 0, 44);
  g.addColorStop(0, '#3a3456');
  g.addColorStop(1, '#2a2542');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1400, 44);
  return c;
}

function taikoBackground(): OffscreenCanvas {
  const [c, ctx] = canvas(520, 260);
  const g = ctx.createLinearGradient(0, 0, 520, 260);
  g.addColorStop(0, '#ff5f6d');
  g.addColorStop(1, '#c2185b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 520, 260);
  // diagonal stripes
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 18;
  for (let x = -260; x < 520; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 260);
    ctx.lineTo(x + 260, 0);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 520, 6);
  ctx.fillRect(0, 254, 520, 6);
  return c;
}

function taikoFrame(): OffscreenCanvas {
  const [c, ctx] = canvas(1410, 262);
  ctx.fillStyle = COLOR.outline;
  ctx.fillRect(0, 0, 1410, 8);
  ctx.fillRect(0, 252, 1410, 10);
  ctx.fillRect(0, 0, 8, 262);
  ctx.fillStyle = COLOR.accent;
  ctx.fillRect(0, 6, 1410, 2);
  return c;
}

function drumBase(): OffscreenCanvas {
  const [c, ctx] = canvas(180, 180);
  const cx = 90;
  const cy = 90;
  circle(ctx, cx, cy + 4, 86, 'rgba(0,0,0,0.35)');
  const rim = ctx.createLinearGradient(0, 0, 0, 180);
  rim.addColorStop(0, '#8b3a1a');
  rim.addColorStop(1, '#4a1a0a');
  circle(ctx, cx, cy, 84, rim, COLOR.outline, 4);
  // studs
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    circle(ctx, cx + Math.cos(a) * 75, cy + Math.sin(a) * 75, 3.5, '#f3d9a4');
  }
  const head = ctx.createRadialGradient(cx - 18, cy - 20, 8, cx, cy, 66);
  head.addColorStop(0, '#fffaf0');
  head.addColorStop(1, '#ead7b5');
  circle(ctx, cx, cy, 64, head, COLOR.outline, 3);
  // stylised star emblem
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(194,24,91,0.18)';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 14 : 34;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return c;
}

/** Hit highlight: 'don' lights the head, 'ka' lights the rim. The renderer uses each half separately. */
function drumHit(kind: 'don' | 'ka'): OffscreenCanvas {
  const [c, ctx] = canvas(180, 180);
  if (kind === 'don') {
    const g = ctx.createRadialGradient(90, 90, 10, 90, 90, 66);
    g.addColorStop(0, 'rgba(255,90,110,0.95)');
    g.addColorStop(1, 'rgba(255,40,80,0.55)');
    circle(ctx, 90, 90, 64, g);
  } else {
    ctx.lineWidth = 20;
    ctx.strokeStyle = 'rgba(70,200,255,0.95)';
    ctx.beginPath();
    ctx.arc(90, 90, 74, 0, Math.PI * 2);
    ctx.stroke();
  }
  return c;
}

function comboText(): OffscreenCanvas {
  const [c, ctx] = canvas(150, 150);
  text(ctx, 'COMBO', 75, 136, 22, '#fff', COLOR.outline, 'center', 900);
  return c;
}

function courseBadge(label: string, color: string): OffscreenCanvas {
  const [c, ctx] = canvas(150, 64);
  roundRect(ctx, 3, 3, 144, 58, 16);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLOR.outline;
  ctx.stroke();
  text(ctx, label, 75, 33, label.length > 5 ? 22 : 28, '#fff', COLOR.outline, 'center', 900);
  return c;
}

function gaugeImage(kind: 'base' | 'fill' | 'clear'): OffscreenCanvas {
  const [c, ctx] = canvas(1040, 110);
  const cells = 50;
  const cw = 1040 / cells;
  roundRect(ctx, 0, 0, 1040, 60, 12);
  ctx.save();
  ctx.clip();
  for (let i = 0; i < cells; i++) {
    let col: string;
    if (kind === 'base') col = i >= 40 ? '#3d2a1a' : '#2c1a2e';
    else if (kind === 'fill') col = `hsl(${350 + (i / 40) * 30}, 90%, ${52 + (i / 40) * 8}%)`;
    else col = `hsl(${42 + (i / 50) * 10}, 100%, ${58 + ((i % 2) * 4)}%)`;
    ctx.fillStyle = col;
    ctx.fillRect(i * cw, 0, cw, 60);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(i * cw + cw - 2, 0, 2, 60);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, 0, 1040, 14);
  ctx.restore();
  if (kind === 'base') {
    roundRect(ctx, 0, 0, 1040, 60, 12);
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.outline;
    ctx.stroke();
  }
  if (kind === 'fill') {
    // "CLEAR" labels for the renderer: unlit at x=0, lit at x=130 (y=70..104)
    text(ctx, 'CLEAR', 60, 87, 26, '#8d8aa0', COLOR.outline, 'center', 900);
    const g = ctx.createLinearGradient(0, 72, 0, 102);
    g.addColorStop(0, '#fff7c2');
    g.addColorStop(1, COLOR.gold);
    text(ctx, 'CLEAR', 190, 87, 26, g, COLOR.outline, 'center', 900);
  }
  return c;
}

function soulImage(): OffscreenCanvas {
  const [c, ctx] = canvas(110, 220);
  const star = (cy: number, fill: string | CanvasGradient, glow: boolean) => {
    if (glow) circle(ctx, 55, cy, 50, 'rgba(255,210,94,0.35)');
    circle(ctx, 55, cy, 42, COLOR.outline);
    circle(ctx, 55, cy, 37, fill);
    ctx.save();
    ctx.translate(55, cy);
    ctx.fillStyle = glow ? '#fff' : '#9b97b3';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 10 : 25;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  const g = ctx.createRadialGradient(45, 40, 4, 55, 55, 40);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(1, '#ff9f1c');
  star(55, g, true);
  star(165, '#4a4560', false);
  return c;
}

function frames(n: number, fw: number, fh: number, rows: number, draw: (ctx: C2D, i: number, row: number) => void) {
  const [c, ctx] = canvas(fw * n, fh * rows);
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(i * fw, row * fh);
      ctx.beginPath();
      ctx.rect(0, 0, fw, fh);
      ctx.clip();
      draw(ctx, i, row);
      ctx.restore();
    }
  }
  return c;
}

function ring(ctx: C2D, cx: number, cy: number, r: number, width: number, color: string, alpha: number) {
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function sparkles(ctx: C2D, cx: number, cy: number, r: number, n: number, size: number, color: string, alpha: number, rot = 0) {
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rot;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function hitExplosion(): OffscreenCanvas {
  // 7 frames x 4 rows (great, good, big great, big good), 300px cells.
  return frames(7, 300, 300, 4, (ctx, i, row) => {
    const p = (i + 1) / 7;
    const big = row >= 2;
    const great = row % 2 === 0;
    const base = big ? 92 : 70;
    const color = great ? COLOR.gold : '#ffffff';
    ring(ctx, 150, 150, base + p * (big ? 50 : 38), (1 - p) * 22 + 4, color, 1 - p * 0.9);
    sparkles(ctx, 150, 150, base + 10 + p * (big ? 70 : 52), 12, (1 - p) * 9 + 2, great ? '#fff5c9' : '#d9e6ff', 1 - p, p);
  });
}

function gogoFire(): OffscreenCanvas {
  return frames(7, 420, 420, 1, (ctx, i) => {
    const t = (i / 7) * Math.PI * 2;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const len = 150 + Math.sin(t + k * 1.7) * 26;
      const g = ctx.createLinearGradient(210, 210, 210 + Math.cos(a) * len, 210 + Math.sin(a) * len);
      g.addColorStop(0.45, 'rgba(255,120,40,0)');
      g.addColorStop(0.65, 'rgba(255,120,40,0.55)');
      g.addColorStop(1, 'rgba(255,220,90,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(210, 210);
      ctx.lineTo(210 + Math.cos(a) * len, 210 + Math.sin(a) * len);
      ctx.stroke();
    }
  });
}

function soulFire(): OffscreenCanvas {
  return frames(8, 300, 300, 1, (ctx, i) => {
    const t = (i / 8) * Math.PI * 2;
    for (let k = 0; k < 7; k++) {
      const h = 90 + Math.sin(t + k) * 20;
      const x = 150 + (k - 3) * 16;
      const g = ctx.createLinearGradient(x, 200, x, 200 - h);
      g.addColorStop(0, 'rgba(255,140,30,0.8)');
      g.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, 200 - h / 2, 18, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function soulExplosion(): OffscreenCanvas {
  return frames(16, 240, 240, 1, (ctx, i) => {
    const p = (i + 1) / 16;
    ring(ctx, 120, 120, 40 + p * 70, (1 - p) * 16 + 2, COLOR.gold, 1 - p);
    sparkles(ctx, 120, 120, 50 + p * 60, 8, (1 - p) * 7 + 1, '#fff', 1 - p, p * 2);
  });
}

function balloonBubble(): OffscreenCanvas {
  const [c, ctx] = canvas(280, 220);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = COLOR.outline;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(140, 100, 128, 88, 0, 0, Math.PI * 2);
  ctx.moveTo(60, 160);
  ctx.lineTo(30, 214);
  ctx.lineTo(100, 178);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(140, 100, 124, 84, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function balloonBreaking(stage: number): OffscreenCanvas {
  const [c, ctx] = canvas(200, 200);
  const r = 40 + stage * 9;
  const g = ctx.createRadialGradient(100 - r * 0.3, 100 - r * 0.3, 4, 100, 100, r);
  g.addColorStop(0, '#ffe0c4');
  g.addColorStop(1, stage >= 4 ? '#ff3d3d' : COLOR.balloon);
  circle(ctx, 100, 100, r, g, COLOR.outline, 5);
  ctx.strokeStyle = COLOR.outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(100, 100 + r);
  ctx.quadraticCurveTo(90, 100 + r + 20, 104, 198);
  ctx.stroke();
  return c;
}

function rollFrame(): OffscreenCanvas {
  return frames(5, 440, 260, 1, (ctx, i) => {
    const s = [0.25, 0.55, 0.8, 1.05, 1][i];
    ctx.translate(220, 130);
    ctx.scale(s, s);
    roundRect(ctx, -190, -100, 380, 200, 60);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = COLOR.outline;
    ctx.stroke();
    if (i === 4) text(ctx, 'ROLL!', 0, 72, 30, COLOR.roll, COLOR.outline, 'center', 900);
  });
}

function mine(): OffscreenCanvas {
  const [c, ctx] = canvas(194, 194);
  ctx.save();
  ctx.translate(97, 97);
  ctx.fillStyle = COLOR.outline;
  for (let k = 0; k < 8; k++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -64, 12, 24);
  }
  ctx.restore();
  circle(ctx, 97, 97, 46, '#5a2a7a', COLOR.outline, 6);
  text(ctx, '×', 97, 97, 56, '#fff', '', 'center', 900);
  return c;
}

function barLine(color: string): OffscreenCanvas {
  const [c, ctx] = canvas(4, 270);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 4, 270);
  return c;
}

function footer(): OffscreenCanvas {
  const [c, ctx] = canvas(W, 40);
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(0, 0, W, 40);
  for (let x = 0; x < W; x += 40) {
    ctx.fillStyle = (x / 40) % 2 ? '#ff5fa2' : '#35c3ff';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x + 20, 14);
    ctx.lineTo(x + 40, 40);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

// ------------------------------------------------------------------ background

function sky(clear: boolean): OffscreenCanvas {
  const [c, ctx] = canvas(W, 282);
  const g = ctx.createLinearGradient(0, 0, 0, 282);
  if (clear) {
    g.addColorStop(0, '#ff9a5a');
    g.addColorStop(1, '#ff5f9e');
  } else {
    g.addColorStop(0, '#120f2e');
    g.addColorStop(1, '#3b1d5c');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 282);
  return c;
}

function starsTile(): OffscreenCanvas {
  const [c, ctx] = canvas(480, 282);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 480;
    const y = rnd() * 282;
    const r = rnd() * 2.2 + 0.6;
    circle(ctx, x, y, r, `rgba(255,255,255,${0.4 + rnd() * 0.6})`);
  }
  for (let i = 0; i < 3; i++) {
    const x = rnd() * 480;
    const y = rnd() * 282;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,230,160,0.8)';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const r = k % 2 ? 2 : 8;
      const a = (k / 8) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
    ctx.restore();
  }
  return c;
}

function hillsTile(): OffscreenCanvas {
  const [c, ctx] = canvas(640, 132);
  ctx.fillStyle = 'rgba(20,14,40,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, 132);
  for (let x = 0; x <= 640; x += 8) {
    ctx.lineTo(x, 70 + Math.sin((x / 640) * Math.PI * 2) * 26 + Math.sin((x / 640) * Math.PI * 6) * 8);
  }
  ctx.lineTo(640, 132);
  ctx.fill();
  // little buildings / lanterns
  for (let k = 0; k < 4; k++) {
    const x = 60 + k * 160;
    ctx.fillStyle = 'rgba(20,14,40,0.95)';
    ctx.fillRect(x, 52, 34, 80);
    circle(ctx, x + 17, 66, 6, 'rgba(255,200,90,0.9)');
  }
  return c;
}

function stage(clear: boolean): OffscreenCanvas {
  const [c, ctx] = canvas(W, 498);
  const g = ctx.createLinearGradient(0, 0, 0, 498);
  g.addColorStop(0, clear ? '#4a1d5e' : '#1a1336');
  g.addColorStop(1, clear ? '#ff7a59' : '#2d1b4e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 498);
  // perspective floor grid
  ctx.strokeStyle = clear ? 'rgba(255,230,180,0.35)' : 'rgba(130,110,255,0.3)';
  ctx.lineWidth = 2;
  const horizon = 180;
  for (let k = -24; k <= 24; k++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + k * 30, horizon);
    ctx.lineTo(W / 2 + k * 260, 498);
    ctx.stroke();
  }
  for (let k = 0; k < 9; k++) {
    const y = horizon + Math.pow(k / 8, 1.8) * (498 - horizon);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  return c;
}

function lightsTile(): OffscreenCanvas {
  const [c, ctx] = canvas(320, 120);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.quadraticCurveTo(160, 70, 320, 20);
  ctx.stroke();
  const cols = ['#ff5fa2', '#35c3ff', '#ffd25e', '#7cff8a'];
  for (let k = 0; k < 4; k++) {
    const t = (k + 0.5) / 4;
    const x = t * 320;
    const y = 20 + 4 * t * (1 - t) * 50;
    circle(ctx, x, y + 10, 16, cols[k] + '55');
    circle(ctx, x, y + 10, 8, cols[k]);
  }
  return c;
}

function confettiTile(): OffscreenCanvas {
  const [c, ctx] = canvas(400, 400);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = ['#ff5fa2', '#35c3ff', '#ffd25e', '#7cff8a', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    ctx.save();
    ctx.translate(rnd() * 400, rnd() * 400);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(-7, -3, 14, 6);
    ctx.restore();
  }
  return c;
}

// ------------------------------------------------------------------ dancers

/** Three original "lantern spirit" dancers, 8 frames each. */
function dancerFrames(hue: number, variant: number): OffscreenCanvas[] {
  const out: OffscreenCanvas[] = [];
  for (let i = 0; i < 8; i++) {
    const [c, ctx] = canvas(260, 340);
    const t = (i / 8) * Math.PI * 2;
    const hop = Math.abs(Math.sin(t)) * 26;
    const tilt = Math.sin(t) * 0.18 * (variant % 2 ? -1 : 1);
    const cx = 130;
    const cy = 190 - hop;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, 318, 60 - hop, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    // arms (ribbons)
    for (const side of [-1, 1]) {
      const a = Math.sin(t + (side > 0 ? Math.PI : 0)) * 0.9;
      ctx.strokeStyle = `hsl(${hue + 30}, 90%, 70%)`;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(side * 58, -10);
      ctx.quadraticCurveTo(side * 100, -40 + a * 30, side * 110, -90 + a * 50);
      ctx.stroke();
    }
    // body: paper lantern
    const g = ctx.createRadialGradient(-20, -30, 10, 0, 0, 90);
    g.addColorStop(0, `hsl(${hue}, 100%, 85%)`);
    g.addColorStop(1, `hsl(${hue}, 85%, 52%)`);
    ctx.fillStyle = g;
    ctx.strokeStyle = COLOR.outline;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 90, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 70 * Math.cos((k / 6) * Math.PI), 90, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // caps
    ctx.fillStyle = COLOR.outline;
    roundRect(ctx, -40, -102, 80, 18, 6);
    ctx.fill();
    roundRect(ctx, -40, 84, 80, 18, 6);
    ctx.fill();
    // glowing eyes (simple dots, no mouth)
    const blink = i === 3 || i === 7;
    ctx.fillStyle = COLOR.outline;
    for (const side of [-1, 1]) {
      if (blink) ctx.fillRect(side * 22 - 9, -8, 18, 4);
      else {
        ctx.beginPath();
        ctx.arc(side * 22, -6, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // feet
    ctx.fillStyle = COLOR.outline;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 26, 110 + (side > 0 ? Math.sin(t) : -Math.sin(t)) * 6, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------ loading screen

function loadingBackground(): OffscreenCanvas {
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2a1250');
  g.addColorStop(0.55, '#7a1f6b');
  g.addColorStop(1, '#ff6f61');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // concentric rings
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let r = 80; r < 1400; r += 70) {
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const stars = starsTile();
  for (let x = 0; x < W; x += stars.width) for (let y = 0; y < H; y += stars.height) ctx.drawImage(stars, x, y);
  return c;
}

function loadingPlate(): OffscreenCanvas {
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = 'rgba(12,10,28,0.82)';
  ctx.fillRect(0, 430, W, 220);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,95,162,0)');
  g.addColorStop(0.5, 'rgba(255,95,162,1)');
  g.addColorStop(1, 'rgba(53,195,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 430, W, 6);
  ctx.fillRect(0, 644, W, 6);
  return c;
}

function loadingChara(): OffscreenCanvas {
  const [c, ctx] = canvas(W, H);
  const sets = [dancerFrames(330, 0)[1], dancerFrames(190, 1)[5], dancerFrames(45, 2)[2]];
  ctx.drawImage(sets[1], 80, 700);
  ctx.drawImage(sets[0], W / 2 - 130, 720);
  ctx.drawImage(sets[2], W - 340, 700);
  return c;
}

// ------------------------------------------------------------------ rainbow gauge

/** Rainbow overlay for a full gauge: 12 frames of hue-shifted cells (crossfaded by the renderer). */
function rainbowFrames(): OffscreenCanvas[] {
  return Array.from({ length: 12 }, (_, f) => {
    const [c, ctx] = canvas(1040, 60);
    roundRect(ctx, 0, 0, 1040, 60, 12);
    ctx.clip();
    const cells = 50;
    const cw = 1040 / cells;
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = `hsl(${(i * 12 - f * 30 + 3600) % 360}, 95%, 62%)`;
      ctx.fillRect(i * cw, 0, cw, 60);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(i * cw + cw - 2, 0, 2, 60);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(0, 0, 1040, 14);
    return c;
  });
}

// ------------------------------------------------------------------ nameplate

/** Nameplate sheet in the standard 12-row layout (rows of 81px = 54px × 1.5). */
function nameplateSheet(): OffscreenCanvas {
  const k = 1.5;
  const R = 54 * k;
  const [c, ctx] = canvas(220 * k, R * 12);
  const at = (row: number, fn: () => void) => {
    ctx.save();
    ctx.translate(0, row * R);
    ctx.scale(k, k);
    fn();
    ctx.restore();
  };
  const badge = (row: number, color: string, label: string) =>
    at(row, () => {
      circle(ctx, 27, 27, 23, COLOR.outline);
      circle(ctx, 27, 27, 20, color);
      text(ctx, label, 27, 28, 18, '#fff', COLOR.outline, 'center', 900);
    });
  badge(0, COLOR.don, '1P');
  badge(1, COLOR.ka, '1P');
  badge(2, COLOR.ka, '2P');
  at(3, () => {
    roundRect(ctx, 2, 2, 216, 50, 25);
    ctx.fillStyle = '#fffaf2';
    ctx.fill();
  });
  at(4, () => {
    roundRect(ctx, 2, 2, 216, 50, 25);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR.outline;
    ctx.stroke();
  });
  const strip = (row: number, a: string, b: string) =>
    at(row, () => {
      ctx.save();
      roundRect(ctx, 2, 2, 216, 50, 25);
      ctx.clip();
      const g = ctx.createLinearGradient(0, 0, 220, 0);
      g.addColorStop(0, a);
      g.addColorStop(0.5, '#fff');
      g.addColorStop(1, a);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 220, 28);
      ctx.fillStyle = b;
      ctx.fillRect(0, 26, 220, 2);
      ctx.restore();
    });
  strip(5, COLOR.gold, '#b67c00');
  strip(6, '#b98cff', '#5a2a9a');
  at(7, () => {
    roundRect(ctx, 8, 28, 82, 20, 8);
    ctx.fillStyle = COLOR.outline;
    ctx.fill();
  });
  const medal = (row: number, fill: string | ((g: C2D) => CanvasGradient)) =>
    at(row, () => {
      ctx.save();
      roundRect(ctx, 8, 28, 82, 20, 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = typeof fill === 'string' ? fill : fill(ctx);
      ctx.stroke();
      ctx.restore();
    });
  medal(8, '#c8d0dc');
  medal(9, COLOR.gold);
  medal(10, (g) => {
    const gr = g.createLinearGradient(8, 0, 90, 0);
    ['#ff5f5f', '#ffd25e', '#7cff8a', '#35c3ff', '#b98cff'].forEach((col, i) => gr.addColorStop(i / 4, col));
    return gr;
  });
  at(11, () => {
    ctx.fillStyle = COLOR.gold;
    ctx.fillRect(30, 46, 40, 3);
  });
  return c;
}

// ------------------------------------------------------------------ character

/** "Hoshi", the built-in mascot: a star-shaped drummer. Pose is a function of the frame phase. */
interface Pose {
  hop: number;
  squash: number;
  rot: number;
  armL: number;
  armR: number;
  eyes: 'open' | 'happy' | 'closed' | 'sad';
  aura?: string;
  sparkle?: number;
  pump?: number;
}

function drawHoshi(ctx: C2D, p: Pose) {
  const cx = 180;
  const ground = 236;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, ground + 6, 70 - p.hop * 0.4, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, ground - 80 - p.hop);
  ctx.rotate(p.rot);
  ctx.scale(1 + p.squash, 1 - p.squash);
  if (p.aura) {
    const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 120);
    g.addColorStop(0, p.aura);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();
  }
  // arms with drumsticks
  for (const [side, a] of [
    [-1, p.armL],
    [1, p.armR],
  ] as const) {
    ctx.save();
    ctx.translate(side * 52, 4);
    ctx.rotate(side * (0.4 + a));
    ctx.strokeStyle = COLOR.outline;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * 34, -26);
    ctx.stroke();
    ctx.strokeStyle = '#d9a35f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(side * 30, -22);
    ctx.lineTo(side * 62, -70);
    ctx.stroke();
    circle(ctx, side * 64, -73, 8, '#fff2d6', COLOR.outline, 3);
    ctx.restore();
  }
  // star body
  const body = ctx.createRadialGradient(-18, -22, 6, 0, 0, 78);
  body.addColorStop(0, '#fff6c9');
  body.addColorStop(1, '#ffb52e');
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 40 : 78;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = COLOR.outline;
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.fill();
  // cheeks
  circle(ctx, -26, 12, 7, 'rgba(255,110,140,0.6)');
  circle(ctx, 26, 12, 7, 'rgba(255,110,140,0.6)');
  // eyes
  ctx.strokeStyle = COLOR.outline;
  ctx.fillStyle = COLOR.outline;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = side * 15;
    const ey = -2;
    ctx.beginPath();
    if (p.eyes === 'open') {
      ctx.arc(ex, ey, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.eyes === 'happy') {
      ctx.arc(ex, ey + 3, 7, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else if (p.eyes === 'sad') {
      ctx.moveTo(ex - 7, ey + side * 3);
      ctx.lineTo(ex + 7, ey - side * 3);
      ctx.stroke();
    } else {
      ctx.moveTo(ex - 7, ey);
      ctx.lineTo(ex + 7, ey);
      ctx.stroke();
    }
  }
  ctx.restore();
  if (p.sparkle) sparkles(ctx, cx, ground - 80 - p.hop, 100, 10, 5, '#fff7c2', p.sparkle, p.hop / 30);
}

function hoshiFrames(n: number, pose: (ph: number, i: number) => Pose): OffscreenCanvas[] {
  return Array.from({ length: n }, (_, i) => {
    const [c, ctx] = canvas(360, 260);
    drawHoshi(ctx, pose(i / n, i));
    return c;
  });
}

function hoshiStates(): Partial<Record<CharaState, OffscreenCanvas[]>> {
  const TAU = Math.PI * 2;
  const bounce = (ph: number, h: number) => Math.abs(Math.sin(ph * Math.PI)) * h;
  const drum = (ph: number) => Math.sin(ph * TAU) * 0.6;
  return {
    Normal: hoshiFrames(8, (ph) => ({
      hop: bounce(ph, 10),
      squash: Math.cos(ph * TAU) * 0.04,
      rot: 0,
      armL: drum(ph),
      armR: -drum(ph),
      eyes: 'open',
    })),
    Clear: hoshiFrames(8, (ph) => ({
      hop: bounce(ph, 22),
      squash: Math.cos(ph * TAU) * 0.05,
      rot: Math.sin(ph * TAU) * 0.08,
      armL: drum(ph) + 0.6,
      armR: -drum(ph) + 0.6,
      eyes: 'happy',
      sparkle: 0.5,
    })),
    GoGo: hoshiFrames(8, (ph) => ({
      hop: bounce(ph * 2, 30),
      squash: Math.cos(ph * TAU * 2) * 0.07,
      rot: Math.sin(ph * TAU) * 0.12,
      armL: drum(ph * 2) + 0.8,
      armR: -drum(ph * 2) + 0.8,
      eyes: 'happy',
      aura: 'rgba(255,120,40,0.55)',
    })),
    '10combo': hoshiFrames(12, (ph) => ({
      hop: Math.sin(ph * Math.PI) * 70,
      squash: 0,
      rot: ph * TAU,
      armL: 1.2,
      armR: 1.2,
      eyes: 'happy',
      sparkle: 1 - ph,
    })),
    GoGoStart: hoshiFrames(12, (ph) => ({
      hop: Math.sin(ph * Math.PI) * 60,
      squash: -Math.sin(ph * Math.PI) * 0.08,
      rot: 0,
      armL: 1.4,
      armR: 1.4,
      eyes: 'happy',
      aura: `rgba(255,140,60,${0.7 * (1 - ph)})`,
      sparkle: 1 - ph,
    })),
    Clearin: hoshiFrames(12, (ph) => ({
      hop: Math.sin(ph * Math.PI) * 50,
      squash: 0,
      rot: Math.sin(ph * TAU) * 0.2,
      armL: 1.3,
      armR: 1.3,
      eyes: 'happy',
      sparkle: 1,
    })),
    Balloon_Breaking: hoshiFrames(6, (ph) => ({
      hop: 0,
      squash: -0.06 + Math.sin(ph * TAU) * 0.06,
      rot: 0,
      armL: Math.sin(ph * TAU) * 1.1,
      armR: -Math.sin(ph * TAU) * 1.1,
      eyes: 'closed',
      pump: ph,
    })),
    Balloon_Broke: hoshiFrames(12, (ph) => ({
      hop: Math.sin(ph * Math.PI) * 60,
      squash: 0,
      rot: 0,
      armL: 1.4,
      armR: 1.4,
      eyes: 'happy',
      sparkle: 1 - ph,
    })),
    Balloon_Miss: hoshiFrames(8, (ph) => ({
      hop: 0,
      squash: 0.05,
      rot: Math.sin(ph * TAU) * 0.05,
      armL: -0.5,
      armR: -0.5,
      eyes: 'sad',
    })),
  };
}

const HOSHI_BEATS: Partial<Record<CharaState, number>> = {
  Normal: 1,
  Clear: 1,
  GoGo: 2,
  '10combo': 1.5,
  GoGoStart: 1.5,
  Clearin: 1.5,
  Balloon_Breaking: 0.35,
  Balloon_Broke: 0.8,
  Balloon_Miss: 0.8,
};

// ------------------------------------------------------------------ sounds

/** Encodes mono float samples as a 16-bit PCM WAV file. */
function wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  }
  return buf;
}

/** Deep drum hit: pitch-dropping sine body plus a short noise attack. */
function synthDon(sr = 48000): ArrayBuffer {
  const n = Math.floor(sr * 0.45);
  const out = new Float32Array(n);
  let phase = 0;
  let seed = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 70 + 110 * Math.exp(-t * 30);
    phase += (2 * Math.PI * f) / sr;
    const body = Math.sin(phase) * Math.exp(-t * 9);
    seed = (seed * 16807) % 2147483647;
    const noise = (seed / 2147483647 - 0.5) * Math.exp(-t * 90) * 0.6;
    out[i] = (body + noise) * 0.9;
  }
  return wav(out, sr);
}

/** Rim click: bright filtered noise burst plus a short high tone. */
function synthKa(sr = 48000): ArrayBuffer {
  const n = Math.floor(sr * 0.18);
  const out = new Float32Array(n);
  let seed = 5;
  let hp = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    seed = (seed * 16807) % 2147483647;
    const x = seed / 2147483647 - 0.5;
    hp = 0.85 * (hp + x - last);
    last = x;
    const tone = Math.sin(2 * Math.PI * 1650 * t) * 0.5 + Math.sin(2 * Math.PI * 2460 * t) * 0.3;
    out[i] = (hp * 1.4 + tone) * Math.exp(-t * 38) * 0.8;
  }
  return wav(out, sr);
}

// ------------------------------------------------------------------ assemble

let cached: Promise<LoadedSkin> | null = null;

async function bitmap(c: OffscreenCanvas): Promise<ImageSource> {
  return createImageBitmap(c);
}

/** Builds (once) and returns the built-in skin. */
export function loadBuiltinSkin(): Promise<LoadedSkin> {
  cached ??= (async () => {
    const sprites: Partial<Record<ImageKey, OffscreenCanvas>> = {
      notes: notesSheet(),
      seNotes: seNotesSheet(),
      judge: judgeSheet(),
      bar: barLine('rgba(255,255,255,0.55)'),
      barBranch: barLine('rgba(255,210,94,0.9)'),
      mine: mine(),
      laneBackground: laneImage('#1d1a34'),
      laneSub: laneSub(),
      laneGogo: laneImage('#5a1f4a', 0.85),
      laneBaseNormal: laneImage('#1d1a34'),
      laneBaseExpert: laneImage('#13325a'),
      laneBaseMaster: laneImage('#4a1658'),
      laneTextNormal: laneText('NORMAL', '#ffffff'),
      laneTextExpert: laneText('EXPERT', '#7fd3ff'),
      laneTextMaster: laneText('MASTER', '#ff9df0'),
      laneRed: laneFlash('rgba(255,79,94,0.55)'),
      laneBlue: laneFlash('rgba(53,195,255,0.55)'),
      laneYellow: laneFlash('rgba(255,200,61,0.55)'),
      taikoBackground: taikoBackground(),
      taikoFrame: taikoFrame(),
      taikoBase: drumBase(),
      taikoDon: drumHit('don'),
      taikoKa: drumHit('ka'),
      combo: digitsSheet(60, 72, () => '#ffffff', COLOR.outline),
      comboMedium: digitsSheet(60, 72, () => '#e8f1ff', '#2b3a66'),
      comboBig: digitsSheet(
        60,
        72,
        (ctx) => {
          const g = ctx.createLinearGradient(0, 4, 0, 68);
          g.addColorStop(0, '#fff7c2');
          g.addColorStop(1, COLOR.gold);
          return g;
        },
        '#5a3600',
      ),
      comboHuge: digitsSheet(
        60,
        72,
        (ctx) => {
          const g = ctx.createLinearGradient(0, 4, 0, 68);
          g.addColorStop(0, '#ffd1f0');
          g.addColorStop(0.5, '#ff5fa2');
          g.addColorStop(1, '#7a3cff');
          return g;
        },
        '#2a0c3a',
      ),
      comboText: comboText(),
      score: digitsSheet(39, 51, () => '#ffffff', COLOR.outline),
      courseEasy: courseBadge('EASY', '#ff8a3d'),
      courseNormal: courseBadge('NORMAL', '#6ccf3a'),
      courseHard: courseBadge('HARD', '#3aa0cf'),
      courseOni: courseBadge('ONI', '#e0306a'),
      courseEdit: courseBadge('URA', '#8a3ce0'),
      gaugeBase: gaugeImage('base'),
      gaugeFill: gaugeImage('fill'),
      gaugeClear: gaugeImage('clear'),
      soul: soulImage(),
      soulFire: soulFire(),
      soulExplosion: soulExplosion(),
      hitExplosion: hitExplosion(),
      gogoFire: gogoFire(),
      balloon: balloonBubble(),
      balloonBreaking0: balloonBreaking(0),
      balloonBreaking1: balloonBreaking(1),
      balloonBreaking2: balloonBreaking(2),
      balloonBreaking3: balloonBreaking(3),
      balloonBreaking4: balloonBreaking(4),
      balloonBreaking5: balloonBreaking(5),
      rollNumber: digitsSheet(95, 113, () => '#ffffff', '#1b3a8a'),
      rollFrame: rollFrame(),
      footer: footer(),
      loadingBackground: loadingBackground(),
      loadingPlate: loadingPlate(),
      loadingChara: loadingChara(),
      nameplate: nameplateSheet(),
      scoreAdd: digitsSheet(39, 51, () => '#ff9a3d', COLOR.outline),
    };
    const layerSprites: Record<string, OffscreenCanvas> = {
      'gen:sky': sky(false),
      'gen:skyClear': sky(true),
      'gen:stars': starsTile(),
      'gen:hills': hillsTile(),
      'gen:stage': stage(false),
      'gen:stageClear': stage(true),
      'gen:lights': lightsTile(),
      'gen:confetti': confettiTile(),
    };

    const images: LoadedSkin['images'] = {};
    await Promise.all(
      Object.entries(sprites).map(async ([k, c]) => {
        images[k as ImageKey] = await bitmap(c!);
      }),
    );
    const layerImages: LoadedSkin['layerImages'] = {};
    await Promise.all(
      Object.entries(layerSprites).map(async ([k, c]) => {
        layerImages[k] = await bitmap(c);
      }),
    );

    const dancerSets = await Promise.all(
      [
        [330, 0],
        [190, 1],
        [45, 2],
      ].map(([hue, v]) => Promise.all(dancerFrames(hue, v).map(bitmap))),
    );
    const dancer: LoadedDancer = {
      config: {
        count: 3,
        x: [960, 560, 1360],
        y: [800, 820, 820],
        motion: [0, 1, 2, 3, 4, 5, 6, 7, 0],
        beat: 2,
        gauge: [0, 40, 80],
      },
      frames: dancerSets,
    };

    const characterStates: LoadedCharacter['states'] = {};
    await Promise.all(
      Object.entries(hoshiStates()).map(async ([state, frames]) => {
        const bitmaps = await Promise.all(frames!.map(bitmap));
        characterStates[state as CharaState] = {
          frames: bitmaps,
          motion: bitmaps.map((_, i) => i),
          beat: HOSHI_BEATS[state as CharaState] ?? 1,
        };
      }),
    );
    const character: LoadedCharacter = { x: 40, y: 10, balloonX: 40, balloonY: 10, scale: 1, states: characterStates };

    const gaugeRainbow = { frames: await Promise.all(rainbowFrames().map(bitmap)), frameMs: 50 };

    return {
      gaugeRainbow,
      manifest: BUILTIN_MANIFEST,
      images,
      sounds: { don: synthDon(), ka: synthKa() },
      fontFamily: FONT,
      dancer,
      character,
      layerImages,
    };
  })();
  return cached;
}
