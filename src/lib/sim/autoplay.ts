import type { Course, Note } from '../tja/types';
import { buildDanPlay, type DanPlay } from './dan';

export type Hand = 'L' | 'R' | 'both';

/** A single drum hit performed by the autoplayer. */
export interface Hit {
  time: number;
  color: 'don' | 'ka';
  hand: Hand;
  big: boolean;
  source: 'note' | 'roll' | 'balloon';
  /** Index into course.notes. */
  noteIndex: number;
}

/** A note judged "Good" (autoplay always hits perfectly). */
export interface Judgement {
  time: number;
  noteIndex: number;
  big: boolean;
  color: 'don' | 'ka';
}

export interface RollState {
  noteIndex: number;
  start: number;
  end: number;
  hitTimes: number[];
  /** Balloon only: time it popped (undefined if not popped before end). */
  popTime?: number;
  required?: number;
}

export interface Step {
  time: number;
  value: number;
}

export interface AutoplayOptions {
  /** Drumroll / balloon hits per second. OpenTaiko's default autoplay speed is 15. */
  rollSpeed: number;
}

export interface Playthrough {
  course: Course;
  hits: Hit[];
  judgements: Judgement[];
  rolls: RollState[];
  combo: Step[];
  score: Step[];
  gauge: Step[];
  /** Gauge value (0–100) at which the course is cleared. */
  clearThreshold: number;
  maxCombo: number;
  totalNotes: number;
  firstTime: number;
  lastTime: number;
  /** Dan-i dojo exam tracking (dan courses only). */
  dan?: DanPlay;
}

const GAUGE_RATIO: Record<string, number> = { Easy: 0.6, Normal: 0.65, Hard: 0.7, Oni: 0.75, Edit: 0.75 };
const CLEAR_THRESHOLD: Record<string, number> = { Easy: 60, Normal: 70, Hard: 70, Oni: 80, Edit: 80 };

const isHittable = (n: Note) => n.type === 'don' || n.type === 'ka' || n.type === 'bigDon' || n.type === 'bigKa';

/** Simulates a perfect autoplay run, producing every timed event the renderer needs. */
export function simulate(course: Course, opts: AutoplayOptions): Playthrough {
  const hits: Hit[] = [];
  const judgements: Judgement[] = [];
  const rolls: RollState[] = [];
  const events: { time: number; kind: 'note' | 'roll' | 'pop'; big: boolean }[] = [];

  let alt = false;
  const nextHand = (): Hand => ((alt = !alt) ? 'R' : 'L');
  const interval = 1000 / Math.max(1, opts.rollSpeed);

  course.notes.forEach((n, i) => {
    if (isHittable(n)) {
      const big = n.type === 'bigDon' || n.type === 'bigKa';
      const color = n.type === 'don' || n.type === 'bigDon' ? 'don' : 'ka';
      hits.push({ time: n.time, color, big, hand: big ? 'both' : nextHand(), source: 'note', noteIndex: i });
      judgements.push({ time: n.time, noteIndex: i, big, color });
      events.push({ time: n.time, kind: 'note', big });
    } else if (n.type === 'roll' || n.type === 'bigRoll' || n.type === 'balloon') {
      const end = n.endTime ?? n.time;
      const state: RollState = { noteIndex: i, start: n.time, end, hitTimes: [] };
      if (n.type === 'balloon') state.required = Math.max(1, n.balloonCount ?? 5);
      for (let t = n.time; t < end || (t === n.time && end === n.time); t += interval) {
        state.hitTimes.push(t);
        hits.push({ time: t, color: 'don', big: false, hand: nextHand(), source: n.type === 'balloon' ? 'balloon' : 'roll', noteIndex: i });
        events.push({ time: t, kind: 'roll', big: n.type === 'bigRoll' });
        if (state.required && state.hitTimes.length >= state.required) {
          state.popTime = t;
          events.push({ time: t, kind: 'pop', big: false });
          break;
        }
        if (end === n.time) break;
      }
      rolls.push(state);
    }
  });

  hits.sort((a, b) => a.time - b.time);
  events.sort((a, b) => a.time - b.time);

  const totalNotes = judgements.length;
  const shinUchi = (notes: number) => Math.ceil(1_000_000 / Math.max(1, notes) / 10) * 10;
  // Dan: every song has its own per-note score (SCOREINIT from #NEXTSONG).
  const danSongs = course.dan?.songs ?? [];
  const songOf = (t: number) => {
    let k = 0;
    for (let i = 0; i < danSongs.length; i++) if (danSongs[i].chipTime <= t) k = i;
    return k;
  };
  const danPerNote = danSongs.map((s, k) => {
    const end = k + 1 < danSongs.length ? danSongs[k + 1].chipTime : Infinity;
    const n = judgements.filter((j) => j.time >= s.chipTime && j.time < end).length;
    return s.scoreInit ?? shinUchi(n);
  });
  const perNoteFixed = course.scoreInit ?? shinUchi(totalNotes);
  const perNoteAt = (t: number) => (danSongs.length ? danPerNote[songOf(t)] : perNoteFixed);
  const gaugeStep = 100 / Math.max(1, totalNotes * (GAUGE_RATIO[course.course] ?? 0.75));

  const combo: Step[] = [{ time: -Infinity, value: 0 }];
  const score: Step[] = [{ time: -Infinity, value: 0 }];
  const gauge: Step[] = [{ time: -Infinity, value: 0 }];
  let c = 0;
  let s = 0;
  let g = 0;
  for (const e of events) {
    if (e.kind === 'note') {
      c++;
      s += perNoteAt(e.time);
      g = Math.min(100, g + gaugeStep);
      combo.push({ time: e.time, value: c });
      gauge.push({ time: e.time, value: g });
    } else if (e.kind === 'roll') {
      s += e.big ? 200 : 100;
    } else if (e.kind === 'pop') {
      s += 5000;
    }
    score.push({ time: e.time, value: s });
  }

  const times = course.notes.map((n) => n.endTime ?? n.time);
  const gaugeExam = course.dan?.songs[0]?.exams.find((e) => e?.type === 'gauge') ?? course.dan?.exams.find((e) => e?.type === 'gauge');
  const play: Playthrough = {
    course,
    hits,
    judgements,
    rolls,
    combo,
    score,
    gauge,
    clearThreshold: gaugeExam ? Math.min(100, gaugeExam.values[0]) : (CLEAR_THRESHOLD[course.course] ?? 80),
    maxCombo: c,
    totalNotes,
    firstTime: course.notes.length ? course.notes[0].time : 0,
    lastTime: times.length ? Math.max(...times) : 0,
  };
  if (course.dan) play.dan = buildDanPlay(play, course.dan, danPerNote);
  return play;
}

/** Value of a step function at time t (last step with time <= t). */
export function stepAt(steps: Step[], t: number): number {
  let lo = 0;
  let hi = steps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (steps[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return steps[lo].value;
}

/** Index of the first element with time >= t in a time-sorted array. */
export function lowerBound<T extends { time: number }>(arr: T[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
