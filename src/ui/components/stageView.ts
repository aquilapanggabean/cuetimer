export function renderStageViewHtml(): string {
  return `
    <div id="stageView" class="stage-display-shell" aria-label="Broadcast Stage Timer Display">
      <!-- Zone 1: Top Header -->
      <header class="stage-top-zone">
        <div>
          <div class="stage-session-label">Active Session</div>
          <div id="stageSessionIndicator" class="stage-session-name">Cue 1 of 5</div>
        </div>

        <div class="stage-clock-center">
          <div class="stage-session-label">Local Time</div>
          <div id="stageLocalClock" class="stage-clock-digits mono">00:00:00</div>
        </div>

        <div class="stage-top-right">
          <div>
            <div class="stage-session-label">Event Elapsed</div>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:2px;">
              <span id="stageScheduleStatusTag" class="tag mono">On Time</span>
              <span id="stageElapsedStopwatch" class="stage-clock-digits mono">00:00:00</span>
            </div>
          </div>

          <div class="stage-chrome-controls">
            <button type="button" id="btnToggleFullscreen" class="btn btn-sm" aria-label="Toggle Fullscreen">
              <span>Fullscreen</span>
            </button>
            <button type="button" id="btnBackToController" class="btn btn-sm" aria-label="Back to Controller">
              <span>Back to Controller</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Zone 2: Center Hero Countdown -->
      <main class="stage-hero-zone" aria-live="polite">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="stageOvertimeTag" class="tag tag-red hidden" style="font-size:13px;padding:4px 10px;">OVERTIME</span>
            <span id="stagePausedTag" class="tag tag-amber hidden" style="font-size:13px;padding:4px 10px;">PAUSED</span>
          </div>
          <h2 id="stageCueTitle" class="stage-cue-heading">Opening Remarks</h2>
          <div id="stageCueSpeaker" class="stage-cue-sub">Event Host</div>
        </div>

        <div id="stageHeroCountdown" class="stage-countdown-hero mono text-normal">05:00</div>

        <div
          id="stageProgressBar"
          class="stage-progress-container"
          role="progressbar"
          aria-label="Cue time remaining"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="100"
        >
          <div id="stageProgressFill" class="stage-progress-bar-fill fill-normal" style="width:100%;"></div>
        </div>
      </main>

      <!-- High-Visibility Flash Message Overlay -->
      <div id="stageFlashOverlay" class="stage-flash-banner hidden" role="alert">
        <div id="stageFlashMessageText" class="stage-flash-banner-text"></div>
        <button type="button" id="btnDismissStageFlash" class="btn" style="background:#09090B;color:#FAFAFA;border-color:#09090B;">
          Dismiss Message
        </button>
      </div>

      <!-- Zone 3: Bottom Status Bar -->
      <footer class="stage-bottom-zone">
        <div class="stage-upnext-row">
          <span class="tag tag-neutral-bright">UP NEXT</span>
          <span id="stageUpNextTitle" style="font-size:clamp(1rem, 1.9vw, 1.45rem);font-weight:600;">Keynote Address</span>
          <span id="stageUpNextMeta" class="mono" style="font-size:clamp(0.9rem, 1.5vw, 1.15rem);color:var(--text-muted);">
            Lead Speaker | 20:00
          </span>
        </div>

        <div class="mono" style="font-size:12px;color:var(--text-muted);">
          CueTimer Stage Feed
        </div>
      </footer>
    </div>
  `;
}
