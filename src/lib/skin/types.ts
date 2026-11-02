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
  'courseDan',
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
  'loadingBackground',
  'loadingChara',
  'loadingPlate',
  'nameplate',
  'scoreAdd',
  'gogoSplash',
  'loadingBackgroundWait',
  'loadingFade',
  'scoreRank',
  'comboBalloon',
  'comboBalloonNumber',
  'genreTemplate',
  // Dan-i dojo (OpenTaiko 17_DanC, 7_Gauge/1P_Dan*, 6_Taiko/Dan_Background)
  'danBackground',
  'danBase',
  'danBaseSmall',
  'danGaugeNormal',
  'danGaugeReach',
  'danGaugeClear',
  'danGaugeFlush',
  'danGaugeLow',
  'danGaugeBase',
  'danFailed',
  'danNumber',
  'danSmallNumber',
  'danMiniNumber',
  'danExamType',
  'danExamRange',
  'danExamCymbol',
  'danScreen',
  'danSmallBase',
  'danSmallExamCymbol',
  'gaugeDanBase',
  'gaugeDan',
  'gaugeDanClearBase',
  'gaugeDanClear',
  'taikoDanBackground',
] as const;

/** Images only used by dan-i dojo courses (not reported as missing). */
export const DAN_IMAGE_KEYS: readonly ImageKey[] = IMAGE_KEYS.filter(
  (k) => k.startsWith('dan') || k.startsWith('gaugeDan') || k === 'taikoDanBackground',
);
export type ImageKey = (typeof IMAGE_KEYS)[number];

export const SOUND_KEYS = ['don', 'ka', 'balloonPop', 'endClear', 'endFullCombo', 'endDondaFullCombo'] as const;
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
  /** Rows in Judge.png (OpenTaiko: 5, TJAPlayer3: 4 rows of 60px at 720p). */
  judgeRows: number;
  /**
   * Animate note faces (OpenTaiko Game_Notes_Anime): from 50/150/300 combo the
   * notes alternate between rows of Notes.png every quarter beat.
   */
  notesAnime: boolean;
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
  /** Digit scales (OpenTaiko Game_Balloon_Roll_Number_Scale / Game_Balloon_Balloon_Number_Scale). */
  rollNumberScale: number;
  balloonNumberScale: number;
  /** Digit spacing for the balloon counter (0 = same as balloonNumberInterval). */
  balloonDigitInterval: number;
  /**
   * Mob placement (tja2vid extension; TJAPlayer3 draws the image unscaled at
   * x 0 with its top at screen height − (image height − 70)): scale, x offset
   * of the left and right halves, top y at rest and hop height.
   */
  mobScale?: number;
  mobX?: XY;
  mobY?: number;
  mobJump?: number;
  /** Dan-i dojo exam panel layout overrides (skin px); unset fields use OpenTaiko's defaults scaled. */
  dan?: Partial<DanLayout>;
  /** In-game song title: right edge and vertical centre. */
  title: XY;
  /** Titles wider than this are squeezed horizontally (OpenTaiko Game_MusicName_MaxWidth). */
  titleMaxWidth: number;
  titleFontSize: number;
  subtitleFontSize: number;
  /** Background bands. */
  bgUpHeight: number;
  bgDownY: number;
  /** Song loading screen: plate centre, title / subtitle centres, chara slide-in offset. */
  loadingPlate: XY;
  loadingTitle: XY;
  loadingSubtitle: XY;
  loadingTitleFontSize: number;
  /** Loading title outline width outside the glyph, 720p px (0 = font size / 10). */
  loadingTitleOutline: number;
  /** Extra spacing between loading-title letters, 720p px (negative = tighter). */
  loadingTitleLetterSpacing: number;
  /** Loading title / subtitle wider than these are squeezed horizontally (SongLoading_*_MaxSize). */
  loadingTitleMaxWidth: number;
  loadingSubtitleMaxWidth: number;
  loadingSubtitleFontSize: number;
  loadingCharaMove: XY;
  /** Text colours for the loading screen (empty stroke = no outline). */
  loadingTitleColor: string;
  loadingTitleStroke: string;
  loadingSubtitleColor: string;
  loadingSubtitleStroke: string;
  /**
   * Nameplate position (top-left of the "1P" badge). The NamePlate sheet has 12
   * equal rows (54px at 720p): 1P/1P/2P badges, plate, outline, gold/purple
   * title strips, dan plate, silver/gold/rainbow dan medals, gold bar.
   */
  nameplate: XY;
  /**
   * Nameplate draw scale. All sheet rows (badge, plate, outline) are drawn at
   * the same position and scale: the sheet is designed so the badge sits
   * exactly on the plate's left end.
   */
  nameplateScale: number;
  /** Draw the sheet's thick outline row over the plate. */
  nameplateOutline: boolean;
  /** Where "+score" popups appear (right-aligned over 7 digit slots, bottom anchored). */
  scoreAdd: XY;
  /**
   * GoGo-start fireworks (OpenTaiko GoGoSplash, 1 player only): sheet frame size
   * and count, ms per frame, bottom-centre positions, and whether the outer
   * ones tilt outwards.
   */
  gogoSplash: { frame: [number, number, number]; frameMs: number; x: number[]; y: number[]; rotate: boolean };
  /** Score rank badge (粋/雅/極 sheet, 7 rows) centre. */
  scoreRank: XY;
  /**
   * Combo balloon (every 50/100 combo): scroll plate (3 frames side by side),
   * digit positions (<1000 / ≥1000), digit cell size and spacing, and the
   * "コンボ!" label position and source rect in the number sheet.
   */
  comboBalloon: XY;
  comboBalloonNumber: XY;
  comboBalloonNumberEx: XY;
  comboBalloonNumberSize: XY;
  comboBalloonNumberInterval: XY;
  comboBalloonText: XY;
  comboBalloonTextEx: XY;
  comboBalloonTextRect: [number, number, number, number];
  /**
   * 'opentaiko': digits/label at the fixed Game_Balloon_Combo_* positions.
   * 'centered' (Nijiiro arcade): digits + label centred as a group on the plate
   * (positions below are 720p px relative to the plate's top-left); four or more
   * digits are squeezed horizontally.
   */
  comboBalloonStyle: 'opentaiko' | 'centered';
  comboBalloonGroupCenterX: number;
  comboBalloonDigitTop: number;
  comboBalloonLabelTop: number;
  comboBalloonSpacing: [number, number];
  comboBalloonSqueeze: number;
  /** Genre plate (top-left of the 13_GENRE template) and text size. */
  genre: XY;
  genreFontSize: number;
  /** Extra downward offset (720p px) of the loading title when the song has no subtitle (OpenTaiko: 15). */
  loadingTitleNoSubtitleOffset: number;
  /** How the loading screen gives way to play: crossfade, or split open like a curtain. */
  loadingTransition: 'fade' | 'curtain';
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
  /** Optional player character (OpenTaiko 1_Chara / 11_Characters format). */
  character?: CharacterManifest;
  /**
   * Optional hit effect sequences shown at the judge circle on every hit:
   * `<dir>/Great/0.png …`, `Great_Big`, `Good`, `Good_Big` (OpenTaiko 10_Effects/Hit).
   */
  hitEffect?: { dir: string; frameMs?: number };
  /**
   * Result animations (TJAPlayer3 9_End format): `<dir>/FullCombo/0.png …`,
   * `<dir>/DondaFullCombo/…` frame sequences, and the Clear parts
   * `<dir>/Clear/Clear_L_0..4.png, Clear_R_0..4.png, Clear_Text.png, Clear_Text_Effect.png`.
   */
  endAnim?: { dir: string; frameMs?: number; loopFrameMs?: number };
  /** Rainbow gauge frames shown when the gauge is full: `<dir>/0.png …` (OpenTaiko 7_Gauge/Rainbow). */
  gaugeRainbow?: { dir: string; frameMs?: number };
  /** Rainbow frames for a gold (better success) dan exam bar (OpenTaiko 17_DanC/Rainbow). */
  danRainbow?: { dir: string; frameMs?: number };
  /**
   * Mob (crowd) shown behind the dancers while the soul gauge is full
   * (TJAPlayer3 3_Mob): `<dir>/0.png, 1.png, …` are alternative crowds.
   * They bounce 70px (at 720p) once every `beat` beats.
   */
  mob?: { dir: string; beat?: number };
  /**
   * Data-driven background. When present it replaces the built-in
   * OpenTaiko-style background (the bgUp… and bgDown… images).
   */
  background?: BackgroundSpec;
  /** Upper background used for dan-i dojo courses (falls back to `background`). */
  danBackground?: BackgroundSpec;
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

/** Character animation states, named after OpenTaiko's folders. */
export const CHARA_STATES = [
  'Normal',
  'Clear',
  'Clear_Max',
  'GoGo',
  'GoGo_Max',
  '10combo',
  '10combo_Max',
  'GoGoStart',
  'GoGoStart_Max',
  'Clearin',
  'Soulin',
  'Balloon_Breaking',
  'Balloon_Broke',
  'Balloon_Miss',
] as const;
export type CharaState = (typeof CHARA_STATES)[number];

export interface CharaStateConfig {
  /** Frame index sequence; defaults to 0..n-1. */
  motion?: number[];
  /**
   * Loops: beats per cycle. One-shots: length in beats. Balloon states: length
   * in seconds (as in OpenTaiko).
   */
  beat?: number;
}

/**
 * A character in OpenTaiko's format: `<dir>/<State>/0.png, 1.png …` per state
 * (see CHARA_STATES), plus an optional `<dir>/CharaConfig.txt`.
 */
export interface CharacterManifest {
  dir: string;
  x: number;
  y: number;
  /** Position while a balloon is being popped (defaults to x/y). */
  balloonX?: number;
  balloonY?: number;
  /** Resolution the frames were drawn for; frames are scaled to the skin resolution. */
  resolution?: [number, number];
  /** TJAPlayer3: ms per frame for the balloon animations (Game_Chara_Balloon_Timer). */
  balloonTimer?: number;
  /** TJAPlayer3: fade-out after a popped/missed balloon, ms (Game_Chara_Balloon_FadeOut). */
  balloonFadeOut?: number;
  states?: Partial<Record<CharaState, CharaStateConfig>>;
}

export interface LoadedCharacter {
  x: number;
  y: number;
  /** Draw scale (skin resolution / character resolution). */
  scale: number;
  /** Fade-out after Balloon_Broke / Balloon_Miss finish (ms). */
  balloonFadeOutMs: number;
  balloonX: number;
  balloonY: number;
  states: Partial<Record<CharaState, { frames: ImageSource[]; motion: number[]; beat: number }>>;
}

/** A frame sequence drawn at (x, y) in skin pixels; the last frame is held. */
export interface EndSequence {
  frames: ImageSource[];
  /** Per-frame draw offsets when frames were cropped to their visible area. */
  offsets?: [number, number][];
  frameMs: number;
  x: number;
  y: number;
}

export interface LoadedEndAnim {
  fullCombo?: EndSequence;
  /** Loop shown after the full-combo sequence ends (FullCombo/loop_N.png). */
  fullComboLoop?: EndSequence;
  dondaFullCombo?: EndSequence;
  /** Lane background behind the donderful-combo sequence (DondaFullCombo/bg.png), from its 34th frame. */
  dondaBackground?: { image: ImageSource; x: number; y: number; fromMs: number };
  clear?: EndSequence;
  /** Code-drawn result animation (built-in skin); e = ms since the animation started. */
  procedural?: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, result: 'clear' | 'fullCombo' | 'dondaFullCombo', e: number) => void;
  /** TJAPlayer3 Clear animation parts (taiko pair opening over the "クリア成功" text). */
  clearParts?: { l: ImageSource[]; r: ImageSource[]; text: ImageSource; effect?: ImageSource };
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
  character?: LoadedCharacter;
  hitEffect?: { great: ImageSource[]; greatBig: ImageSource[]; frameMs: number };
  gaugeRainbow?: { frames: ImageSource[]; frameMs: number };
  danRainbow?: { frames: ImageSource[]; frameMs: number };
  mob?: { images: ImageSource[]; beat: number };
  endAnim?: LoadedEndAnim;
  /** Images used by background layers, keyed by BackgroundLayer.image. */
  layerImages: Record<string, ImageSource>;
}

/**
 * Resolves a skin-relative path to its bytes (or null if missing). Resolvers
 * backed by a folder or zip can also list their files, which enables
 * auto-detection of dancer folders.
 */
export type SkinFileResolver = ((path: string) => Promise<Blob | null>) & { list?: () => string[] };

/**
 * Dan-i dojo exam panel layout (OpenTaiko Game_DanC_* skin values), in skin px.
 * Defaults are OpenTaiko's 720p values scaled to the skin height.
 */
export interface DanLayout {
  /** Game_DanC_X/Y[0]: soul gauge exam tab (its x is shifted by the exam value). */
  gaugeExam: XY;
  /** Game_DanC_X/Y[1]: exam panel origin. */
  panel: XY;
  /** Game_DanC_Size: one exam bar (half of Base.png). */
  size: XY;
  padding: number;
  baseOffsetX: XY;
  baseOffsetY: XY;
  smallBaseOffsetX: XY;
  smallBaseOffsetY: XY;
  /** Exam gauge fill, from the bar's left / lower edge. */
  offset: XY;
  numberSize: XY;
  smallNumberSize: XY;
  miniNumberSize: XY;
  numberPadding: number;
  numberSmallScale: number;
  numberSmallPadding: number;
  examNumberScale: number;
  numberOffset: XY;
  examTypeSize: XY;
  examRangeSize: XY;
  examRangePadding: number;
  examOffset: XY;
  /** Song title on the section curtain: [title only, title with subtitle]. */
  title: [XY, XY];
  subtitle: XY;
  titleSize: number;
  subtitleSize: number;
  titleMaxWidth: number;
  /** Dan plate (Dan_Plate.png from the song folder) centre. */
  plate: XY;
}
