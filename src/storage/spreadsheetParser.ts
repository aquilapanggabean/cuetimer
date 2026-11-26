import * as XLSX from 'xlsx';
import { Cue, ScheduleMetrics } from '../core/types';
import { parseDurationSeconds, formatMMSS, formatClockHHMM } from '../core/timeEngine';

export interface ParsedSpreadsheetResult {
  cues: Cue[];
  eventStartTime: string | null;
  eventTitle: string | null;
}

export function createId(prefix = 'cue'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function mapHeaderColumn(rawHeader: string): string | null {
  const key = String(rawHeader || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    ['title', 'agenda', 'session', 'cue', 'cuetitle', 'sessionname', 'item', 'topic', 'acara', 'sesi', 'kegiatan', 'materi'].includes(key)
  ) {
    return 'title';
  }
  if (
    ['speaker', 'pic', 'presenter', 'host', 'moderator', 'owner', 'lead', 'pembicara', 'narasumber', 'pengisiacara', 'mc'].includes(key)
  ) {
    return 'speaker';
  }
  if (
    ['duration', 'planned', 'plannedduration', 'time', 'length', 'minutes', 'mins', 'plannedtime', 'durasi'].includes(key)
  ) {
    return 'duration';
  }
  if (
    ['start', 'starttime', 'scheduledstart', 'jammulai', 'mulai', 'timestart', 'begin', 'startclock', 'eventstart'].includes(key)
  ) {
    return 'startTime';
  }
  if (
    ['end', 'endtime', 'scheduledend', 'jamselesai', 'selesai', 'timeend', 'finish', 'endclock'].includes(key)
  ) {
    return 'endTime';
  }
  if (['type', 'cuetype', 'category', 'kind', 'tipe', 'jenis'].includes(key)) return 'type';
  if (['mode', 'trigger', 'triggermode', 'advance'].includes(key)) return 'mode';
  if (['yellow', 'warning', 'yellowwarning', 'warn'].includes(key)) return 'yellow';
  if (['red', 'critical', 'redwarning', 'danger'].includes(key)) return 'red';
  if (['notes', 'note', 'remarks', 'comments', 'description', 'catatan', 'keterangan'].includes(key)) return 'notes';
  return null;
}

export function parseClockTimeHHMM(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;

  if (input instanceof Date && !isNaN(input.getTime())) {
    const h = String(input.getHours()).padStart(2, '0');
    const m = String(input.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  if (typeof input === 'number' && !isNaN(input)) {
    // Excel serial time fraction (0..1) or datetime serial (> 1)
    const frac = input >= 1 ? input % 1 : input;
    if (frac >= 0 && frac < 1) {
      const totalMins = Math.round(frac * 24 * 60) % (24 * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // Match HH:MM(:SS)? AM/PM or HH.MM AM/PM
  const match = raw.match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = (match[3] || '').toLowerCase();

  if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) return null;

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function diffClockTimeSec(startHHMM: string, endHHMM: string): number | null {
  const s = startHHMM.split(':').map(Number);
  const e = endHHMM.split(':').map(Number);
  if (s.length < 2 || e.length < 2) return null;
  const startMin = s[0] * 60 + s[1];
  let endMin = e[0] * 60 + e[1];
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }
  const diff = (endMin - startMin) * 60;
  return diff > 0 && diff <= 12 * 3600 ? diff : null;
}

export function convertRowsToCuesWithMeta(rowObjects: Record<string, unknown>[]): ParsedSpreadsheetResult {
  if (!Array.isArray(rowObjects) || !rowObjects.length) {
    return { cues: [], eventStartTime: null, eventTitle: null };
  }

  const cues: Cue[] = [];
  let detectedStartTime: string | null = null;

  rowObjects.forEach((row, index) => {
    const normalized: Record<string, unknown> = {};
    Object.keys(row).forEach((colKey) => {
      const field = mapHeaderColumn(colKey);
      if (field && row[colKey] !== undefined && row[colKey] !== null) {
        normalized[field] = row[colKey];
      }
    });

    const title = String(normalized.title || '').trim();
    const speaker = String(normalized.speaker || '').trim();
    const hasDuration = normalized.duration !== undefined && String(normalized.duration).trim() !== '';
    const startHHMM = parseClockTimeHHMM(normalized.startTime);
    const endHHMM = parseClockTimeHHMM(normalized.endTime);

    if (!title && !speaker && !hasDuration && !startHHMM) return;

    if (!detectedStartTime && startHHMM) {
      detectedStartTime = startHHMM;
    }

    let durSec = 600;
    if (hasDuration) {
      durSec = parseDurationSeconds(normalized.duration, 600);
    } else if (startHHMM && endHHMM) {
      durSec = diffClockTimeSec(startHHMM, endHHMM) ?? 600;
    }

    const rawType = String(normalized.type || '').trim().toLowerCase();
    const type = rawType.includes('buffer') || rawType.includes('break') || rawType.includes('istirahat')
      ? 'Buffer/Break'
      : 'Main';

    const rawMode = String(normalized.mode || '').trim().toLowerCase();
    const mode = rawMode.includes('auto') ? 'auto' : 'manual';

    const yellowSec = parseDurationSeconds(normalized.yellow, 120);
    const redSec = parseDurationSeconds(normalized.red, 30);

    cues.push({
      id: createId('cue'),
      title: title || 'Cue ' + (index + 1),
      speaker: speaker || 'Presenter',
      plannedDurationSec: durSec,
      adjustedDurationSec: durSec,
      type,
      mode,
      yellowThresholdSec: yellowSec,
      redThresholdSec: redSec,
      notes: String(normalized.notes || '').trim(),
      status: 'pending'
    });
  });

  return {
    cues,
    eventStartTime: detectedStartTime,
    eventTitle: null
  };
}

export function convertRowsToCues(rowObjects: Record<string, unknown>[]): Cue[] {
  return convertRowsToCuesWithMeta(rowObjects).cues;
}

export function parseSpreadsheetWithMeta(data: ArrayBuffer | string): ParsedSpreadsheetResult {
  const workbook: XLSX.WorkBook =
    typeof data === 'string'
      ? XLSX.read(data, { type: 'string', raw: false })
      : XLSX.read(data, { type: 'array', raw: false });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { cues: [], eventStartTime: null, eventTitle: null };

  const worksheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });

  if (!grid.length) return { cues: [], eventStartTime: null, eventTitle: null };

  let metaStartTime: string | null = null;
  let metaEventTitle: string | null = null;
  let headerRowIdx = 0;

  // Locate header row (first row with >= 2 recognized cue columns) and scan any pre-header metadata rows
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r] || [];
    const recognizedCols = row.filter((cell) => mapHeaderColumn(String(cell || '')) !== null).length;

    if (recognizedCols >= 2) {
      headerRowIdx = r;
      break;
    }

    // Check metadata key-value pairs in rows above the table
    for (let c = 0; c < row.length - 1; c++) {
      const label = String(row[c] || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const val = row[c + 1];
      if (!metaStartTime && ['starttime', 'eventstart', 'start', 'jammulai', 'mulai'].includes(label)) {
        metaStartTime = parseClockTimeHHMM(val);
      }
      if (!metaEventTitle && ['event', 'eventname', 'eventtitle', 'acara', 'namaacara'].includes(label)) {
        const t = String(val || '').trim();
        if (t) metaEventTitle = t;
      }
    }
  }

  const headers = (grid[headerRowIdx] || []).map((h, i) => String(h || '').trim() || `col_${i}`);
  const rowObjects: Record<string, unknown>[] = [];

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const cells = grid[r] || [];
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    headers.forEach((h, i) => {
      const val = cells[i];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        hasAny = true;
      }
      obj[h] = val ?? '';
    });
    if (hasAny) {
      rowObjects.push(obj);
    }
  }

  const result = convertRowsToCuesWithMeta(rowObjects);
  return {
    cues: result.cues,
    eventStartTime: metaStartTime || result.eventStartTime,
    eventTitle: metaEventTitle
  };
}

export function parseSpreadsheet(data: ArrayBuffer | string): Cue[] {
  return parseSpreadsheetWithMeta(data).cues;
}

export function generateRundownTemplateWorkbook(): XLSX.WorkBook {
  const sampleRows = [
    {
      Start_Time: '09:00',
      Title: 'Doors Open & Stage Check',
      Speaker: 'Production Crew',
      Duration: '05:00',
      Type: 'Buffer/Break',
      Mode: 'Auto-next',
      Yellow_Warning: '01:00',
      Red_Warning: '00:15',
      Notes: 'Verify stage mics and confidence monitor'
    },
    {
      Start_Time: '09:05',
      Title: 'Opening Remarks & Welcome',
      Speaker: 'Event Host',
      Duration: '10:00',
      Type: 'Main',
      Mode: 'Manual',
      Yellow_Warning: '02:00',
      Red_Warning: '00:30',
      Notes: 'Cue walk-in music 10 seconds before start'
    },
    {
      Start_Time: '09:15',
      Title: 'Keynote Address: Future of Live Production',
      Speaker: 'Dr. Maya Lin',
      Duration: '25:00',
      Type: 'Main',
      Mode: 'Manual',
      Yellow_Warning: '03:00',
      Red_Warning: '00:30',
      Notes: 'Main slide deck on Playback A + clicker ready'
    },
    {
      Start_Time: '09:40',
      Title: 'Coffee & Stage Reset Buffer',
      Speaker: 'Stage Manager',
      Duration: '10:00',
      Type: 'Buffer/Break',
      Mode: 'Auto-next',
      Yellow_Warning: '02:00',
      Red_Warning: '00:30',
      Notes: 'Place 4 panel chairs and handheld mics'
    },
    {
      Start_Time: '09:50',
      Title: 'Executive Panel & Audience Q&A',
      Speaker: 'Panel Moderator',
      Duration: '30:00',
      Type: 'Main',
      Mode: 'Manual',
      Yellow_Warning: '05:00',
      Red_Warning: '01:00',
      Notes: 'Reserve final 10 mins for floor questions'
    }
  ];

  const guideRows = [
    { Column: 'Start_Time', Format: 'HH:MM (24h or AM/PM)', Description: 'First row Start_Time automatically sets the Event Start Time when imported.' },
    { Column: 'Title', Format: 'Text', Description: 'Session or cue name shown on Stage Display and OBS Overlay.' },
    { Column: 'Speaker', Format: 'Text', Description: 'Presenter, host, or PIC responsible for the cue.' },
    { Column: 'Duration', Format: 'MM:SS, HH:MM:SS, or minutes', Description: 'Planned cue duration (e.g., 15:00 or 15). If omitted, End_Time - Start_Time is used.' },
    { Column: 'Type', Format: 'Main | Buffer/Break', Description: 'Buffer/Break cues absorb overtime first during recovery.' },
    { Column: 'Mode', Format: 'Manual | Auto-next', Description: 'Auto-next automatically advances to the next cue when the timer hits 00:00.' },
    { Column: 'Yellow_Warning', Format: 'MM:SS', Description: 'Remaining time threshold when countdown turns Amber (default 02:00).' },
    { Column: 'Red_Warning', Format: 'MM:SS', Description: 'Remaining time threshold when countdown turns Red (default 00:30).' },
    { Column: 'Notes', Format: 'Text', Description: 'Operator production notes (shown in Operator Console only).' }
  ];

  const wsRundown = XLSX.utils.json_to_sheet(sampleRows);
  wsRundown['!cols'] = [
    { wch: 12 },
    { wch: 40 },
    { wch: 20 },
    { wch: 12 },
    { wch: 15 },
    { wch: 13 },
    { wch: 15 },
    { wch: 13 },
    { wch: 42 }
  ];

  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRundown, 'Rundown');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instructions');
  return wb;
}

export function downloadRundownTemplate(filename = 'CueTimer_Rundown_Template.xlsx'): void {
  const wb = generateRundownTemplateWorkbook();
  XLSX.writeFile(wb, filename);
}

export function exportRundownToExcel(cues: Cue[], schedule: ScheduleMetrics, filename = 'CueTimer_Rundown.xlsx'): void {
  const exportRows = cues.map((cue, idx) => {
    const sched = schedule.cueSchedules[idx];
    return {
      Order: idx + 1,
      Start_Time: sched ? formatClockHHMM(sched.startEpoch) : '',
      End_Time: sched ? formatClockHHMM(sched.endEpoch) : '',
      Title: cue.title,
      Speaker: cue.speaker,
      Planned_Duration: formatMMSS(cue.plannedDurationSec),
      Adjusted_Duration: formatMMSS(cue.adjustedDurationSec),
      Type: cue.type,
      Trigger_Mode: cue.mode === 'auto' ? 'Auto-next' : 'Manual',
      Yellow_Warning: formatMMSS(cue.yellowThresholdSec),
      Red_Warning: formatMMSS(cue.redThresholdSec),
      Notes: cue.notes
    };
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rundown');
  XLSX.writeFile(wb, filename);
}
