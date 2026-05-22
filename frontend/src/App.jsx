import { useState, useEffect, useRef, useCallback } from 'react'
import BehaviorTreeGraph from './components/BehaviorTree'
import WindowSVG from './components/WindowSVG'
import './App.css'

const WS_URL = 'ws://' + (window.location.hostname || 'localhost') + ':8001/ws'

const SCENES = [
  { id: 'storm', icon: '\u{1F327}\uFE0F', name: '暴风雨', data: { rain_detected: true, rain_level: 'storm', wind_speed_ms: 12, wind_level: 6, human_detected: true } },
  { id: 'west_sun', icon: '\u2600\uFE0F', name: '午后西晒', data: { lux: 50000, temp_indoor_c: 32, orientation: 'W', time_hour: 15, human_detected: true } },
  { id: 'night_co2', icon: '\u{1F319}', name: '深夜卧室', data: { time_hour: 2, co2_ppm: 1350, humidity_pct: 62, human_detected: true, room_type: 'bedroom' } },
  { id: 'child', icon: '\u{1F476}', name: '儿童房', data: { room_type: 'child_room', co2_ppm: 1280, human_detected: true } },
  { id: 'elderly', icon: '\u{1F474}', name: '老人防寒', data: { room_type: 'elderly_room', temp_indoor_c: 16.8, temp_outdoor_c: 3, human_detected: true } },
  { id: 'study', icon: '\u{1F4D6}', name: '书房会议', data: { room_type: 'study', noise_db: 68, human_detected: true } },
  { id: 'pet', icon: '\u{1F431}', name: '宠物在家', data: { has_pets: true, human_detected: false } },
  { id: 'forecast', icon: '\u26C8\uFE0F', name: '暴雨预警', data: { forecast_rain_prob: 0.85, pressure_trend: 'plunging', human_detected: true } },
]

export default function App() {
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState({ tick: 0, tm: null, tree: null, semantic: { tags: [] }, btBranch: '...', log: [], aiStatus: 'idle', agents: {} })
  const wsRef = useRef(null)
  const rafRef = useRef(null)
  const pendingRef = useRef(null)

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg))
  }, [])

  const applyScene = useCallback((scene) => {
    send({ cmd: 'reset' })
    setTimeout(() => {
      Object.entries(scene.data).forEach(([key, value]) => {
        send({ cmd: 'set_sensor', key, value })
      })
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
            pendingRef.current = { tick: data.tick, tm: data.thing_model, tree: data.tree, semantic: data.semantic || { tags: [] }, btBranch: data.bt_branch || '...', log: data.decision_log || [], aiStatus: data.ai_status || 'idle', agents: data.agents_status || {} }
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

  const { tick, tm, tree, semantic, btBranch, log, aiStatus, agents } = state
  const win = tm?.window || {}, act = tm?.actuator || {}, scr = tm?.screen || {}, sens = tm?.sensors || {}
  const sec = tm?.security || {}

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', height: '100vh', background: '#100C06', color: '#F5ECD7', fontFamily: 'Inter,sans-serif', fontSize: 12 }}>
      {/* ═══ Left Panel ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, overflowY: 'auto', borderRight: '1px solid rgba(212,165,116,0.15)' }}>
        {/* Window SVG */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <WindowSVG openPct={win.open_pct || 0} screenPct={scr.position_pct || 0} state={win.state || 'closed'} motion={win.motion || 'stopped'} actuatorState={act.state || 'idle'} rain={!!sens.rain} wind={sens.wind_speed || 0} alarm={!!sec.alarm} />
        </div>
        {/* Status line */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#A89070' }}>
          <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#D4A574' }}>{Math.round(win.open_pct || 0)}%</span>
          {' '} {win.state || 'closed'} | {act.state || 'idle'}
          <span style={{ marginLeft: 8, fontSize: 9, color: connected ? '#7EC8A0' : '#E07070' }}>{connected ? '\u25CF' : '\u25CB'}</span>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn label="开50%" onClick={() => send({ cmd: 'user_open_to', value: 50 })} />
          <Btn label="全开" onClick={() => send({ cmd: 'user_open_to', value: 100 })} />
          <Btn label="停止" onClick={() => send({ cmd: 'user_stop' })} color="#E8B86D" />
          <Btn label="关窗" onClick={() => send({ cmd: 'user_open_to', value: 0 })} />
          <Btn label="\uD83D\uDD12 布防" onClick={() => send({ cmd: 'security_arm' })} />
          <Btn label="\uD83D\uDD13 撤防" onClick={() => send({ cmd: 'security_disarm' })} />
        </div>
        {/* Scene Cards */}
        <SectionTitle text="场景卡片" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {SCENES.map(s => (
            <button key={s.id} onClick={() => applyScene(s)} style={{ padding: '10px 4px', background: 'rgba(212,165,116,0.06)', border: '1px solid rgba(212,165,116,0.2)', borderRadius: 8, color: '#D4A574', cursor: 'pointer', textAlign: 'center', fontSize: 10 }}>
              <div style={{ fontSize: 20 }}>{s.icon}</div>
              <div style={{ marginTop: 2 }}>{s.name}</div>
            </button>
          ))}
        </div>
        {/* Quick Adjust */}
        <SectionTitle text="快速调节" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          <MiniSlider label="CO\u2082" value={sens.co2_ppm || 400} min={300} max={2500} step={10} unit="ppm" onChange={v => send({ cmd: 'set_sensor', key: 'co2_ppm', value: v })} />
          <MiniSlider label="温度" value={sens.temp_indoor || 26} min={10} max={42} step={0.5} unit="\u00B0C" onChange={v => send({ cmd: 'set_sensor', key: 'temp_indoor_c', value: v })} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#A89070', marginBottom: 4 }}>降雨</div>
            <button role="switch" aria-checked={!!sens.rain} aria-label="降雨开关" onClick={() => send({ cmd: 'set_sensor', key: 'rain_detected', value: !sens.rain })} style={{ width: 36, height: 18, borderRadius: 9, background: sens.rain ? '#E07070' : '#2a1a0a', border: '1px solid rgba(212,165,116,0.2)', cursor: 'pointer', position: 'relative', padding: 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: '#F5ECD7', position: 'absolute', top: 1, left: sens.rain ? 19 : 1, transition: 'left 0.2s' }} />
            </button>
          </div>
          <MiniSlider label="风速" value={sens.wind_speed || 0} min={0} max={20} step={0.5} unit="m/s" onChange={v => send({ cmd: 'set_sensor', key: 'wind_speed_ms', value: v })} />
        </div>
      </div>

      {/* ═══ Right Panel ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: 12, overflowY: 'auto', gap: 8 }}>
        {/* Semantic tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {(semantic.tags || []).map(tag => (
            <span key={tag} style={{ padding: '2px 5px', borderRadius: 4, fontSize: 8, fontFamily: 'monospace', fontWeight: 600, background: tag.includes('HIGH') || tag.includes('STORM') ? 'rgba(224,112,112,0.15)' : 'rgba(212,165,116,0.1)', color: tag.includes('HIGH') || tag.includes('STORM') ? '#E07070' : '#D4A574', border: '1px solid rgba(212,165,116,0.2)' }}>{tag}</span>
          ))}
          {semantic.tags?.length === 0 && <span style={{ fontSize: 9, color: '#5C4A35' }}>等待语义标签...</span>}
        </div>
        {/* BT branch label */}
        <div style={{ padding: '3px 8px', background: 'rgba(212,165,116,0.1)', borderRadius: 4, fontSize: 9, fontWeight: 600, color: '#D4A574', alignSelf: 'flex-start' }}>{btBranch}</div>
        {/* BehaviorTree Graph */}
        <div style={{ flex: 1, minHeight: 280, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(212,165,116,0.15)' }}>
          {tree ? <BehaviorTreeGraph node={tree} /> : <div style={{ padding: 20, color: '#5C4A35' }}>等待行为树数据...</div>}
        </div>
        {/* Decision log */}
        {log.length > 0 && (
          <div>
            <SectionTitle text="决策日志" />
            {log.slice(0, 5).map((e, i) => (
              <div key={i} style={{ fontSize: 9, fontFamily: 'monospace', padding: '2px 0', borderBottom: '1px solid rgba(212,165,116,0.08)', color: '#A89070' }}>#{e.tick} <span style={{ color: '#D4A574' }}>{e.branch}</span> {e.action}</div>
            ))}
          </div>
        )}
        {/* Agent status */}
        {Object.keys(agents).length > 0 && (
          <div>
            <SectionTitle text="Agent 状态" />
            {Object.entries(agents).map(([name, info]) => (
              <div key={name} style={{ fontSize: 9, fontFamily: 'monospace', padding: '2px 0', borderBottom: '1px solid rgba(212,165,116,0.08)', color: '#A89070', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#D4A574' }}>{name}</span>
                <span>{info.status || 'ok'} \u00B7 {Math.round(info.avg_tick_ms || 0)}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ Sub-components ═══
function SectionTitle({ text }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', margin: '6px 0 4px', textTransform: 'uppercase' }}>{text}</div>
}

function Btn({ label, onClick, color }) {
  return <button onClick={onClick} style={{ padding: '6px 12px', background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.25)', borderRadius: 6, color: color || '#D4A574', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
}

function MiniSlider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#A89070', marginBottom: 2 }}>{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label + ' ' + value + unit} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', height: 3, accentColor: '#D4A574', cursor: 'pointer' }} />
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#F5ECD7', textAlign: 'center' }}>{step < 1 ? Number(value).toFixed(1) : Math.round(value)}{unit}</div>
    </div>
  )
}
