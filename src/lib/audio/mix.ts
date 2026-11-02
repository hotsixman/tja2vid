import type { Playthrough } from '../sim/autoplay';
import type { LoadedSkin, SoundKey } from '../skin/types';
import { endAnimationTime, type EndResult } from '../endResult';

export interface MixOptions {
  sampleRate: number;
  musicVolume: number;
  hitVolume: number;
  /** Video-time (ms) at which song time 0 happens. */
  leadInMs: number;
  /** Total length of the output in ms. */
  durationMs: number;
  /** Result jingle to play when the result animation starts. */
  endResult?: EndResult;
  /** End of the song (audio) in song time; the result animation starts then. */
  songEndMs?: number | null;
}

/** Decodes an encoded audio file using a throwaway context. */
export async function decodeAudio(data: ArrayBuffer, sampleRate = 48000): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, sampleRate);
  return ctx.decodeAudioData(data.slice(0));
}

/**
 * Renders the final soundtrack: the song (delayed by the lead-in) plus a drum
 * sample for every autoplay hit.
 */
export async function mixSoundtrack(
  music: AudioBuffer | null,
  skin: LoadedSkin,
  play: Playthrough,
  opts: MixOptions,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil((opts.durationMs / 1000) * opts.sampleRate));
  const ctx = new OfflineAudioContext(2, length, opts.sampleRate);

  if (music) {
    const src = ctx.createBufferSource();
    src.buffer = music;
    const gain = ctx.createGain();
    gain.gain.value = opts.musicVolume;
    src.connect(gain).connect(ctx.destination);
    // A negative lead-in means the output starts part-way into the song.
    const at = opts.leadInMs / 1000;
    if (at >= 0) src.start(at);
    else src.start(0, -at);
  }

  const decode = async (buf?: ArrayBuffer) => (buf ? ctx.decodeAudioData(buf.slice(0)).catch(() => null) : null);
  const [don, ka] = await Promise.all([decode(skin.sounds.don), decode(skin.sounds.ka)]);

  if (opts.hitVolume > 0) {
    const hitGain = ctx.createGain();
    hitGain.gain.value = opts.hitVolume;
    hitGain.connect(ctx.destination);
    for (const h of play.hits) {
      const buf = h.color === 'don' ? don : ka;
      if (!buf) continue;
      const when = (h.time + opts.leadInMs) / 1000;
      if (when < 0 || when * 1000 > opts.durationMs) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(hitGain);
      src.start(when);
    }
  }

  const endKey: Record<EndResult, SoundKey | null> = {
    none: null,
    clear: 'endClear',
    fullCombo: 'endFullCombo',
    dondaFullCombo: 'endDondaFullCombo',
  };
  const key = endKey[opts.endResult ?? 'dondaFullCombo'];
  const jingle = key ? await decode(skin.sounds[key] ?? (key === 'endDondaFullCombo' ? skin.sounds.endFullCombo : undefined)) : null;
  const when = (endAnimationTime(play, opts.songEndMs) + opts.leadInMs) / 1000;
  if (jingle && when >= 0 && when * 1000 < opts.durationMs) {
    const src = ctx.createBufferSource();
    src.buffer = jingle;
    src.connect(ctx.destination);
    src.start(when);
  }

  // Dan-i dojo: section sound when each song's curtain starts (OpenTaiko Dan_Cert.Start).
  const sections = play.dan?.sections ?? [];
  if (sections.length) {
    const [first, next] = await Promise.all([decode(skin.sounds.danSectionFirst), decode(skin.sounds.danSection)]);
    sections.forEach((sec, i) => {
      const buf = i === 0 ? first : next;
      const at = (sec.start + opts.leadInMs) / 1000;
      if (!buf || at < 0 || at * 1000 >= opts.durationMs) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(at);
    });
  }

  return ctx.startRendering();
}

/**
 * Dan-i dojo: places every song's audio at its start time on one timeline.
 * Files are looked up by name (case-insensitive); missing ones stay silent.
 */
export function composeDanMusic(
  songs: { wave: string; audioStart: number }[],
  bank: Record<string, AudioBuffer>,
  sampleRate: number,
): { buffer: AudioBuffer | null; missing: string[] } {
  const found = songs.map((s) => bank[s.wave.toLowerCase()] ?? null);
  const missing = songs.filter((_, i) => !found[i]).map((s) => s.wave);
  if (found.every((b) => !b)) return { buffer: null, missing };
  let length = 1;
  songs.forEach((s, i) => {
    const b = found[i];
    if (b) length = Math.max(length, Math.round((s.audioStart / 1000) * sampleRate) + Math.round(b.duration * sampleRate));
  });
  const out = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  songs.forEach((s, i) => {
    const b = found[i];
    if (!b) return;
    const at = Math.round((s.audioStart / 1000) * sampleRate);
    // Buffers are decoded at the output rate, so samples copy straight across.
    for (let ch = 0; ch < 2; ch++) {
      const src = b.getChannelData(Math.min(ch, b.numberOfChannels - 1));
      out.getChannelData(ch).set(src.subarray(0, Math.max(0, Math.min(src.length, length - at))), at);
    }
  });
  return { buffer: out, missing };
}
