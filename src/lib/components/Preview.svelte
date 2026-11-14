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
  /** Game clock: the preview advances in fixed 120 ticks per second. */
  const TPS = 120;
  const TICK_MS = 1000 / TPS;
  /** Preview frame-rate cap (0 = unlimited, every display refresh). */
  let fpsCap = $state<60 | 120 | 0>(60);

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
  let lastDraw = -Infinity;
  let lastTick = -1;

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
    // Snap to the 120 TPS game tick.
    const tickPos = Math.floor(position / TICK_MS + 1e-6) * TICK_MS;
    renderer.render(ctx, tickPos - leadInMs);
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
      draw();
      return;
    }
    // Frame cap (small tolerance so a 60/120 Hz display isn't skipped by jitter).
    const minGap = fpsCap ? 1000 / fpsCap : 0;
    const t = Math.floor(position / TICK_MS + 1e-6);
    if (now - lastDraw >= minGap - 1.5 && t !== lastTick) {
      lastDraw = now;
      lastTick = t;
      draw();
    }
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
    lastDraw = -Infinity;
    lastTick = -1;
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
    <label class="fps" title="미리보기 게임 틱은 120 TPS 고정">
      <select bind:value={fpsCap}>
        <option value={60}>60 FPS</option>
        <option value={120}>120 FPS</option>
        <option value={0}>제한 없음</option>
      </select>
    </label>
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
    flex-wrap: wrap;
  }
  .controls input[type='range'] {
    flex: 1;
    min-width: 8rem;
  }
  .fps select {
    width: auto;
  }
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 9em;
    text-align: right;
  }
</style>
