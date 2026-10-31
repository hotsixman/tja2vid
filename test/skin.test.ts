import { describe, expect, it } from 'vitest';
import { parseDancerConfig } from '../src/lib/skin/opentaiko';

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
