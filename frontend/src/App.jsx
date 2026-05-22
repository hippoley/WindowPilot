import { useState, useEffect, useRef, useCallback } from 'react'
import BehaviorTreeGraph from './components/BehaviorTree'
import WindowSVG from './components/WindowSVG'
import './App.css'

const WS_URL = 'ws://' + (window.location.hostname || 'localhost') + ':8001/ws'

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
  const [state, setState] = useState({ tick: 0, tm: null, tree: null, btBranch: '...', log: [] })
  const [tab, setTab] = useState('scenes')
  const [jsonText, setJsonText] = useState('{}')
  const wsRef = useRef(null)
  const rafRef = useRef(null)
  const pendingRef = useRef(null)

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg))
  }, [])

  const applyScene = useCallback((scene) => {
    send({ cmd: 'reset' })
    setTimeout(() => {
      Object.entries(scene.event).forEach(([k, v]) => send({ cmd: 'set_sensor', key: k, value: v }))
    }, 100)
  }, [send])

  useEffect(() => {
    let reconnectTimer, disposed = false
    function connect() {
      if (disposed) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen = () => { if (!disposed) setConnected(true) }
      ws.onclose = () => { if (!disposed) { setConnected(false); reconnectTimer = setTimeout(connect, 2000) } }
      ws.onerror = () => ws.close()
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.type === 'tick') {
            pendingRef.current = { tick: data.tick, tm: data.thing_model, tree: data.tree, btBranch: data.bt_branch || '...', log: data.decision_log || [] }
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => { rafRef.current = null; if (pendingRef.current) { setState(pendingRef.current); pendingRef.current = null } })
            }
          }
        } catch (e) { console.error('[WS] parse error:', e) }
      }
    }
    connect()
    return () => { disposed = true; clearTimeout(reconnectTimer); if (rafRef.current) cancelAnimationFrame(rafRef.current); wsRef.current?.close() }
  }, [])

  const { tm, tree, btBranch, log } = state
  const win = tm?.window || {}, act = tm?.actuator || {}, scr = tm?.screen || {}, sens = tm?.sensors || {}
  const sec = tm?.security || {}

  const switchTab = (t) => {
    if (t === 'json') setJsonText(JSON.stringify(sens, null, 2))
    setTab(t)
  }

  const injectJson = () => {
    try {
      const obj = JSON.parse(jsonText)
      Object.entries(obj).forEach(([k, v]) => send({ cmd: 'set_sensor', key: k, value: v }))
    } catch (e) { alert('JSON 解析失败') }
  }

  const tabStyle = (t) => ({ padding: '4px 10px', fontSize: 10, fontWeight: tab === t ? 700 : 400, background: tab === t ? 'rgba(212,165,116,0.15)' : 'transparent', border: '1px solid rgba(212,165,116,0.2)', borderRadius: 4, color: '#D4A574', cursor: 'pointer' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', height: '100vh', background: '#0A0806', color: '#F5ECD7', fontFamily: 'Inter,sans-serif', fontSize: 12 }}>
      {/* ═══ Left Panel ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, overflowY: 'auto', borderRight: '1px solid rgba(212,165,116,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', height: 180 }}>
          <WindowSVG openPct={win.open_pct || 0} screenPct={scr.position_pct || 0} state={win.state || 'closed'} motion={win.motion || 'stopped'} actuatorState={act.state || 'idle'} rain={!!sens.rain} wind={sens.wind_speed || 0} alarm={!!sec.alarm} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#A89070' }}>
          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: '#D4A574' }}>{Math.round(win.open_pct || 0)}%</span>
          {' '}{win.state || 'closed'} | {act.state || 'idle'}
          <span style={{ marginLeft: 8, fontSize: 9, color: connected ? '#7EC8A0' : '#E07070' }}>{connected ? '●' : '○'}</span>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={tabStyle('scenes')} onClick={() => switchTab('scenes')}>场景注入</button>
          <button style={tabStyle('json')} onClick={() => switchTab('json')}>JSON编辑</button>
          <button style={tabStyle('manual')} onClick={() => switchTab('manual')}>人工干预</button>
        </div>
        {/* Tab content */}
        {tab === 'scenes' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {SCENES.map(s => (
              <button key={s.id} onClick={() => applyScene(s)} style={{ padding: '10px 4px', background: 'rgba(212,165,116,0.06)', border: '1px solid rgba(212,165,116,0.2)', borderRadius: 8, color: '#D4A574', cursor: 'pointer', textAlign: 'center', fontSize: 10 }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={{ marginTop: 2 }}>{s.name}</div>
              </button>
            ))}
          </div>
        )}
        {tab === 'json' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} style={{ width: '100%', height: 180, background: '#1a1408', border: '1px solid rgba(212,165,116,0.2)', borderRadius: 6, color: '#F5ECD7', fontFamily: 'monospace', fontSize: 10, padding: 8, resize: 'vertical' }} />
            <button onClick={injectJson} style={{ alignSelf: 'flex-start', padding: '6px 16px', background: 'rgba(212,165,116,0.15)', border: '1px solid rgba(212,165,116,0.3)', borderRadius: 6, color: '#D4A574', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>注入</button>
          </div>
        )}
        {tab === 'manual' && (
          <div style={{ opacity: 0.6 }}>
            <div style={{ fontSize: 9, color: '#5C4A35', marginBottom: 6 }}>⚠️ 人工干预（调试用）</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn label="开50%" onClick={() => send({ cmd: 'user_open_to', value: 50 })} />
              <Btn label="全开" onClick={() => send({ cmd: 'user_open_to', value: 100 })} />
              <Btn label="停止" onClick={() => send({ cmd: 'user_stop' })} />
              <Btn label="关窗" onClick={() => send({ cmd: 'user_open_to', value: 0 })} />
              <Btn label="布防" onClick={() => send({ cmd: 'arm_security' })} />
              <Btn label="撤防" onClick={() => send({ cmd: 'disarm_security' })} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ Right Panel ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: 12, overflowY: 'auto', gap: 8 }}>
        <div style={{ flex: 1, minHeight: 280, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(212,165,116,0.15)' }}>
          {tree ? <BehaviorTreeGraph node={tree} /> : <div style={{ padding: 20, color: '#5C4A35' }}>等待行为树数据...</div>}
        </div>
        {log.length > 0 && (
          <div style={{ padding: 8, background: 'rgba(212,165,116,0.05)', borderRadius: 6, border: '1px solid rgba(212,165,116,0.12)' }}>
            <div style={{ fontWeight: 700, fontSize: 10, color: '#D4A574', marginBottom: 4 }}>决策解释</div>
            <div style={{ fontSize: 10, color: '#F5ECD7' }}>当前分支: {btBranch}</div>
            <div style={{ fontSize: 10, color: '#A89070' }}>原因: {log[0]?.branch} → {log[0]?.action}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#5C4A35', marginBottom: 4 }}>EVENT TIMELINE</div>
          {log.slice(0, 5).map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: '#D4A574', marginTop: 4 }} />
              <div>
                <div style={{ fontSize: 10, color: '#D4A574' }}>#{e.tick} {e.branch}</div>
                <div style={{ fontSize: 9, color: '#A89070' }}>{e.action}</div>
              </div>
            </div>
          ))}
          {log.length === 0 && <div style={{ fontSize: 9, color: '#5C4A35' }}>暂无事件...</div>}
        </div>
      </div>
    </div>
  )
}

function Btn({ label, onClick }) {
  return <button onClick={onClick} style={{ padding: '6px 12px', background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.25)', borderRadius: 6, color: '#D4A574', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
}
