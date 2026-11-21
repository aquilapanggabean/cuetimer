export function renderOverlayViewHtml(): string {
  return `
    <div id="overlayView" class="overlay-display-shell" aria-label="Broadcast Transparent Overlay">
      <div id="overlayBox" class="overlay-lower-third">
        <div style="display:flex;flex-direction:column;gap:2px;max-width:380px;">
          <div id="overlayCueTitle" style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            Opening Remarks
          </div>
          <div id="overlayCueSpeaker" style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            Event Host
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;">
          <span id="overlayStatusBadge" class="tag mono" style="font-size:11px;">LIVE</span>
          <div id="overlayTimer" class="mono text-normal" style="font-size:28px;font-weight:700;letter-spacing:-0.02em;">
            05:00
          </div>
        </div>
      </div>
    </div>
  `;
}
