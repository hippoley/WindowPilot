// 传感器控制面板 — Andluca 设计语言
export default function SensorPanel({ sensors, send }) {
  const co2Class = sensors.co2_ppm >= 1000 ? 'danger' : sensors.co2_ppm >= 800 ? 'warning' : 'ok'
  const windClass = sensors.wind_speed >= 10 ? 'danger' : sensors.wind_speed >= 6 ? 'warning' : 'ok'
  const tempClass = sensors.temperature >= 35 ? 'danger' : sensors.temperature >= 28 ? 'warning' : 'ok'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="panel-label">传感器仿真控制</div>

      {/* 环境传感器 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🌡️ 温度</span>
          <span className={`sensor-value ${tempClass}`}>{(sensors.temperature ?? 22).toFixed(1)}°C</span>
        </div>
        <input type="range" min="0" max="45" step="0.5"
          value={sensors.temperature ?? 22}
          onChange={e => send({ cmd: 'set_temperature', value: +e.target.value })}
        />
        <div className="sensor-row">
          <span className="sensor-label">💧 湿度</span>
          <span className="sensor-value">{(sensors.humidity ?? 50).toFixed(0)}%</span>
        </div>
        <input type="range" min="0" max="100" step="1"
          value={sensors.humidity ?? 50}
          onChange={e => send({ cmd: 'set_humidity', value: +e.target.value })}
        />
      </div>

      {/* CO₂ */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🌬️ CO₂浓度</span>
          <span className={`sensor-value ${co2Class}`}>{(sensors.co2_ppm ?? 400).toFixed(0)} ppm</span>
        </div>
        <input type="range" min="300" max="2000" step="10"
          value={sensors.co2_ppm ?? 400}
          onChange={e => send({ cmd: 'set_co2', value: +e.target.value })}
        />
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          正常 &lt;800 · 超标 &gt;800 · 危险 &gt;1000
        </div>
      </div>

      {/* 风速 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">💨 风速</span>
          <span className={`sensor-value ${windClass}`}>{(sensors.wind_speed ?? 0).toFixed(1)} m/s</span>
        </div>
        <input type="range" min="0" max="20" step="0.5"
          value={sensors.wind_speed ?? 0}
          onChange={e => send({ cmd: 'set_wind', value: +e.target.value })}
        />
      </div>

      {/* 开关类传感器 */}
      <div className="glass-card">
        <div className="toggle-row">
          <span className="sensor-label">🌧️ 降雨检测</span>
          <button
            className={`toggle ${sensors.rain ? 'on' : ''}`}
            onClick={() => send({ cmd: 'set_rain', value: !sensors.rain })}
            aria-label="切换降雨"
          />
        </div>
        <div className="toggle-row">
          <span className="sensor-label">🤚 夹手/阻力异常</span>
          <button
            className={`toggle ${sensors.motor_blocked ? 'on' : ''}`}
            onClick={() => send({ cmd: 'set_motor_blocked', value: !sensors.motor_blocked })}
            aria-label="切换夹手检测"
          />
        </div>
        <div className="toggle-row">
          <span className="sensor-label">🔥 电机过热</span>
          <button
            className={`toggle ${sensors.motor_overheat ? 'on' : ''}`}
            onClick={() => send({ cmd: 'set_motor_overheat', value: !sensors.motor_overheat })}
            aria-label="切换电机过热"
          />
        </div>
      </div>

      {/* 用户指令 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">👤 用户手动指令</span>
          <span className="sensor-value">
            {sensors.user_command != null ? `${Math.round(sensors.user_command * 100)}%` : '无'}
          </span>
        </div>
        <input type="range" min="0" max="100" step="5"
          value={sensors.user_command != null ? sensors.user_command * 100 : 0}
          onChange={e => send({ cmd: 'set_user_command', value: +e.target.value / 100 })}
        />
        <button className="mini-btn" onClick={() => send({ cmd: 'set_user_command', value: null })}>
          清除指令
        </button>
      </div>

      {/* AI 推荐 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🤖 AI推荐开窗</span>
          <span className="sensor-value" style={{ color: 'var(--accent2)' }}>
            {sensors.ai_recommendation != null ? `${Math.round(sensors.ai_recommendation * 100)}%` : '无'}
          </span>
        </div>
        <input type="range" min="0" max="100" step="5"
          value={sensors.ai_recommendation != null ? sensors.ai_recommendation * 100 : 0}
          onChange={e => send({ cmd: 'set_ai_recommendation', value: +e.target.value / 100 })}
        />
        <button className="mini-btn" onClick={() => send({ cmd: 'set_ai_recommendation', value: null })}>
          清除推荐
        </button>
      </div>
    </div>
  )
}
