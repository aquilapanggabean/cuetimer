export function renderModalsHtml(): string {
  return `
    <!-- Overtime Recovery Modal -->
    <div id="overtimeRecoveryModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="otModalHeading">
      <div class="modal-box">
        <div class="modal-head">
          <h2 id="otModalHeading">Overtime Recovery Engine</h2>
          <button type="button" class="btn btn-icon btn-ghost" data-close-modal="overtimeRecoveryModal" aria-label="Close modal">
            &times;
          </button>
        </div>

        <div class="modal-content">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--alert-red-tint);border:1px solid rgba(239,68,68,0.5);border-radius:6px;">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#FCA5A5;">Overtime Delta</div>
              <div id="otSummaryCaption" style="font-size:13px;color:var(--text-primary);margin-top:2px;">
                Select a recovery mode for upcoming cues
              </div>
            </div>
            <div id="otDeltaValue" class="mono" style="font-size:22px;font-weight:500;color:var(--alert-red);">+00:00</div>
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

    <!-- Non-blocking Toast Banner -->
    <div id="toastBanner" class="toast-notification hidden" role="status" aria-live="polite">
      <span id="toastMessage"></span>
    </div>
  `;
}
