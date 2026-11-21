export type CueType = 'Main' | 'Buffer/Break';
export type TriggerMode = 'manual' | 'auto';
export type CueStatus = 'pending' | 'active' | 'completed';

export interface Cue {
  id: string;
  title: string;
  speaker: string;
  plannedDurationSec: number;
  adjustedDurationSec: number;
  type: CueType;
  mode: TriggerMode;
  yellowThresholdSec: number;
  redThresholdSec: number;
  notes: string;
  status: CueStatus;
}

export interface FlashMessage {
  text: string;
  blinking: boolean;
  visible: boolean;
  dismissedOnStage: boolean;
}

export interface AppState {
  eventStartTime: string; // e.g. "09:00"
  cues: Cue[];
  activeCueIndex: number;
  isRunning: boolean;
  startedAtEpoch: number | null;
  accumulatedElapsedMs: number;
  eventFirstStartedEpoch: number | null;
  eventEndedEpoch: number | null;
  scheduleOffsetSec: number;
  adjustStepSec: number;
  flashMessage: FlashMessage;
  googleSheetUrl: string;
}

export interface ScheduledCueItem {
  startEpoch: number;
  endEpoch: number;
  effectiveSec: number;
}

export interface ScheduleMetrics {
  startEpoch: number;
  plannedTotalSec: number;
  plannedEndEpoch: number;
  projectedEndEpoch: number;
  varianceSec: number;
  cueSchedules: ScheduledCueItem[];
}
