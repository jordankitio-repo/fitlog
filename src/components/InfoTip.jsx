// Small inline "i" affordance that reveals a plain-language explanation on
// hover (desktop) or tap/focus (touch). Reuses the styled-tooltip look from the
// Groundwork tiles. Tip strings live in utils/consistencyTips.js.
export default function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      <span className="info-tip-mark" aria-hidden="true">i</span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  )
}
