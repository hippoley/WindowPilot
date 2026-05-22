import { useState, useEffect, useRef, useCallback } from 'react'
import BehaviorTreeGraph from './components/BehaviorTree'
import './App.css'

const WS_URL = `ws://${window.location.hostname || 'localhost'}:8001/ws`

export default function App() {
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState({ tick: 0, tm: null, tree: null, semantic: { tags: [] }, btBranch: '...', log: [], aiStatus: 'idle', agents: {} })
  const [treeView, setTreeView] = useState('compact') // 'compact' | 'graph'
  const wsRef = useRef(null)
  const rafRef = useRef(null)
  const pendingRef = useRef(null)

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg))
  }, [])

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
  const win = tm?.window || {}, act = tm?.actuator || {}, scr = tm?.screen || {}, sens = tm?.sensors || {}, cfg = tm?.config || {}
  const card = tm?.ai?.card || null, recs = tm?.ai?.recommendations || [], sec = tm?.security || {}
  const risk = semantic.risk || 'safe'
  const riskColor = risk === 'danger' ? '#E07070' : risk === 'caution' ? '#E8B86D' : '#7EC8A0'

  return (
    <div className="app-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', height: '100vh', background: '#100C06', color: '#F5ECD7', fontFamily: 'Inter,sans-serif', fontSize: 12 }}>
      {/* ═══ 左栏：传感器控制 ═══ */}
      <div style={{ borderRight: '1px solid rgba(212,165,116,0.15)', padding: 12, overflowY: 'auto' }}>
        <SectionTitle text="传感器控制" />
        <Slider label="CO₂" value={sens.co2_ppm || 400} min={300} max={2500} step={10} unit="ppm" onChange={v => send({ cmd: 'set_sensor', key: 'co2_ppm', value: v })} />
        <Slider label="室内温度" value={sens.temp_indoor || 26} min={10} max={42} step={0.5} unit="°C" onChange={v => send({ cmd: 'set_sensor', key: 'temp_indoor_c', value: v })} />
        <Slider label="湿度" value={sens.humidity || 50} min={10} max={100} step={1} unit="%" onChange={v => send({ cmd: 'set_sensor', key: 'humidity_pct', value: v })} />
        <Slider label="风速" value={sens.wind_speed || 0} min={0} max={20} step={0.5} unit="m/s" onChange={v => send({ cmd: 'set_sensor', key: 'wind_speed_ms', value: v })} />
        <Slider label="VOC" value={sens.voc_mg || 0} min={0} max={2} step={0.05} unit="mg" onChange={v => send({ cmd: 'set_sensor', key: 'voc_mg', value: v })} />
        <Slider label="光照" value={sens.lux || 0} min={0} max={100000} step={100} unit="lx" onChange={v => send({ cmd: 'set_sensor', key: 'lux', value: v })} />
        <Slider label="噪音" value={sens.noise_db || 30} min={20} max={100} step={1} unit="dB" onChange={v => send({ cmd: 'set_sensor', key: 'noise_db', value: v })} />
        <Slider label="AQI" value={sens.aqi || 0} min={0} max={500} step={5} unit="" onChange={v => send({ cmd: 'set_sensor', key: 'aqi', value: v })} />
        <Slider label="降雨概率" value={sens.forecast_rain_prob || 0} min={0} max={1} step={0.05} unit="" onChange={v => send({ cmd: 'set_sensor', key: 'forecast_rain_prob', value: v })} />

        <SectionTitle text="安全开关" />
        <Toggle label="降雨" active={sens.rain} onClick={() => send({ cmd: 'set_sensor', key: 'rain_detected', value: !sens.rain })} />
        <Toggle label="人体检测" active={sens.human} onClick={() => send({ cmd: 'set_sensor', key: 'human_detected', value: !sens.human })} />
        <Toggle label="有宠物" active={cfg.has_pets} onClick={() => send({ cmd: 'set_config', key: 'has_pets', value: !cfg.has_pets })} />

        <SectionTitle text="场景" />
        {['bedroom_ventilation', 'child_room', 'storm_emergency', 'elderly_cold', 'study_meeting'].map(id => (
          <button key={id} onClick={() => send({ cmd: 'load_scenario', value: id })} style={{ display: 'block', width: '100%', marginBottom: 4, padding: '6px 8px', background: 'rgba(212,165,116,0.08)', border: '1px solid rgba(212,165,116,0.2)', borderRadius: 6, color: '#A89070', fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>{id}</button>
        ))}
        <button onClick={() => send({ cmd: 'reset' })} style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(224,112,112,0.1)', border: '1px solid rgba(224,112,112,0.3)', borderRadius: 6, color: '#E07070', fontSize: 10, cursor: 'pointer', width: '100%' }}>↺ 重置</button>
      </div>

      {/* ═══ 中栏：窗户状态 ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, overflowY: 'auto' }}>
        <div style={{ fontSize: 9, color: '#5C4A35', display: 'flex', alignItems: 'center', gap: 8 }}>
          {connected ? '● 已连接' : '○ 连接中...'} · Tick #{tick}
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor, display: 'inline-block' }} title={`Risk: ${risk}`} />
          {aiStatus === 'running' && <span style={{ color: '#E8B86D', fontSize: 9 }}>AI 推荐中...</span>}
        </div>

        {/* Security badge */}
        {(sec.mode || sec.alarm) && (
          <div style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: sec.alarm ? 'rgba(224,112,112,0.15)' : 'rgba(126,200,160,0.1)', color: sec.alarm ? '#E07070' : '#7EC8A0' }}>
            {sec.alarm ? `🚨 报警! ${sec.alarm_reason || ''}` : '🔒 布防中'}
          </div>
        )}

        <div style={{ fontSize: 64, fontWeight: 800, fontFamily: 'monospace', color: '#D4A574' }}>{Math.round(win.open_pct || 0)}%</div>
        <div style={{ fontSize: 11, color: '#A89070' }}>窗户 {win.state || 'closed'} · 纱窗 {Math.round(scr.position_pct || 0)}%</div>
        <div style={{ fontSize: 10, color: '#5C4A35', fontFamily: 'monospace' }}>推窗器: {act.state || 'idle'} | 行程 {Math.round(act.stroke_mm || 0)}mm | 电流 {Math.round(act.current_ma || 120)}mA</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Btn label="开窗50%" onClick={() => send({ cmd: 'user_open_to', value: 50 })} />
          <Btn label="开窗100%" onClick={() => send({ cmd: 'user_open_to', value: 100 })} />
          <Btn label="停止" onClick={() => send({ cmd: 'user_stop' })} />
          <Btn label="关窗" onClick={() => send({ cmd: 'user_open_to', value: 0 })} />
        </div>

        {/* Security arm/disarm */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Btn label="🔒 布防" onClick={() => send({ cmd: 'security_arm' })} />
          <Btn label="🔓 撤防" onClick={() => send({ cmd: 'security_disarm' })} />
        </div>

        {/* AI Card */}
        {card && (
          <div style={{ marginTop: 12, padding: 14, background: 'rgba(212,165,116,0.08)', border: '1px solid rgba(212,165,116,0.25)', borderRadius: 12, maxWidth: 360, width: '100%' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{card.title}</div>
            <div style={{ fontSize: 11, color: '#A89070', marginBottom: 8 }}>{card.reason}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => send({ cmd: 'accept_recommendation' })} style={{ flex: 1, padding: '8px 12px', background: '#D4A574', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>✓ 确认</button>
              <button onClick={() => send({ cmd: 'reject_recommendation' })} style={{ flex: 1, padding: '8px 12px', background: 'transparent', border: '1px solid rgba(224,112,112,0.4)', borderRadius: 8, color: '#E07070', cursor: 'pointer' }}>✕ 拒绝</button>
            </div>
          </div>
        )}

        {/* Recommendations list */}
        {recs.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto', width: '100%', maxWidth: 360 }}>
            {recs.map((r, i) => (
              <div key={i} style={{ padding: '6px 10px', marginBottom: 4, background: 'rgba(212,165,116,0.05)', border: '1px solid rgba(212,165,116,0.15)', borderRadius: 8, fontSize: 10, color: '#A89070' }}>
                <span style={{ fontWeight: 600, color: '#D4A574' }}>{r.title || r.action || '建议'}</span>{r.reason ? ` — ${r.reason}` : ''}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 8, padding: '4px 10px', background: 'rgba(212,165,116,0.1)', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#D4A574' }}>{btBranch}</div>
      </div>

      {/* ═══ 右栏：行为树 + 语义 ═══ */}
      <div style={{ borderLeft: '1px solid rgba(212,165,116,0.15)', padding: 12, overflowY: 'auto' }}>
        <SectionTitle text="语义状态" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 12 }}>
          {(semantic.tags || []).map(tag => (
            <span key={tag} style={{ padding: '2px 5px', borderRadius: 4, fontSize: 8, fontFamily: 'monospace', fontWeight: 600, background: tag.includes('HIGH') || tag.includes('STORM') ? 'rgba(224,112,112,0.15)' : 'rgba(212,165,116,0.1)', color: tag.includes('HIGH') || tag.includes('STORM') ? '#E07070' : '#D4A574', border: '1px solid rgba(212,165,116,0.2)' }}>{tag}</span>
          ))}
        </div>
        {semantic.summary && <div style={{ fontSize: 9, color: '#A89070', marginBottom: 10, fontStyle: 'italic' }}>{semantic.summary}</div>}

        <SectionTitle text="行为树" />
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <button onClick={() => setTreeView('compact')} style={{ padding: '2px 6px', fontSize: 9, borderRadius: 4, border: '1px solid rgba(212,165,116,0.2)', background: treeView === 'compact' ? 'rgba(212,165,116,0.2)' : 'transparent', color: '#D4A574', cursor: 'pointer' }}>列表</button>
          <button onClick={() => setTreeView('graph')} style={{ padding: '2px 6px', fontSize: 9, borderRadius: 4, border: '1px solid rgba(212,165,116,0.2)', background: treeView === 'graph' ? 'rgba(212,165,116,0.2)' : 'transparent', color: '#D4A574', cursor: 'pointer' }}>图形</button>
        </div>
        {tree ? (
          treeView === 'graph'
            ? <div style={{ height: 400, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(212,165,116,0.15)' }}><BehaviorTreeGraph node={tree} /></div>
            : <TreeNode node={tree} depth={0} />
        ) : <div style={{ color: '#5C4A35' }}>等待数据...</div>}

        {log.length > 0 && (<>
          <SectionTitle text="决策日志" />
          {log.slice(0, 5).map((e, i) => (
            <div key={i} style={{ fontSize: 9, fontFamily: 'monospace', padding: '3px 0', borderBottom: '1px solid rgba(212,165,116,0.08)', color: '#A89070' }}>#{e.tick} <span style={{ color: '#D4A574' }}>{e.branch}</span> {e.action}</div>
          ))}
        </>)}

        {/* Agent status */}
        {Object.keys(agents).length > 0 && (<>
          <SectionTitle text="Agent 状态" />
          {Object.entries(agents).map(([name, info]) => (
            <div key={name} style={{ fontSize: 9, fontFamily: 'monospace', padding: '3px 0', borderBottom: '1px solid rgba(212,165,116,0.08)', color: '#A89070', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#D4A574' }}>{name}</span>
              <span>{info.status || 'ok'} · {Math.round(info.avg_tick_ms || 0)}ms</span>
            </div>
          ))}
        </>)}
      </div>
    </div>
  )
}

// ═══ 子组件 ═══
function SectionTitle({ text }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#5C4A35', margin: '10px 0 6px' }}>{text}</div>
}

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: '#A89070' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#F5ECD7' }}>{typeof value === 'number' ? (step < 1 ? value.toFixed(2) : Math.round(value)) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={`${label} ${value}${unit}`} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', height: 3, accentColor: '#D4A574', cursor: 'pointer' }} />
    </div>
  )
}

function Toggle({ label, active, onClick }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#A89070' }}>{label}</span>
      <button role="switch" aria-checked={!!active} aria-label={label} onClick={onClick} style={{ width: 32, height: 16, borderRadius: 8, background: active ? '#E07070' : '#2a1a0a', border: '1px solid rgba(212,165,116,0.2)', cursor: 'pointer', position: 'relative', padding: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#F5ECD7', position: 'absolute', top: 1, left: active ? 17 : 1, transition: 'left 0.2s' }} />
      </button>
    </div>
  )
}

function Btn({ label, onClick }) {
  return <button onClick={onClick} style={{ padding: '6px 12px', background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.25)', borderRadius: 6, color: '#D4A574', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
}

function TreeNode({ node, depth }) {
  const s = node.status || 'invalid'
  const color = s === 'success' ? '#7EC8A0' : s === 'failure' ? '#5C4A35' : s === 'running' ? '#E8B86D' : '#3a2a1a'
  const dot = s === 'success' ? '●' : s === 'failure' ? '○' : s === 'running' ? '◉' : '·'
  return (
    <div>
      <div style={{ marginLeft: depth * 12, fontSize: 10, fontFamily: 'monospace', color, padding: '1px 0', display: 'flex', alignItems: 'center', gap: 4 }}><span>{dot}</span><span>{node.name}</span></div>
      {node.children?.map((c, i) => <TreeNode key={c.name || c.id || i} node={c} depth={depth + 1} />)}
    </div>
  )
}
