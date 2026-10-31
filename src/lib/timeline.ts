import type { Playthrough } from './sim/autoplay';

export interface TimelineOptions {
  /** Lead-in shown before the chart starts (ms). */
  preRollMs: number;
  /** Extra time after the last note (ms). */
  tailMs: number;
  /** 'audio' = run until the song ends, 'chart' = stop shortly after the last note. */
  endMode: 'audio' | 'chart';
}

export interface Timeline {
  /** Video time (ms) at which song time 0 (audio start) happens. */
  leadInMs: number;
  /** Total video length (ms). */
  durationMs: number;
}

export function computeTimeline(play: Playthrough, musicDurationMs: number | null, o: TimelineOptions): Timeline {
  const firstBar = play.course.bars[0]?.time ?? play.firstTime;
  const chartStart = Math.min(firstBar, play.firstTime);
  // Start no later than the audio, and early enough that the first notes scroll in.
  const startSong = Math.min(0, chartStart - o.preRollMs);
  const leadInMs = -startSong;

  const chartEnd = play.lastTime + o.tailMs;
  const endSong =
    o.endMode === 'audio' && musicDurationMs !== null ? Math.max(musicDurationMs, play.lastTime + 1000) : chartEnd;
  return { leadInMs, durationMs: Math.max(1000, endSong + leadInMs) };
}
