import { useStoreShallow } from '../store'

// Selectors (returns object → use shallow comparison)
const selectDecision = (s) => ({
  btBranch: s.btBranch,
  log: s.decisionLog,
})

export default function DecisionPanel() {
  const { btBranch, log } = useStoreShallow(selectDecision)

  return (
    <div className="decision-panel">
      {log.length > 0 && (
        <div className="decision-card">
          <div className="decision-title">决策解释</div>
          <div className="decision-branch">当前分支: {btBranch}</div>
          <div className="decision-reason">
            原因: {log[0]?.branch} → {log[0]?.action}
          </div>
        </div>
      )}
      <div className="timeline">
        <div className="timeline-title">EVENT TIMELINE</div>
        {log.length === 0 && (
          <div className="timeline-empty">暂无事件...</div>
        )}
        {log.slice(0, 5).map((e, i) => (
          <div key={i} className="timeline-item">
            <div className="timeline-dot" />
            <div className="timeline-content">
              <div className="timeline-tick">#{e.tick} {e.branch}</div>
              <div className="timeline-action">{e.action}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
