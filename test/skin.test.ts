import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseDancerConfig } from '../src/lib/skin/opentaiko';
import { defaultLayoutFor, zipResolver } from '../src/lib/skin/loader';

describe('parseDancerConfig', () => {
  it('reads OpenTaiko DancerConfig.txt', () => {
    const c = parseDancerConfig(
      'Game_Dancer_Count=2\n\nGame_Dancer_X=100,300\nGame_Dancer_Y=700,710\nGame_Dancer_Motion=0,1,2,1\nGame_Dancer_Beat=8\nGame_Dancer_Gauge=0,40',
    );
    expect(c).toEqual({ count: 2, x: [100, 300], y: [700, 710], motion: [0, 1, 2, 1], beat: 8, gauge: [0, 40] });
  });
  it('falls back to the manifest values', () => {
    const c = parseDancerConfig('', { count: 1, x: [968], y: [770], beat: 80, gauge: [0] });
    expect(c.x).toEqual([968]);
    expect(c.beat).toBe(80);
    expect(c.motion).toEqual([0]);
  });
});


describe('zipResolver', () => {
  it('finds the skin root inside nested folders, case-insensitively', async () => {
    const zip = zipSync({
      'My Skin/SkinConfig.ini': strToU8('Name=Test'),
      'My Skin/Graphics/5_Game/Notes.png': strToU8('png'),
      'readme.txt': strToU8('x'),
    });
    const r = zipResolver(zip);
    expect(await (await r('skinconfig.ini'))!.text()).toBe('Name=Test');
    expect(await r('Graphics/5_Game/Notes.png')).not.toBeNull();
    expect(await r('readme.txt')).toBeNull();
    expect(r.list!()).toContain('graphics/5_game/notes.png');
  });
});

describe('defaultLayoutFor', () => {
  it('uses 720p defaults and scales them for other resolutions', () => {
    expect(defaultLayoutFor([1280, 720]).scrollField).toEqual([349, 192]);
    expect(defaultLayoutFor([1920, 1080]).scrollField).toEqual([523, 286]);
    const l = defaultLayoutFor([2560, 1440]);
    expect(l.scrollField).toEqual([698, 384]);
    expect(l.gaugeCells).toBe(50);
    expect(l.notesFlash[2]).toBe(16);
  });
});
