import { describe, it, expect } from 'vitest';
import { parseSpreadsheet, mapHeaderColumn } from '../src/storage/spreadsheetParser';

describe('SpreadsheetParser', () => {
  it('normalizes common header aliases', () => {
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
});
