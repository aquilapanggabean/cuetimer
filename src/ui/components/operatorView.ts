export function renderOperatorViewHtml(): string {
  return `
    <div id="controllerView" class="controller-shell">
      <header class="top-control-bar">
        <div class="top-bar-brand-group">
          <h1 class="app-h1">CueTimer</h1>
          <span id="syncStatusBadge" class="tag mono" title="Connected stage windows status">
            Sync Active (0 Stage Windows)
          </span>

          <div class="schedule-strip" aria-label="Event Schedule Summary">
            <label class="schedule-metric" for="eventStartInput">
              <span>Start</span>
              <input
                type="time"
                id="eventStartInput"
                class="input input-sm mono"
                style="width:104px;height:28px;"
                aria-label="Event Start Time"
              />
            </label>

            <span class="schedule-metric">
              <span>Planned End</span>
              <strong id="plannedEndText" class="mono">09:00</strong>
            </span>

            <span class="schedule-metric">
              <span>Projected End</span>
              <strong id="projectedEndText" class="mono">09:00</strong>
            </span>

            <span id="varianceBadge" class="tag tag-neutral-bright mono">On Time</span>
          </div>
        </div>

        <nav class="top-toolbar-nav" aria-label="Rundown and Stage Actions">
          <input type="file" id="spreadsheetFileInput" accept=".xlsx,.xls,.csv" class="hidden" />
          <button type="button" id="btnImportExcel" class="btn btn-sm">
            <span>Import Excel / CSV</span>
          </button>
          <button type="button" id="btnDownloadTemplate" class="btn btn-sm">Download Template</button>
          <button type="button" id="btnExportRundown" class="btn btn-sm">Export Rundown</button>

          <button type="button" id="btnToggleSoundMute" class="btn btn-sm">
            <span id="muteStatusLabel">Sound: ON</span>
          </button>

          <button type="button" id="btnUndo" class="btn btn-sm btn-ghost" title="Undo (Ctrl+Z)" disabled>
            <span>Undo</span>
          </button>
          <button type="button" id="btnRedo" class="btn btn-sm btn-ghost" title="Redo (Ctrl+Y)" disabled>
            <span>Redo</span>
          </button>

          <button type="button" id="btnOpenOverlay" class="btn btn-sm" title="Launch OBS / vMix Lower-Third Overlay">
            <span>OBS Overlay</span>
          </button>
          <button type="button" id="btnLaunchStage" class="btn btn-sm btn-contrast">
            <span>Launch Stage View</span>
          </button>
        </nav>
      </header>

      <div class="workspace-grid">
        <main class="main-column">
          <!-- Master Transport Panel -->
          <section class="panel" aria-label="Master Transport and Live Time Adjustment">
            <div class="panel-header">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <h2 class="panel-heading">Master Transport &amp; Live Adjustment</h2>
                <span id="transportCueCounter" class="mono" style="font-size:12px;color:var(--text-muted);">Cue 1 of 5</span>
              </div>
              <span style="font-size:11px;color:var(--text-muted);">Shortcuts: Space (Start/Pause), Left/Right Arrows (Prev/Next Cue)</span>
            </div>

            <div class="transport-bar-body">
              <div class="live-timer-card">
                <div class="live-timer-caption">Active Remaining (click to set)</div>
                <button
                  type="button"
                  id="btnTimerClickEdit"
                  class="timer-readout-btn text-normal"
                  title="Click to type an exact remaining MM:SS time"
                >05:00</button>

                <form id="inlineTimerForm" class="timer-inline-editor hidden">
                  <label for="inlineTimerInput" class="sr-only">Set exact remaining time (MM:SS)</label>
                  <input
                    type="text"
                    id="inlineTimerInput"
                    class="timer-inline-input"
                    placeholder="MM:SS"
                    aria-label="Set exact remaining time in MM:SS"
                  />
                  <button type="submit" class="btn btn-sm btn-contrast" style="height:38px;">Set</button>
                  <button type="button" id="btnCancelInlineTimer" class="btn btn-sm" style="height:38px;">Cancel</button>
                </form>
              </div>

              <div class="transport-buttons-cluster">
                <button type="button" id="btnStartPause" class="btn btn-emerald btn-transport-primary">
                  <span id="labelStartPause">START</span>
                </button>
                <button type="button" id="btnPrevCue" class="btn btn-transport-secondary">Previous Cue</button>
                <button type="button" id="btnNextCue" class="btn btn-transport-secondary">Next Cue</button>
                <button type="button" id="btnResetCue" class="btn btn-transport-secondary">Reset Cue</button>
                <button type="button" id="btnEndEvent" class="btn btn-transport-secondary">End Event</button>
              </div>

              <div class="adjustment-cluster" aria-label="Live Time Adjustment Controls">
                <div class="preset-chips" role="group" aria-label="Step duration presets">
                  <button type="button" class="chip-btn" data-step="30">30s</button>
                  <button type="button" class="chip-btn is-active" data-step="60">1m</button>
                  <button type="button" class="chip-btn" data-step="120">2m</button>
                  <button type="button" class="chip-btn" data-step="300">5m</button>
                </div>

                <div class="custom-adjust-controls">
                  <label class="num-unit-box" for="adjustMinInput">
                    <input type="number" id="adjustMinInput" min="0" max="180" value="1" aria-label="Adjustment minutes" />
                    <span>m</span>
                  </label>
                  <label class="num-unit-box" for="adjustSecInput">
                    <input type="number" id="adjustSecInput" min="0" max="59" value="0" aria-label="Adjustment seconds" />
                    <span>s</span>
                  </label>
                  <button type="button" id="btnAdjustMinus" class="btn btn-sm" title="Subtract adjustment step">- Adjust</button>
                  <button type="button" id="btnAdjustPlus" class="btn btn-sm" title="Add adjustment step">+ Adjust</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Overtime Recovery Bar -->
          <div id="overtimeRecoveryBar" class="overtime-recovery-bar hidden" role="alert">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span class="tag tag-red">Overtime Detected</span>
              <span id="overtimeBarText" style="font-size:13px;font-weight:600;">Schedule is behind by +00:00</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <button type="button" id="btnOpenOvertimeModal" class="btn btn-sm btn-red">Resolve Overtime</button>
            </div>
          </div>

          <!-- Event Rundown Panel -->
          <section class="panel" aria-label="Cue List Rundown Table">
            <div class="panel-header">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <h2 class="panel-heading">Event Rundown</h2>
                <span id="rundownMetaText" class="mono" style="font-size:12px;color:var(--text-muted);">5 cues | Total 01:15:00</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <button type="button" id="btnAddCue" class="btn btn-sm btn-contrast">+ Add Cue</button>
                <button type="button" id="btnRestoreSample" class="btn btn-sm btn-ghost">Load Sample</button>
                <button type="button" id="btnClearRundown" class="btn btn-sm btn-ghost">Clear</button>
              </div>
            </div>

            <div id="emptyRundownState" class="empty-rundown-box hidden">
              <h3>Rundown Is Empty</h3>
              <p>Add your first cue manually, import an Excel / CSV file, or restore the 5-cue sample event.</p>
              <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
                <button type="button" id="btnEmptyAdd" class="btn btn-contrast">+ Add Cue</button>
                <button type="button" id="btnEmptyImport" class="btn">Import Excel / CSV</button>
                <button type="button" id="btnEmptySample" class="btn">Load Sample</button>
              </div>
            </div>

            <div id="rundownTableContainer" class="table-scroll">
              <table class="rundown-table">
                <thead>
                  <tr>
                    <th style="width:84px;">#</th>
                    <th style="min-width:190px;">Cue Title / Session Name</th>
                    <th style="min-width:140px;">Speaker / PIC</th>
                    <th style="width:92px;">Planned</th>
                    <th style="width:112px;">Live / Adj</th>
                    <th style="width:116px;">Start - End</th>
                    <th style="width:116px;">Cue Type</th>
                    <th style="width:110px;">Trigger</th>
                    <th style="width:136px;">Warn (Y / R)</th>
                    <th style="min-width:140px;">Notes</th>
                    <th style="width:104px;text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="rundownTableBody"></tbody>
              </table>
            </div>
          </section>
        </main>

        <!-- Right Sidebar -->
        <aside class="sidebar-column" aria-label="Stage Preview and Speaker Messaging">
          <!-- Mini 16:9 Stage Preview -->
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-heading">Live Stage Preview (16:9)</h2>
              <button type="button" id="btnInlineStagePreview" class="btn btn-sm btn-ghost" title="Open Stage View">
                Full View
              </button>
            </div>
            <div style="padding:12px;">
              <div id="miniStageScreen" class="mini-stage-aspect">
                <div class="mini-top-row">
                  <span id="miniSessionName" style="max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Standby</span>
                  <span id="miniClockText" class="mono">00:00:00</span>
                  <span id="miniElapsedText" class="mono">00:00:00</span>
                </div>
                <div class="mini-center-row">
                  <div id="miniCueTitle" class="mini-cue-title">Opening Remarks</div>
                  <div id="miniCueSpeaker" class="mini-cue-speaker">Event Host</div>
                  <div id="miniHeroTimer" class="mini-hero-digits mono text-normal">05:00</div>
                  <div class="mini-progress-track">
                    <div id="miniProgressFill" class="mini-progress-fill fill-normal" style="width:100%;"></div>
                  </div>
                </div>
                <div id="miniFlashOverlay" class="mini-flash-overlay hidden"></div>
                <div class="mini-bottom-row">
                  <span id="miniUpNextText" style="max-width:74%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Up Next: Standby</span>
                  <span id="miniStatusTag" class="mono">READY</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Speaker Flash Messaging Panel -->
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-heading">Speaker Flash Messaging</h2>
              <label for="flashBlinkToggle" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);">
                <input type="checkbox" id="flashBlinkToggle" />
                <span>Blink Alert</span>
              </label>
            </div>
            <div style="padding:12px;">
              <label for="speakerMessageInput" class="sr-only">Speaker message text</label>
              <input
                type="text"
                id="speakerMessageInput"
                class="input"
                style="width:100%;margin-bottom:8px;"
                placeholder="Enter message to display on stage..."
                aria-label="Speaker message text"
              />
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <button type="button" id="btnSendStageMessage" class="btn btn-contrast">Send to Stage</button>
                <button type="button" id="btnClearStageMessage" class="btn">Clear Message</button>
              </div>
              <div class="preset-msg-grid" role="group" aria-label="Quick speaker message presets">
                <button type="button" class="preset-msg-btn" data-preset-msg="Wrap up in 1 minute">Wrap up in 1 minute</button>
                <button type="button" class="preset-msg-btn" data-preset-msg="Please conclude now">Please conclude now</button>
                <button type="button" class="preset-msg-btn" data-preset-msg="Q&amp;A started">Q&amp;A started</button>
                <button type="button" class="preset-msg-btn" data-preset-msg="Mic check">Mic check</button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}
