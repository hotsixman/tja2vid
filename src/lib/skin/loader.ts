import { OPENTAIKO_MANIFEST, applyOpenTaikoIni, parseIni } from './opentaiko';
import type { ImageKey, LoadedSkin, SkinFileResolver, SkinManifest, SoundKey } from './types';

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

  return { manifest, images, sounds, fontFamily };
}

/** Lists manifest images that could not be loaded — handy for the UI. */
export function missingImages(skin: LoadedSkin): ImageKey[] {
  return (Object.keys(skin.manifest.images) as ImageKey[]).filter((k) => !skin.images[k]);
}
