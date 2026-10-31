import { describe, expect, it } from 'vitest';
import { buildCourse, parseTja } from '../src/lib/tja/parser';
import { simulate } from '../src/lib/sim/autoplay';
import { decodeTja } from '../src/lib/tja/decode';

const SAMPLE = `TITLE:Test Song
SUBTITLE:--Someone
BPM:120
WAVE:test.ogg
OFFSET:-1.5

COURSE:Oni
LEVEL:8
BALLOON:7,3
SCOREINIT:1000

#START
1020,
3400,
#BPMCHANGE 240
1111,
#GOGOSTART
5000
0008,
#GOGOEND
7008,
#MEASURE 3/4
111,
#DELAY 0.5
1,
#END

COURSE:Easy
LEVEL:2
#START
1,
#END
`;

describe('parseTja', () => {
  const parsed = parseTja(SAMPLE);

  it('reads metadata', () => {
    expect(parsed.meta.title).toBe('Test Song');
    expect(parsed.meta.subtitle).toBe('Someone');
    expect(parsed.meta.offset).toBe(-1.5);
    expect(parsed.meta.wave).toBe('test.ogg');
    expect(parsed.courses.map((c) => c.course)).toEqual(['Oni', 'Easy']);
    expect(parsed.courses[0].level).toBe(8);
  });

  it('times notes correctly', () => {
    const c = buildCourse(parsed.meta, parsed.courses[0]);
    const t = c.notes.map((n) => [n.type, Math.round(n.time)]);
    // 120 BPM, 4/4 => 2000ms per measure, OFFSET -1.5 => +1500ms.
    expect(t.slice(0, 4)).toEqual([
      ['don', 1500],
      ['ka', 2500],
      ['bigDon', 3500],
      ['bigKa', 4000],
    ]);
    // 240 BPM measure: 1000ms, 4 notes 250ms apart starting at 5500.
    expect(t.slice(4, 8).map((x) => x[1])).toEqual([5500, 5750, 6000, 6250]);
    const roll = c.notes[8];
    expect(roll.type).toBe('roll');
    // "5000" + "0008," is one 8-note measure at 240 BPM: 125ms per note.
    expect(roll.time).toBe(6500);
    expect(roll.endTime).toBe(7375);
    const balloon = c.notes[9];
    expect(balloon.type).toBe('balloon');
    expect(balloon.balloonCount).toBe(7);
    expect(balloon.time).toBe(7500);
    expect(balloon.endTime).toBe(8250);
    // 3/4 measure at 240 BPM = 750ms, 3 notes 250ms apart.
    expect(c.notes.slice(10, 13).map((n) => n.time)).toEqual([8500, 8750, 9000]);
    // #DELAY 0.5 after the 3/4 measure.
    expect(c.notes[13].time).toBe(9750);
    expect(c.gogo).toEqual([{ start: 6500, end: 7500 }]);
    expect(c.bars.length).toBe(7);
    expect(c.scoreInit).toBe(1000);
  });

  it('simulates autoplay', () => {
    const c = buildCourse(parsed.meta, parsed.courses[0]);
    const p = simulate(c, { rollSpeed: 10 });
    expect(p.totalNotes).toBe(12);
    expect(p.maxCombo).toBe(12);
    const roll = p.rolls.find((r) => c.notes[r.noteIndex].type === 'roll')!;
    expect(roll.hitTimes.length).toBe(9); // 875ms at 10/s
    const balloon = p.rolls.find((r) => c.notes[r.noteIndex].type === 'balloon')!;
    expect(balloon.hitTimes.length).toBe(7);
    expect(balloon.popTime).toBe(balloon.hitTimes[6]);
    expect(p.gauge[p.gauge.length - 1].value).toBe(100);
  });
});

describe('branches', () => {
  const tja = `BPM:60
OFFSET:0
COURSE:Oni
BALLOON:2,4,6
#START
1,
#BRANCHSTART p,10,20
#N
1,
7008,
#E
2,
7008,
#M
3,
7008,
#BRANCHEND
4,
#END
`;
  it('keeps only the selected branch and continues after it', () => {
    const parsed = parseTja(tja);
    expect(parsed.courses[0].hasBranches).toBe(true);
    for (const [branch, type, balloon] of [
      ['normal', 'don', 2],
      ['expert', 'ka', 4],
      ['master', 'bigDon', 6],
    ] as const) {
      const c = buildCourse(parsed.meta, parsed.courses[0], branch);
      expect(c.notes.map((n) => n.type)).toEqual(['don', type, 'balloon', 'bigKa']);
      expect(c.notes[1].time).toBe(4000);
      expect(c.notes[2].balloonCount).toBe(balloon);
      expect(c.notes[3].time).toBe(12000);
    }
  });
});

describe('decodeTja', () => {
  it('falls back to Shift_JIS', () => {
    // "TITLE:あ" in Shift_JIS
    const bytes = new Uint8Array([0x54, 0x49, 0x54, 0x4c, 0x45, 0x3a, 0x82, 0xa0]);
    expect(decodeTja(bytes)).toBe('TITLE:あ');
  });
  it('strips UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    expect(decodeTja(bytes)).toBe('A');
  });
});
