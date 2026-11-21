import * as XLSX from 'xlsx';
import { Cue } from '../core/types';
import { parseDurationSeconds, formatMMSS, formatClockHHMM } from '../core/timeEngine';
import { ScheduleMetrics } from '../core/types';

export function createId(prefix = 'cue'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function mapHeaderColumn(rawHeader: string): string | null {
  const key = String(rawHeader || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['title', 'agenda', 'session', 'cue', 'cuetitle', 'sessionname', 'item', 'topic'].includes(key)) return 'title';
  if (['speaker', 'pic', 'presenter', 'host', 'moderator', 'owner', 'lead'].includes(key)) return 'speaker';
  if (['duration', 'planned', 'plannedduration', 'time', 'length', 'minutes', 'mins', 'plannedtime'].includes(key)) return 'duration';
  if (['type', 'cuetype', 'category', 'kind'].includes(key)) return 'type';
  if (['mode', 'trigger', 'triggermode', 'advance'].includes(key)) return 'mode';
  if (['yellow', 'warning', 'yellowwarning', 'warn'].includes(key)) return 'yellow';
  if (['red', 'critical', 'redwarning', 'danger'].includes(key)) return 'red';
  if (['notes', 'note', 'remarks', 'comments', 'description'].includes(key)) return 'notes';
  return null;
}

export function convertRowsToCues(rowObjects: Record<string, unknown>[]): Cue[] {
  if (!Array.isArray(rowObjects) || !rowObjects.length) return [];
  const cues: Cue[] = [];

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

    if (!title && !speaker && !hasDuration) return;

    const durSec = parseDurationSeconds(normalized.duration, 600);
    const rawType = String(normalized.type || '').trim().toLowerCase();
    const type = (rawType.includes('buffer') || rawType.includes('break')) ? 'Buffer/Break' : 'Main';

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

  return cues;
}

export function parseSpreadsheet(data: ArrayBuffer | string): Cue[] {
  let workbook: XLSX.WorkBook;

  if (typeof data === 'string') {
    workbook = XLSX.read(data, { type: 'string', raw: false });
  } else {
    workbook = XLSX.read(data, { type: 'array', raw: false });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const worksheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false });
  return convertRowsToCues(jsonRows);
}

export function exportRundownToExcel(cues: Cue[], schedule: ScheduleMetrics, filename = 'CueTimer_Rundown.xlsx'): void {
  const exportRows = cues.map((cue, idx) => {
    const sched = schedule.cueSchedules[idx];
    return {
      Order: idx + 1,
      Title: cue.title,
      Speaker: cue.speaker,
      Planned_Duration: formatMMSS(cue.plannedDurationSec),
      Adjusted_Duration: formatMMSS(cue.adjustedDurationSec),
      Scheduled_Start: sched ? formatClockHHMM(sched.startEpoch) : '',
      Scheduled_End: sched ? formatClockHHMM(sched.endEpoch) : '',
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
