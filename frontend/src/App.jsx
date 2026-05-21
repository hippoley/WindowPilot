import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// 自动检测主机名（解决远程访问问题）
const WS_URL = `ws://${window.location.hostname || 'localhost'}:8001/ws`

export default function App() {
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState(0)
  const [tm, setTm] = useState(null)
  const [tree, setTree] = useState(null)
  const [semantic, setSemantic] = useState({ tags: [] })
  const [btBranch, setBtBranch] = useState('...')
  const [log, setLog] = useState([])
  const wsRef = useRef(null)

  const send = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    let ws
    let reconnectTimer
    function connect() {
      ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); reconnectTimer = setTimeout(connect, 2000) }
      ws.onerror = () => ws.close()
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.type === 'tick') {
            setTick(data.tick)
            setTm(data.thing_model)
            setTree(data.tree)
            setSemantic(data.semantic || { tags: [] })
            setBtBranch(data.bt_branch || '...')
            setLog(data.decision_log || [])
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e)
        }
      }
    }
    connect()
    return () => { clearTimeout(reconnectTimer); if (ws) ws.close() }
  }, [])

  // 从 thing_model 提取数据
  const win = tm?.window || {}
  const act = tm?.actuator || {}
  const scr = tm?.screen || {}
  const sens = tm?.sensors || {}
  const cfg = tm?.config || {}
  const card = tm?.ai?.card || null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', height: '100vh', background: '#100C06', color: '#F5ECD7', fontFamily: 'Inter,sans-serif', fontSize: 12 }}>

      {/* ═══ 左栏：传感器控制 ═══ */}
      <div style={{ borderRight: '1px solid rgba(212,165,116,0.15)', padding: 12, overflowY: 'auto' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', marginBottom: 8 }}>传感器控制</div>

        <Slider label="CO₂" value={sens.co2_ppm || 400} min={300} max={2500} step={10} unit="ppm"
          onChange={v => send({ cmd: 'set_sensor', key: 'co2_ppm', value: v })} />
        <Slider label="室内温度" value={sens.temp_indoor || 26} min={10} max={42} step={0.5} unit="°C"
          onChange={v => send({ cmd: 'set_sensor', key: 'temp_indoor_c', value: v })} />
        <Slider label="湿度" value={sens.humidity || 50} min={10} max={100} step={1} unit="%"
          onChange={v => send({ cmd: 'set_sensor', key: 'humidity_pct', value: v })} />
        <Slider label="风速" value={sens.wind_speed || 0} min={0} max={20} step={0.5} unit="m/s"
          onChange={v => send({ cmd: 'set_sensor', key: 'wind_speed_ms', value: v })} />
        <Slider label="VOC" value={sens.voc_mg || 0} min={0} max={2} step={0.05} unit="mg"
          onChange={v => send({ cmd: 'set_sensor', key: 'voc_mg', value: v })} />

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', margin: '12px 0 6px' }}>安全开关</div>
        <Toggle label="降雨" active={sens.rain} onClick={() => send({ cmd: 'set_sensor', key: 'rain_detected', value: !sens.rain })} />
        <Toggle label="人体检测" active={sens.human} onClick={() => send({ cmd: 'set_sensor', key: 'human_detected', value: !sens.human })} />

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', margin: '12px 0 6px' }}>场景</div>
        {['bedroom_ventilation', 'child_room', 'storm_emergency', 'elderly_cold', 'study_meeting'].map(id => (
          <button key={id} onClick={() => send({ cmd: 'load_scenario', value: id })}
            style={{ display: 'block', width: '100%', marginBottom: 4, padding: '6px 8px', background: 'rgba(212,165,116,0.08)', border: '1px solid rgba(212,165,116,0.2)', borderRadius: 6, color: '#A89070', fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>
            {id}
          </button>
        ))}
        <button onClick={() => send({ cmd: 'reset' })} style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(224,112,112,0.1)', border: '1px solid rgba(224,112,112,0.3)', borderRadius: 6, color: '#E07070', fontSize: 10, cursor: 'pointer', width: '100%' }}>
          ↺ 重置
        </button>
      </div>

      {/* ═══ 中栏：窗户状态 ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
        <div style={{ fontSize: 9, color: '#5C4A35' }}>{connected ? '● 已连接' : '○ 连接中...'} · Tick #{tick}</div>

        {/* 窗户开度大数字 */}
        <div style={{ fontSize: 64, fontWeight: 800, fontFamily: 'monospace', color: '#D4A574' }}>
          {Math.round(win.open_pct || 0)}%
        </div>
        <div style={{ fontSize: 11, color: '#A89070' }}>
          窗户 {win.state || 'closed'} · 纱窗 {Math.round(scr.position_pct || 0)}%
        </div>

        {/* 推窗器状态 */}
        <div style={{ fontSize: 10, color: '#5C4A35', fontFamily: 'monospace' }}>
          推窗器: {act.state || 'idle'} | 行程 {Math.round(act.stroke_mm || 0)}mm | 电流 {Math.round(act.current_ma || 120)}mA
        </div>

        {/* 手动控制 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn label="开窗50%" onClick={() => send({ cmd: 'user_open_to', value: 50 })} />
          <Btn label="开窗100%" onClick={() => send({ cmd: 'user_open_to', value: 100 })} />
          <Btn label="停止" onClick={() => send({ cmd: 'user_stop' })} />
          <Btn label="关窗" onClick={() => send({ cmd: 'user_open_to', value: 0 })} />
        </div>

        {/* 推荐卡片 */}
        {card && (
          <div style={{ marginTop: 16, padding: 14, background: 'rgba(212,165,116,0.08)', border: '1px solid rgba(212,165,116,0.25)', borderRadius: 12, maxWidth: 360, width: '100%' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{card.title}</div>
            <div style={{ fontSize: 11, color: '#A89070', marginBottom: 8 }}>{card.reason}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => send({ cmd: 'accept_recommendation' })} style={{ flex: 1, padding: '8px 12px', background: '#D4A574', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>✓ 确认</button>
              <button onClick={() => send({ cmd: 'reject_recommendation' })} style={{ flex: 1, padding: '8px 12px', background: 'transparent', border: '1px solid rgba(224,112,112,0.4)', borderRadius: 8, color: '#E07070', cursor: 'pointer' }}>✕ 拒绝</button>
            </div>
          </div>
        )}

        {/* 当前分支 */}
        <div style={{ marginTop: 12, padding: '4px 10px', background: 'rgba(212,165,116,0.1)', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#D4A574' }}>
          {btBranch}
        </div>
      </div>

      {/* ═══ 右栏：行为树 + 语义 ═══ */}
      <div style={{ borderLeft: '1px solid rgba(212,165,116,0.15)', padding: 12, overflowY: 'auto' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', marginBottom: 8 }}>语义状态</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 12 }}>
          {(semantic.tags || []).map(tag => (
            <span key={tag} style={{ padding: '2px 5px', borderRadius: 4, fontSize: 8, fontFamily: 'monospace', fontWeight: 600, background: tag.includes('HIGH') || tag.includes('STORM') ? 'rgba(224,112,112,0.15)' : 'rgba(212,165,116,0.1)', color: tag.includes('HIGH') || tag.includes('STORM') ? '#E07070' : '#D4A574', border: '1px solid rgba(212,165,116,0.2)' }}>
              {tag}
            </span>
          ))}
        </div>

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', marginBottom: 6 }}>行为树</div>
        {tree ? <TreeNode node={tree} depth={0} /> : <div style={{ color: '#5C4A35' }}>等待数据...</div>}

        {log.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', margin: '12px 0 6px' }}>决策日志</div>
            {log.slice(0, 5).map((e, i) => (
              <div key={i} style={{ fontSize: 9, fontFamily: 'monospace', padding: '3px 0', borderBottom: '1px solid rgba(212,165,116,0.08)', color: '#A89070' }}>
                #{e.tick} <span style={{ color: '#D4A574' }}>{e.branch}</span> {e.action}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ═══ 子组件 ═══

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: '#A89070' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#F5ECD7' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 3, accentColor: '#D4A574', cursor: 'pointer' }} />
    </div>
  )
}

function Toggle({ label, active, onClick }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#A89070' }}>{label}</span>
      <div onClick={onClick} style={{ width: 32, height: 16, borderRadius: 8, background: active ? '#E07070' : '#2a1a0a', border: '1px solid rgba(212,165,116,0.2)', cursor: 'pointer', position: 'relative' }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#F5ECD7', position: 'absolute', top: 1, left: active ? 17 : 1, transition: 'left 0.2s' }} />
      </div>
    </div>
  )
}

function Btn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 12px', background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.25)', borderRadius: 6, color: '#D4A574', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
      {label}
    </button>
  )
}

function TreeNode({ node, depth }) {
  const s = node.status || 'invalid'
  const color = s === 'success' ? '#7EC8A0' : s === 'failure' ? '#5C4A35' : s === 'running' ? '#E8B86D' : '#3a2a1a'
  const dot = s === 'success' ? '●' : s === 'failure' ? '○' : s === 'running' ? '◉' : '·'
  return (
    <div>
      <div style={{ marginLeft: depth * 12, fontSize: 10, fontFamily: 'monospace', color, padding: '1px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{dot}</span>
        <span>{node.name}</span>
      </div>
      {node.children && node.children.map((c, i) => <TreeNode key={c.name || c.id || i} node={c} depth={depth + 1} />)}
    </div>
  )
}
