<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { FrameRenderer } from '../render/renderer';

  interface Props {
    renderer: FrameRenderer | null;
    soundtrack: AudioBuffer | null;
    leadInMs: number;
    durationMs: number;
  }
  let { renderer, soundtrack, leadInMs, durationMs }: Props = $props();

  const PREVIEW_W = 1280;
  const PREVIEW_H = 720;

  let canvas: HTMLCanvasElement | undefined = $state();
  let playing = $state(false);
  /** Current video time in ms. */
  let position = $state(0);

  let audioCtx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let startedAt = 0; // audioCtx.currentTime when playback started
  let startedFrom = 0; // video ms when playback started
  let raf = 0;
  let lastPerf = 0;

  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    if (!renderer) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
      return;
    }
    ctx.setTransform(PREVIEW_W / renderer.width, 0, 0, PREVIEW_H / renderer.height, 0, 0);
    renderer.render(ctx, position - leadInMs);
  }

  function tick(now: number) {
    if (!playing) return;
    if (audioCtx && source) {
      position = startedFrom + (audioCtx.currentTime - startedAt) * 1000;
    } else {
      position += now - lastPerf;
    }
    lastPerf = now;
    if (position >= durationMs) {
      position = durationMs;
      stop();
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (!renderer) return;
    if (position >= durationMs) position = 0;
    playing = true;
    startedFrom = position;
    if (soundtrack) {
      audioCtx ??= new AudioContext();
      void audioCtx.resume();
      source = audioCtx.createBufferSource();
      source.buffer = soundtrack;
      source.connect(audioCtx.destination);
      startedAt = audioCtx.currentTime + 0.05;
      source.start(startedAt, position / 1000);
    }
    lastPerf = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    try {
      source?.stop();
    } catch {
      /* already stopped */
    }
    source?.disconnect();
    source = null;
  }

  function toggle() {
    if (playing) stop();
    else play();
  }

  function seek(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    const wasPlaying = playing;
    if (wasPlaying) stop();
    position = v;
    draw();
    if (wasPlaying) play();
  }

  // Redraw whenever inputs change; stop playback if the soundtrack/renderer is replaced.
  $effect(() => {
    void renderer;
    void soundtrack;
    void leadInMs;
    void durationMs;
    untrack(() => {
      if (playing) stop();
      if (position > durationMs) position = 0;
      draw();
    });
  });

  onDestroy(() => {
    stop();
    void audioCtx?.close();
  });

  const fmt = (ms: number) => {
    const s = Math.max(0, ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  };
</script>

<div class="preview">
  <canvas bind:this={canvas} width={PREVIEW_W} height={PREVIEW_H}></canvas>
  <div class="controls">
    <button onclick={toggle} disabled={!renderer}>{playing ? '❚❚ 일시정지' : '▶ 재생'}</button>
    <input type="range" min="0" max={durationMs} step="1" value={position} oninput={seek} disabled={!renderer} />
    <span class="time">{fmt(position)} / {fmt(durationMs)}</span>
  </div>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  canvas {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #111;
    border-radius: 8px;
    display: block;
  }
  .controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .controls input[type='range'] {
    flex: 1;
  }
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 9em;
    text-align: right;
  }
</style>
