/**
 * Skin system.
 *
 * A skin is a manifest (layout + asset paths) plus a way to resolve those paths
 * to files. The renderer only ever talks to a {@link LoadedSkin}, so adding a new
 * skin means providing a new manifest (or a skin.json in a folder) — no renderer
 * changes required. Missing images are simply skipped by the renderer, so partial
 * skins work too.
 */

/** Every image the renderer knows how to draw. All are optional. */
export const IMAGE_KEYS = [
  'notes',
  'seNotes',
  'judge',
  'bar',
  'barBranch',
  'mine',
  'laneBackground',
  'laneSub',
  'laneGogo',
  'laneBaseNormal',
  'laneBaseExpert',
  'laneBaseMaster',
  'laneTextNormal',
  'laneTextExpert',
  'laneTextMaster',
  'laneRed',
  'laneBlue',
  'laneYellow',
  'taikoBackground',
  'taikoFrame',
  'taikoBase',
  'taikoDon',
  'taikoKa',
  'combo',
  'comboMedium',
  'comboBig',
  'comboHuge',
  'comboText',
  'score',
  'courseEasy',
  'courseNormal',
  'courseHard',
  'courseOni',
  'courseEdit',
  'gaugeBase',
  'gaugeFill',
  'gaugeClear',
  'soul',
  'soulFire',
  'soulExplosion',
  'hitExplosion',
  'gogoFire',
  'balloon',
  'balloonBreaking0',
  'balloonBreaking1',
  'balloonBreaking2',
  'balloonBreaking3',
  'balloonBreaking4',
  'balloonBreaking5',
  'rollNumber',
  'rollFrame',
  'bgUpBase',
  'bgUpBaseClear',
  'bgUpDot',
  'bgUpDotClear',
  'bgUpDango',
  'bgUpDangoClear',
  'bgDown',
  'bgDownClear',
  'bgDownScroll',
  'footer',
] as const;
export type ImageKey = (typeof IMAGE_KEYS)[number];

export const SOUND_KEYS = ['don', 'ka', 'balloonPop'] as const;
export type SoundKey = (typeof SOUND_KEYS)[number];

type XY = [number, number];

/**
 * Layout in skin pixels (the skin's native resolution). Values for the default
 * skin are set in builtin.ts; OpenTaiko-format skins map their GameConfig.ini
 * (player 1 values) onto these fields.
 */
export interface SkinLayout {
  /** Size of one cell in the notes sheet (Notes.png has 13 columns). */
  noteSize: XY;
  /** Top-left of the judge circle; notes are positioned relative to this. */
  scrollField: XY;
  /** Pixels per 4 beats at scroll 1.0. */
  pxPer4Beats: number;
  seNotesOffset: XY;
  seNoteSize: XY;
  lane: XY;
  laneSub: XY;
  judge: XY;
  judgeMove: XY;
  taikoBackground: XY;
  taikoFrame: XY;
  taiko: XY;
  combo: XY;
  comboEx: XY;
  comboEx4: XY;
  comboPadding: [number, number, number];
  comboSize: XY;
  comboText: XY;
  courseSymbol: XY;
  score: XY;
  scorePadding: number;
  scoreSize: XY;
  gauge: XY;
  gaugeRect: [number, number, number, number];
  gaugeClearText: XY;
  gaugeClearTextRect: [number, number, number, number];
  gaugeClearTextClearRect: [number, number, number, number];
  gaugeCells: number;
  soul: XY;
  soulFire: XY;
  soulFireFrames: number;
  flyingStart: XY;
  flyingEnd: XY;
  flyingSine: number;
  /** Frame size + frame count of the soul explosion sheet. */
  notesFlash: [number, number, number];
  hitExplosion: XY;
  hitExplosionFrames: number;
  gogoFire: XY;
  gogoFireFrames: number;
  /** Balloon character (Breaking_N.png) position. */
  balloon: XY;
  balloonFrame: XY;
  balloonNumber: XY;
  balloonNumberSize: XY;
  balloonNumberInterval: XY;
  rollFrame: XY;
  rollFrameFrames: number;
  rollNumber: XY;
  /** Song title, right-aligned at this point (baseline). */
  title: XY;
  titleFontSize: number;
  subtitleFontSize: number;
  /** Background bands. */
  bgUpHeight: number;
  bgDownY: number;
}

export interface SkinManifest {
  id: string;
  name: string;
  /** Native resolution the layout is authored for. */
  resolution: XY;
  images: Partial<Record<ImageKey, string>>;
  sounds: Partial<Record<SoundKey, string>>;
  /** Optional font file used for the song title. */
  font?: string;
  layout: SkinLayout;
  /** Text shown in the UI (credits / license notes). */
  credits?: string;
  /** Optional dancer set (OpenTaiko 2_Dancer format). */
  dancer?: DancerManifest;
  /**
   * Data-driven background. When present it replaces the built-in
   * OpenTaiko-style background (the bgUp… and bgDown… images).
   */
  background?: BackgroundSpec;
}

export interface BackgroundSpec {
  /** Fill colour behind everything. */
  color?: string;
  /** Drawn bottom to top. */
  layers: BackgroundLayer[];
}

export interface BackgroundLayer {
  /** Image path (relative to the skin root) or a generated image id. */
  image: string;
  x?: number;
  y?: number;
  /** Area to fill; defaults to the image size (or the full width when tileX). */
  width?: number;
  height?: number;
  tileX?: boolean;
  tileY?: boolean;
  /** Scroll speed in px/s; positive moves the image left / up. */
  scrollX?: number;
  scrollY?: number;
  /** Vertical bobbing: [amplitude px, period in beats]. */
  bob?: [number, number];
  /**
   * 'normal' fades out and 'clear' fades in once the clear gauge is reached;
   * 'always' (default) is always drawn.
   */
  show?: 'always' | 'normal' | 'clear';
  opacity?: number;
}

/**
 * A dancer set in OpenTaiko's format: `<dir>/1/0.png, 1.png, …` for dancer 1,
 * `<dir>/2/…` for dancer 2, and an optional `<dir>/DancerConfig.txt` whose
 * values override the ones given here.
 */
export interface DancerManifest {
  dir: string;
  /** Sub-folder per dancer, in order of appearance. Defaults to "1", "2", … */
  folders?: string[];
  /** Frames per dancer. If omitted, frames are probed (0.png, 1.png, …) until one is missing. */
  frameCount?: number;
  config?: Partial<DancerConfig>;
}

export interface DancerConfig {
  count: number;
  /** Centre position per dancer. */
  x: number[];
  y: number[];
  /** Frame index sequence for one full motion cycle. */
  motion: number[];
  /** Beats per full motion cycle. */
  beat: number;
  /** Gauge value (0–100) each dancer needs before it appears. */
  gauge: number[];
}

export interface LoadedDancer {
  config: DancerConfig;
  /** frames[dancerIndex][frameIndex] */
  frames: ImageSource[][];
}

export type ImageSource = ImageBitmap | HTMLImageElement;

export interface LoadedSkin {
  manifest: SkinManifest;
  images: Partial<Record<ImageKey, ImageSource>>;
  /** Raw encoded audio; decoded by whichever AudioContext needs it. */
  sounds: Partial<Record<SoundKey, ArrayBuffer>>;
  /** CSS font-family to use for text. */
  fontFamily: string;
  dancer?: LoadedDancer;
  /** Images used by background layers, keyed by BackgroundLayer.image. */
  layerImages: Record<string, ImageSource>;
}

/**
 * Resolves a skin-relative path to its bytes (or null if missing). Resolvers
 * backed by a folder or zip can also list their files, which enables
 * auto-detection of dancer folders.
 */
export type SkinFileResolver = ((path: string) => Promise<Blob | null>) & { list?: () => string[] };
