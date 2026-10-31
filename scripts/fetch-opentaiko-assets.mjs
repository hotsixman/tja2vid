#!/usr/bin/env node
// Downloads the subset of the OpenTaiko default skin ("Open-World Memories") that
// tja2vid uses into public/skins/opentaiko/.
//
// The assets are NOT committed to this repository: they are covered by the
// OpenTaiko Extended License (see the downloaded LICENSE.md), which forbids
// redistribution outside of a direct fork of the official OpenTaiko repository.
// Videos made with them are allowed when related to OpenTaiko.
//
// Usage: npm run fetch-assets [-- --ref <git-ref>] [-- --force]
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const refIdx = args.indexOf('--ref');
const REF = refIdx >= 0 ? args[refIdx + 1] : 'main';
const FORCE = args.includes('--force');

const REPO = '0auBSQ/OpenTaiko';
const SKIN_ROOT = 'OpenTaiko/System/Open-World Memories';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'skins', 'opentaiko');

const G = 'Graphics/5_Game';
const BG = `${G}/5_Background/Normal`;
const FILES = [
  'LICENSE.md',
  'README.txt',
  'GameConfig.ini',
  'Fonts/MPLUSRounded1c-Medium.ttf',
  'Sounds/Taiko/dong.ogg',
  'Sounds/Taiko/ka.ogg',
  `${G}/Notes.png`,
  `${G}/SENotes.png`,
  `${G}/Judge.png`,
  `${G}/Bar.png`,
  `${G}/Bar_Branch.png`,
  `${G}/ChipEffect.png`,
  `${G}/Mine.png`,
  `${G}/12_Lane/Background_Main.png`,
  `${G}/12_Lane/Background_Sub.png`,
  `${G}/12_Lane/Background_GoGo.png`,
  `${G}/12_Lane/Base_Normal.png`,
  `${G}/12_Lane/Base_Expert.png`,
  `${G}/12_Lane/Base_Master.png`,
  `${G}/12_Lane/Text_Normal.png`,
  `${G}/12_Lane/Text_Expert.png`,
  `${G}/12_Lane/Text_Master.png`,
  `${G}/12_Lane/Red.png`,
  `${G}/12_Lane/Blue.png`,
  `${G}/12_Lane/Yellow.png`,
  `${G}/6_Taiko/1P_Background.png`,
  `${G}/6_Taiko/1P_Frame.png`,
  `${G}/6_Taiko/Base.png`,
  `${G}/6_Taiko/Don.png`,
  `${G}/6_Taiko/Ka.png`,
  `${G}/6_Taiko/Combo.png`,
  `${G}/6_Taiko/Combo_Big.png`,
  `${G}/6_Taiko/Combo_Midium.png`,
  `${G}/6_Taiko/Combo_Huge.png`,
  `${G}/6_Taiko/Combo_Text.png`,
  `${G}/6_Taiko/Score.png`,
  `${G}/4_CourseSymbol/Easy.png`,
  `${G}/4_CourseSymbol/Normal.png`,
  `${G}/4_CourseSymbol/Hard.png`,
  `${G}/4_CourseSymbol/Oni.png`,
  `${G}/4_CourseSymbol/Edit.png`,
  `${G}/7_Gauge/1P_Base.png`,
  `${G}/7_Gauge/1P.png`,
  `${G}/7_Gauge/Clear.png`,
  `${G}/7_Gauge/Soul.png`,
  `${G}/7_Gauge/Fire.png`,
  `${G}/7_Gauge/1P_Explosion.png`,
  `${G}/10_Effects/Hit/Explosion.png`,
  `${G}/10_Effects/Fire.png`,
  `${G}/11_Balloon/Balloon.png`,
  `${G}/11_Balloon/Breaking_0.png`,
  `${G}/11_Balloon/Breaking_1.png`,
  `${G}/11_Balloon/Breaking_2.png`,
  `${G}/11_Balloon/Breaking_3.png`,
  `${G}/11_Balloon/Breaking_4.png`,
  `${G}/11_Balloon/Breaking_5.png`,
  `${G}/11_Balloon/Number_Roll.png`,
  `${G}/11_Balloon/Roll.png`,
  `${BG}/Up/0/BG_Red.png`,
  `${BG}/Up/0/BG_Clear.png`,
  `${BG}/Up/0/Dot_Red.png`,
  `${BG}/Up/0/Dot_Clear.png`,
  `${BG}/Up/0/Dango_Red.png`,
  `${BG}/Up/0/Dango_Clear.png`,
  `${BG}/Down/0/Down.png`,
  `${BG}/Down/0/Down_Clear.png`,
  `${BG}/Down/0/Down_Scroll.png`,
  `${G}/8_Footer/0.png`,
  `${G}/2_Dancer/Dashy/DancerConfig.txt`,
  ...Array.from({ length: 42 }, (_, i) => `${G}/2_Dancer/Dashy/1/${i}.png`),
];

const exists = (p) => access(p).then(() => true, () => false);
const url = (f) =>
  `https://raw.githubusercontent.com/${REPO}/${REF}/${[...SKIN_ROOT.split('/'), ...f.split('/')].map(encodeURIComponent).join('/')}`;

async function fetchWithRetry(u, tries = 4) {
  let delay = 2000;
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

let done = 0, skipped = 0, failed = 0;
const queue = [...FILES];
async function worker() {
  while (queue.length) {
    const f = queue.shift();
    const dest = join(OUT, f);
    if (!FORCE && (await exists(dest))) { skipped++; continue; }
    try {
      const data = await fetchWithRetry(url(f));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, data);
      done++;
      process.stdout.write(`\r  downloaded ${done}/${FILES.length - skipped}`);
    } catch (e) {
      failed++;
      console.error(`\n  ! ${f}: ${e.message}`);
    }
  }
}

console.log(`Fetching OpenTaiko skin assets (${REPO}@${REF}) -> ${OUT}`);
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`\nDone: ${done} downloaded, ${skipped} already present, ${failed} failed.`);
console.log('These assets are covered by the OpenTaiko Extended License (public/skins/opentaiko/LICENSE.md).');
if (failed) process.exit(1);
