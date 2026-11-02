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

describe('dan-i dojo', () => {
  const tja = [
    'TITLE:Test Dan',
    'BPM:120',
    'COURSE:Dan',
    'LEVEL:10',
    'BALLOON:5',
    'EXAM1:g,92,100,m',
    'EXAM2:jb,35,16,l',
    '#START',
    '#NEXTSONG Song A,Sub A,,a.ogg,350,80,9,3',
    'EXAM3:r,18,24,m',
    '1111,',
    '#NEXTSONG Song\\, B,,,b.ogg',
    'EXAM3:r,40,62,m',
    '#DELAY 0.5',
    '2222,',
    '#END',
  ].join('\n');

  it('joins songs with the OpenTaiko gap and collects exams', () => {
    const parsed = parseTja(tja);
    const src = parsed.courses[0];
    expect(src.course).toBe('Dan');
    const c = buildCourse(parsed.meta, src);
    const dan = c.dan!;
    expect(dan.songs.map((s) => s.title)).toEqual(['Song A', 'Song, B']);
    expect(dan.songs[0].chipTime).toBe(0);
    expect(dan.songs[0].audioStart).toBe(7200);
    expect(dan.songs[0].scoreInit).toBe(350);
    // One 4/4 bar at 120 BPM = 2000ms.
    expect(dan.songs[1].chipTime).toBe(9200);
    expect(dan.songs[1].audioStart).toBe(16400);
    expect(c.notes[0].time).toBe(7200);
    expect(c.notes[4].time).toBe(16900);
    // Global exams fill song 0; the per-song exam 3 differs per song.
    expect(dan.songs[0].exams[0]?.type).toBe('gauge');
    expect(dan.songs[0].exams[1]).toEqual({ type: 'judgeBad', values: [35, 16], range: 'less' });
    expect(dan.songs[0].exams[2]?.values).toEqual([18, 24]);
    expect(dan.songs[1].exams[2]?.values).toEqual([40, 62]);
    expect(dan.songs[1].exams[0]).toBeNull();
    expect(dan.exams[2]?.values).toEqual([18, 24]);
  });
});

describe('dan builder', () => {
  const song = (title: string, wave: string) =>
    parseTja([`TITLE:${title}`, 'BPM:120', `WAVE:${wave}`, 'COURSE:Oni', 'LEVEL:9', '#START', '1111,', '2222,', '#END'].join('\n'));

  it('lays songs out like #NEXTSONG and assigns exams', async () => {
    const { buildDanCourse } = await import('../src/lib/tja/danBuilder');
    const a = song('A', 'a.ogg');
    const b = song('B', 'b.ogg');
    const c = buildDanCourse(
      [
        { meta: a.meta, source: a.courses[0], branch: 'master' },
        { meta: b.meta, source: b.courses[0], branch: 'master' },
      ],
      [
        { type: 'gauge', range: 'more', perSong: false, values: [[90, 100]] },
        { type: 'roll', range: 'more', perSong: true, values: [[10, 20], [30, 40]] },
      ],
    );
    const dan = c.dan!;
    expect(c.course).toBe('Dan');
    expect(dan.songs.map((s) => [s.chipTime, s.audioStart, s.wave])).toEqual([
      [0, 7200, 'a.ogg'],
      // two 2s bars of song A, then the next curtain
      [11200, 18400, 'b.ogg'],
    ]);
    expect(c.notes[0].time).toBe(7200);
    expect(c.notes[8].time).toBe(18400);
    expect(dan.songs[0].exams[0]?.values).toEqual([90, 100]);
    expect(dan.songs[1].exams[0]).toBeNull();
    expect(dan.songs[1].exams[1]?.values).toEqual([30, 40]);
  });
});
