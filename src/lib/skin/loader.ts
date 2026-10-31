import { OPENTAIKO_MANIFEST, applyOpenTaikoIni, parseDancerConfig, parseIni } from './opentaiko';
import type {
  DancerManifest,
  ImageKey,
  ImageSource,
  LoadedDancer,
  LoadedSkin,
  SkinFileResolver,
  SkinManifest,
  SoundKey,
} from './types';

/** Resolves files relative to a base URL (e.g. `/skins/opentaiko/`). */
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

/**
 * Resolves files from a user-selected folder (`<input webkitdirectory>`).
 * The selected folder itself is the skin root; matching is case-insensitive.
 */
export function folderResolver(files: FileList | File[]): SkinFileResolver {
  const map = new Map<string, File>();
  for (const f of Array.from(files)) {
    const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const inner = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;
    map.set(inner.toLowerCase(), f);
  }
  return async (path) => map.get(path.toLowerCase()) ?? null;
}

/** Partial manifest that a custom skin may ship as `skin.json` in its root. */
export type SkinJson = Partial<Omit<SkinManifest, 'layout'>> & { layout?: Partial<SkinManifest['layout']> };

let fontCounter = 0;

/**
 * Loads a skin. Resolution order for the manifest:
 * 1. `skin.json` in the skin root (merged on top of `base`)
 * 2. OpenTaiko-format folder: `GameConfig.ini` / `SkinConfig.ini` applied on top of `base`
 * 3. `base` as-is
 */
export async function loadSkin(
  resolve: SkinFileResolver,
  base: SkinManifest = OPENTAIKO_MANIFEST,
  onProgress?: (loaded: number, total: number) => void,
): Promise<LoadedSkin> {
  let manifest: SkinManifest = structuredClone(base);

  const skinJson = await resolve('skin.json');
  if (skinJson) {
    const j = JSON.parse(await skinJson.text()) as SkinJson;
    manifest = {
      ...manifest,
      ...j,
      id: j.id ?? `${manifest.id}-custom`,
      images: { ...manifest.images, ...j.images },
      sounds: { ...manifest.sounds, ...j.sounds },
      layout: { ...manifest.layout, ...j.layout },
    } as SkinManifest;
  } else {
    const gameIni = await resolve('GameConfig.ini');
    if (gameIni) {
      const skinIni = await resolve('SkinConfig.ini');
      const { layout, resolution } = applyOpenTaikoIni(
        manifest.layout,
        parseIni(await gameIni.text()),
        skinIni ? parseIni(await skinIni.text()) : {},
      );
      manifest.layout = layout;
      if (resolution) manifest.resolution = resolution;
    }
  }

  const imageEntries = Object.entries(manifest.images) as [ImageKey, string][];
  const soundEntries = Object.entries(manifest.sounds) as [SoundKey, string][];
  const total = imageEntries.length + soundEntries.length + (manifest.font ? 1 : 0);
  let loaded = 0;
  const tick = () => onProgress?.(++loaded, total);

  const images: LoadedSkin['images'] = {};
  const sounds: LoadedSkin['sounds'] = {};
  let fontFamily = 'system-ui, sans-serif';

  await Promise.all([
    ...imageEntries.map(async ([key, path]) => {
      const blob = await resolve(path);
      if (blob) {
        try {
          images[key] = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
        } catch {
          console.warn(`[skin] failed to decode ${path}`);
        }
      }
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

  return { manifest, images, sounds, fontFamily, dancer };
}

async function decodeImage(resolve: SkinFileResolver, path: string): Promise<ImageSource | null> {
  const blob = await resolve(path);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
  } catch {
    return null;
  }
}

/** Loads frames `<dir>/<n>/<i>.png`, probing in parallel chunks when the count is unknown. */
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
  const frames = await Promise.all(
    Array.from({ length: config.count }, (_, i) => loadFrames(resolve, `${m.dir}/${i + 1}`, m.frameCount)),
  );
  if (!frames.some((f) => f.length)) return undefined;
  return { config, frames };
}

/** Lists manifest images that could not be loaded — handy for the UI. */
export function missingImages(skin: LoadedSkin): ImageKey[] {
  return (Object.keys(skin.manifest.images) as ImageKey[]).filter((k) => !skin.images[k]);
}
