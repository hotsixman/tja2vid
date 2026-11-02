/**
 * Dan-i dojo (段位道場) exam tracking for a perfect autoplay run.
 *
 * Ports OpenTaiko's Dan_Cert/Dan_C logic: every exam slot has an amount (e.g.
 * number of 良) and a "reach status" that drives the exam bar's colour and
 * blinking. Exams that are redefined by the last song are "individual" (one per
 * song, shown with a 1st/2nd/3rd badge); the others count over the whole dan.
 * Everything is precomputed as snapshots so the renderer can draw any time.
 */
import type { DanExam, DanInfo, Note } from '../tja/types';
import { stepAt, type Playthrough } from './autoplay';

/** OpenTaiko Exam.ReachStatus, in the same order (comparisons use it). */
export const Reach = {
  Unknown: 0,
  Failure: 1,
  Danger: 2,
  Low: 3,
  High: 4,
  NearSuccess: 5,
  NearerSuccess: 6,
  SuccessOrBetter: 7,
  NearBetterSuccess: 8,
  NearerBetterSuccess: 9,
  BetterSuccess: 10,
} as const;
export type ReachStatus = (typeof Reach)[keyof typeof Reach];

/** 0 = failure, 1 = success (red), 2 = better success (gold). */
export type ExamStatus = 0 | 1 | 2;

/** Section timing (OpenTaiko Dan_Cert counters). */
export const DAN_CURTAIN_IN_MS = 1000;
export const DAN_CURTAIN_WAIT_MS = 2300;
export const DAN_CURTAIN_OUT_MS = 273;
export const DAN_TEXT_MS = 2900;
/** Into the wait, when individual exams switch to the new song. */
export const DAN_EXAM_SWITCH_MS = 800;

export interface ExamSnapshot {
  time: number;
  amount: number;
  status: ReachStatus;
  /** When the status last changed visibly (starts the 400ms white flash), or -Infinity. */
  statusChanged: number;
  /** When the blink loop (re)started, or -Infinity. */
  flashStart: number;
  /** When the amount last changed (number bounce), or -Infinity. */
  amountChanged: number;
}

export interface ExamTrack {
  exam: DanExam;
  /** Song index for individual exams, null for whole-dan exams. */
  song: number | null;
  snaps: ExamSnapshot[];
}

export interface ExamSlot {
  /** EXAMn index (0-based). */
  index: number;
  individual: boolean;
  /** Individual: one track per song (null where that song has no exam); otherwise a single track. */
  tracks: (ExamTrack | null)[];
}

export interface DanSection {
  /** Song time of #NEXTSONG (curtain). */
  start: number;
  audioStart: number;
  /** Time the last hittable object of this song is done, or start if none. */
  lastChipTime: number;
  notes: number;
  /** Shin-uchi points per note for this song. */
  perNote: number;
}

export interface DanPlay {
  info: DanInfo;
  sections: DanSection[];
  slots: ExamSlot[];
}

interface Scope {
  /** Note index range [from, to). */
  from: number;
  to: number;
  /** First section in scope (for score exam) and whether it is one song only. */
  song: number;
  individual: boolean;
  start: number;
  judgeTimes: number[];
  rollHitTimes: number[];
  balloonEnds: { time: number; required: number }[];
  rolls: { start: number; end: number }[];
  notesMax: number;
  barRollMax: number;
  balloonHitMax: number;
  msBarRollMax: number;
  lastChipTime: number;
}

const isHittable = (n: Note) => n.type === 'don' || n.type === 'ka' || n.type === 'bigDon' || n.type === 'bigKa';
const isRoll = (n: Note) => n.type === 'roll' || n.type === 'bigRoll';

/** Sorted-number upper bound (count of values <= t). */
function countUpTo(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

class ExamState {
  amount = 0;
  status: ReachStatus = Reach.Unknown;
  constructor(readonly exam: DanExam) {}
  get v0() {
    return this.exam.values[0];
  }
  get v1() {
    return this.exam.values[1];
  }
  get less() {
    return this.exam.range === 'less';
  }
  /** Returns whether the amount changed (OpenTaiko Dan_C.Update). */
  update(now: number): boolean {
    if (now < 0) return false;
    const changed = this.less && now > this.amount && this.amount > this.v0 ? false : Math.trunc(now) !== Math.trunc(this.amount);
    this.amount = now;
    return changed;
  }
  examStatus(): ExamStatus {
    if (!this.less) {
      const c0 = this.amount >= this.v0;
      return c0 && this.amount >= this.v1 ? 2 : c0 ? 1 : 0;
    }
    const c0 = this.amount < this.v0;
    return c0 && this.amount < this.v1 ? 2 : c0 ? 1 : 0;
  }
  displayed(): number {
    return Math.max(0, this.less ? this.v0 - this.amount : this.amount);
  }
  percent(): number {
    if (this.v0 === 0 || this.displayed() === 0) return 0;
    return Math.trunc(Math.min(100, Math.max(1, (this.displayed() / this.v0) * 100)));
  }
  betterPercent(): number {
    if (this.exam.type === 'accuracy') return 0;
    if (this.v1 - this.v0 <= 0) return this.displayed() >= this.v0 ? 100 : 0;
    return Math.min(100, Math.max(0, ((this.displayed() - this.v0) / (this.v1 - this.v0)) * 100));
  }
}

export function examDisplayed(exam: DanExam, amount: number): number {
  return Math.max(0, exam.range === 'less' ? exam.values[0] - amount : amount);
}

export function examPercent(exam: DanExam, amount: number): number {
  const s = new ExamState(exam);
  s.amount = amount;
  return s.percent();
}

const toReach = (s: ExamStatus): ReachStatus =>
  s === 1 ? Reach.SuccessOrBetter : s === 2 ? Reach.BetterSuccess : Reach.Failure;

/** Blink speed of a status (0 = none). */
export function flashSpeed(r: ReachStatus): number {
  if (r === Reach.NearerSuccess || r === Reach.NearerBetterSuccess) return 2;
  if (r === Reach.Danger || r === Reach.NearSuccess || r === Reach.NearBetterSuccess) return 1;
  return 0;
}

/** Bar texture: 0 = normal, 1 = reach, 2 = clear (OpenTaiko GetIdxExamGaugeTexture). */
export function gaugeTextureIndex(r: ReachStatus, less: boolean): number {
  if (r >= Reach.SuccessOrBetter) return 2;
  if (r === Reach.Unknown && less) return 2;
  if (r >= Reach.High) return 1;
  return 0;
}

export function buildDanPlay(play: Playthrough, info: DanInfo, perNote: number[]): DanPlay {
  const notes = play.course.notes;
  const songs = info.songs;

  // Note index ranges per song.
  const ranges = songs.map((s, k) => {
    const end = k + 1 < songs.length ? songs[k + 1].chipTime : Infinity;
    let from = notes.findIndex((n) => n.time >= s.chipTime);
    if (from < 0) from = notes.length;
    let to = notes.findIndex((n) => n.time >= end);
    if (to < 0) to = notes.length;
    return { from, to, start: s.chipTime };
  });

  const makeScope = (from: number, to: number, song: number, individual: boolean, start: number): Scope => {
    const inRange = (i: number) => i >= from && i < to;
    const judgeTimes = play.judgements.filter((j) => inRange(j.noteIndex)).map((j) => j.time);
    const rollHitTimes = play.hits.filter((h) => h.source !== 'note' && inRange(h.noteIndex)).map((h) => h.time);
    const balloonEnds: Scope['balloonEnds'] = [];
    const rolls: Scope['rolls'] = [];
    let balloonHitMax = 0;
    let barRollMax = 0;
    let msBarRollMax = 0;
    let lastChipTime = start;
    for (let i = from; i < to; i++) {
      const n = notes[i];
      if (isHittable(n)) lastChipTime = Math.max(lastChipTime, n.time);
      else if (isRoll(n)) {
        barRollMax++;
        msBarRollMax += (n.endTime ?? n.time) - n.time;
        rolls.push({ start: n.time, end: n.endTime ?? n.time });
        lastChipTime = Math.max(lastChipTime, n.endTime ?? n.time);
      } else if (n.type === 'balloon') {
        const r = play.rolls.find((x) => x.noteIndex === i);
        const required = Math.max(1, n.balloonCount ?? 5);
        balloonHitMax += required;
        balloonEnds.push({ time: r?.popTime ?? n.endTime ?? n.time, required });
        lastChipTime = Math.max(lastChipTime, n.endTime ?? n.time);
      }
    }
    balloonEnds.sort((a, b) => a.time - b.time);
    return {
      from,
      to,
      song,
      individual,
      start,
      judgeTimes,
      rollHitTimes,
      balloonEnds,
      rolls,
      notesMax: judgeTimes.length,
      barRollMax,
      balloonHitMax,
      msBarRollMax,
      lastChipTime,
    };
  };

  const songScopes = ranges.map((r, k) => makeScope(r.from, r.to, k, true, r.start));
  const total = makeScope(0, notes.length, 0, false, songs[0]?.chipTime ?? 0);

  const sections: DanSection[] = songs.map((s, k) => ({
    start: s.chipTime,
    audioStart: s.audioStart,
    lastChipTime: songScopes[k].lastChipTime,
    notes: songScopes[k].notesMax,
    perNote: perNote[k] ?? 0,
  }));

  const showingAt = (t: number) => {
    let k = 0;
    for (let i = 0; i < songs.length; i++) if (songs[i].chipTime <= t) k = i;
    return k;
  };

  /** Value an exam measures at time t within a scope. */
  const amountAt = (exam: DanExam, sc: Scope, t: number): number => {
    const great = countUpTo(sc.judgeTimes, t);
    const roll = countUpTo(sc.rollHitTimes, t);
    switch (exam.type) {
      case 'gauge':
        return stepAt(play.gauge, t);
      case 'judgePerfect':
        return great;
      case 'score':
        return stepAt(play.score, t);
      case 'roll':
        return roll;
      case 'hit':
        return great + roll;
      case 'combo':
        // Perfect play: the highest combo within the scope is its judged count
        // (the whole-dan combo carries across songs).
        return sc.individual ? great : stepAt(play.combo, t);
      case 'accuracy':
        return great > 0 ? 100 : 0;
      default:
        return 0;
    }
  };

  const reachAt = (st: ExamState, sc: Scope, t: number, k: number) => {
    const great = countUpTo(sc.judgeTimes, t);
    const notesRemainMax = sc.notesMax - great;
    const barRollPass = sc.rolls.filter((r) => r.end <= t).length;
    let balloonHitPass = 0;
    for (const b of sc.balloonEnds) if (b.time <= t) balloonHitPass += b.required;
    let msBarRollPass = 0;
    for (const r of sc.rolls) msBarRollPass += Math.max(0, Math.min(t, r.end) - r.start);
    const combo = sc.individual ? great : stepAt(play.combo, t);

    const exam = st.exam;
    const judgeOnlyAfterLastNote = exam.type === 'gauge' || exam.type === 'accuracy';
    const isAfterLastChip = t >= sc.lastChipTime;

    const doFinalJudge = (): boolean => {
      const s = st.examStatus();
      st.status = toReach(s);
      return s !== 1;
    };
    if (isAfterLastChip && doFinalJudge()) return;
    if (st.status === Reach.Failure) return;

    if (!judgeOnlyAfterLastNote) {
      if (!st.less) {
        if (st.examStatus() === 2) {
          st.status = Reach.BetterSuccess;
          return;
        }
      } else if (st.examStatus() === 0) {
        st.status = Reach.Failure;
        return;
      }
    }

    const everyTime = ['judgePerfect', 'judgeGood', 'judgeBad', 'combo', 'judgeAdlib', 'judgeMine', 'roll', 'hit', 'accuracy'].includes(
      exam.type,
    );
    const judgeFailure = everyTime || isAfterLastChip;

    const resetDanger = () => {
      if (st.examStatus() >= 1) st.status = toReach(st.examStatus());
    };
    const genericMore = (remain: number): boolean => {
      if (remain <= 0 && doFinalJudge()) return true;
      if (st.examStatus() < 1) {
        if (judgeFailure && remain < st.v0 - st.amount) {
          st.status = Reach.Failure;
          return true;
        }
        if (remain - 0.02 * remain < st.v0 - st.amount) {
          st.status = Reach.Danger;
          return true;
        }
      }
      resetDanger();
      return false;
    };
    const genericLess = (remain: number, weight = 1): boolean => {
      if (remain <= 0 && doFinalJudge()) return true;
      if (st.amount + 4 * weight >= st.v0 && st.amount > 0) {
        st.status = Reach.Danger;
        return true;
      }
      resetDanger();
      return false;
    };
    const generic = (remain: number) => (st.less ? genericLess(remain) : genericMore(remain));
    const expectedRollHits = () => (20 * Math.max(0, sc.msBarRollMax - msBarRollPass)) / 1000;
    const judgeRoll = (remain: number, noteWeight: number): boolean => {
      if (!st.less) {
        if (remain <= 0 && doFinalJudge()) return true;
        if (st.examStatus() < 1) {
          const balloonRemain = sc.balloonHitMax - balloonHitPass;
          const maxNoRoll = st.amount + noteWeight * notesRemainMax + balloonRemain;
          if (judgeFailure && maxNoRoll < st.v0 && sc.barRollMax <= barRollPass) {
            st.status = Reach.Failure;
            return true;
          }
          if (maxNoRoll + expectedRollHits() < st.v0) {
            st.status = Reach.Danger;
            return true;
          }
        }
        resetDanger();
        return false;
      }
      return genericLess(remain);
    };

    let amountMax = sc.notesMax;
    let amountRemainMax = notesRemainMax;
    const rollRemain = sc.barRollMax - barRollPass + (sc.balloonHitMax - balloonHitPass);

    switch (exam.type) {
      case 'judgePerfect':
      case 'judgeGood':
      case 'judgeBad':
        if (generic(amountRemainMax)) return;
        break;
      case 'judgeAdlib':
      case 'judgeMine':
        amountMax = 0;
        amountRemainMax = 0;
        if (generic(0)) return;
        break;
      case 'combo':
        if (!st.less) {
          if (notesRemainMax <= 0 && doFinalJudge()) return;
          if (st.examStatus() < 1) {
            if (judgeFailure && combo + notesRemainMax < st.v0) {
              st.status = Reach.Failure;
              return;
            }
            if (notesRemainMax - 50 <= st.v0) {
              st.status = Reach.Danger;
              return;
            }
          }
          resetDanger();
        } else if (genericLess(amountRemainMax)) return;
        break;
      case 'roll':
        amountMax = sc.barRollMax + sc.balloonHitMax;
        amountRemainMax = rollRemain;
        if (judgeRoll(amountRemainMax, 0)) return;
        break;
      case 'hit':
        amountMax = sc.notesMax + sc.barRollMax + sc.balloonHitMax;
        amountRemainMax = notesRemainMax + rollRemain;
        if (judgeRoll(amountRemainMax, 1)) return;
        break;
      case 'accuracy': {
        if (amountRemainMax <= 0 && doFinalJudge()) return;
        const success = st.v0 * sc.notesMax;
        const better = st.v1 * sc.notesMax;
        const accMax = (great + notesRemainMax) * 100;
        const acc = great * 100;
        if (!st.less) {
          if (judgeFailure && accMax < success) {
            st.status = Reach.Failure;
            return;
          }
          if (st.examStatus() < 1) {
            st.status = Reach.Low;
            return;
          }
          st.status = successLess(amountMax, amountRemainMax, accMax >= better ? 2 : 1);
          return;
        }
        if (judgeFailure && acc >= success) {
          st.status = Reach.Failure;
          return;
        }
        if (acc + 400 >= success && acc > 0) {
          st.status = Reach.Danger;
          return;
        }
        break;
      }
      case 'score': {
        amountMax = sc.notesMax + sc.barRollMax + sc.balloonHitMax;
        amountRemainMax = notesRemainMax + rollRemain;
        if (!st.less) {
          if (amountRemainMax <= 0 && doFinalJudge()) return;
          let ptsRemain = 0;
          const last = sc.individual ? k + 1 : sections.length;
          for (let i = k; i < last; i++) {
            const s2 = songScopes[i];
            ptsRemain += sections[i].perNote * (s2.notesMax - countUpTo(s2.judgeTimes, t));
          }
          if (st.examStatus() < 1) {
            const balloonRemain = sc.balloonHitMax - balloonHitPass;
            const ptsNoRoll = st.amount + ptsRemain + 100 * balloonRemain;
            if (judgeFailure && ptsNoRoll < st.v0 && sc.barRollMax <= barRollPass) {
              st.status = Reach.Failure;
              return;
            }
            if (ptsNoRoll + 100 * expectedRollHits() < st.v0) {
              st.status = Reach.Danger;
              return;
            }
          }
          resetDanger();
        } else {
          const ptsPerHit = Math.max(100, ...sections.slice(k).map((s) => s.perNote));
          if (genericLess(amountRemainMax, ptsPerHit)) return;
        }
        break;
      }
      default:
        if (amountRemainMax <= 0 && doFinalJudge()) return;
        if (judgeFailure && st.examStatus() < 1) {
          st.status = Reach.Failure;
          return;
        }
        resetDanger();
        break;
    }

    if (st.status === Reach.Danger) return;

    function successLess(max: number, remain: number, status: ExamStatus): ReachStatus {
      if (isAfterLastChip) return Reach.SuccessOrBetter;
      const pct = max < 0 ? 0 : (100 * remain) / Math.max(1e-9, max);
      if (pct >= 10) return status === 2 ? Reach.SuccessOrBetter : Reach.High;
      if (pct >= 5) return status === 2 ? Reach.NearBetterSuccess : Reach.NearSuccess;
      return status === 2 ? Reach.NearerBetterSuccess : Reach.NearerSuccess;
    }

    if (!st.less) {
      const p = st.percent();
      if (p < 50) st.status = Reach.Low;
      else if (p < 95) st.status = Reach.High;
      else if (p < 100) st.status = Reach.NearSuccess;
      else {
        const b = st.betterPercent();
        st.status = isAfterLastChip
          ? Reach.SuccessOrBetter
          : b < 100 / 3
            ? Reach.SuccessOrBetter
            : b < 200 / 3
              ? Reach.NearBetterSuccess
              : Reach.NearerBetterSuccess;
      }
    } else {
      const p = st.percent();
      if (p < 20 && !isAfterLastChip) st.status = Reach.Danger;
      else if (p < 30 && !isAfterLastChip) st.status = Reach.Low;
      else st.status = successLess(amountMax, amountRemainMax, st.examStatus());
    }
  };

  // Every time something an exam can see changes.
  const eventTimes = [
    ...play.judgements.map((j) => j.time),
    ...play.hits.filter((h) => h.source !== 'note').map((h) => h.time),
    ...play.gauge.map((g) => g.time),
    ...play.score.map((s) => s.time),
    ...sections.map((s) => s.lastChipTime),
    ...play.rolls.map((r) => r.end),
  ].filter((x) => Number.isFinite(x));

  const runTrack = (exam: DanExam, sc: Scope, from: number, to: number, kOf: (t: number) => number): ExamSnapshot[] => {
    const st = new ExamState(exam);
    const snaps: ExamSnapshot[] = [];
    let statusChanged = -Infinity;
    let flashStart = -Infinity;
    let amountChanged = -Infinity;
    const times = [...new Set(eventTimes.filter((x) => x > from && x < to))].sort((a, b) => a - b);
    const step = (t: number, reset: boolean) => {
      const old = st.status;
      if (st.update(amountAt(exam, sc, t))) amountChanged = t;
      reachAt(st, sc, t, kOf(t));
      if (st.status !== old && old !== Reach.Unknown) {
        statusChanged = t;
        flashStart = t;
      } else if (reset) flashStart = t;
      const prev = snaps[snaps.length - 1];
      if (
        !prev ||
        prev.amount !== st.amount ||
        prev.status !== st.status ||
        prev.statusChanged !== statusChanged ||
        prev.flashStart !== flashStart ||
        prev.amountChanged !== amountChanged
      )
        snaps.push({ time: t, amount: st.amount, status: st.status, statusChanged, flashStart, amountChanged });
    };
    step(from, true);
    for (const t of times) step(t, false);
    return snaps;
  };

  const slots: ExamSlot[] = [];
  const last = songs[songs.length - 1];
  for (let i = 0; i < info.exams.length; i++) {
    if (!info.exams[i] && !songs.some((s) => s.exams[i])) continue;
    const individual = songs.length > 1 && !!last?.exams[i];
    if (individual) {
      const tracks = songs.map((s, k) => {
        const exam = s.exams[i];
        if (!exam) return null;
        // Active from the moment it is switched in until the next song's curtain.
        const from = k === 0 ? s.chipTime : s.chipTime + DAN_CURTAIN_IN_MS + DAN_EXAM_SWITCH_MS;
        const to = k + 1 < songs.length ? songs[k + 1].chipTime : Infinity;
        return { exam, song: k, snaps: runTrack(exam, songScopes[k], from, to, () => k) };
      });
      slots.push({ index: i, individual, tracks });
    } else {
      const exam = songs[0].exams[i] ?? info.exams[i]!;
      slots.push({
        index: i,
        individual,
        tracks: [{ exam, song: null, snaps: runTrack(exam, total, songs[0].chipTime, Infinity, showingAt) }],
      });
    }
  }
  return { info, sections, slots };
}

/** Snapshot of a track at time t (the first one if t is before it starts). */
export function snapAt(track: ExamTrack, t: number): ExamSnapshot {
  const s = track.snaps;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return s[lo];
}

/** Index of the song whose section (curtain onwards) contains t. */
export function danSongAt(dan: DanPlay, t: number): number {
  let k = 0;
  for (let i = 0; i < dan.sections.length; i++) if (dan.sections[i].start <= t) k = i;
  return k;
}
