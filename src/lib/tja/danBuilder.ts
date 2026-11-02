/**
 * Builds a dan-i dojo course from ordinary song charts plus user-chosen exams,
 * laid out exactly like a `COURSE:Dan` TJA with #NEXTSONG between the songs.
 */
import { buildCourse, DAN_NEXT_SONG_DELAY_MS } from './parser';
import type { BarLine, Branch, Course, CourseSource, DanExam, DanSong, GogoRange, Note, TjaMeta } from './types';
import { MAX_EXAMS } from './types';

export interface DanBuildSong {
  meta: TjaMeta;
  source: CourseSource;
  branch: Branch;
}

export interface DanBuildExam {
  type: DanExam['type'];
  range: DanExam['range'];
  /** Per-song exam (1st/2nd/3rd…) instead of one for the whole dan. */
  perSong: boolean;
  /** [red, gold] for the whole dan, or one pair per song when perSong. */
  values: [number, number][];
}

/** End of a song's chart: the end of its last measure (or last note). */
function chartEnd(c: Course): number {
  let end = 0;
  for (const n of c.notes) end = Math.max(end, n.endTime ?? n.time);
  const bars = c.bars;
  if (bars.length) {
    const last = bars[bars.length - 1].time;
    const len = bars.length > 1 ? last - bars[bars.length - 2].time : 0;
    end = Math.max(end, last + len);
  }
  return end;
}

export function buildDanCourse(songs: DanBuildSong[], exams: DanBuildExam[], tick?: number): Course {
  const notes: Note[] = [];
  const bars: BarLine[] = [];
  const gogo: GogoRange[] = [];
  const danSongs: DanSong[] = [];
  let cursor = 0;
  songs.forEach((s) => {
    const c = buildCourse(s.meta, s.source, s.branch);
    const chipTime = cursor;
    const audioStart = chipTime + DAN_NEXT_SONG_DELAY_MS;
    const shift = (t: number) => t + audioStart;
    for (const n of c.notes) notes.push({ ...n, time: shift(n.time), endTime: n.endTime === undefined ? undefined : shift(n.endTime) });
    for (const b of c.bars) bars.push({ ...b, time: shift(b.time) });
    for (const g of c.gogo) gogo.push({ start: shift(g.start), end: shift(g.end) });
    danSongs.push({
      title: s.meta.title,
      subtitle: s.meta.subtitle,
      genre: s.meta.genre,
      wave: s.meta.wave,
      scoreInit: c.scoreInit,
      scoreDiff: c.scoreDiff,
      level: s.source.level,
      chipTime,
      audioStart,
      exams: Array(MAX_EXAMS).fill(null),
    });
    cursor = audioStart + chartEnd(c);
  });

  const global: (DanExam | null)[] = Array(MAX_EXAMS).fill(null);
  exams.slice(0, MAX_EXAMS).forEach((e, i) => {
    const make = (v: [number, number] | undefined): DanExam => ({ type: e.type, range: e.range, values: v ?? [0, 0] });
    if (e.perSong && e.type !== 'gauge' && danSongs.length > 1) {
      danSongs.forEach((s, k) => (s.exams[i] = make(e.values[k] ?? e.values[e.values.length - 1])));
      global[i] = danSongs[0].exams[i];
    } else {
      global[i] = make(e.values[0]);
      if (danSongs[0]) danSongs[0].exams[i] = global[i];
    }
  });

  notes.sort((a, b) => a.time - b.time);
  bars.sort((a, b) => a.time - b.time);
  return {
    course: 'Dan',
    level: 10,
    label: '段位道場 (Dan)',
    notes,
    bars,
    gogo,
    hasBranches: false,
    branch: 'master',
    dan: { songs: danSongs, exams: global, tick },
  };
}
