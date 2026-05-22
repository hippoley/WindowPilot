// 右侧状态面板 — Andluca 设计语言
export default function StatusPanel({ tm, semantic, btBranch }) {
  const openPct = tm?.window?.open_pct ?? 0
  const windowState = tm?.window?.state ?? 'closed'
  const actuatorState = tm?.actuator?.state ?? 'idle'
  const sensors = tm?.sensors ?? {}
  const risk = semantic?.risk ?? 'safe'

  const stateText = {
    closed: '已关闭', opening: '开启中', open: '已开启',
    closing: '关闭中', stopped: '已停止', error: '故障',
    partial: '半开',
  }[windowState] || windowState

  const motorText = {
    idle: '电机待机', extending: '电机伸出中', retracting: '电机缩回中',
    holding: '电机保持', stalled: '⚠ 电机堵转',
  }[actuatorState] || actuatorState

  const motorRunning = actuatorState !== 'idle'

  const riskStyle = {
    safe: { color: '#6fcf97', label: '安全' },
    caution: { color: '#f2c94c', label: '注意' },
    danger: { color: '#eb5757', label: '危险' },
  }[risk] || { color: '#aaa', label: risk }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel-label">窗户状态</div>

      {/* 主状态卡 */}
      <div className="status-card">
        <div className="status-label-sm">当前开窗比例</div>
        <div className="status-pct">{Math.round(openPct)}%</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${openPct}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`status-badge badge-${windowState}`}>{stateText}</span>
          <div className="motor-row">
            <div className={`motor-dot ${motorRunning ? 'running' : ''}`} />
            {motorText}
          </div>
        </div>
      </div>

      {/* 当前决策 & 风险 */}
      <div className="glass-card">
        <div className="panel-label" style={{ marginBottom: 6 }}>当前决策</div>
        <div className="decision-scenario">{btBranch || '待机'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: riskStyle.color,
          }} />
          <span style={{ fontSize: 12, color: riskStyle.color }}>{riskStyle.label}</span>
        </div>
        {semantic?.summary && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            {semantic.summary}
          </div>
        )}
      </div>

      {/* 传感器摘要 */}
      <div className="glass-card">
        <div className="panel-label" style={{ marginBottom: 6 }}>传感器摘要</div>
        {[
          { icon: '🌧️', label: '降雨', value: sensors.rain ? '⚠ 检测到' : '正常', alert: !!sensors.rain },
          { icon: '🌬️', label: 'CO₂', value: `${(sensors.co2_ppm ?? 400).toFixed(0)} ppm`, alert: (sensors.co2_ppm ?? 0) >= 800 },
          { icon: '💨', label: '风速', value: `${(sensors.wind_speed ?? 0).toFixed(1)} m/s (Lv${sensors.wind_level ?? 0})`, alert: (sensors.wind_speed ?? 0) >= 10 },
          { icon: '🌡️', label: '室内温度', value: `${(sensors.temp_indoor ?? 22).toFixed(1)}°C`, alert: (sensors.temp_indoor ?? 22) >= 35 },
          { icon: '💧', label: '湿度', value: `${(sensors.humidity ?? 50).toFixed(0)}%`, alert: (sensors.humidity ?? 50) >= 80 },
          { icon: '🏭', label: 'AQI', value: `${(sensors.aqi ?? 50).toFixed(0)}`, alert: (sensors.aqi ?? 0) >= 150 },
        ].map(r => (
          <div key={r.label} className="sensor-summary-row">
            <span className="sensor-summary-label">{r.icon} {r.label}</span>
            <span className={`sensor-summary-val ${r.alert ? 'alert' : ''}`}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* 优先级 */}
      <div className="glass-card">
        <div className="panel-label" style={{ marginBottom: 8 }}>决策优先级</div>
        {[
          { color: 'var(--danger)', label: '① 安全保护', desc: '夹手 / 过热 / 强风 / 下雨' },
          { color: 'var(--accent)', label: '② 用户手动', desc: '覆盖所有自动逻辑' },
          { color: 'var(--accent2)', label: '③ AI 推荐', desc: '综合环境最优方案' },
          { color: 'var(--warning)', label: '④ CO₂通风', desc: '超标自动开窗 40%' },
          { color: 'var(--surface3)', label: '⑤ 待机', desc: '保持当前状态' },
        ].map(item => (
          <div key={item.label} className="priority-item">
            <div className="priority-bar" style={{ background: item.color }} />
            <div>
              <div className="priority-name">{item.label}</div>
              <div className="priority-desc">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
