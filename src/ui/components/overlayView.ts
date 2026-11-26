export function renderOverlayViewHtml(): string {
  return `
    <div id="overlayView" class="overlay-display-shell" aria-label="Broadcast Transparent Overlay">
      <div class="overlay-top-nav">
        <button type="button" id="btnBackToController" class="btn btn-sm" aria-label="Back to Operator Console">
          Back to Operator
        </button>
      </div>
      <div id="overlayBox" class="overlay-lower-third">
        <div class="overlay-info-col">
          <div id="overlayCueTitle" class="overlay-cue-title">
            Opening Remarks
          </div>
          <div id="overlayCueSpeaker" class="overlay-cue-speaker">
            Event Host
          </div>
        </div>

        <div class="overlay-timer-col">
          <span id="overlayStatusBadge" class="overlay-status-text mono">LIVE</span>
          <div id="overlayTimer" class="mono text-normal overlay-timer-digits">
            05:00
          </div>
        </div>
      </div>
    </div>
  `;
}
