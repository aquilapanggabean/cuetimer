import { describe, it, expect } from 'vitest';
import {
  parseSpreadsheet,
  parseSpreadsheetWithMeta,
  mapHeaderColumn,
  parseClockTimeHHMM,
  generateRundownTemplateWorkbook
} from '../src/storage/spreadsheetParser';

describe('SpreadsheetParser', () => {
  it('normalizes common header aliases including Start Time and Indonesian headers', () => {
    expect(mapHeaderColumn('Title')).toBe('title');
    expect(mapHeaderColumn('Session Name')).toBe('title');
    expect(mapHeaderColumn('Presenter')).toBe('speaker');
    expect(mapHeaderColumn('PIC')).toBe('speaker');
    expect(mapHeaderColumn('Duration')).toBe('duration');
    expect(mapHeaderColumn('Planned Time')).toBe('duration');
    expect(mapHeaderColumn('Category')).toBe('type');
    expect(mapHeaderColumn('Trigger')).toBe('mode');
    expect(mapHeaderColumn('Yellow Warning')).toBe('yellow');
    expect(mapHeaderColumn('Red Warning')).toBe('red');
    expect(mapHeaderColumn('Remarks')).toBe('notes');
    expect(mapHeaderColumn('Start_Time')).toBe('startTime');
    expect(mapHeaderColumn('Jam Mulai')).toBe('startTime');
    expect(mapHeaderColumn('End Time')).toBe('endTime');
  });

  it('parses clock times from 24h strings, AM/PM, dots, and Excel serial numbers', () => {
    expect(parseClockTimeHHMM('08:30')).toBe('08:30');
    expect(parseClockTimeHHMM('9:05')).toBe('09:05');
    expect(parseClockTimeHHMM('09.45')).toBe('09:45');
    expect(parseClockTimeHHMM('2:15 PM')).toBe('14:15');
    expect(parseClockTimeHHMM('12:00 AM')).toBe('00:00');
    expect(parseClockTimeHHMM(0.375)).toBe('09:00');
  });

  it('parses CSV text into validated Cue array', () => {
    const csvContent = `Title,Speaker,Duration,Type,Mode,Yellow,Red,Notes
Opening Keynote,Dr. Jane,20:00,Main,Manual,02:00,00:30,Stage deck 1
Coffee Break,Crew,10:00,Buffer,Auto,01:00,00:30,Restock drinks`;

    const cues = parseSpreadsheet(csvContent);
    expect(cues.length).toBe(2);

    expect(cues[0].title).toBe('Opening Keynote');
    expect(cues[0].speaker).toBe('Dr. Jane');
    expect(cues[0].plannedDurationSec).toBe(1200);
    expect(cues[0].type).toBe('Main');
    expect(cues[0].mode).toBe('manual');
    expect(cues[0].yellowThresholdSec).toBe(120);
    expect(cues[0].redThresholdSec).toBe(30);

    expect(cues[1].title).toBe('Coffee Break');
    expect(cues[1].type).toBe('Buffer/Break');
    expect(cues[1].mode).toBe('auto');
    expect(cues[1].plannedDurationSec).toBe(600);
  });

  it('extracts eventStartTime from Start_Time column and computes duration from Start/End when Duration is omitted', () => {
    const csvWithStart = `Start_Time,End_Time,Title,Speaker
08:45,09:00,Welcome Doors,Host
09:00,09:30,Keynote,CEO`;

    const result = parseSpreadsheetWithMeta(csvWithStart);
    expect(result.eventStartTime).toBe('08:45');
    expect(result.cues.length).toBe(2);
    expect(result.cues[0].plannedDurationSec).toBe(900);
    expect(result.cues[1].plannedDurationSec).toBe(1800);
  });

  it('extracts pre-header metadata Start Time and Event Name before cue table', () => {
    const csvWithMeta = `Event Name,Tech Summit Jakarta,,,
Start Time,13:15,,,
Title,Speaker,Duration,Type,Mode
Opening,MC,05:00,Main,Manual`;

    const result = parseSpreadsheetWithMeta(csvWithMeta);
    expect(result.eventTitle).toBe('Tech Summit Jakarta');
    expect(result.eventStartTime).toBe('13:15');
    expect(result.cues.length).toBe(1);
    expect(result.cues[0].title).toBe('Opening');
  });

  it('generates downloadable rundown template workbook with Rundown and Instructions sheets', () => {
    const wb = generateRundownTemplateWorkbook();
    expect(wb.SheetNames).toContain('Rundown');
    expect(wb.SheetNames).toContain('Instructions');
  });
});
