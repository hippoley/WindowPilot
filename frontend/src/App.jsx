import { useEffect } from 'react'
import { useStore } from './store'
import { connectWebSocket, disconnectWebSocket } from './services/websocket'
import ErrorBoundary from './components/ErrorBoundary'
import WindowSVG from './components/WindowSVG'
import BehaviorTreeGraph from './components/BehaviorTree'
import ControlTabs from './components/ControlTabs'
import DecisionPanel from './components/DecisionPanel'
import ConnectionBadge from './components/ConnectionBadge'
import './App.css'

// ─── Selectors (stable references — MUST return same reference when data is absent) ─
const EMPTY = {}
const selectWindow = (s) => s.thingModel?.window ?? EMPTY
const selectActuator = (s) => s.thingModel?.actuator ?? EMPTY
const selectScreen = (s) => s.thingModel?.screen ?? EMPTY
const selectSensors = (s) => s.thingModel?.sensors ?? EMPTY
const selectSecurity = (s) => s.thingModel?.security ?? EMPTY
const selectTree = (s) => s.tree

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  // Connect WebSocket on mount, disconnect on unmount
  useEffect(() => {
    connectWebSocket()
    return () => disconnectWebSocket()
  }, [])

  const win = useStore(selectWindow)
  const act = useStore(selectActuator)
  const scr = useStore(selectScreen)
  const sens = useStore(selectSensors)
  const sec = useStore(selectSecurity)
  const tree = useStore(selectTree)

  return (
    <div className="app-layout">
      {/* ═══ Left Panel ═══ */}
      <aside className="left-panel">
        {/* 左上：窗户可视化 */}
        <section className="window-viz">
          <WindowSVG
            openPct={win.open_pct || 0}
            screenPct={scr.position_pct || 0}
            state={win.state || 'closed'}
            motion={win.motion || 'stopped'}
            actuatorState={act.state || 'idle'}
            rain={!!sens.rain}
            wind={sens.wind_speed || 0}
            alarm={!!sec.alarm}
          />
          <div className="window-status">
            <span className="window-pct">{Math.round(win.open_pct || 0)}%</span>
            <span className="window-state">{win.state || 'closed'}</span>
            <ConnectionBadge />
          </div>
          {sec.alarm && <div className="alarm-badge">🚨 安防报警</div>}
        </section>

        {/* 左下：控制面板 */}
        <section className="control-section">
          <ControlTabs />
        </section>
      </aside>

      {/* ═══ Right Panel ═══ */}
      <main className="right-panel">
        <ErrorBoundary>
          <div className="bt-container">
            {tree
              ? <BehaviorTreeGraph node={tree} />
              : <div className="bt-placeholder">等待行为树数据...</div>
            }
          </div>
        </ErrorBoundary>
        <DecisionPanel />
      </main>
    </div>
  )
}
