// 传感器控制面板 — Andluca 设计语言
export default function SensorPanel({ sensors, send }) {
  const co2Class = sensors.co2_ppm >= 1000 ? 'danger' : sensors.co2_ppm >= 800 ? 'warning' : 'ok'
  const windClass = sensors.wind_speed >= 10 ? 'danger' : sensors.wind_speed >= 6 ? 'warning' : 'ok'
  const tempClass = sensors.temp_indoor >= 35 ? 'danger' : sensors.temp_indoor >= 28 ? 'warning' : 'ok'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="panel-label">传感器仿真控制</div>

      {/* 环境传感器 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🌡️ 室内温度</span>
          <span className={`sensor-value ${tempClass}`}>{(sensors.temp_indoor ?? 26).toFixed(1)}°C</span>
        </div>
        <input type="range" min="10" max="42" step="0.5"
          value={sensors.temp_indoor ?? 26}
          onChange={e => send({ cmd: 'set_sensor', key: 'temp_indoor_c', value: +e.target.value })}
        />
        <div className="sensor-row">
          <span className="sensor-label">💧 湿度</span>
          <span className="sensor-value">{(sensors.humidity ?? 50).toFixed(0)}%</span>
        </div>
        <input type="range" min="10" max="100" step="1"
          value={sensors.humidity ?? 50}
          onChange={e => send({ cmd: 'set_sensor', key: 'humidity_pct', value: +e.target.value })}
        />
      </div>

      {/* CO₂ */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🌬️ CO₂浓度</span>
          <span className={`sensor-value ${co2Class}`}>{(sensors.co2_ppm ?? 400).toFixed(0)} ppm</span>
        </div>
        <input type="range" min="300" max="2500" step="10"
          value={sensors.co2_ppm ?? 400}
          onChange={e => send({ cmd: 'set_sensor', key: 'co2_ppm', value: +e.target.value })}
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
          onChange={e => send({ cmd: 'set_sensor', key: 'wind_speed_ms', value: +e.target.value })}
        />
      </div>

      {/* 噪声 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🔊 噪声</span>
          <span className="sensor-value">{(sensors.noise_db ?? 40).toFixed(0)} dB</span>
        </div>
        <input type="range" min="20" max="120" step="1"
          value={sensors.noise_db ?? 40}
          onChange={e => send({ cmd: 'set_sensor', key: 'noise_db', value: +e.target.value })}
        />
      </div>

      {/* AQI */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🏭 AQI</span>
          <span className="sensor-value">{(sensors.aqi ?? 50).toFixed(0)}</span>
        </div>
        <input type="range" min="0" max="500" step="5"
          value={sensors.aqi ?? 50}
          onChange={e => send({ cmd: 'set_sensor', key: 'aqi', value: +e.target.value })}
        />
      </div>

      {/* 光照 */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">☀️ 光照</span>
          <span className="sensor-value">{(sensors.lux ?? 0).toFixed(0)} lux</span>
        </div>
        <input type="range" min="0" max="100000" step="100"
          value={sensors.lux ?? 0}
          onChange={e => send({ cmd: 'set_sensor', key: 'lux', value: +e.target.value })}
        />
      </div>

      {/* VOC */}
      <div className="glass-card">
        <div className="sensor-row">
          <span className="sensor-label">🧪 VOC</span>
          <span className="sensor-value">{(sensors.voc_mg ?? 0).toFixed(2)} mg</span>
        </div>
        <input type="range" min="0" max="2" step="0.05"
          value={sensors.voc_mg ?? 0}
          onChange={e => send({ cmd: 'set_sensor', key: 'voc_mg', value: +e.target.value })}
        />
      </div>

      {/* 开关类传感器 */}
      <div className="glass-card">
        <div className="toggle-row">
          <span className="sensor-label">🌧️ 降雨检测</span>
          <button
            className={`toggle ${sensors.rain ? 'on' : ''}`}
            onClick={() => send({ cmd: 'set_sensor', key: 'rain_detected', value: !sensors.rain })}
            aria-label="切换降雨"
          />
        </div>
        <div className="toggle-row">
          <span className="sensor-label">🧑 人体感应</span>
          <button
            className={`toggle ${sensors.human ? 'on' : ''}`}
            onClick={() => send({ cmd: 'set_sensor', key: 'human_detected', value: !sensors.human })}
            aria-label="切换人体感应"
          />
        </div>
      </div>
    </div>
  )
}
