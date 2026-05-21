// 右侧状态面板 — Andluca 设计语言
export default function StatusPanel({ window_, sensors }) {
  const pos = window_.position ?? 0
  const status = window_.status ?? 'closed'
  const statusText = {
    closed: '已关闭', opening: '开启中', open: '已开启',
    closing: '关闭中', stopped: '紧急停止', error: '故障',
  }[status] || status

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel-label">窗户状态</div>

      {/* 主状态卡 */}
      <div className="status-card">
        <div className="status-label-sm">当前开窗比例</div>
        <div className="status-pct">{Math.round(pos * 100)}%</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pos * 100}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`status-badge badge-${status}`}>{statusText}</span>
          <div className="motor-row">
            <div className={`motor-dot ${window_.motor_running ? 'running' : ''}`} />
            {window_.motor_running ? '电机运行中' : '电机待机'}
          </div>
        </div>
      </div>

      {/* 当前决策 */}
      <div className="glass-card">
        <div className="panel-label" style={{ marginBottom: 6 }}>当前决策</div>
        <div className="decision-scenario">{window_.active_scenario || '待机'}</div>
        <div className="decision-box">{window_.decision_reason || '系统初始化'}</div>
        {window_.target_position != null && Math.abs(window_.target_position - pos) > 0.02 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            目标 → {Math.round(window_.target_position * 100)}%
          </div>
        )}
      </div>

      {/* 传感器摘要 */}
      <div className="glass-card">
        <div className="panel-label" style={{ marginBottom: 6 }}>传感器摘要</div>
        {[
          { icon: '🌧️', label: '降雨', value: sensors.rain ? '⚠ 检测到' : '正常', alert: sensors.rain },
          { icon: '🌬️', label: 'CO₂', value: `${(sensors.co2_ppm ?? 400).toFixed(0)} ppm`, alert: sensors.co2_ppm >= 800 },
          { icon: '💨', label: '风速', value: `${(sensors.wind_speed ?? 0).toFixed(1)} m/s`, alert: sensors.wind_speed >= 10 },
          { icon: '🌡️', label: '温度', value: `${(sensors.temperature ?? 22).toFixed(1)}°C`, alert: sensors.temperature >= 35 },
          { icon: '🤚', label: '夹手', value: sensors.motor_blocked ? '⚠ 异常' : '正常', alert: sensors.motor_blocked },
          { icon: '🔥', label: '过热', value: sensors.motor_overheat ? '⚠ 过热' : '正常', alert: sensors.motor_overheat },
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
