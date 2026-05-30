import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Baby,
  CloudRain,
  DoorOpen,
  Droplets,
  Fan,
  Gauge,
  Hand,
  Home,
  Lock,
  Moon,
  Pause,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Thermometer,
  Unlock,
  Users,
  Wind,
  X,
} from 'lucide-react'
import BehaviorTreeGraph from './components/BehaviorTree'
import Home3DScene, { ROOM_EVENTS, ROOM_LAYOUT } from './components/Home3DScene'
import WindowSVG from './components/WindowSVG'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

const SCENES = [
  { id: 'storm', icon: CloudRain, name: '暴风雨', event: { rain_detected: true, rain_level: 'storm', wind_speed_ms: 12, wind_level: 6, human_detected: true } },
  { id: 'child', icon: Baby, name: '次卧B闷热', event: { room_type: 'child_room', co2_ppm: 1280, human_detected: true } },
  { id: 'night', icon: Moon, name: '主卧深夜', event: { time_hour: 2, co2_ppm: 1400, human_detected: true, room_type: 'bedroom' } },
  { id: 'sun', icon: Sun, name: '午后西晒', event: { lux: 55000, temp_indoor_c: 33, time_hour: 15, orientation: 'W', human_detected: true } },
  { id: 'pet', icon: Shield, name: '宠物独处', event: { has_pets: true, human_detected: false } },
  { id: 'elderly', icon: Thermometer, name: '次卧A防寒', event: { room_type: 'bedroom', temp_indoor_c: 16, temp_outdoor_c: 2, human_detected: true } },
  { id: 'forecast', icon: AlertTriangle, name: '暴雨预警', event: { forecast_rain_prob: 0.88, pressure_trend: 'plunging', human_detected: true } },
  { id: 'voc', icon: Wind, name: 'VOC 突变', event: { voc_mg: 1.2, human_detected: true } },
]

const QUICK_ACTIONS = [
  { label: '开 25%', icon: DoorOpen, msg: { cmd: 'user_open_to', value: 25 } },
  { label: '开 50%', icon: DoorOpen, msg: { cmd: 'user_open_to', value: 50 } },
  { label: '全开', icon: Fan, msg: { cmd: 'user_open_to', value: 100 } },
  { label: '暂停', icon: Pause, msg: { cmd: 'user_stop' } },
  { label: '关窗', icon: X, msg: { cmd: 'user_open_to', value: 0 }, danger: true },
]

const ROOM_LABELS = {
  living_room: '客厅',
  dining_room: '餐厅',
  second_bed_a: '次卧A',
  second_bed_b: '次卧B',
  master_bedroom: '主卧',
  master_bath: '主卫',
  guest_bath: '客卫',
  entry: '玄关',
  balcony: '阳台',
  bedroom: '卧室',
  child_room: '儿童房',
  bathroom: '厕所',
  kitchen: '厨房',
}

const MODE_LABELS = {
  ventilation_first: '通风优先',
  wind_protect: '防风保护',
  safety_first: '安全优先',
  manual: '手动',
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }) {
  return (
    <div className={`metric metric--${tone}`}>
      <Icon size={16} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function App() {
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState(0)
  const [tm, setTm] = useState(null)
  const [tree, setTree] = useState(null)
  const [btBranch, setBtBranch] = useState('等待数据')
  const [log, setLog] = useState([])
  const [tab, setTab] = useState('scenes')
  const [mainView, setMainView] = useState('home')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [lastAction, setLastAction] = useState('正在连接后端...')
  const wsRef = useRef(null)

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
      setLastAction(`已发送：${msg.cmd}${msg.value !== undefined ? ` ${msg.value}` : ''}`)
    } else {
      setLastAction('WebSocket 未连接')
    }
  }, [])

  const applySensorPatch = useCallback((event) => {
    Object.entries(event).forEach(([key, value]) => send({ cmd: 'set_sensor', key, value }))
  }, [send])

  const handleRoomSelect = useCallback((roomId) => {
    setSelectedRoom(roomId)
    if (!roomId) {
      setLastAction('已回到全屋视角')
      return
    }
    const room = ROOM_LAYOUT.find(item => item.id === roomId)
    if (ROOM_EVENTS[roomId]) applySensorPatch(ROOM_EVENTS[roomId])
    setLastAction(`进入${room?.name || '房间'}：同步房间画像与传感器`)
  }, [applySensorPatch])

  useEffect(() => {
    let disposed = false
    let reconnectTimer

    function connect() {
      if (disposed) return
      const host = window.location.hostname || 'localhost'
      const port = window.location.port === '5173' ? '8001' : (window.location.port || '8001')
      const ws = new WebSocket(`ws://${host}:${port}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        if (!disposed) {
          setConnected(true)
          setLastAction('实时通道已连接')
        }
      }
      ws.onclose = () => {
        if (!disposed) {
          setConnected(false)
          setLastAction('实时通道断开，正在重连...')
          reconnectTimer = setTimeout(connect, 2000)
        }
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.type === 'tick') {
            setTick(data.tick)
            setTm(data.thing_model)
            setTree(data.tree)
            setBtBranch(data.bt_branch || '未命中分支')
            setLog(data.decision_log || [])
          }
        } catch (error) {
          console.error('[WS] parse error', error)
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
  const cfg = tm?.config || {}
  const sec = tm?.security || {}
  const ai = tm?.ai || {}
  const activeRoom = ROOM_LAYOUT.find(room => room.id === selectedRoom)
  const riskLevel = sec.alarm ? 'danger' : sens.rain || sens.wind_level >= 6 || sens.voc_mg > 0.8 ? 'warning' : 'safe'
  const roomState = useMemo(() => ({
    windowOpenPct: win.open_pct || 0,
    screenPct: scr.position_pct || 0,
    riskLevel,
  }), [win.open_pct, scr.position_pct, riskLevel])

  const riskText = riskLevel === 'danger' ? '安防报警' : riskLevel === 'warning' ? '需要注意' : '运行平稳'
  const currentRec = ai.card || ai.recommendation || ai.recommendations?.[0]

  const applyScene = (scene) => {
    send({ cmd: 'reset' })
    setTimeout(() => applySensorPatch(scene.event), 100)
    setLastAction(`已注入场景：${scene.name}`)
  }

  return (
    <div className="app-layout">
      <aside className="control-panel">
        <header className="brand-bar">
          <div>
            <span className="eyebrow">WindowPilot</span>
            <h1>全屋门窗驾驶舱</h1>
          </div>
          <div className={`connection-pill ${connected ? 'is-on' : 'is-off'}`}>
            <span />
            {connected ? '在线' : '离线'}
          </div>
        </header>

        <section className={`device-stage device-stage--${riskLevel}`}>
          <div className="stage-topline">
            <div>
              <span>{activeRoom ? `${activeRoom.name}开度` : '当前开度'}</span>
              <strong>{Math.round(win.open_pct || 0)}%</strong>
            </div>
            <div className="risk-chip">{riskText}</div>
          </div>
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
        </section>

        <section className="quick-actions">
          {QUICK_ACTIONS.map(({ label, icon: Icon, msg, danger }) => (
            <button key={label} className={`action-btn ${danger ? 'action-btn--danger' : ''}`} onClick={() => send(msg)}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
          <button className="icon-action" title="布防" onClick={() => send({ cmd: 'arm_security' })}>
            <Lock size={17} />
          </button>
          <button className="icon-action" title="撤防" onClick={() => send({ cmd: 'disarm_security' })}>
            <Unlock size={17} />
          </button>
        </section>

        <section className="metrics-grid">
          <Metric icon={Gauge} label="CO₂" value={`${sens.co2_ppm ?? '-'} ppm`} tone={(sens.co2_ppm || 0) > 1000 ? 'warning' : 'neutral'} />
          <Metric icon={Thermometer} label="室内" value={`${sens.temp_indoor ?? '-'}°C`} />
          <Metric icon={Droplets} label="湿度" value={`${sens.humidity ?? '-'}%`} tone={(sens.humidity || 0) > 75 ? 'warning' : 'neutral'} />
          <Metric icon={Wind} label="风速" value={`${sens.wind_speed ?? 0} m/s`} tone={(sens.wind_level || 0) >= 6 ? 'warning' : 'neutral'} />
          <Metric icon={Users} label="有人" value={sens.human ? '是' : '否'} />
          <Metric icon={Home} label="房间" value={activeRoom?.name || ROOM_LABELS[cfg.room_type] || cfg.room_type || '全屋'} />
        </section>

        <section className="mode-strip">
          <span>{MODE_LABELS[cfg.mode] || cfg.mode || '未知模式'}</span>
          <span>Tick #{tick}</span>
          <span>{lastAction}</span>
        </section>

        <section className="scenario-panel">
          <div className="section-tabs">
            <button className={tab === 'scenes' ? 'active' : ''} onClick={() => setTab('scenes')}>
              <Sparkles size={15} /> 场景
            </button>
            <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>
              <Hand size={15} /> 手动
            </button>
          </div>

          {tab === 'scenes' ? (
            <div className="scene-grid">
              {SCENES.map(({ id, icon: Icon, name }) => {
                const scene = SCENES.find(item => item.id === id)
                return (
                  <button key={id} className="scene-btn" onClick={() => applyScene(scene)}>
                    <Icon size={18} />
                    <span>{name}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="manual-pad">
              <button onClick={() => send({ cmd: 'reset' })}><RotateCcw size={16} />重置系统</button>
              <button onClick={() => send({ cmd: 'set_mode', value: 'safety_first' })}><Shield size={16} />安全优先</button>
              <button onClick={() => send({ cmd: 'set_mode', value: 'ventilation_first' })}><Fan size={16} />通风优先</button>
            </div>
          )}
        </section>
      </aside>

      <main className="workbench workbench--immersive">
        <section className="experience-panel">
          <div className="panel-heading panel-heading--floating">
            <div>
              <span className="eyebrow">{mainView === 'home' ? '3D Home Scene' : 'Behavior Tree'}</span>
              <h2>{mainView === 'home' ? '全屋 3D 户型漫游' : '实时决策树'}</h2>
            </div>
            <div className="view-switch">
              <button className={mainView === 'home' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setMainView('home') }}>3D 户型</button>
              <button className={mainView === 'tree' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setMainView('tree') }}>行为树</button>
            </div>
          </div>

          {mainView === 'home' ? (
            <Home3DScene
              selectedRoom={selectedRoom}
              onRoomSelect={handleRoomSelect}
              roomState={roomState}
            />
          ) : (
            <ErrorBoundary>
              <div className="bt-container bt-container--standalone">
                {tree
                  ? <BehaviorTreeGraph node={tree} activeBranch={btBranch} />
                  : <div className="bt-placeholder">等待行为树数据...</div>
                }
              </div>
            </ErrorBoundary>
          )}
        </section>

        <aside className="inspector inspector--immersive">
          <section className="decision-card room-card">
            <span className="eyebrow">Room Profile</span>
            <h3>{activeRoom?.name || '全屋总览'}</h3>
            <strong>{activeRoom?.persona || '点击任意房间进入真实房间视角'}</strong>
            <p>
              {activeRoom
                ? `${activeRoom.product}：${activeRoom.logic}`
                : '客厅与走廊连接老人房、儿童房、厕所、厨房、书房、卧室；门洞全部打通，外墙嵌入智能窗纱一体产品。'}
            </p>
          </section>

          <section className="decision-card">
            <span className="eyebrow">Decision</span>
            <h3>当前决策</h3>
            <strong>{btBranch}</strong>
            <p>{log[0] ? `${log[0].branch || '行为树'}：${log[0].action || log[0].detail || '已执行'}` : '等待新的决策日志'}</p>
          </section>

          {currentRec && (
            <section className="decision-card decision-card--ai">
              <span className="eyebrow">Recommendation</span>
              <h3>{currentRec.title || 'AI 建议'}</h3>
              <strong>建议开窗 {currentRec.window_pct ?? 0}%</strong>
              <p>{currentRec.reason || '根据当前环境生成的候选策略'}</p>
              <div className="recommend-actions">
                <button onClick={() => send({ cmd: 'accept_recommendation' })}>采纳</button>
                <button onClick={() => send({ cmd: 'reject_recommendation' })}>忽略</button>
              </div>
            </section>
          )}

          <section className="timeline">
            <span className="eyebrow">Trace</span>
            <h3>最近动作</h3>
            {log.length === 0 ? (
              <p className="muted">暂无日志</p>
            ) : log.slice(0, 6).map((item, index) => (
              <div className="timeline-item" key={`${item.tick || index}-${item.branch || index}`}>
                <span />
                <div>
                  <strong>{item.branch || item.node || 'System'}</strong>
                  <p>{item.action || item.detail || item.result || 'updated'}</p>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
