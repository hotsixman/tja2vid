import type { Playthrough } from './sim/autoplay';

export interface TimelineOptions {
  /** Lead-in shown before the chart starts (ms). */
  preRollMs: number;
  /** Extra time after the last note (ms). */
  tailMs: number;
  /** 'audio' = run until the song ends, 'chart' = stop shortly after the last note. */
  endMode: 'audio' | 'chart';
  /** Length of the song loading screen shown before play (0 = none). */
  introMs?: number;
  /** Keep the video running at least this long after the last note (e.g. for the result animation). */
  minTailMs?: number;
}

export interface Timeline {
  /** Video time (ms) at which song time 0 (audio start) happens. */
  leadInMs: number;
  /** Total video length (ms). */
  durationMs: number;
  /** Loading screen range in song time, if enabled. */
  intro?: { start: number; end: number };
}

export function computeTimeline(play: Playthrough, musicDurationMs: number | null, o: TimelineOptions): Timeline {
  const firstBar = play.course.bars[0]?.time ?? play.firstTime;
  const chartStart = Math.min(firstBar, play.firstTime);
  // Start no later than the audio, and early enough that the first notes scroll in.
  const playStart = Math.min(0, chartStart - o.preRollMs);
  const introMs = Math.max(0, o.introMs ?? 0);
  const startSong = playStart - introMs;
  const leadInMs = -startSong;

  const minEnd = play.lastTime + Math.max(1000, o.minTailMs ?? 0);
  const chartEnd = Math.max(play.lastTime + o.tailMs, minEnd);
  const endSong = o.endMode === 'audio' && musicDurationMs !== null ? Math.max(musicDurationMs, minEnd) : chartEnd;
  return {
    leadInMs,
    durationMs: Math.max(1000, endSong + leadInMs),
    intro: introMs > 0 ? { start: startSong, end: playStart } : undefined,
  };
}
