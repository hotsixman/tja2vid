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

export type CourseName = 'Easy' | 'Normal' | 'Hard' | 'Oni' | 'Edit';

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
