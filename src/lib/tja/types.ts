/** Note kinds after normalisation (see parser for the TJA char mapping). */
export type NoteType =
  | 'don'
  | 'ka'
  | 'bigDon'
  | 'bigKa'
  | 'roll'
  | 'bigRoll'
  | 'balloon'
  | 'mine';

export type Branch = 'normal' | 'expert' | 'master';

export type CourseName = 'Easy' | 'Normal' | 'Hard' | 'Oni' | 'Edit' | 'Dan';

export interface Note {
  type: NoteType;
  /** Song time in ms (0 = start of the audio file). */
  time: number;
  /** BPM / scroll in effect for this note — used for horizontal position. */
  bpm: number;
  scroll: number;
  gogo: boolean;
  /** For roll / bigRoll / balloon: end time and the end chip's bpm/scroll. */
  endTime?: number;
  endBpm?: number;
  endScroll?: number;
  /** For balloon: number of hits required. */
  balloonCount?: number;
}

export interface BarLine {
  time: number;
  bpm: number;
  scroll: number;
  visible: boolean;
  /** True for the bar that starts a branch section. */
  branch: boolean;
}

export interface GogoRange {
  start: number;
  end: number;
}

export interface Course {
  course: CourseName;
  level: number;
  /** Raw course key (e.g. "Oni", "Edit"), useful for UI. */
  label: string;
  notes: Note[];
  bars: BarLine[];
  gogo: GogoRange[];
  hasBranches: boolean;
  branch: Branch;
  scoreInit?: number;
  scoreDiff?: number;
  /** Dan-i dojo (段位道場) course: songs joined by #NEXTSONG plus exams. */
  dan?: DanInfo;
}

/** Dan-i dojo exam kinds (OpenTaiko Exam.Type), in their ExamType.png row order. */
export const EXAM_TYPES = [
  'gauge',
  'judgePerfect',
  'judgeGood',
  'judgeBad',
  'score',
  'roll',
  'hit',
  'combo',
  'accuracy',
  'judgeAdlib',
  'judgeMine',
] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

/** One `EXAMn:type,red,gold,range` condition. */
export interface DanExam {
  type: ExamType;
  /** [pass (red), better pass (gold)] thresholds. */
  values: [number, number];
  range: 'more' | 'less';
}

/** Max exams per dan (including the soul gauge one), as in OpenTaiko. */
export const MAX_EXAMS = 7;

export interface DanSong {
  title: string;
  subtitle: string;
  genre: string;
  /** Audio file name from #NEXTSONG. */
  wave: string;
  scoreInit?: number;
  scoreDiff?: number;
  level: number;
  /** Song time of the #NEXTSONG command (the section curtain starts here). */
  chipTime: number;
  /** Song time at which this song's audio starts. */
  audioStart: number;
  /** Exams for this song, by exam slot (index 0 = EXAM1). Global exams fill song 0's empty slots. */
  exams: (DanExam | null)[];
}

export interface DanInfo {
  songs: DanSong[];
  /** DANTICK (dan plate style, 0–5) and DANTICKCOLOR. */
  tick?: number;
  tickColor?: string;
  /** Exams by slot as first defined (global values). */
  exams: (DanExam | null)[];
}

export interface TjaMeta {
  title: string;
  subtitle: string;
  wave: string;
  offset: number;
  bpm: number;
  demoStart: number;
  genre: string;
}

export interface CourseSource {
  course: CourseName;
  label: string;
  level: number;
  headers: Record<string, string>;
  /** Raw lines between #START and #END. */
  body: string[];
  hasBranches: boolean;
}

export interface ParsedTja {
  meta: TjaMeta;
  courses: CourseSource[];
}
