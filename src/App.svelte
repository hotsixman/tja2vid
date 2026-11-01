<script lang="ts">
  import { onMount } from 'svelte';
  import Preview from './lib/components/Preview.svelte';
  import { decodeTja, ENCODINGS, type TjaEncoding } from './lib/tja/decode';
  import { buildCourse, parseTja } from './lib/tja/parser';
  import type { Branch, ParsedTja } from './lib/tja/types';
  import { simulate } from './lib/sim/autoplay';
  import { TaikoRenderer } from './lib/render/renderer';
  import { folderResolver, loadSkin, missingImages, zipResolver } from './lib/skin/loader';
  import type { LoadedSkin } from './lib/skin/types';
  import { loadBuiltinSkin } from './lib/skin/builtin';
  import { clearDefaultSkin, loadDefaultSkinZip, saveDefaultSkin } from './lib/skin/storage';
  import { decodeAudio, mixSoundtrack } from './lib/audio/mix';
  import { computeTimeline } from './lib/timeline';
  import { exportVideo, isExportSupported, type FrameRate, type QualityName } from './lib/video/export';

  const SAMPLE_RATE = 48000;
  const RESOLUTIONS = [
    { label: '1920×1080 (FHD)', w: 1920, h: 1080 },
    { label: '1280×720 (HD)', w: 1280, h: 720 },
    { label: '2560×1440 (QHD)', w: 2560, h: 1440 },
    { label: '3840×2160 (4K)', w: 3840, h: 2160 },
  ];

  // ---------------------------------------------------------------- inputs
  let tjaName = $state('');
  let tjaBytes = $state<Uint8Array | null>(null);
  let encoding = $state<TjaEncoding>('auto');
  let audioName = $state('');
  let music = $state<AudioBuffer | null>(null);
  let audioError = $state('');
  let pendingAudio: File[] = [];

  let courseIndex = $state(0);
  let branch = $state<Branch>('master');

  // ---------------------------------------------------------------- options
  let fps = $state<FrameRate>(60);
  let resolutionIndex = $state(0);
  let quality = $state<QualityName>('high');
  let rollSpeed = $state(15);
  let musicVolume = $state(1);
  let hitVolume = $state(0.7);
  let showTitle = $state(true);
  let showDancer = $state(true);
  let titleOverride = $state('');
  let subtitleOverride = $state('');
  let preRollSec = $state(2);
  let endMode = $state<'audio' | 'chart'>('audio');

  // ---------------------------------------------------------------- skin
  let skin = $state<LoadedSkin | null>(null);
  let skinStatus = $state('스킨 불러오는 중…');
  let skinMissing = $state<string[]>([]);

  let rememberSkin = $state(true);
  let usingStoredSkin = $state(false);

  async function useSkin(promise: Promise<LoadedSkin>, label: string): Promise<boolean> {
    skinStatus = `${label} 불러오는 중…`;
    try {
      const s = await promise;
      const total = Object.keys(s.manifest.images).length;
      const missing = missingImages(s);
      if (total > 0 && missing.length === total) {
        skinStatus = `${label}: 스킨 이미지를 찾지 못했습니다. 스킨 폴더/zip이 맞는지 확인하세요.`;
        return false;
      }
      skin = s;
      skinMissing = missing;
      skinStatus = total ? `${s.manifest.name} (${total - missing.length}/${total} 이미지)` : s.manifest.name;
      return true;
    } catch (e) {
      skinStatus = `스킨 로드 실패: ${(e as Error).message}`;
      return false;
    }
  }

  async function zipSkin(data: Blob): Promise<LoadedSkin> {
    return loadSkin(zipResolver(new Uint8Array(await data.arrayBuffer())));
  }

  onMount(async () => {
    // A skin zip the user chose earlier becomes their default; otherwise the built-in skin.
    const stored = await loadDefaultSkinZip();
    if (stored && (await useSkin(zipSkin(stored.data), stored.name))) {
      usingStoredSkin = true;
      return;
    }
    await useSkin(loadBuiltinSkin(), '기본 스킨');
  });

  function onSkinFolder(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length) void useSkin(loadSkin(folderResolver(files)), '사용자 스킨');
  }

  async function onSkinZip(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const ok = await useSkin(zipSkin(file), file.name);
    if (ok && rememberSkin) {
      try {
        await saveDefaultSkin({ name: file.name, data: file });
        usingStoredSkin = true;
      } catch (err) {
        console.warn('could not store skin', err);
      }
    }
  }

  async function resetSkin() {
    await clearDefaultSkin().catch(() => {});
    usingStoredSkin = false;
    await useSkin(loadBuiltinSkin(), '기본 스킨');
  }

  // ---------------------------------------------------------------- derived chart
  const parsed: ParsedTja | null = $derived.by(() => {
    if (!tjaBytes) return null;
    try {
      return parseTja(decodeTja(tjaBytes, encoding));
    } catch (e) {
      console.error(e);
      return null;
    }
  });

  const courseSrc = $derived(parsed?.courses[Math.min(courseIndex, (parsed?.courses.length ?? 1) - 1)] ?? null);
  const course = $derived(parsed && courseSrc ? buildCourse(parsed.meta, courseSrc, branch) : null);
  const play = $derived(course ? simulate(course, { rollSpeed }) : null);
  const timeline = $derived(
    play
      ? computeTimeline(play, music ? music.duration * 1000 : null, {
          preRollMs: preRollSec * 1000,
          tailMs: 3000,
          endMode,
        })
      : { leadInMs: 0, durationMs: 1000 },
  );
  const renderer = $derived(
    skin && play && parsed
      ? new TaikoRenderer(skin, play, {
          showTitle,
        showDancer,
          title: titleOverride || parsed.meta.title,
          subtitle: subtitleOverride || parsed.meta.subtitle,
        })
      : null,
  );

  // Pick Oni by default when a new file is loaded.
  $effect(() => {
    if (!parsed) return;
    const oni = parsed.courses.findIndex((c) => c.course === 'Oni' && !c.label.includes('P2'));
    courseIndex = oni >= 0 ? oni : 0;
  });

  // ---------------------------------------------------------------- soundtrack
  let soundtrack = $state<AudioBuffer | null>(null);
  let mixing = $state(false);
  let mixVersion = 0;

  $effect(() => {
    const p = play;
    const s = skin;
    const m = music;
    const t = timeline;
    const mv = musicVolume;
    const hv = hitVolume;
    if (!p || !s) {
      soundtrack = null;
      return;
    }
    const version = ++mixVersion;
    mixing = true;
    const timer = setTimeout(async () => {
      try {
        const buf = await mixSoundtrack(m, s, p, {
          sampleRate: SAMPLE_RATE,
          musicVolume: mv,
          hitVolume: hv,
          leadInMs: t.leadInMs,
          durationMs: t.durationMs,
        });
        if (version === mixVersion) soundtrack = buf;
      } catch (e) {
        console.error(e);
      } finally {
        if (version === mixVersion) mixing = false;
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  // ---------------------------------------------------------------- files
  const isTja = (f: File) => /\.tja$/i.test(f.name);
  const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(ogg|mp3|wav|m4a|aac|flac|opus|webm)$/i.test(f.name);

  async function loadTja(f: File) {
    tjaName = f.name;
    tjaBytes = new Uint8Array(await f.arrayBuffer());
    titleOverride = '';
    subtitleOverride = '';
    // If audio files were dropped together, pick the one named by WAVE:.
    if (pendingAudio.length) {
      const wave = parsed?.meta.wave.toLowerCase();
      const match = pendingAudio.find((a) => a.name.toLowerCase() === wave) ?? pendingAudio[0];
      await loadAudio(match);
    }
  }

  async function loadAudio(f: File) {
    audioName = f.name;
    audioError = '';
    try {
      music = await decodeAudio(await f.arrayBuffer(), SAMPLE_RATE);
    } catch (e) {
      music = null;
      audioError = `오디오 디코딩 실패: ${(e as Error).message}`;
    }
  }

  async function handleFiles(list: FileList | File[] | null) {
    if (!list) return;
    const files = Array.from(list);
    const tja = files.find(isTja);
    pendingAudio = files.filter(isAudio);
    if (tja) await loadTja(tja);
    else if (pendingAudio.length) await loadAudio(pendingAudio[0]);
    pendingAudio = [];
  }

  let dragging = $state(false);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    void handleFiles(e.dataTransfer?.files ?? null);
  }

  // ---------------------------------------------------------------- export
  let exporting = $state(false);
  let progress = $state(0);
  let exportStatus = $state('');
  let downloadUrl = $state('');
  let downloadName = $state('');
  let abort: AbortController | null = null;
  const exportSupported = isExportSupported();

  async function startExport() {
    if (!skin || !play || !parsed) return;
    const res = RESOLUTIONS[resolutionIndex];
    exporting = true;
    progress = 0;
    exportStatus = '오디오 믹싱 중…';
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = '';
    abort = new AbortController();
    const started = performance.now();
    try {
      const track = await mixSoundtrack(music, skin, play, {
        sampleRate: SAMPLE_RATE,
        musicVolume,
        hitVolume,
        leadInMs: timeline.leadInMs,
        durationMs: timeline.durationMs,
      });
      const r = new TaikoRenderer(skin, play, {
        showTitle,
        showDancer,
        title: titleOverride || parsed.meta.title,
        subtitle: subtitleOverride || parsed.meta.subtitle,
      });
      exportStatus = '렌더링 / 인코딩 중…';
      const result = await exportVideo(r, {
        fps,
        width: res.w,
        height: res.h,
        quality,
        leadInMs: timeline.leadInMs,
        durationMs: timeline.durationMs,
        soundtrack: track,
        signal: abort.signal,
        onProgress: (done, total) => {
          progress = done / total;
          const elapsed = (performance.now() - started) / 1000;
          const eta = progress > 0 ? elapsed / progress - elapsed : 0;
          exportStatus = `렌더링 / 인코딩 중… ${done}/${total} 프레임 · 남은 시간 약 ${Math.ceil(eta)}초`;
        },
      });
      downloadUrl = URL.createObjectURL(result.blob);
      const base = (titleOverride || parsed.meta.title || tjaName.replace(/\.tja$/i, '') || 'autoplay').replace(
        /[\\/:*?"<>|]/g,
        '_',
      );
      downloadName = `${base} [${course?.label ?? ''}] ${fps}fps${result.fileExtension}`;
      const mb = (result.blob.size / 1024 / 1024).toFixed(1);
      exportStatus = `완료! ${mb} MB · ${result.videoCodec}${result.audioCodec ? ' / ' + result.audioCodec : ''} · ${((performance.now() - started) / 1000).toFixed(1)}초`;
    } catch (e) {
      exportStatus = (e as Error).name === 'AbortError' ? '취소되었습니다.' : `오류: ${(e as Error).message}`;
      console.error(e);
    } finally {
      exporting = false;
      abort = null;
    }
  }

  const stats = $derived(
    play
      ? `노트 ${play.totalNotes}개 · 최대 콤보 ${play.maxCombo} · 길이 ${(timeline.durationMs / 1000).toFixed(1)}초`
      : '',
  );
  const waveHint = $derived(parsed?.meta.wave && !music ? `TJA가 지정한 음원: ${parsed.meta.wave}` : '');
</script>

<svelte:window
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false;
  }}
  ondrop={onDrop}
/>

<main class:dragging>
  <header>
    <h1>tja2vid</h1>
    <p>TJA 채보와 음원을 넣으면 태고 스타일 오토플레이 영상을 만들어 줍니다. 모든 처리는 브라우저 안에서 이루어집니다.</p>
  </header>

  <div class="layout">
    <section class="panel">
      <h2>1. 파일</h2>
      <label class="drop">
        <input
          type="file"
          multiple
          accept=".tja,audio/*,.ogg,.mp3,.wav,.m4a,.flac,.opus"
          onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
        />
        <span>TJA + 음원 파일을 선택하거나 이 창에 끌어다 놓으세요</span>
      </label>
      <dl class="files">
        <dt>TJA</dt>
        <dd>{tjaName || '—'}</dd>
        <dt>음원</dt>
        <dd>{audioName || '—'} {#if music}<small>({music.duration.toFixed(1)}초)</small>{/if}</dd>
      </dl>
      {#if waveHint}<p class="hint">{waveHint}</p>{/if}
      {#if audioError}<p class="error">{audioError}</p>{/if}
      <label>
        TJA 인코딩
        <select bind:value={encoding}>
          {#each ENCODINGS as e (e.value)}<option value={e.value}>{e.label}</option>{/each}
        </select>
      </label>

      {#if parsed}
        <h2>2. 채보</h2>
        {#if parsed.courses.length === 0}
          <p class="error">#START ~ #END 구간을 찾지 못했습니다.</p>
        {:else}
          <label>
            난이도
            <select bind:value={courseIndex}>
              {#each parsed.courses as c, i (i)}
                <option value={i}>{c.label} ★{c.level}</option>
              {/each}
            </select>
          </label>
          {#if courseSrc?.hasBranches}
            <label>
              분기
              <select bind:value={branch}>
                <option value="normal">보통 (Normal)</option>
                <option value="expert">현인 (Expert)</option>
                <option value="master">달인 (Master)</option>
              </select>
            </label>
          {/if}
          <label>제목 <input type="text" placeholder={parsed.meta.title} bind:value={titleOverride} /></label>
          <label>부제 <input type="text" placeholder={parsed.meta.subtitle} bind:value={subtitleOverride} /></label>
          <p class="hint">{stats}</p>
        {/if}
      {/if}

      <h2>3. 옵션</h2>
      <div class="grid">
        <label>
          프레임레이트
          <select bind:value={fps}>
            <option value={60}>60 fps</option>
            <option value={120}>120 fps</option>
          </select>
        </label>
        <label>
          해상도
          <select bind:value={resolutionIndex}>
            {#each RESOLUTIONS as r, i (r.label)}<option value={i}>{r.label}</option>{/each}
          </select>
        </label>
        <label>
          화질
          <select bind:value={quality}>
            <option value="medium">보통</option>
            <option value="high">높음</option>
            <option value="veryHigh">매우 높음</option>
          </select>
        </label>
        <label>
          연타 속도 (타/초)
          <input type="number" min="1" max="60" step="1" bind:value={rollSpeed} />
        </label>
        <label>
          음악 볼륨 {Math.round(musicVolume * 100)}%
          <input type="range" min="0" max="1.5" step="0.05" bind:value={musicVolume} />
        </label>
        <label>
          타격음 볼륨 {Math.round(hitVolume * 100)}%
          <input type="range" min="0" max="1.5" step="0.05" bind:value={hitVolume} />
        </label>
        <label>
          시작 전 여유 (초)
          <input type="number" min="0" max="10" step="0.5" bind:value={preRollSec} />
        </label>
        <label>
          영상 끝
          <select bind:value={endMode}>
            <option value="audio">음원 끝까지</option>
            <option value="chart">마지막 노트 + 3초</option>
          </select>
        </label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={showTitle} /> 곡 제목 표시</label>
      <label class="check">
        <input type="checkbox" bind:checked={showDancer} disabled={!skin?.dancer} /> 댄서 표시
        {#if skin && !skin.dancer}<small class="hint">(이 스킨에는 댄서가 없음)</small>{/if}
      </label>

      <h2>4. 스킨</h2>
      <p class="hint">{skinStatus}</p>
      <div class="row">
        <label class="button">
          스킨 zip 불러오기…
          <input type="file" accept=".zip,application/zip" onchange={onSkinZip} hidden />
        </label>
        <label class="button">
          스킨 폴더 불러오기…
          <input type="file" webkitdirectory multiple onchange={onSkinFolder} hidden />
        </label>
        <button onclick={resetSkin}>기본 스킨으로</button>
      </div>
      <label class="check"><input type="checkbox" bind:checked={rememberSkin} /> 불러온 zip을 이 브라우저의 기본 스킨으로 기억</label>
      {#if usingStoredSkin}<p class="hint small">저장된 스킨을 사용 중입니다. "기본 스킨으로"를 누르면 저장이 지워집니다.</p>{/if}
      <p class="hint small">
        <code>skin.json</code>이 있는 스킨, 또는 OpenTaiko / TJAPlayer3 형식 스킨(GameConfig.ini · SkinConfig.ini)을 불러올 수
        있습니다. 스킨 파일은 브라우저 안에서만 쓰이고 업로드되지 않습니다.
      </p>
      {#if skin?.manifest.credits}<p class="hint small">{skin.manifest.credits}</p>{/if}
    </section>

    <section class="panel main">
      <Preview {renderer} {soundtrack} leadInMs={timeline.leadInMs} durationMs={timeline.durationMs} />
      {#if mixing}<p class="hint">오디오 준비 중…</p>{/if}

      <div class="export">
        {#if !exportSupported}
          <p class="error">이 브라우저는 WebCodecs를 지원하지 않습니다. 최신 Chrome / Edge / Safari를 사용하세요.</p>
        {/if}
        <div class="row">
          <button class="primary" onclick={startExport} disabled={!renderer || exporting || !exportSupported}>
            영상 만들기 ({RESOLUTIONS[resolutionIndex].label.split(' ')[0]}, {fps}fps)
          </button>
          {#if exporting}<button onclick={() => abort?.abort()}>취소</button>{/if}
          {#if downloadUrl}<a class="button" href={downloadUrl} download={downloadName}>⬇ 다운로드</a>{/if}
        </div>
        {#if exporting}<progress value={progress} max="1"></progress>{/if}
        {#if exportStatus}<p class="hint">{exportStatus}</p>{/if}
        {#if downloadUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={downloadUrl} controls></video>
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  main {
    max-width: 1600px;
    margin: 0 auto;
    padding: 1.5rem;
  }
  main.dragging {
    outline: 3px dashed var(--accent);
    outline-offset: -8px;
  }
  header h1 {
    margin: 0;
    color: var(--accent);
  }
  header p {
    margin: 0.25rem 0 1rem;
    color: var(--muted);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(300px, 380px) 1fr;
    gap: 1.5rem;
    align-items: start;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .panel {
    background: var(--panel);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .panel.main {
    position: sticky;
    top: 1rem;
  }
  h2 {
    font-size: 1rem;
    margin: 0.75rem 0 0.25rem;
    color: var(--accent);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
  label.check {
    flex-direction: row;
    align-items: center;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .drop {
    border: 2px dashed #555;
    border-radius: 10px;
    padding: 1rem;
    text-align: center;
    cursor: pointer;
  }
  .drop input {
    display: none;
  }
  .files {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.75rem;
    margin: 0;
    font-size: 0.9rem;
  }
  .files dt {
    color: var(--muted);
  }
  .files dd {
    margin: 0;
    word-break: break-all;
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  .small {
    font-size: 0.75rem;
  }
  .error {
    color: #ff7b7b;
    font-size: 0.85rem;
    margin: 0;
  }
  .export {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  progress {
    width: 100%;
  }
  video {
    width: 100%;
    border-radius: 8px;
  }
</style>
