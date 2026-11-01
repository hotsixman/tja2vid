import type { DancerConfig, SkinLayout, SkinManifest } from './types';

/*
 * Compatibility with OpenTaiko / TJAPlayer3-format skin folders.
 *
 * No skin assets ship with this app. This module only describes the folder
 * layout and config files of that format, so users can load skins they have.
 */

const G = 'Graphics/5_Game';
const BG = `${G}/5_Background/Normal`;

/** OpenTaiko 1920x1080 layout (values from its default skin's GameConfig.ini, 1P). */
export const OPENTAIKO_LAYOUT: SkinLayout = {
  noteSize: [195, 195],
  scrollField: [523, 286],
  // Game_Notes_Interval (960) * Resolution.X / 1280
  pxPer4Beats: 1440,
  seNotesOffset: [-8, 198],
  seNoteSize: [204, 45],
  lane: [499, 287],
  laneSub: [499, 488],
  judge: [554, 234],
  judgeMove: [0, 20],
  judgeRows: 5,
  notesAnime: true,
  taikoBackground: [0, 276],
  taikoFrame: [495, 204],
  taiko: [303, 324],
  combo: [391, 406],
  comboEx: [391, 408],
  comboEx4: [391, 403],
  comboPadding: [51, 51, 45],
  comboSize: [60, 72],
  comboText: [391, 446],
  courseSymbol: [-4, 355],
  score: [25, 343],
  scorePadding: 31,
  scoreSize: [39, 51],
  gauge: [719, 208],
  gaugeRect: [0, 0, 1050, 76],
  gaugeClearText: [1671, 244],
  gaugeClearTextRect: [4, 77, 92, 34],
  gaugeClearTextClearRect: [104, 77, 92, 34],
  gaugeCells: 50,
  soul: [1776, 186],
  soulFire: [1672, 61],
  soulFireFrames: 8,
  flyingStart: [620, 352],
  flyingEnd: [1833, 240],
  flyingSine: 330,
  notesFlash: [270, 270, 16],
  hitExplosion: [424, 186],
  hitExplosionFrames: 7,
  gogoFire: [342, 89],
  gogoFireFrames: 7,
  balloon: [565, 168],
  balloonFrame: [565, 133],
  balloonNumber: [636, 295],
  balloonNumberSize: [95, 113],
  balloonNumberInterval: [83, 0],
  rollFrame: [218, -3],
  rollFrameFrames: 5,
  rollNumber: [383, 209],
  title: [1890, 63],
  titleFontSize: 54,
  subtitleFontSize: 30,
  bgUpHeight: 288,
  bgDownY: 540,
  loadingPlate: [960, 540],
  loadingTitle: [960, 420],
  loadingSubtitle: [960, 488],
  loadingTitleFontSize: 62,
  loadingSubtitleFontSize: 40,
  loadingCharaMove: [375, -120],
  loadingTitleColor: '#ffffff',
  loadingTitleStroke: '#000000',
  loadingSubtitleColor: '#000000',
  loadingSubtitleStroke: '',
};

/**
 * Asset paths, relative to the skin root. These are the same relative paths an
 * OpenTaiko skin folder uses, so any OpenTaiko-format skin folder can be loaded
 * with this manifest (its GameConfig.ini is applied on top, see loader.ts).
 */
export const OPENTAIKO_MANIFEST: SkinManifest = {
  id: 'opentaiko-format',
  name: 'OpenTaiko 형식 스킨',
  resolution: [1920, 1080],
  font: 'Fonts/MPLUSRounded1c-Medium.ttf',
  images: {
    notes: `${G}/Notes.png`,
    seNotes: `${G}/SENotes.png`,
    judge: `${G}/Judge.png`,
    bar: `${G}/Bar.png`,
    barBranch: `${G}/Bar_Branch.png`,
    mine: `${G}/Mine.png`,
    laneBackground: `${G}/12_Lane/Background_Main.png`,
    laneSub: `${G}/12_Lane/Background_Sub.png`,
    laneGogo: `${G}/12_Lane/Background_GoGo.png`,
    laneBaseNormal: `${G}/12_Lane/Base_Normal.png`,
    laneBaseExpert: `${G}/12_Lane/Base_Expert.png`,
    laneBaseMaster: `${G}/12_Lane/Base_Master.png`,
    laneTextNormal: `${G}/12_Lane/Text_Normal.png`,
    laneTextExpert: `${G}/12_Lane/Text_Expert.png`,
    laneTextMaster: `${G}/12_Lane/Text_Master.png`,
    laneRed: `${G}/12_Lane/Red.png`,
    laneBlue: `${G}/12_Lane/Blue.png`,
    laneYellow: `${G}/12_Lane/Yellow.png`,
    taikoBackground: `${G}/6_Taiko/1P_Background.png`,
    taikoFrame: `${G}/6_Taiko/1P_Frame.png`,
    taikoBase: `${G}/6_Taiko/Base.png`,
    taikoDon: `${G}/6_Taiko/Don.png`,
    taikoKa: `${G}/6_Taiko/Ka.png`,
    combo: `${G}/6_Taiko/Combo.png`,
    comboMedium: `${G}/6_Taiko/Combo_Midium.png`,
    comboBig: `${G}/6_Taiko/Combo_Big.png`,
    comboHuge: `${G}/6_Taiko/Combo_Huge.png`,
    comboText: `${G}/6_Taiko/Combo_Text.png`,
    score: `${G}/6_Taiko/Score.png`,
    courseEasy: `${G}/4_CourseSymbol/Easy.png`,
    courseNormal: `${G}/4_CourseSymbol/Normal.png`,
    courseHard: `${G}/4_CourseSymbol/Hard.png`,
    courseOni: `${G}/4_CourseSymbol/Oni.png`,
    courseEdit: `${G}/4_CourseSymbol/Edit.png`,
    gaugeBase: `${G}/7_Gauge/1P_Base.png`,
    gaugeFill: `${G}/7_Gauge/1P.png`,
    gaugeClear: `${G}/7_Gauge/Clear.png`,
    soul: `${G}/7_Gauge/Soul.png`,
    soulFire: `${G}/7_Gauge/Fire.png`,
    soulExplosion: `${G}/7_Gauge/1P_Explosion.png`,
    hitExplosion: `${G}/10_Effects/Hit/Explosion.png`,
    gogoFire: `${G}/10_Effects/Fire.png`,
    balloon: `${G}/11_Balloon/Balloon.png`,
    balloonBreaking0: `${G}/11_Balloon/Breaking_0.png`,
    balloonBreaking1: `${G}/11_Balloon/Breaking_1.png`,
    balloonBreaking2: `${G}/11_Balloon/Breaking_2.png`,
    balloonBreaking3: `${G}/11_Balloon/Breaking_3.png`,
    balloonBreaking4: `${G}/11_Balloon/Breaking_4.png`,
    balloonBreaking5: `${G}/11_Balloon/Breaking_5.png`,
    rollNumber: `${G}/11_Balloon/Number_Roll.png`,
    rollFrame: `${G}/11_Balloon/Roll.png`,
    bgUpBase: `${BG}/Up/0/BG_Red.png`,
    bgUpBaseClear: `${BG}/Up/0/BG_Clear.png`,
    bgUpDot: `${BG}/Up/0/Dot_Red.png`,
    bgUpDotClear: `${BG}/Up/0/Dot_Clear.png`,
    bgUpDango: `${BG}/Up/0/Dango_Red.png`,
    bgUpDangoClear: `${BG}/Up/0/Dango_Clear.png`,
    bgDown: `${BG}/Down/0/Down.png`,
    bgDownClear: `${BG}/Down/0/Down_Clear.png`,
    bgDownScroll: `${BG}/Down/0/Down_Scroll.png`,
    footer: `${G}/8_Footer/0.png`,
    loadingBackground: 'Graphics/4_SongLoading/Bg.png',
    loadingChara: 'Graphics/4_SongLoading/Chara.png',
    loadingPlate: 'Graphics/4_SongLoading/Plate.png',
  },
  sounds: {
    don: 'Sounds/Taiko/dong.ogg',
    ka: 'Sounds/Taiko/ka.ogg',
  },
  layout: OPENTAIKO_LAYOUT,
  hitEffect: { dir: `${G}/10_Effects/Hit` },
};

/**
 * OpenTaiko's built-in defaults (CSkin.cs), which are 1280x720 values. Older
 * TJAPlayer3-style skins without a GameConfig.ini only override some of these.
 */
export const OPENTAIKO_720_LAYOUT: SkinLayout = {
  noteSize: [130, 130],
  scrollField: [349, 192],
  pxPer4Beats: 960,
  seNotesOffset: [-2, 131],
  seNoteSize: [136, 30],
  lane: [333, 192],
  laneSub: [333, 326],
  judge: [364, 152],
  judgeMove: [0, 20],
  judgeRows: 5,
  notesAnime: true,
  taikoBackground: [0, 184],
  taikoFrame: [329, 136],
  taiko: [205, 206],
  combo: [267, 272],
  comboEx: [267, 274],
  comboEx4: [267, 269],
  comboPadding: [34, 34, 30],
  comboSize: [40, 48],
  comboText: [268, 298],
  courseSymbol: [-4, 232],
  score: [20, 226],
  scorePadding: 20,
  scoreSize: [24, 40],
  gauge: [492, 144],
  gaugeRect: [0, 0, 700, 44],
  gaugeClearText: [1038, 144],
  gaugeClearTextRect: [0, 44, 58, 24],
  gaugeClearTextClearRect: [58, 44, 58, 24],
  gaugeCells: 50,
  soul: [1184, 125],
  soulFire: [1112, 52],
  soulFireFrames: 8,
  flyingStart: [414, 260],
  flyingEnd: [1222, 164],
  flyingSine: 220,
  notesFlash: [180, 180, 16],
  hitExplosion: [284, 126],
  hitExplosionFrames: 7,
  gogoFire: [240, 71],
  gogoFireFrames: 7,
  balloon: [382, 115],
  balloonFrame: [382, 80],
  balloonNumber: [423, 187],
  balloonNumberSize: [63, 75],
  balloonNumberInterval: [55, 0],
  rollFrame: [218, -3],
  rollFrameFrames: 5,
  rollNumber: [313, 122],
  title: [1260, 42],
  titleFontSize: 36,
  subtitleFontSize: 20,
  bgUpHeight: 192,
  bgDownY: 360,
  loadingPlate: [640, 360],
  loadingTitle: [640, 280],
  loadingSubtitle: [640, 325],
  loadingTitleFontSize: 41,
  loadingSubtitleFontSize: 27,
  loadingCharaMove: [250, -80],
  loadingTitleColor: '#ffffff',
  loadingTitleStroke: '#000000',
  loadingSubtitleColor: '#000000',
  loadingSubtitleStroke: '',
};

/**
 * Maps OpenTaiko GameConfig.ini keys (1P value = first element) onto layout
 * fields, so a custom OpenTaiko skin folder's positions are honoured.
 */
const INI_PAIRS: [keyof SkinLayout, string, string?][] = [
  ['scrollField', 'Game_ScrollField_X', 'Game_ScrollField_Y'],
  ['seNotesOffset', 'Game_SENotes_Offset_X', 'Game_SENotes_Offset_Y'],
  ['lane', 'Game_Lane_X', 'Game_Lane_Y'],
  ['laneSub', 'Game_Lane_Sub_X', 'Game_Lane_Sub_Y'],
  ['judge', 'Game_Judge_X', 'Game_Judge_Y'],
  ['taikoBackground', 'Game_Taiko_Background_X', 'Game_Taiko_Background_Y'],
  ['taikoFrame', 'Game_Taiko_Frame_X', 'Game_Taiko_Frame_Y'],
  ['taiko', 'Game_Taiko_X', 'Game_Taiko_Y'],
  ['combo', 'Game_Taiko_Combo_X', 'Game_Taiko_Combo_Y'],
  ['comboEx', 'Game_Taiko_Combo_Ex_X', 'Game_Taiko_Combo_Ex_Y'],
  ['comboEx4', 'Game_Taiko_Combo_Ex4_X', 'Game_Taiko_Combo_Ex4_Y'],
  ['comboText', 'Game_Taiko_Combo_Text_X', 'Game_Taiko_Combo_Text_Y'],
  ['courseSymbol', 'Game_CourseSymbol_X', 'Game_CourseSymbol_Y'],
  ['score', 'Game_Score_X', 'Game_Score_Y'],
  ['gauge', 'Game_Gauge_X', 'Game_Gauge_Y'],
  ['gaugeClearText', 'Game_Gauge_ClearText_X', 'Game_Gauge_ClearText_Y'],
  ['soul', 'Gauge_Soul_X', 'Gauge_Soul_Y'],
  ['soulFire', 'Gauge_Soul_Fire_X', 'Gauge_Soul_Fire_Y'],
  ['flyingStart', 'Game_Effect_FlyingNotes_StartPoint_X', 'Game_Effect_FlyingNotes_StartPoint_Y'],
  ['flyingEnd', 'Game_Effect_FlyingNotes_EndPoint_X', 'Game_Effect_FlyingNotes_EndPoint_Y'],
  ['hitExplosion', 'Game_Effects_Hit_Explosion_X', 'Game_Effects_Hit_Explosion_Y'],
  ['gogoFire', 'Game_Effect_Fire_X', 'Game_Effect_Fire_Y'],
  ['balloon', 'Game_Balloon_Balloon_X', 'Game_Balloon_Balloon_Y'],
  ['balloonFrame', 'Game_Balloon_Balloon_Frame_X', 'Game_Balloon_Balloon_Frame_Y'],
  ['balloonNumber', 'Game_Balloon_Balloon_Number_X', 'Game_Balloon_Balloon_Number_Y'],
  ['rollFrame', 'Game_Balloon_Roll_Frame_X', 'Game_Balloon_Roll_Frame_Y'],
  ['rollNumber', 'Game_Balloon_Roll_Number_X', 'Game_Balloon_Roll_Number_Y'],
  ['loadingPlate', 'SongLoading_Plate_X', 'SongLoading_Plate_Y'],
  ['loadingTitle', 'SongLoading_Title_X', 'SongLoading_Title_Y'],
  ['loadingSubtitle', 'SongLoading_SubTitle_X', 'SongLoading_SubTitle_Y'],
];
const INI_VECTORS: [keyof SkinLayout, string][] = [
  ['noteSize', 'Game_Notes_Size'],
  ['seNoteSize', 'Game_SENote_Size'],
  ['judgeMove', 'Game_Judge_Move'],
  ['comboPadding', 'Game_Taiko_Combo_Padding'],
  ['comboSize', 'Game_Taiko_Combo_Size'],
  ['scoreSize', 'Game_Score_Size'],
  ['gaugeRect', 'Game_Gauge_Rect'],
  ['gaugeClearTextRect', 'Game_Gauge_ClearText_Rect'],
  ['gaugeClearTextClearRect', 'Game_Gauge_ClearText_Clear_Rect'],
  ['notesFlash', 'Game_Effect_NotesFlash'],
  ['balloonNumberSize', 'Game_Balloon_Number_Size'],
  ['balloonNumberInterval', 'Game_Balloon_Number_Interval'],
  ['loadingCharaMove', 'SongLoading_Chara_Move'],
];

/** Parses an OpenTaiko DancerConfig.txt onto a base config. */
export function parseDancerConfig(text: string, base: Partial<DancerConfig> = {}): DancerConfig {
  const ini = parseIni(text);
  const list = (k: string) => nums(ini[k]);
  const count = list('Game_Dancer_Count')[0] ?? base.count ?? 1;
  const x = list('Game_Dancer_X');
  const y = list('Game_Dancer_Y');
  const motion = list('Game_Dancer_Motion');
  const gauge = list('Game_Dancer_Gauge');
  return {
    count,
    x: x.length ? x : (base.x ?? [960]),
    y: y.length ? y : (base.y ?? [770]),
    motion: motion.length ? motion : (base.motion ?? [0]),
    beat: list('Game_Dancer_Beat')[0] ?? base.beat ?? 8,
    gauge: gauge.length ? gauge : (base.gauge ?? [0]),
  };
}

export function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim();
    const m = /^([^=\s]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const nums = (v: string | undefined) =>
  v === undefined ? [] : v.split(',').map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));

/** Applies OpenTaiko SkinConfig.ini / GameConfig.ini values onto a layout. */
export function applyOpenTaikoIni(
  layout: SkinLayout,
  game: Record<string, string>,
  skin: Record<string, string> = {},
): { layout: SkinLayout; resolution?: [number, number] } {
  const l: SkinLayout = structuredClone(layout);
  const set = (k: keyof SkinLayout, v: unknown) => ((l as unknown as Record<string, unknown>)[k] = v);
  for (const [field, kx, ky] of INI_PAIRS) {
    const x = nums(game[kx])[0];
    const y = ky ? nums(game[ky])[0] : undefined;
    const cur = l[field] as [number, number];
    if (x !== undefined || y !== undefined) set(field, [x ?? cur[0], y ?? cur[1]]);
  }
  for (const [field, key] of INI_VECTORS) {
    const v = nums(game[key]);
    const cur = l[field] as number[];
    if (v.length >= cur.length) set(field, v.slice(0, cur.length));
  }
  const pad = nums(game.Game_Score_Padding)[0];
  if (pad !== undefined) l.scorePadding = pad;
  // OpenTaiko font sizes are in points.
  const pt = (k: string) => {
    const v = nums(game[k])[0];
    return v === undefined ? undefined : Math.round((v * 4) / 3);
  };
  l.loadingTitleFontSize = pt('SongLoading_Title_FontSize') ?? l.loadingTitleFontSize;
  l.loadingSubtitleFontSize = pt('SongLoading_SubTitle_FontSize') ?? l.loadingSubtitleFontSize;
  // In-game title: Game_MusicName_X/Y is the top-right corner.
  l.titleFontSize = pt('Game_MusicName_FontSize') ?? l.titleFontSize;
  const mx = nums(game.Game_MusicName_X)[0];
  const my = nums(game.Game_MusicName_Y)[0];
  if (mx !== undefined) l.title = [mx, l.title[1]];
  if (my !== undefined) l.title = [l.title[0], my + l.titleFontSize / 2];
  const color = (k: string) => {
    const v = game[k]?.trim();
    if (!v) return undefined;
    const m = /^#([0-9a-f]{2})([0-9a-f]{6})$/i.exec(v); // .NET #AARRGGBB
    if (m) return parseInt(m[1], 16) === 0 ? '' : `#${m[2]}${m[1]}`;
    return v;
  };
  l.loadingTitleColor = color('SongLoading_Title_ForeColor') ?? l.loadingTitleColor;
  l.loadingTitleStroke = color('SongLoading_Title_BackColor') ?? l.loadingTitleStroke;
  l.loadingSubtitleColor = color('SongLoading_SubTitle_ForeColor') ?? l.loadingSubtitleColor;
  l.loadingSubtitleStroke = color('SongLoading_SubTitle_BackColor') ?? l.loadingSubtitleStroke;
  if (game.Game_Notes_Anime !== undefined) l.notesAnime = /^(1|true)$/i.test(game.Game_Notes_Anime.trim());
  const sine = nums(game.Game_Effect_FlyingNotes_Sine)[0];
  if (sine !== undefined) l.flyingSine = sine;

  const res = nums(skin.Resolution);
  const resolution = res.length >= 2 ? ([res[0], res[1]] as [number, number]) : undefined;
  const interval = nums(game.Game_Notes_Interval)[0];
  if (interval !== undefined) l.pxPer4Beats = (interval * (resolution?.[0] ?? 1920)) / 1280;
  return { layout: l, resolution };
}
