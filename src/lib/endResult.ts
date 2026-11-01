import type { Playthrough } from './sim/autoplay';

/**
 * Result animation shown when the chart ends (TJAPlayer3 / Nijiiro):
 * clear (gauge passed), full combo (no misses), donda full combo (all 良).
 * A perfect autoplay is always a donda full combo; the others can be chosen
 * for the video.
 */
export type EndResult = 'none' | 'clear' | 'fullCombo' | 'dondaFullCombo';

export const END_RESULTS: { value: EndResult; label: string }[] = [
  { value: 'dondaFullCombo', label: '동더풀콤보 (전량)' },
  { value: 'fullCombo', label: '풀콤보' },
  { value: 'clear', label: '클리어' },
  { value: 'none', label: '없음' },
];

/** Delay after the last note before the result animation starts (ms). */
export const END_DELAY_MS = 300;

/**
 * Song time (ms) at which the result animation starts: once the song has
 * completely finished (end of the audio), and never before the last note.
 */
export function endAnimationTime(play: Playthrough, songEndMs?: number | null): number {
  return Math.max(play.lastTime + END_DELAY_MS, songEndMs ?? -Infinity);
}

/** Default time the result animation stays on screen (ms). */
export const END_HOLD_MS = 6000;
