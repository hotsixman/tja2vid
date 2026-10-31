import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type Quality,
} from 'mediabunny';
import type { FrameRenderer } from '../render/renderer';

export type FrameRate = 60 | 120;
export type QualityName = 'medium' | 'high' | 'veryHigh';

export interface ExportOptions {
  fps: FrameRate;
  width: number;
  height: number;
  quality: QualityName;
  /** Video-time (ms) at which song time 0 happens. */
  leadInMs: number;
  durationMs: number;
  soundtrack: AudioBuffer | null;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface ExportResult {
  blob: Blob;
  fileExtension: string;
  videoCodec: string;
  audioCodec: string | null;
}

const QUALITIES: Record<QualityName, Quality> = {
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
  veryHigh: QUALITY_VERY_HIGH,
};

export function isExportSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * Renders every frame offline (faster or slower than real time, depending on the
 * machine) and encodes it with WebCodecs. Output is MP4 (H.264/AAC) when the
 * browser can encode it, otherwise WebM (VP9/Opus).
 */
export async function exportVideo(renderer: FrameRenderer, opts: ExportOptions): Promise<ExportResult> {
  const { fps, width, height } = opts;
  const quality = QUALITIES[opts.quality];

  let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat({ fastStart: 'in-memory' });
  let videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width, height, quality, frameRate: fps });
  let audioCodec = opts.soundtrack
    ? await getFirstEncodableAudioCodec(['aac', 'opus'], {
        numberOfChannels: opts.soundtrack.numberOfChannels,
        sampleRate: opts.soundtrack.sampleRate,
        quality,
      })
    : null;
  if (!videoCodec) {
    format = new WebMOutputFormat();
    videoCodec = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width, height, quality, frameRate: fps });
    if (opts.soundtrack) audioCodec = await getFirstEncodableAudioCodec(['opus', 'vorbis'], { quality });
  }
  if (!videoCodec) throw new Error('이 브라우저에서는 영상 인코딩(WebCodecs)을 지원하지 않습니다.');

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

  const output = new Output({ format, target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });

  let audio: AudioBufferSource | null = null;
  if (opts.soundtrack && audioCodec) {
    audio = new AudioBufferSource({ codec: audioCodec, quality });
    output.addAudioTrack(audio);
  }

  await output.start();

  const abort = async () => {
    await output.cancel();
    throw new DOMException('Export cancelled', 'AbortError');
  };

  try {
    if (audio && opts.soundtrack) {
      await audio.add(opts.soundtrack);
      audio.close();
    }

    const sx = width / renderer.width;
    const sy = height / renderer.height;
    const total = Math.ceil((opts.durationMs / 1000) * fps);
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) await abort();
      const songTime = (i * 1000) / fps - opts.leadInMs;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      renderer.render(ctx, songTime);
      await video.add(i / fps, 1 / fps);
      if (i % 10 === 0 || i === total - 1) {
        opts.onProgress?.(i + 1, total);
        // Yield so the UI can update.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    video.close();
    await output.finalize();
  } catch (e) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    throw e;
  }

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('No output produced');
  return {
    blob: new Blob([buffer], { type: format.mimeType }),
    fileExtension: format.fileExtension,
    videoCodec,
    audioCodec,
  };
}
