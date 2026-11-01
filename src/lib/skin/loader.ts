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
import type {
  BackgroundSpec,
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
]);

/** Default layout for a resolution: OpenTaiko's 1080p values, or its 720p defaults scaled. */
export function defaultLayoutFor([w]: [number, number]): SkinLayout {
  if (w === 1920) return structuredClone(OPENTAIKO_LAYOUT);
  const k = w / 1280;
  const out = structuredClone(OPENTAIKO_720_LAYOUT) as unknown as Record<string, unknown>;
  if (k !== 1) {
    for (const [key, v] of Object.entries(out)) {
      if (COUNT_KEYS.has(key as keyof SkinLayout)) continue;
      out[key] = Array.isArray(v) ? v.map((n: number) => Math.round(n * k)) : Math.round((v as number) * k);
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

  // OpenTaiko / TJAPlayer3 format. OpenTaiko's own default resolution is 1280x720.
  manifest = structuredClone(OPENTAIKO_MANIFEST);
  delete manifest.font;
  const ini = { ...(skinIni ?? {}), ...(gameIni ?? {}) };
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
  manifest.dancer = await detectDancer(resolve, ini);
  return manifest;
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
      const blob = await resolve(path);
      if (blob) sounds[key] = await blob.arrayBuffer();
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

  const dancer = manifest.dancer ? await loadDancer(resolve, manifest.dancer).catch(() => undefined) : undefined;

  return { manifest, images, sounds, fontFamily, dancer, layerImages };
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

/** Lists manifest images that could not be loaded — handy for the UI. */
export function missingImages(skin: LoadedSkin): ImageKey[] {
  return (Object.keys(skin.manifest.images) as ImageKey[]).filter((k) => !skin.images[k]);
}
