import type { Playthrough } from '../sim/autoplay';
import type { LoadedSkin, SoundKey } from '../skin/types';
import { endAnimationTime, type EndResult } from '../endResult';
import { danSongAt } from '../sim/dan';

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
  /** Dan-i dojo: per-song hit-sound volume multipliers (by song index). */
  danHitVolumes?: number[];
}

/**
 * Loudness reference: PeepoDrumKit-web (hotsixman/PeepoDrumKit-web). There the
 * song and the hit sounds both go through a 0.75 master gain, the song at
 * SONGVOL and its don.wav / ka.wav at SEVOL. To get the same balance at
 * 100% / 100% with any skin's sounds, each hit sound is scaled to the loudness
 * of those files (loudest 50ms RMS, measured from them).
 */
export const MASTER_GAIN = 0.75;
const HIT_REFERENCE_RMS = { don: 0.179, ka: 0.16 } as const;

/** Loudest 50ms RMS of a buffer (channels averaged). */
export function peakWindowRms(buf: AudioBuffer): number {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const w = Math.max(1, Math.round(buf.sampleRate * 0.05));
  const hop = Math.max(1, w >> 2);
  let best = 0;
  for (let i = 0; i + w <= n || i === 0; i += hop) {
    let sum = 0;
    const end = Math.min(n, i + w);
    for (let j = i; j < end; j++) {
      let v = 0;
      for (const ch of chans) v += ch[j];
      v /= chans.length;
      sum += v * v;
    }
    best = Math.max(best, Math.sqrt(sum / Math.max(1, end - i)));
    if (end >= n) break;
  }
  return best;
}

/**
 * "음량 자동 맞춤": loudness of the busy parts of a song — the 90th percentile
 * of 400ms-window RMS (channels averaged), so quiet intros don't count.
 */
export function loudRms(buf: AudioBuffer): number {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const w = Math.max(1, Math.round(buf.sampleRate * 0.4));
  const rms: number[] = [];
  for (let i = 0; i < buf.length; i += w) {
    const end = Math.min(buf.length, i + w);
    let sum = 0;
    for (let j = i; j < end; j++) {
      let v = 0;
      for (const ch of chans) v += ch[j];
      v /= chans.length;
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / (end - i)));
  }
  if (!rms.length) return 0;
  rms.sort((a, b) => a - b);
  return rms[Math.min(rms.length - 1, Math.floor(rms.length * 0.9))];
}

/** Auto balance targets (after the master gain): loud parts of the song at this RMS… */
export const AUTO_MUSIC_TARGET = 0.17;
/** …and a don hit (loudest 50ms) at this fraction of it. */
export const AUTO_HIT_RATIO = 0.75;

/** Music volume that brings a song's loud parts to the auto target (null if silent). */
export function autoMusicVolume(buf: AudioBuffer): number | null {
  const r = loudRms(buf);
  return r > 1e-4 ? AUTO_MUSIC_TARGET / (r * MASTER_GAIN) : null;
}

/** Hit volume for the auto target (hit sounds are already at the reference loudness). */
export function autoHitVolume(): number {
  return (AUTO_MUSIC_TARGET * AUTO_HIT_RATIO) / (HIT_REFERENCE_RMS.don * MASTER_GAIN);
}

/** Largest absolute sample of a buffer. */
export function peakLevel(buf: AudioBuffer): number {
  let pk = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i] < 0 ? -d[i] : d[i];
      if (v > pk) pk = v;
    }
  }
  return pk;
}

/** Gain that brings a hit sound to the PeepoDrumKit reference loudness. */
function hitNormalize(buf: AudioBuffer | null, color: 'don' | 'ka'): number {
  if (!buf) return 1;
  const rms = peakWindowRms(buf);
  return rms > 1e-4 ? Math.min(4, Math.max(0.1, HIT_REFERENCE_RMS[color] / rms)) : 1;
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
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  if (music) {
    const src = ctx.createBufferSource();
    src.buffer = music;
    const gain = ctx.createGain();
    gain.gain.value = opts.musicVolume;
    src.connect(gain).connect(master);
    // A negative lead-in means the output starts part-way into the song.
    const at = opts.leadInMs / 1000;
    if (at >= 0) src.start(at);
    else src.start(0, -at);
  }

  const decode = async (buf?: ArrayBuffer) => (buf ? ctx.decodeAudioData(buf.slice(0)).catch(() => null) : null);
  const [don, ka] = await Promise.all([decode(skin.sounds.don), decode(skin.sounds.ka)]);
  const norm = { don: hitNormalize(don, 'don'), ka: hitNormalize(ka, 'ka') };

  if (opts.hitVolume > 0) {
    const hitGain = ctx.createGain();
    hitGain.gain.value = opts.hitVolume;
    hitGain.connect(master);
    // Like OpenTaiko (one CSound per drum, PlayStart rewinds it), a new hit of
    // the same colour cuts the previous one, so dense streams don't stack up
    // and clip. The cut is a few-ms fade to avoid a click. The hits are
    // summed here into one buffer (one node per hit was ~3x slower to render).
    const sr = opts.sampleRate;
    const track = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
    const out = [track.getChannelData(0), track.getChannelData(1)];
    const FADE = Math.max(1, Math.round(sr * 0.004));
    const dan = play.dan;
    const songGain = (t: number) => (dan && opts.danHitVolumes ? (opts.danHitVolumes[danSongAt(dan, t)] ?? 1) : 1);
    const hits = [...play.hits].sort((x, y) => x.time - y.time);
    // Start sample of the next hit of the same colour (where this one is cut).
    const nextStart = new Array<number>(hits.length).fill(Infinity);
    const seen: Record<'don' | 'ka', number> = { don: Infinity, ka: Infinity };
    const startOf = (h: (typeof hits)[number]) => Math.round(((h.time + opts.leadInMs) / 1000) * sr);
    for (let i = hits.length - 1; i >= 0; i--) {
      nextStart[i] = seen[hits[i].color];
      seen[hits[i].color] = startOf(hits[i]);
    }
    hits.forEach((h, i) => {
      const buf = h.color === 'don' ? don : ka;
      if (!buf) return;
      const at = startOf(h);
      if (at < 0 || at >= length) return;
      const g = norm[h.color] * songGain(h.time);
      if (g <= 0) return;
      const cut = nextStart[i];
      const end = Math.min(at + buf.length, cut, length);
      const fadeFrom = cut < at + buf.length ? Math.max(at, cut - FADE) : Infinity;
      for (let ch = 0; ch < 2; ch++) {
        const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
        const dst = out[ch];
        for (let t = at; t < end; t++) {
          const f = t < fadeFrom ? 1 : (cut - t) / FADE;
          dst[t] += src[t - at] * g * f;
        }
      }
    });
    const src = ctx.createBufferSource();
    src.buffer = track;
    src.connect(hitGain);
    src.start(0);
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
    src.connect(master);
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
      src.connect(master);
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
  songs: { wave: string; audioStart: number; chipTime?: number; volume?: number }[],
  bank: Record<string, AudioBuffer>,
  sampleRate: number,
): { buffer: AudioBuffer | null; missing: string[] } {
  const found = songs.map((s) => bank[s.wave.toLowerCase()] ?? null);
  const missing = songs.filter((_, i) => !found[i]).map((s) => s.wave);
  if (found.every((b) => !b)) return { buffer: null, missing };
  const ms = (t: number) => Math.round((t / 1000) * sampleRate);
  // A song still playing when the next one's curtain starts fades out over 1s
  // (matters for full-length audio used in a self-built dan).
  const FADE = ms(1000);
  const spans = songs.map((s, i) => {
    const b = found[i];
    if (!b) return null;
    const at = ms(s.audioStart);
    const next = songs[i + 1]?.chipTime;
    const fadeAt = next !== undefined ? ms(next) : Infinity;
    const end = Math.min(at + b.length, fadeAt + FADE);
    return { b, at, end, fadeAt, vol: s.volume ?? 1 };
  });
  let length = 1;
  for (const sp of spans) if (sp) length = Math.max(length, sp.end);
  const out = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  for (const sp of spans) {
    if (!sp) continue;
    for (let ch = 0; ch < 2; ch++) {
      const src = sp.b.getChannelData(Math.min(ch, sp.b.numberOfChannels - 1));
      const dst = out.getChannelData(ch);
      const n = Math.min(sp.end, length) - sp.at;
      if (sp.vol <= 0) continue;
      if (sp.vol === 1 && sp.end - sp.at === src.length && sp.fadeAt >= sp.end) {
        dst.set(src.subarray(0, n), sp.at);
        continue;
      }
      for (let j = 0; j < n; j++) {
        const t = sp.at + j;
        const g = t < sp.fadeAt ? 1 : Math.max(0, 1 - (t - sp.fadeAt) / FADE);
        dst[t] += src[j] * g * sp.vol;
      }
    }
  }
  return { buffer: out, missing };
}
