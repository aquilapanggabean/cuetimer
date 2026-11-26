import { SHORTCUT_DEFINITIONS } from '../../core/shortcuts';

export function renderModalsHtml(): string {
  const shortcutRowsHtml = SHORTCUT_DEFINITIONS.map((def) => {
    const keysHtml = def.keys
      .map((k) => `<kbd class="kbd-modal">${k}</kbd>`)
      .join('<span class="meta-sep">/</span>');
    return `
      <div class="shortcut-row">
        <div class="shortcut-info">
          <div class="shortcut-label">${def.label}</div>
          <div class="shortcut-desc">${def.description}</div>
        </div>
        <div class="shortcut-keys">${keysHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <!-- Overtime Recovery Modal -->
    <div id="overtimeRecoveryModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="otModalHeading">
      <div class="modal-box">
        <div class="modal-head">
          <h2 id="otModalHeading">Overtime Recovery Engine</h2>
          <button type="button" class="btn btn-icon btn-ghost" data-close-modal="overtimeRecoveryModal" aria-label="Close overtime recovery modal">
            &times;
          </button>
        </div>

        <div class="modal-content">
          <div class="ot-delta-banner">
            <div>
              <div class="ot-delta-label">Overtime Delta</div>
              <div id="otSummaryCaption" class="ot-delta-caption">
                Select a recovery mode for upcoming cues
              </div>
            </div>
            <div id="otDeltaValue" class="mono ot-delta-value">+00:00</div>
          </div>

          <button type="button" id="btnModeRipple" class="recovery-card">
            <span class="recovery-card-title">1. Ripple / Cascade Shift</span>
            <span class="recovery-card-desc">
              Keep subsequent cue durations unchanged and shift all remaining Start/End timestamps forward by the overtime amount.
            </span>
            <span id="otPreviewRipple" class="recovery-card-meta">New Projected End: --:--</span>
          </button>

          <button type="button" id="btnModeTrimNext" class="recovery-card">
            <span class="recovery-card-title">2. Trim Next Cue (Hard End)</span>
            <span class="recovery-card-desc">
              Subtract the overtime delta from the immediate next cue duration (clamped at 0) so the planned event end time stays fixed.
            </span>
            <span id="otPreviewTrimNext" class="recovery-card-meta">Immediate next cue adjustment</span>
          </button>

          <button type="button" id="btnModeBufferProportional" class="recovery-card">
            <span class="recovery-card-title">3. Absorb via Buffer / Proportional Trim</span>
            <span class="recovery-card-desc">
              Deduct overtime first from upcoming Buffer/Break cues, and distribute any remaining overtime proportionally across remaining Main cues.
            </span>
            <span id="otPreviewProportional" class="recovery-card-meta">Buffer and proportional trim breakdown</span>
          </button>
        </div>

        <div class="modal-foot">
          <button type="button" id="btnSkipRecoveryAdvance" class="btn btn-ghost hidden">Advance Without Adjusting</button>
          <button type="button" class="btn" data-close-modal="overtimeRecoveryModal">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Save Rundown Modal -->
    <div id="saveRundownModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="saveRundownHeading">
      <div class="modal-box modal-box-sm">
        <div class="modal-head">
          <h2 id="saveRundownHeading">Save Rundown</h2>
          <button type="button" class="btn btn-icon btn-ghost" data-close-modal="saveRundownModal" aria-label="Close save rundown modal">
            &times;
          </button>
        </div>

        <form id="saveRundownForm">
          <div class="modal-content">
            <p class="modal-lead">Save your current rundown, start time, and cue thresholds locally so you can reload them anytime.</p>
            <label for="saveRundownNameInput" class="field-label">Rundown Name</label>
            <input
              type="text"
              id="saveRundownNameInput"
              class="input"
              style="width:100%;"
              placeholder="e.g., Global Summit Day 1"
              required
            />
            <div id="saveRundownSummary" class="mono saved-meta-summary">5 cues · Start 09:00 · Total 01:05:00</div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" data-close-modal="saveRundownModal">Cancel</button>
            <button type="submit" class="btn btn-emerald">Save Rundown</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Saved Rundowns & Last Used Modal -->
    <div id="savedRundownsModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="savedRundownsHeading">
      <div class="modal-box">
        <div class="modal-head">
          <h2 id="savedRundownsHeading">Saved &amp; Recent Rundowns</h2>
          <button type="button" class="btn btn-icon btn-ghost" data-close-modal="savedRundownsModal" aria-label="Close saved rundowns modal">
            &times;
          </button>
        </div>

        <div class="modal-content">
          <div id="lastUsedRundownCard" class="last-rundown-card hidden">
            <div class="last-rundown-info">
              <div class="ot-delta-label" style="color:var(--accent-emerald);">Last Used / Imported Rundown</div>
              <div id="lastUsedRundownName" class="saved-item-title">Untitled Rundown</div>
              <div id="lastUsedRundownMeta" class="mono saved-item-meta">0 cues · Start 09:00</div>
            </div>
            <button type="button" id="btnModalLoadLastRundown" class="btn btn-sm btn-emerald">Import Last Used</button>
          </div>

          <div class="saved-section-head">
            <span class="field-label" style="margin:0;">Saved Library</span>
            <button type="button" id="btnTriggerSaveFromLibrary" class="btn btn-sm btn-contrast">+ Save Current</button>
          </div>

          <div id="savedRundownsList" class="saved-rundowns-list"></div>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn" data-close-modal="savedRundownsModal">Close</button>
        </div>
      </div>
    </div>

    <!-- Keyboard Shortcuts Reference Modal -->
    <div id="shortcutsModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="shortcutsHeading">
      <div class="modal-box">
        <div class="modal-head">
          <h2 id="shortcutsHeading">Keyboard Shortcuts</h2>
          <button type="button" class="btn btn-icon btn-ghost" data-close-modal="shortcutsModal" aria-label="Close keyboard shortcuts modal">
            &times;
          </button>
        </div>

        <div class="modal-content">
          <p class="modal-lead">Control live playback, cue skipping, and timing adjustments without leaving the keyboard. Disabled automatically while typing inside text fields.</p>
          <div class="shortcuts-grid">
            ${shortcutRowsHtml}
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn btn-contrast" data-close-modal="shortcutsModal">Done</button>
        </div>
      </div>
    </div>

    <!-- Non-blocking Toast Banner -->
    <div id="toastBanner" class="toast-notification hidden" role="status" aria-live="polite">
      <span id="toastMessage"></span>
    </div>
  `;
}
