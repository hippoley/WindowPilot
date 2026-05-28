import { useEffect, useState, useRef, useCallback } from 'react'
import BehaviorTreeGraph from './components/BehaviorTree'
import WindowSVG from './components/WindowSVG'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

// ─── 场景数据 ─────────────────────────────────────────────────────────────────
const SCENES = [
  { id: 'storm', icon: '🌧️', name: '暴风雨', event: { rain_detected: true, rain_level: 'storm', wind_speed_ms: 12, wind_level: 6, human_detected: true } },
  { id: 'child', icon: '👶', name: '儿童靠窗', event: { room_type: 'child_room', co2_ppm: 1280, human_detected: true } },
  { id: 'night', icon: '🌙', name: '深夜闷热', event: { time_hour: 2, co2_ppm: 1400, human_detected: true, room_type: 'bedroom' } },
  { id: 'sun', icon: '☀️', name: '午后西晒', event: { lux: 55000, temp_indoor_c: 33, time_hour: 15, orientation: 'W', human_detected: true } },
  { id: 'pet', icon: '🐱', name: '宠物独处', event: { has_pets: true, human_detected: false } },
  { id: 'elderly', icon: '👴', name: '老人防寒', event: { room_type: 'elderly_room', temp_indoor_c: 16, temp_outdoor_c: 2, human_detected: true } },
  { id: 'forecast', icon: '⛈️', name: '暴雨预警', event: { forecast_rain_prob: 0.88, pressure_trend: 'plunging', human_detected: true } },
  { id: 'voc', icon: '💨', name: 'VOC突变', event: { voc_mg: 1.2, human_detected: true } },
]

export default function App() {
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState(0)
  const [tm, setTm] = useState(null)
  const [tree, setTree] = useState(null)
  const [btBranch, setBtBranch] = useState('...')
  const [log, setLog] = useState([])
  const [tab, setTab] = useState('scenes')
  const [lastAction, setLastAction] = useState('')
  const wsRef = useRef(null)

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
      setLastAction(`已发送: ${msg.cmd} ${msg.value ?? msg.key ?? ''}`)
    } else {
      setLastAction('⚠️ WebSocket 未连接')
    }
  }, [])

  // WebSocket 连接 — 最简单直接的方式
  useEffect(() => {
    let disposed = false
    let reconnectTimer

    function connect() {
      if (disposed) return
      const host = window.location.hostname || 'localhost'
      const port = window.location.port || '8001'
      const url = `ws://${host}:${port}/ws`
      console.log('[WS] connecting to', url)
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!disposed) {
          setConnected(true)
          setLastAction('WebSocket 已连接')
          console.log('[WS] connected')
        }
      }
      ws.onclose = () => {
        if (!disposed) {
          setConnected(false)
          setLastAction('WebSocket 断开，2秒后重连...')
          reconnectTimer = setTimeout(connect, 2000)
        }
      }
      ws.onerror = (e) => {
        console.error('[WS] error', e)
        ws.close()
      }
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.type === 'tick') {
            setTick(data.tick)
            setTm(data.thing_model)
            setTree(data.tree)
            setBtBranch(data.bt_branch || '...')
            setLog(data.decision_log || [])
          }
        } catch (e) {
          console.error('[WS] parse error', e)
        }
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [])

  const win = tm?.window || {}
  const act = tm?.actuator || {}
  const scr = tm?.screen || {}
  const sens = tm?.sensors || {}
  const sec = tm?.security || {}

  const applyScene = (scene) => {
    send({ cmd: 'reset' })
    setTimeout(() => {
      Object.entries(scene.event).forEach(([k, v]) => send({ cmd: 'set_sensor', key: k, value: v }))
    }, 100)
    setLastAction(`场景注入: ${scene.name}`)
  }

  return (
    <div className="app-layout">
      {/* ═══ Left Panel ═══ */}
      <aside className="left-panel">
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
            <span className={`conn-badge ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● 已连接' : '○ 断开'}
            </span>
          </div>
          {/* 实时数据指示器 */}
          <div style={{ fontSize: 11, color: '#A89070', textAlign: 'center', marginTop: 8 }}>
            Tick #{tick} | CO₂: {sens.co2_ppm ?? '-'} | 温度: {sens.temp_indoor ?? '-'}°C
            {sens.rain && <span style={{ color: '#6BB8E0' }}> | 🌧️ 降雨</span>}
          </div>
          {lastAction && (
            <div style={{ fontSize: 11, color: '#7EC8A0', textAlign: 'center', marginTop: 4, opacity: 0.8 }}>
              {lastAction}
            </div>
          )}
          {sec.alarm && <div className="alarm-badge">🚨 安防报警</div>}
        </section>

        <section className="control-section">
          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'scenes' ? 'active' : ''}`} onClick={() => setTab('scenes')}>场景注入</button>
            <button className={`tab-btn ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>人工干预</button>
          </div>

          {tab === 'scenes' && (
            <div className="scene-grid">
              {SCENES.map(s => (
                <button key={s.id} className="scene-btn" onClick={() => applyScene(s)}>
                  <span className="scene-icon">{s.icon}</span>
                  <span className="scene-name">{s.name}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'manual' && (
            <div className="ctrl-btn-group">
              <button className="ctrl-btn" onClick={() => send({ cmd: 'user_open_to', value: 50 })}>开50%</button>
              <button className="ctrl-btn" onClick={() => send({ cmd: 'user_open_to', value: 100 })}>全开</button>
              <button className="ctrl-btn" onClick={() => send({ cmd: 'user_stop' })}>停止</button>
              <button className="ctrl-btn" onClick={() => send({ cmd: 'user_open_to', value: 0 })}>关窗</button>
              <button className="ctrl-btn" onClick={() => send({ cmd: 'arm_security' })}>布防</button>
              <button className="ctrl-btn" onClick={() => send({ cmd: 'disarm_security' })}>撤防</button>
            </div>
          )}
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
        {log.length > 0 && (
          <div className="decision-card">
            <div className="decision-title">决策解释</div>
            <div className="decision-branch">当前分支: {btBranch}</div>
            <div className="decision-reason">原因: {log[0]?.branch} → {log[0]?.action}</div>
          </div>
        )}
      </main>
    </div>
  )
}
