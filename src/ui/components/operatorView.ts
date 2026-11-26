export function renderOperatorViewHtml(): string {
  return `
    <div id="controllerView" class="controller-shell">
      <header class="top-control-bar">
        <!-- Zone 1: Brand & Event Title -->
        <div class="top-bar-brand">
          <div class="brand-lockup">
            <svg class="brand-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="13" r="8.5" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 8.5V13L15.2 14.8" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M9.5 3H14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <h1 class="app-h1">CueTimer</h1>
          </div>
          <span class="brand-divider" aria-hidden="true">/</span>
          <label for="eventNameInput" class="sr-only">Event Name</label>
          <input
            type="text"
            id="eventNameInput"
            class="event-name-input"
            placeholder="Untitled Event"
            aria-label="Event Name"
          />
        </div>

        <!-- Zone 2: Navigation & File Actions -->
        <nav class="top-toolbar-nav" aria-label="Workspace Views and File Actions">
          <div class="segmented-nav" role="tablist" aria-label="Display Mode">
            <button type="button" id="navModeOperator" class="seg-btn is-active" role="tab" aria-selected="true">Operator</button>
            <button type="button" id="navModeStage" class="seg-btn" role="tab" aria-selected="false">Stage View</button>
            <button type="button" id="navModeOverlay" class="seg-btn" role="tab" aria-selected="false">OBS Overlay</button>
          </div>

          <input type="file" id="spreadsheetFileInput" accept=".xlsx,.xls,.csv" class="hidden" />
          <button type="button" id="btnImportExcel" class="btn btn-sm">Import Sheet</button>
          <button type="button" id="btnDownloadTemplate" class="btn btn-sm">Download Template</button>
          <button type="button" id="btnOpenSavedModal" class="btn btn-sm">Saved Rundowns</button>
          <button type="button" id="btnExportRundown" class="btn btn-sm">Export XLSX</button>
        </nav>

        <!-- Zone 3: Primary CTA & Shortcuts -->
        <div class="top-bar-actions">
          <button type="button" id="btnOpenShortcutsModal" class="btn btn-sm btn-ghost" title="Keyboard Shortcuts (?)">
            <span>Shortcuts</span>
            <kbd class="kbd-hint">?</kbd>
          </button>
          <a
            id="btnLaunchStage"
            href="#/stage"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-contrast"
            title="Open Stage Display in a new window"
          >Pop-out Stage</a>
        </div>
      </header>

      <!-- Schedule & Utility Strip -->
      <div class="schedule-toolbar" aria-label="Event Schedule Summary and Utilities">
        <div class="schedule-strip">
          <label class="schedule-metric" for="eventStartInput">
            <span class="metric-label">Event Start</span>
            <input
              type="time"
              id="eventStartInput"
              class="input input-sm mono time-picker-input"
              aria-label="Event Start Time"
            />
          </label>

          <span class="meta-sep" aria-hidden="true">·</span>

          <div class="schedule-metric">
            <span class="metric-label">Planned End</span>
            <strong id="plannedEndText" class="mono metric-value">09:00</strong>
          </div>

          <span class="meta-sep" aria-hidden="true">·</span>

          <div class="schedule-metric">
            <span class="metric-label">Projected End</span>
            <strong id="projectedEndText" class="mono metric-value">09:00</strong>
          </div>

          <span class="meta-sep" aria-hidden="true">·</span>

          <div id="varianceBadge" class="variance-status is-ontime" role="status" aria-live="polite">
            On Time
          </div>
        </div>

        <div class="utility-strip">
          <span id="syncStatusBadge" class="sync-meta mono" title="Connected stage windows">
            0 stage windows connected
          </span>
          <button type="button" id="btnToggleSoundMute" class="btn btn-sm">
            <span id="muteStatusLabel">Sound: ON</span>
          </button>
          <button type="button" id="btnUndo" class="btn btn-sm btn-ghost" title="Undo (Ctrl+Z)" disabled>Undo</button>
          <button type="button" id="btnRedo" class="btn btn-sm btn-ghost" title="Redo (Ctrl+Y)" disabled>Redo</button>
          <a
            id="btnOpenOverlay"
            href="#/overlay"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-ghost"
            title="Open OBS / vMix Lower-Third Overlay in a new window"
          >Pop-out OBS</a>
        </div>
      </div>

      <div class="workspace-grid">
        <main class="main-column">
          <!-- Master Transport Panel -->
          <section class="panel transport-panel" aria-label="Master Transport and Live Time Adjustment">
            <div class="panel-header">
              <div class="panel-title-group">
                <h2 class="panel-heading">Master Transport</h2>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span id="transportCueCounter" class="mono panel-meta">Cue 1 of 5</span>
              </div>
              <div class="transport-active-meta">
                <span id="transportActiveCueTitle" class="transport-cue-name">Opening Remarks</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span id="transportActiveCueSpeaker" class="panel-meta">Event Host</span>
              </div>
            </div>

            <div class="transport-bar-body">
              <div class="live-timer-card">
                <div class="live-timer-caption">Active Remaining · Click to edit</div>
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
                  <button type="submit" class="btn btn-sm btn-contrast">Set</button>
                  <button type="button" id="btnCancelInlineTimer" class="btn btn-sm">Cancel</button>
                </form>
              </div>

              <div class="transport-buttons-cluster">
                <button type="button" id="btnStartPause" class="btn btn-emerald btn-transport-primary" title="Play or Pause (Space / P)">
                  <span id="labelStartPause">START</span>
                  <kbd class="kbd-hint kbd-on-solid">Space</kbd>
                </button>
                <button type="button" id="btnPrevCue" class="btn btn-transport-secondary" title="Previous Cue (Left Arrow / B)">
                  <span>Prev</span>
                  <kbd class="kbd-hint">B</kbd>
                </button>
                <button type="button" id="btnNextCue" class="btn btn-transport-secondary" title="Skip to Next Cue (Right Arrow / S)">
                  <span>Skip / Next</span>
                  <kbd class="kbd-hint">S</kbd>
                </button>
                <button type="button" id="btnResetCue" class="btn btn-transport-secondary" title="Reset Current Cue (R)">
                  <span>Reset</span>
                  <kbd class="kbd-hint">R</kbd>
                </button>
                <button type="button" id="btnEndEvent" class="btn btn-transport-secondary" title="End Event (E)">
                  <span>End Event</span>
                </button>
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
                  <button type="button" id="btnAdjustMinus" class="btn btn-sm" title="Subtract adjustment step (-)">- Adjust</button>
                  <button type="button" id="btnAdjustPlus" class="btn btn-sm" title="Add adjustment step (+)">+ Adjust</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Overtime Recovery Bar -->
          <div id="overtimeRecoveryBar" class="overtime-recovery-bar hidden" role="alert">
            <div class="overtime-bar-info">
              <strong class="overtime-bar-badge">Overtime Alert</strong>
              <span id="overtimeBarText">Schedule is behind by +00:00</span>
            </div>
            <div class="overtime-bar-actions">
              <button type="button" id="btnOpenOvertimeModal" class="btn btn-sm btn-red">Resolve Overtime</button>
            </div>
          </div>

          <!-- Event Rundown Panel -->
          <section class="panel" aria-label="Cue List Rundown Table">
            <div class="panel-header">
              <div class="panel-title-group">
                <h2 class="panel-heading">Event Rundown</h2>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span id="rundownMetaText" class="mono panel-meta">5 cues · Total 01:05:00</span>
              </div>
              <div class="rundown-toolbar-actions">
                <label for="rundownSearchInput" class="sr-only">Filter cues</label>
                <input
                  type="search"
                  id="rundownSearchInput"
                  class="input input-sm rundown-search-input"
                  placeholder="Filter cues or speakers..."
                  aria-label="Filter cues or speakers"
                />
                <button type="button" id="btnAddCue" class="btn btn-sm btn-contrast">+ Add Cue</button>
                <button type="button" id="btnSaveRundownModal" class="btn btn-sm">Save Rundown</button>
                <button type="button" id="btnLoadLastRundown" class="btn btn-sm" title="Import the last rundown you saved or imported">Load Last</button>
                <button type="button" id="btnRestoreSample" class="btn btn-sm btn-ghost">Sample</button>
                <button type="button" id="btnClearRundown" class="btn btn-sm btn-ghost">Clear</button>
              </div>
            </div>

            <div id="emptyRundownState" class="empty-rundown-box hidden">
              <h3>No Cues in Rundown</h3>
              <p>Add your first cue manually, import an Excel or CSV sheet, download our starter template, or load your last saved rundown.</p>
              <div class="empty-rundown-actions">
                <button type="button" id="btnEmptyAdd" class="btn btn-contrast">+ Add Cue</button>
                <button type="button" id="btnEmptyImport" class="btn">Import Sheet</button>
                <button type="button" id="btnEmptyTemplate" class="btn">Download Template</button>
                <button type="button" id="btnEmptyLoadLast" class="btn hidden">Load Last Rundown</button>
                <button type="button" id="btnEmptySample" class="btn btn-ghost">Load Sample</button>
              </div>
            </div>

            <div id="rundownTableContainer" class="table-scroll">
              <table class="rundown-table">
                <thead>
                  <tr>
                    <th style="width:54px;">#</th>
                    <th style="min-width:120px;">Cue Title</th>
                    <th style="min-width:96px;">Speaker</th>
                    <th style="width:62px;">Planned</th>
                    <th style="width:68px;">Live</th>
                    <th style="width:94px;">Start – End</th>
                    <th style="width:96px;">Type</th>
                    <th style="width:88px;">Trigger</th>
                    <th style="width:110px;">Warn (Y/R)</th>
                    <th style="min-width:76px;">Notes</th>
                    <th style="width:112px;text-align:right;">Actions</th>
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
              <h2 class="panel-heading">Stage Monitor (16:9)</h2>
              <button type="button" id="btnInlineStagePreview" class="btn btn-sm btn-ghost" title="Switch to Full Stage View">
                Expand Stage
              </button>
            </div>
            <div class="panel-body-pad">
              <div id="miniStageScreen" class="mini-stage-aspect">
                <div class="mini-top-row">
                  <span id="miniSessionName" class="mini-truncate">Cue 1 of 5</span>
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
                  <span id="miniUpNextText" class="mini-upnext-truncate">Up Next: Keynote Address</span>
                  <span id="miniStatusTag" class="mono">STANDBY</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Speaker Flash Messaging Panel -->
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-heading">Stage Flash Message</h2>
              <label for="flashBlinkToggle" class="blink-toggle-label">
                <input type="checkbox" id="flashBlinkToggle" />
                <span>Blink Alert</span>
              </label>
            </div>
            <div class="panel-body-pad">
              <label for="speakerMessageInput" class="sr-only">Speaker message text</label>
              <input
                type="text"
                id="speakerMessageInput"
                class="input"
                style="width:100%;margin-bottom:8px;"
                placeholder="Type an urgent note for the speaker..."
                aria-label="Speaker message text"
              />
              <div class="flash-btn-pair">
                <button type="button" id="btnSendStageMessage" class="btn btn-contrast">Send to Stage</button>
                <button type="button" id="btnClearStageMessage" class="btn">Clear</button>
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
