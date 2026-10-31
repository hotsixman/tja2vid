import type {
  BarLine,
  Branch,
  Course,
  CourseName,
  CourseSource,
  GogoRange,
  Note,
  NoteType,
  ParsedTja,
  TjaMeta,
} from './types';

const COURSE_NAMES: Record<string, CourseName> = {
  '0': 'Easy',
  easy: 'Easy',
  '1': 'Normal',
  normal: 'Normal',
  '2': 'Hard',
  hard: 'Hard',
  '3': 'Oni',
  oni: 'Oni',
  '4': 'Edit',
  edit: 'Edit',
  ura: 'Edit',
};

/** Strips `//` comments and surrounding whitespace. */
function cleanLine(line: string): string {
  const i = line.indexOf('//');
  return (i >= 0 ? line.slice(0, i) : line).trim();
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * First pass: split a TJA file into global metadata and per-course raw bodies.
 */
export function parseTja(text: string): ParsedTja {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const globals: Record<string, string> = {};
  let local: Record<string, string> = {};
  const courses: CourseSource[] = [];

  let body: string[] | null = null;
  let startArg = '';

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    if (body) {
      if (/^#END\b/i.test(line)) {
        const headers = { ...globals, ...local };
        const key = (headers.COURSE ?? '3').trim().toLowerCase();
        const course = COURSE_NAMES[key] ?? 'Oni';
        const player = startArg ? ` (${startArg})` : '';
        courses.push({
          course,
          label: `${course === 'Edit' ? 'Ura Oni' : course}${player}`,
          level: num(headers.LEVEL, 0),
          headers,
          body,
          hasBranches: body.some((l) => /^#BRANCHSTART\b/i.test(l)),
        });
        body = null;
        // Balloon counts are per-course; don't leak them into the next one.
        delete local.BALLOON;
        delete local.BALLOONNOR;
        delete local.BALLOONEXP;
        delete local.BALLOONMAS;
      } else {
        body.push(line);
      }
      continue;
    }

    const start = /^#START\b\s*(.*)$/i.exec(line);
    if (start) {
      body = [];
      startArg = start[1].trim().toUpperCase();
      continue;
    }

    const m = /^([A-Z0-9_]+)\s*:(.*)$/i.exec(line);
    if (m) {
      const key = m[1].toUpperCase();
      const value = m[2].trim();
      if (key === 'COURSE') {
        local = { COURSE: value };
      } else if (
        ['LEVEL', 'BALLOON', 'BALLOONNOR', 'BALLOONEXP', 'BALLOONMAS', 'SCOREINIT', 'SCOREDIFF', 'STYLE'].includes(key)
      ) {
        local[key] = value;
      } else {
        globals[key] = value;
      }
    }
  }

  const meta: TjaMeta = {
    title: globals.TITLE ?? '',
    subtitle: (globals.SUBTITLE ?? '').replace(/^(--|\+\+)/, ''),
    wave: globals.WAVE ?? '',
    offset: num(globals.OFFSET, 0),
    bpm: num(globals.BPM, 120),
    demoStart: num(globals.DEMOSTART, 0),
    genre: globals.GENRE ?? '',
  };
  return { meta, courses };
}

const NOTE_CHARS: Record<string, NoteType | 'end' | 'skip'> = {
  '1': 'don',
  '2': 'ka',
  '3': 'bigDon',
  '4': 'bigKa',
  '5': 'roll',
  '6': 'bigRoll',
  '7': 'balloon',
  '8': 'end',
  '9': 'balloon', // kusudama — rendered as a normal balloon
  A: 'bigDon', // hand-in-hand don
  B: 'bigKa',
  C: 'mine',
  D: 'balloon', // fuse roll
  F: 'skip', // ad-lib (invisible)
  G: 'bigKa', // kadon — approximated as big ka
  H: 'roll',
  I: 'bigRoll',
};

const isLong = (t: NoteType) => t === 'roll' || t === 'bigRoll' || t === 'balloon';

interface State {
  time: number;
  bpm: number;
  scroll: number;
  measureNum: number;
  measureDen: number;
  gogo: boolean;
  barline: boolean;
}

type Token = { note: string } | { cmd: string; arg: string };

const BRANCH_OF: Record<string, Branch> = { N: 'normal', E: 'expert', M: 'master' };

function parseScroll(arg: string, fallback: number): number {
  // Complex scroll ("1+2i") — only the horizontal (real) component is used.
  const m = /^\s*([+-]?[\d.]+)/.exec(arg);
  return m ? parseFloat(m[1]) : fallback;
}

/**
 * Second pass: turn a course body into timed notes, bar lines and gogo ranges.
 * Times are song times in ms (0 = start of the audio file).
 */
export function buildCourse(meta: TjaMeta, src: CourseSource, branch: Branch = 'master'): Course {
  const offsetMs = -meta.offset * 1000;
  const notes: Note[] = [];
  const bars: BarLine[] = [];
  const gogo: GogoRange[] = [];

  const splitBalloons = (v: string | undefined) =>
    (v ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  const balloonShared = splitBalloons(src.headers.BALLOON);
  const balloonPerBranch: Record<Branch, number[]> = {
    normal: splitBalloons(src.headers.BALLOONNOR),
    expert: splitBalloons(src.headers.BALLOONEXP),
    master: splitBalloons(src.headers.BALLOONMAS),
  };
  const balloonIdx: Record<Branch | 'shared', number> = { normal: 0, expert: 0, master: 0, shared: 0 };
  const takeBalloon = (br: Branch | null): number => {
    if (br && balloonPerBranch[br].length) return balloonPerBranch[br][balloonIdx[br]++] ?? 5;
    return balloonShared[balloonIdx.shared++] ?? 5;
  };

  // Pre-scan branch blocks to know which branch sections exist in each.
  const blockBranches: Set<Branch>[] = [];
  {
    let cur: Set<Branch> | null = null;
    for (const line of src.body) {
      if (/^#BRANCHSTART\b/i.test(line)) {
        cur = new Set();
        blockBranches.push(cur);
      } else if (cur && /^#[NEM]\s*$/i.test(line)) {
        cur.add(BRANCH_OF[line[1].toUpperCase()]);
      } else if (/^#BRANCHEND\b/i.test(line)) {
        cur = null;
      }
    }
  }
  const pickBranch = (avail: Set<Branch>): Branch | null => {
    if (avail.has(branch)) return branch;
    const order: Branch[] =
      branch === 'master' ? ['expert', 'normal'] : branch === 'expert' ? ['master', 'normal'] : ['expert', 'master'];
    return order.find((b) => avail.has(b)) ?? null;
  };

  const st: State = {
    time: 0,
    bpm: num(src.headers.BPM, meta.bpm),
    scroll: 1,
    measureNum: 4,
    measureDen: 4,
    gogo: false,
    barline: true,
  };

  let openLong: Note | null = null;
  let gogoStart: number | null = null;

  // Branch tracking
  let blockIndex = -1;
  let inBlock = false;
  let blockStart: State | null = null;
  let activeBranch: Branch | null = null; // which branch section we are in (null = common)
  let selected: Branch | null = null; // the section we keep in the current block
  let afterSelected: State | null = null;
  let firstBarOfBlock = false;

  const collecting = () => !inBlock || activeBranch === null || activeBranch === selected;

  const leaveSection = () => {
    if (inBlock && activeBranch !== null && activeBranch === selected) afterSelected = { ...st };
  };
  const endBlock = () => {
    if (!inBlock) return;
    leaveSection();
    if (afterSelected) Object.assign(st, afterSelected);
    inBlock = false;
    activeBranch = null;
    afterSelected = null;
  };

  let measure: Token[] = [];

  const applyCmd = (cmd: string, arg: string) => {
    switch (cmd) {
      case 'BPMCHANGE':
        st.bpm = num(arg, st.bpm);
        break;
      case 'SCROLL':
        st.scroll = parseScroll(arg, st.scroll);
        break;
      case 'MEASURE': {
        const [a, b] = arg.split('/').map((s) => parseFloat(s));
        if (a > 0 && b > 0) {
          st.measureNum = a;
          st.measureDen = b;
        }
        break;
      }
      case 'DELAY':
        st.time += num(arg, 0) * 1000;
        break;
      case 'GOGOSTART':
        if (!st.gogo) gogoStart = st.time;
        st.gogo = true;
        break;
      case 'GOGOEND':
        if (st.gogo && gogoStart !== null) gogo.push({ start: gogoStart + offsetMs, end: st.time + offsetMs });
        st.gogo = false;
        gogoStart = null;
        break;
      case 'BARLINEOFF':
        st.barline = false;
        break;
      case 'BARLINEON':
        st.barline = true;
        break;
    }
  };

  const flushMeasure = () => {
    const tokens = measure;
    measure = [];
    const noteCount = tokens.filter((t) => 'note' in t).length;
    const measureLen = () => (60000 / st.bpm) * 4 * (st.measureNum / st.measureDen);
    let barDone = false;
    const pushBar = () => {
      if (barDone) return;
      barDone = true;
      bars.push({
        time: st.time + offsetMs,
        bpm: st.bpm,
        scroll: st.scroll,
        visible: st.barline,
        branch: firstBarOfBlock,
      });
      firstBarOfBlock = false;
    };

    for (const t of tokens) {
      if ('cmd' in t) {
        applyCmd(t.cmd, t.arg);
        continue;
      }
      pushBar();
      const kind = NOTE_CHARS[t.note.toUpperCase()];
      const time = st.time + offsetMs;
      if (kind === 'end') {
        if (openLong) {
          openLong.endTime = time;
          openLong.endBpm = st.bpm;
          openLong.endScroll = st.scroll;
          openLong = null;
        }
      } else if (kind && kind !== 'skip') {
        if (isLong(kind) && openLong) {
          // Unterminated long note: close it here.
          openLong.endTime = time;
          openLong.endBpm = st.bpm;
          openLong.endScroll = st.scroll;
          openLong = null;
        }
        const note: Note = { type: kind, time, bpm: st.bpm, scroll: st.scroll, gogo: st.gogo };
        if (kind === 'balloon') note.balloonCount = takeBalloon(inBlock ? selected : null);
        if (isLong(kind)) openLong = note;
        notes.push(note);
      }
      st.time += measureLen() / noteCount;
    }
    if (noteCount === 0) {
      pushBar();
      st.time += measureLen();
    }
  };

  for (const line of src.body) {
    if (line.startsWith('#')) {
      const m = /^#([A-Z]+)\s*(.*)$/i.exec(line);
      if (!m) continue;
      const cmd = m[1].toUpperCase();
      const arg = m[2].trim();

      if (cmd === 'BRANCHSTART') {
        endBlock();
        blockIndex++;
        inBlock = true;
        blockStart = { ...st };
        selected = pickBranch(blockBranches[blockIndex] ?? new Set());
        activeBranch = null;
        afterSelected = null;
        continue;
      }
      if (cmd === 'N' || cmd === 'E' || cmd === 'M') {
        if (!inBlock || !blockStart) continue;
        leaveSection();
        Object.assign(st, blockStart);
        activeBranch = BRANCH_OF[cmd];
        firstBarOfBlock = activeBranch === selected;
        continue;
      }
      if (cmd === 'BRANCHEND') {
        endBlock();
        continue;
      }
      if (!collecting()) continue;
      if (measure.length) measure.push({ cmd, arg });
      else applyCmd(cmd, arg);
      continue;
    }

    // Note data (may contain several measures on one line).
    if (!collecting()) {
      // Still consume balloon counts from the shared list so later balloons line up.
      for (const ch of line) {
        const k = NOTE_CHARS[ch.toUpperCase()];
        if (k === 'balloon' && !(activeBranch && balloonPerBranch[activeBranch].length)) balloonIdx.shared++;
        else if (k === 'balloon' && activeBranch) balloonIdx[activeBranch]++;
      }
      continue;
    }
    for (const ch of line) {
      if (ch === ',') flushMeasure();
      else if (/[0-9A-Z]/i.test(ch)) measure.push({ note: ch });
    }
  }
  if (measure.some((t) => 'note' in t)) flushMeasure();
  endBlock();

  if (st.gogo && gogoStart !== null) gogo.push({ start: gogoStart + offsetMs, end: st.time + offsetMs });
  const unterminated = openLong as Note | null;
  if (unterminated) {
    unterminated.endTime = st.time + offsetMs;
    unterminated.endBpm = st.bpm;
    unterminated.endScroll = st.scroll;
  }

  notes.sort((a, b) => a.time - b.time);
  bars.sort((a, b) => a.time - b.time);

  return {
    course: src.course,
    level: src.level,
    label: src.label,
    notes,
    bars,
    gogo,
    hasBranches: src.hasBranches,
    branch,
    scoreInit: src.headers.SCOREINIT ? num(src.headers.SCOREINIT.split(',')[0], 0) || undefined : undefined,
    scoreDiff: src.headers.SCOREDIFF ? num(src.headers.SCOREDIFF, 0) || undefined : undefined,
  };
}
