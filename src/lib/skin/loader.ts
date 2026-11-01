import { unzipSync } from 'fflate';
import { decodeTja } from '../tja/decode';
import {
  OPENTAIKO_720_LAYOUT,
  OPENTAIKO_LAYOUT,
  OPENTAIKO_MANIFEST,
  applyOpenTaikoIni,
  parseDancerConfig,
  parseIni,
} from './opentaiko';
import { CHARA_STATES } from './types';
import type {
  BackgroundSpec,
  CharacterManifest,
  CharaState,
  LoadedCharacter,
  DancerManifest,
  ImageKey,
  ImageSource,
  LoadedDancer,
  LoadedSkin,
  SkinFileResolver,
  SkinLayout,
  SkinManifest,
  SoundKey,
} from './types';

const G = 'Graphics/5_Game';

// ------------------------------------------------------------------ resolvers

/** Resolves files relative to a base URL (e.g. `/skins/foo/`). */
export function urlResolver(base: string): SkinFileResolver {
  const root = base.endsWith('/') ? base : base + '/';
  return async (path) => {
    try {
      const res = await fetch(root + path.split('/').map(encodeURIComponent).join('/'));
      if (!res.ok) return null;
      // Dev servers answer unknown paths with index.html; don't treat that as an asset.
      if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };
}

function mapResolver(entries: Map<string, () => Promise<Blob | null> | Blob | null>): SkinFileResolver {
  const r: SkinFileResolver = async (path) => {
    const get = entries.get(path.toLowerCase());
    return get ? await get() : null;
  };
  r.list = () => [...entries.keys()];
  return r;
}

/** Finds the skin root inside a list of paths (the folder holding skin.json / *Config.ini / Graphics). */
function findRoot(paths: string[]): string {
  const markers = [/(^|\/)skin\.json$/i, /(^|\/)gameconfig\.ini$/i, /(^|\/)skinconfig\.ini$/i, /(^|\/)graphics\/5_game\//i];
  for (const m of markers) {
    const hits = paths
      .map((p) => {
        const match = m.exec(p);
        return match ? p.slice(0, match.index + (match[1] ? 1 : 0)) : null;
      })
      .filter((x): x is string => x !== null)
      .sort((a, b) => a.length - b.length);
    if (hits.length) return hits[0];
  }
  return '';
}

/**
 * Resolves files from a user-selected folder (`<input webkitdirectory>`).
 * The skin root is detected, so selecting a parent folder also works.
 */
export function folderResolver(files: FileList | File[]): SkinFileResolver {
  const all = Array.from(files).map((f) => ({ f, path: (f.webkitRelativePath || f.name).replace(/\\/g, '/') }));
  const root = findRoot(all.map((x) => x.path));
  const map = new Map<string, () => Blob>();
  for (const { f, path } of all) {
    if (!path.startsWith(root)) continue;
    map.set(path.slice(root.length).toLowerCase(), () => f);
  }
  return mapResolver(map);
}

/** Resolves files from a .zip (the skin root inside the archive is detected). */
export function zipResolver(data: Uint8Array): SkinFileResolver {
  const names: string[] = [];
  unzipSync(data, {
    filter: (f) => {
      names.push(f.name);
      return false;
    },
  });
  const root = findRoot(names.map((n) => n.replace(/\\/g, '/')));
  const map = new Map<string, () => Blob | null>();
  for (const name of names) {
    const path = name.replace(/\\/g, '/');
    if (!path.startsWith(root) || path.endsWith('/')) continue;
    map.set(path.slice(root.length).toLowerCase(), () => {
      const out = unzipSync(data, { filter: (f) => f.name === name });
      const bytes = out[name];
      return bytes ? new Blob([bytes as BlobPart]) : null;
    });
  }
  return mapResolver(map);
}

// ------------------------------------------------------------------ helpers

/** Partial manifest that a custom skin may ship as `skin.json` in its root. */
export type SkinJson = Partial<Omit<SkinManifest, 'layout'>> & { layout?: Partial<SkinManifest['layout']> };

const COUNT_KEYS = new Set<keyof SkinLayout>([
  'gaugeCells',
  'soulFireFrames',
  'hitExplosionFrames',
  'gogoFireFrames',
  'rollFrameFrames',
  'judgeRows',
  'rollNumberScale',
  'balloonNumberScale',
  'balloonDigitInterval',
  'loadingTitleOutline',
  'loadingTitleLetterSpacing',
]);

/** Default layout for a resolution: OpenTaiko's 1080p values, or its 720p defaults scaled. */
export function defaultLayoutFor([w]: [number, number]): SkinLayout {
  if (w === 1920) return structuredClone(OPENTAIKO_LAYOUT);
  const k = w / 1280;
  const out = structuredClone(OPENTAIKO_720_LAYOUT) as unknown as Record<string, unknown>;
  if (k !== 1) {
    for (const [key, v] of Object.entries(out)) {
      if (COUNT_KEYS.has(key as keyof SkinLayout)) continue;
      if (Array.isArray(v)) out[key] = v.map((n: number) => Math.round(n * k));
      else if (typeof v === 'number') out[key] = Math.round(v * k);
      else if (key === 'gogoSplash') {
        const g = v as SkinLayout['gogoSplash'];
        out[key] = {
          ...g,
          frame: [Math.round(g.frame[0] * k), Math.round(g.frame[1] * k), g.frame[2]],
          x: g.x.map((n) => Math.round(n * k)),
          y: g.y.map((n) => Math.round(n * k)),
        };
      }
    }
    // gaugeCells / frame counts stay as-is; notesFlash's 3rd value is a frame count.
    (out.notesFlash as number[])[2] = OPENTAIKO_720_LAYOUT.notesFlash[2];
  }
  return out as unknown as SkinLayout;
}

/** Reads an ini file (Shift_JIS or UTF-8), following `#include file` lines. */
async function readIni(resolve: SkinFileResolver, path: string, depth = 0): Promise<Record<string, string> | null> {
  const blob = await resolve(path);
  if (!blob) return null;
  const text = decodeTja(new Uint8Array(await blob.arrayBuffer()));
  let out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const inc = /^\s*#include\s+(.+?)\s*$/i.exec(raw.replace(/;.*$/, ''));
    if (inc && depth < 4) {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      const sub = (await readIni(resolve, dir + inc[1].replace(/\\/g, '/'), depth + 1)) ?? {};
      out = { ...out, ...sub };
    } else {
      Object.assign(out, parseIni(raw));
    }
  }
  return out;
}

async function exists(resolve: SkinFileResolver, path: string): Promise<boolean> {
  return (await resolve(path)) !== null;
}

/** TJAPlayer3-style background (5_Background/0/1P_Up_1st.png …) expressed as layers. */
function legacyBackground(res: [number, number]): BackgroundSpec {
  const k = res[0] / 1280;
  const B = `${G}/5_Background/0`;
  const up = (name: string, show: 'normal' | 'clear', scrollY: number, scrollX = 0, tileY = true) => ({
    image: `${B}/${show === 'clear' ? 'Clear' : '1P'}_Up_${name}.png`,
    width: res[0],
    height: Math.round(192 * k),
    tileX: true,
    tileY,
    scrollX: scrollX * k,
    scrollY: scrollY * k,
    show,
  });
  return {
    color: '#000',
    layers: [
      up('1st', 'normal', 30),
      up('2nd', 'normal', -30),
      up('1st', 'clear', 30),
      up('2nd', 'clear', -30),
      { ...up('3rd', 'normal', 0, 60, false), height: undefined },
      { ...up('3rd', 'clear', 0, 60, false), height: undefined },
      { image: `${B}/Down.png`, y: Math.round(360 * k) },
      { image: `${B}/Down_Clear.png`, y: Math.round(360 * k), show: 'clear' },
      { image: `${B}/Down_Scroll.png`, y: Math.round(360 * k), tileX: true, width: res[0], scrollX: 120 * k, show: 'clear' },
    ],
  };
}

/** Detects a dancer set in an OpenTaiko / TJAPlayer3 skin folder. */
async function detectDancer(
  resolve: SkinFileResolver,
  ini: Record<string, string>,
): Promise<DancerManifest | undefined> {
  const D = `${G}/2_Dancer`;
  const files = resolve.list?.() ?? [];
  const lower = D.toLowerCase() + '/';
  // OpenTaiko: 2_Dancer/<Set>/DancerConfig.txt
  const set = files.find((f) => f.startsWith(lower) && f.endsWith('/dancerconfig.txt'));
  if (set) {
    const dir = set.slice(0, -'/dancerconfig.txt'.length);
    return { dir: D + dir.slice(D.length) };
  }
  // TJAPlayer3: 2_Dancer/1/0.png, 2_Dancer/2/… with Game_Dancer_* in SkinConfig.txt / skin ini.
  const folders = [
    ...new Set(
      files
        .filter((f) => f.startsWith(lower))
        .map((f) => f.slice(lower.length).split('/'))
        .filter((p) => p.length === 2 && /^\d+$/.test(p[0]))
        .map((p) => p[0]),
    ),
  ].sort((a, b) => +a - +b);
  if (!folders.length && !(await exists(resolve, `${D}/1/0.png`))) return undefined;
  const local = (await readIni(resolve, `${D}/SkinConfig.txt`)) ?? {};
  const merged = { ...ini, ...local };
  const text = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const cfg = parseDancerConfig(text);
  const list = folders.length ? folders : ['1'];
  return {
    dir: D,
    folders: list,
    config: { ...cfg, count: Math.min(list.length, cfg.x.length || list.length) },
  };
}

// ------------------------------------------------------------------ manifest

async function resolveManifest(resolve: SkinFileResolver, base: SkinManifest): Promise<SkinManifest> {
  let manifest: SkinManifest = structuredClone(base);

  const skinJson = await resolve('skin.json');
  if (skinJson) {
    const j = JSON.parse(await skinJson.text()) as SkinJson;
    const resolution = j.resolution ?? manifest.resolution;
    const layoutBase =
      resolution[0] !== manifest.resolution[0] || resolution[1] !== manifest.resolution[1]
        ? defaultLayoutFor(resolution)
        : manifest.layout;
    return {
      ...manifest,
      ...j,
      resolution,
      id: j.id ?? `${manifest.id}-custom`,
      images: { ...manifest.images, ...j.images },
      sounds: { ...manifest.sounds, ...j.sounds },
      layout: { ...layoutBase, ...j.layout },
    } as SkinManifest;
  }

  const gameIni = await readIni(resolve, 'GameConfig.ini');
  const skinIni = await readIni(resolve, 'SkinConfig.ini');
  if (!gameIni && !skinIni) return manifest;
  const loadingIni = (await readIni(resolve, 'SongLoadingConfig.ini')) ?? {};

  // OpenTaiko / TJAPlayer3 format. OpenTaiko's own default resolution is 1280x720.
  manifest = structuredClone(OPENTAIKO_MANIFEST);
  delete manifest.font;
  const ini = { ...(skinIni ?? {}), ...loadingIni, ...(gameIni ?? {}) };
  const res = parseIni(`Resolution=${ini.Resolution ?? '1280,720'}`).Resolution.split(',').map(Number);
  const resolution: [number, number] = res.length >= 2 && res[0] > 0 ? [res[0], res[1]] : [1280, 720];
  const { layout } = applyOpenTaikoIni(defaultLayoutFor(resolution), ini, { Resolution: resolution.join(',') });
  manifest.layout = layout;
  manifest.resolution = resolution;
  manifest.name = skinIni?.Name || manifest.name;
  if (skinIni?.Creator) manifest.credits = `Skin: ${skinIni.Name ?? ''} — ${skinIni.Creator}`;

  if (!(await exists(resolve, manifest.images.bgUpBase!)) && (await exists(resolve, `${G}/5_Background/0/1P_Up_1st.png`))) {
    manifest.background = legacyBackground(resolution);
  }
  // tja2vid extension: result frames may be pre-interpolated (e.g. 8.25ms for 120fps).
  const efm = parseFloat(ini.Game_End_FrameMs ?? '');
  const elm = parseFloat(ini.Game_End_LoopFrameMs ?? '');
  if (manifest.endAnim) {
    if (efm > 0) manifest.endAnim.frameMs = efm;
    if (elm > 0) manifest.endAnim.loopFrameMs = elm;
  }
  manifest.dancer = await detectDancer(resolve, ini);
  manifest.character = await detectCharacter(resolve, ini, resolution);
  manifest.font = detectFont(resolve);
  if (!gameIni) legacySkins.add(manifest);
  return manifest;
}

/** Manifests resolved from TJAPlayer3-style skins (no GameConfig.ini). */
const legacySkins = new WeakSet<SkinManifest>();

/** A font file shipped with the skin: `Fonts/*.otf|ttf|woff2` or one at the root. */
function detectFont(resolve: SkinFileResolver): string | undefined {
  const files = resolve.list?.() ?? [];
  const isFont = (f: string) => /\.(otf|ttf|woff2?)$/i.test(f);
  return files.find((f) => f.startsWith('fonts/') && isFont(f)) ?? files.find((f) => !f.includes('/') && isFont(f));
}

const norm = (s: string) => s.toLowerCase().replace(/_/g, '');

/** Finds a character: TJAPlayer3 `5_Game/1_Chara/` or OpenTaiko `11_Characters/<n>/`. */
async function detectCharacter(
  resolve: SkinFileResolver,
  ini: Record<string, string>,
  resolution: [number, number],
): Promise<CharacterManifest | undefined> {
  const files = resolve.list?.() ?? [];
  let dir: string | undefined;
  if (files.length) {
    if (files.includes(`${G}/1_Chara/normal/0.png`.toLowerCase())) dir = `${G}/1_Chara`;
    else {
      const hit = files.find((f) => /^graphics\/11_characters\/[^/]+\/normal\/0\.png$/.test(f));
      if (hit) dir = 'Graphics/11_Characters/' + hit.split('/')[2];
    }
  } else if (await exists(resolve, `${G}/1_Chara/Normal/0.png`)) {
    dir = `${G}/1_Chara`;
  }
  if (!dir) return undefined;

  const cfg = { ...ini, ...((await readIni(resolve, `${dir}/CharaConfig.txt`)) ?? {}) };
  const byNorm = new Map(Object.entries(cfg).map(([k, v]) => [norm(k), v]));
  const first = (k: string) => {
    const v = byNorm.get(norm(k));
    const n = v ? parseFloat(v.split(',')[0]) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const list = (k: string) => {
    const v = byNorm.get(norm(k));
    const out = v ? v.split(',').map((s) => parseFloat(s)).filter((n) => Number.isFinite(n)) : [];
    return out.length ? out : undefined;
  };
  const states: CharacterManifest['states'] = {};
  for (const s of CHARA_STATES) {
    states[s] = { motion: list(`Game_Chara_Motion_${s}`), beat: first(`Game_Chara_Beat_${s}`) };
  }
  const res = list('Chara_Resolution');
  return {
    dir,
    x: first('Game_Chara_X') ?? 0,
    y: first('Game_Chara_Y') ?? 0,
    balloonX: first('Game_Chara_Balloon_X'),
    balloonY: first('Game_Chara_Balloon_Y'),
    balloonTimer: first('Game_Chara_Balloon_Timer'),
    balloonFadeOut: first('Game_Chara_Balloon_FadeOut'),
    resolution: res && res.length >= 2 ? [res[0], res[1]] : resolution,
    states,
  };
}

/**
 * Default beats per state, from OpenTaiko. Balloon states are in seconds and
 * independent of BPM (OpenTaiko uses 0.2s; TJAPlayer3 skins give ms per frame).
 */
const CHARA_DEFAULT_BEAT: Record<CharaState, number> = {
  Normal: 1,
  Clear: 2,
  Clear_Max: 2,
  GoGo: 2,
  GoGo_Max: 2,
  '10combo': 1.5,
  '10combo_Max': 1.5,
  GoGoStart: 1.5,
  GoGoStart_Max: 1.5,
  Clearin: 1.5,
  Soulin: 1.5,
  Balloon_Breaking: 0.2,
  Balloon_Broke: 0.2,
  Balloon_Miss: 0.2,
};

async function loadCharacter(
  resolve: SkinFileResolver,
  m: CharacterManifest,
  skinRes: [number, number],
): Promise<LoadedCharacter | undefined> {
  const states: LoadedCharacter['states'] = {};
  await Promise.all(
    CHARA_STATES.map(async (s) => {
      const frames = await loadFrames(resolve, `${m.dir}/${s}`);
      if (!frames.length) return;
      const cfg = m.states?.[s] ?? {};
      const motion = (cfg.motion ?? frames.map((_, i) => i)).filter((i) => i >= 0 && i < frames.length);
      const mo = motion.length ? motion : [0];
      // TJAPlayer3: balloon animations run at a fixed ms per frame.
      const beat =
        s.startsWith('Balloon_') && m.balloonTimer ? (mo.length * m.balloonTimer) / 1000 : (cfg.beat ?? CHARA_DEFAULT_BEAT[s]);
      states[s] = { frames, motion: mo, beat };
    }),
  );
  if (!states.Normal) return undefined;
  return {
    x: m.x,
    y: m.y,
    balloonX: m.balloonX ?? m.x,
    balloonY: m.balloonY ?? m.y,
    scale: m.resolution ? skinRes[0] / m.resolution[0] : 1,
    balloonFadeOutMs: m.balloonFadeOut ?? 0,
    states,
  };
}

// ------------------------------------------------------------------ loading

let fontCounter = 0;

async function decodeImage(resolve: SkinFileResolver, path: string): Promise<ImageSource | null> {
  const blob = await resolve(path);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
  } catch {
    console.warn(`[skin] failed to decode ${path}`);
    return null;
  }
}

/**
 * Loads a skin. Resolution order for the manifest:
 * 1. `skin.json` in the skin root (merged on top of `base`)
 * 2. OpenTaiko / TJAPlayer3-format folder (`GameConfig.ini` and/or `SkinConfig.ini`)
 * 3. `base` as-is
 */
export async function loadSkin(
  resolve: SkinFileResolver,
  base: SkinManifest = OPENTAIKO_MANIFEST,
  onProgress?: (loaded: number, total: number) => void,
): Promise<LoadedSkin> {
  const manifest = await resolveManifest(resolve, base);

  const imageEntries = Object.entries(manifest.images) as [ImageKey, string][];
  const soundEntries = Object.entries(manifest.sounds) as [SoundKey, string][];
  const layerPaths = [...new Set((manifest.background?.layers ?? []).map((l) => l.image))];
  const total = imageEntries.length + soundEntries.length + layerPaths.length + (manifest.font ? 1 : 0);
  let loaded = 0;
  const tick = () => onProgress?.(++loaded, total);

  const images: LoadedSkin['images'] = {};
  const sounds: LoadedSkin['sounds'] = {};
  const layerImages: LoadedSkin['layerImages'] = {};
  let fontFamily = 'system-ui, sans-serif';

  await Promise.all([
    ...imageEntries.map(async ([key, path]) => {
      const im = await decodeImage(resolve, path);
      if (im) images[key] = im;
      tick();
    }),
    ...layerPaths.map(async (path) => {
      const im = await decodeImage(resolve, path);
      if (im) layerImages[path] = im;
      tick();
    }),
    ...soundEntries.map(async ([key, path]) => {
      // "a|b": first file that exists.
      for (const p of path.split('|')) {
        const blob = await resolve(p);
        if (blob) {
          sounds[key] = await blob.arrayBuffer();
          break;
        }
      }
      tick();
    }),
    (async () => {
      if (!manifest.font) return;
      const blob = await resolve(manifest.font);
      if (blob) {
        const name = `SkinFont${++fontCounter}`;
        try {
          const face = new FontFace(name, await blob.arrayBuffer());
          await face.load();
          document.fonts.add(face);
          fontFamily = `"${name}", system-ui, sans-serif`;
        } catch {
          console.warn('[skin] failed to load font');
        }
      }
      tick();
    })(),
  ]);

  const [dancer, character, hitEffect, gaugeRainbow, endAnim] = await Promise.all([
    manifest.dancer ? loadDancer(resolve, manifest.dancer).catch(() => undefined) : undefined,
    manifest.character
      ? loadCharacter(resolve, manifest.character, manifest.resolution).catch(() => undefined)
      : undefined,
    manifest.hitEffect ? loadHitEffect(resolve, manifest.hitEffect).catch(() => undefined) : undefined,
    manifest.gaugeRainbow
      ? loadFrames(resolve, manifest.gaugeRainbow.dir)
          .then((frames) => (frames.length ? { frames, frameMs: manifest.gaugeRainbow!.frameMs ?? 50 } : undefined))
          .catch(() => undefined)
      : undefined,
    manifest.endAnim ? loadEndAnim(resolve, manifest).catch(() => undefined) : undefined,
  ]);

  // TJAPlayer3 skins split Judge.png into 60px rows (at 720p) instead of 5 equal rows.
  if (legacySkins.has(manifest) && images.judge) {
    const rowH = 60 * (manifest.resolution[1] / 720);
    manifest.layout.judgeRows = Math.max(1, Math.round(images.judge.height / rowH));
  }

  return { manifest, images, sounds, fontFamily, dancer, character, hitEffect, gaugeRainbow, endAnim, layerImages };
}

/** Loads frames `<dir>/<i>.png`, probing in parallel chunks when the count is unknown. */
async function loadFrames(resolve: SkinFileResolver, dir: string, count?: number): Promise<ImageSource[]> {
  if (count !== undefined) {
    const all = await Promise.all(Array.from({ length: count }, (_, i) => decodeImage(resolve, `${dir}/${i}.png`)));
    const firstMissing = all.indexOf(null);
    return (firstMissing < 0 ? all : all.slice(0, firstMissing)) as ImageSource[];
  }
  const frames: ImageSource[] = [];
  const CHUNK = 16;
  for (let start = 0; start < 1000; start += CHUNK) {
    const chunk = await Promise.all(Array.from({ length: CHUNK }, (_, i) => decodeImage(resolve, `${dir}/${start + i}.png`)));
    for (const f of chunk) {
      if (!f) return frames;
      frames.push(f);
    }
  }
  return frames;
}

async function loadDancer(resolve: SkinFileResolver, m: DancerManifest): Promise<LoadedDancer | undefined> {
  const cfgFile = await resolve(`${m.dir}/DancerConfig.txt`);
  const config = cfgFile ? parseDancerConfig(await cfgFile.text(), m.config) : parseDancerConfig('', m.config);
  const folders = m.folders ?? Array.from({ length: config.count }, (_, i) => String(i + 1));
  const count = Math.min(config.count, folders.length);
  const frames = await Promise.all(
    folders.slice(0, count).map((f) => loadFrames(resolve, `${m.dir}/${f}`, m.frameCount)),
  );
  if (!frames.some((f) => f.length)) return undefined;
  return { config: { ...config, count }, frames };
}

/**
 * TJAPlayer3 result animations. FullCombo / DondaFullCombo frames run at 33ms
 * and are drawn at (lane X, scroll field Y − 142) in 720p units.
 */
async function loadEndAnim(resolve: SkinFileResolver, manifest: SkinManifest): Promise<LoadedSkin['endAnim']> {
  const { dir, frameMs = 33, loopFrameMs = 30 } = manifest.endAnim!;
  const L = manifest.layout;
  const u = manifest.resolution[1] / 720;
  const seq = async (raw: ImageSource[]) => {
    if (!raw.length) return undefined;
    const { frames, offsets } = await cropFrames(raw);
    return { frames, offsets, frameMs, x: L.lane[0], y: L.scrollField[1] - 142 * u };
  };
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const loadLoop = async (d: string) => {
    const out: ImageSource[] = [];
    for (let i = 0; i < 1000; i++) {
      const im = await decodeImage(resolve, `${d}/loop_${i}.png`);
      if (!im) break;
      out.push(im);
    }
    return out;
  };
  const [fc, dfc, l, r, text, effect, fcLoop, dfcBg] = await Promise.all([
    loadFrames(resolve, `${dir}/FullCombo`),
    loadFrames(resolve, `${dir}/DondaFullCombo`),
    Promise.all(range(5).map((i) => decodeImage(resolve, `${dir}/Clear/Clear_L_${i}.png`))),
    Promise.all(range(5).map((i) => decodeImage(resolve, `${dir}/Clear/Clear_R_${i}.png`))),
    decodeImage(resolve, `${dir}/Clear/Clear_Text.png`),
    decodeImage(resolve, `${dir}/Clear/Clear_Text_Effect.png`),
    loadLoop(`${dir}/FullCombo`),
    decodeImage(resolve, `${dir}/DondaFullCombo/bg.png`),
  ]);
  // Sequences may end with blank frames (TJAPlayer3 then shows separate loop images,
  // which skins often lack); drop them so the last visible frame stays on screen.
  const out: NonNullable<LoadedSkin['endAnim']> = {
    fullCombo: await seq(trimBlank(fc)),
    dondaFullCombo: await seq(trimBlank(dfc)),
  };
  // TJAPlayer3: the loop is drawn at scroll field Y + 4 once the sequence has ended.
  if (fcLoop.length) out.fullComboLoop = { frames: fcLoop, frameMs: loopFrameMs, x: L.lane[0], y: L.scrollField[1] + 4 * u };
  // TJAPlayer3: bg.png at the lane from the 34th frame (33ms each) of the original sequence.
  if (dfcBg) out.dondaBackground = { image: dfcBg, x: L.lane[0], y: L.scrollField[1], fromMs: 34 * 33 };
  if (text && l.every(Boolean) && r.every(Boolean)) {
    out.clearParts = { l: l as ImageSource[], r: r as ImageSource[], text, effect: effect ?? undefined };
  }
  return out.fullCombo || out.dondaFullCombo || out.clearParts ? out : undefined;
}

/** Crops frames to their visible (alpha) area to save memory; returns the crops and their offsets. */
async function cropFrames(frames: ImageSource[]): Promise<{ frames: ImageSource[]; offsets: [number, number][] }> {
  const out: ImageSource[] = [];
  const offsets: [number, number][] = [];
  for (const im of frames) {
    const c = new OffscreenCanvas(im.width, im.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      out.push(im);
      offsets.push([0, 0]);
      continue;
    }
    ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, im.width, im.height).data;
    let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
    for (let y = 0; y < im.height; y++) {
      const row = y * im.width * 4;
      for (let x = 0; x < im.width; x++) {
        if (d[row + x * 4 + 3] > 2) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    if (x1 < 0) {
      // Fully transparent: keep a 1px placeholder.
      out.push(await createImageBitmap(c, 0, 0, 1, 1));
      offsets.push([0, 0]);
    } else if (x0 === 0 && y0 === 0 && x1 === im.width - 1 && y1 === im.height - 1) {
      out.push(im);
      offsets.push([0, 0]);
      continue;
    } else {
      out.push(await createImageBitmap(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1));
      offsets.push([x0, y0]);
    }
    if ('close' in im) (im as ImageBitmap).close();
  }
  return { frames: out, offsets };
}

function isBlank(im: ImageSource): boolean {
  const c = new OffscreenCanvas(Math.max(1, im.width >> 2), Math.max(1, im.height >> 2));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(im, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false;
  return true;
}

function trimBlank(frames: ImageSource[]): ImageSource[] {
  let n = frames.length;
  while (n > 0 && isBlank(frames[n - 1])) n--;
  return frames.slice(0, n);
}

async function loadHitEffect(
  resolve: SkinFileResolver,
  m: NonNullable<SkinManifest['hitEffect']>,
): Promise<LoadedSkin['hitEffect']> {
  const [great, greatBig] = await Promise.all([loadFrames(resolve, `${m.dir}/Great`), loadFrames(resolve, `${m.dir}/Great_Big`)]);
  if (!great.length && !greatBig.length) return undefined;
  return { great, greatBig: greatBig.length ? greatBig : great, frameMs: m.frameMs ?? 20 };
}

/** Lists manifest images that could not be loaded — handy for the UI. */
export function missingImages(skin: LoadedSkin): ImageKey[] {
  return (Object.keys(skin.manifest.images) as ImageKey[]).filter((k) => !skin.images[k]);
}
