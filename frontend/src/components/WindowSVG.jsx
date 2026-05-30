import { memo } from 'react'

const STATE_LABELS = {
  closed: '已关闭',
  opening: '开启中',
  open_partial: '半开',
  open_full: '全开',
  closing: '关闭中',
  stopped: '已停止',
  blocked: '遇阻',
  locked: '已锁定',
}

function WindowSVG({
  openPct = 0,
  screenPct = 0,
  state = 'closed',
  motion = 'stopped',
  actuatorState = 'idle',
  rain = false,
  wind = 0,
  alarm = false,
}) {
  const pct = Math.max(0, Math.min(100, openPct)) / 100
  const scrPct = Math.max(0, Math.min(100, screenPct)) / 100
  const sashOffset = pct * 58
  const screenHeight = Math.max(10, 154 * scrPct)
  const screenBarY = 48 + screenHeight
  const windowTrack = 56 + pct * 78
  const screenTrack = 56 + scrPct * 78
  const motorActive = ['extending', 'retracting'].includes(actuatorState) || motion !== 'stopped'
  const accent = alarm ? '#f87171' : motorActive ? '#22c55e' : '#38bdf8'

  return (
    <div className="window-svg-container">
      <svg className="window-svg" viewBox="0 0 260 260" role="img" aria-label="门窗状态示意图">
        <defs>
          <linearGradient id="glassFill" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#1f6feb" stopOpacity="0.22" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0.08" />
          </linearGradient>
          <pattern id="meshFill" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 4H8M4 0V8" stroke="#94a3b8" strokeOpacity=".32" strokeWidth=".7" />
          </pattern>
        </defs>

        <rect x="18" y="18" width="224" height="224" rx="8" fill="#111827" />
        <rect x="42" y="32" width="176" height="188" rx="5" fill="#0f172a" stroke="#334155" strokeWidth="5" />
        <rect x="55" y="45" width="150" height="162" rx="2" fill="#07111f" stroke="#475569" />
        <rect x="57" y="47" width="70" height="158" rx="2" fill="url(#glassFill)" stroke="#64748b" />
        <rect x="133" y="47" width="70" height="158" rx="2" fill="#123247" fillOpacity=".35" stroke="#64748b" />
        <rect x="58" y="124" width="144" height="5" rx="2.5" fill="#475569" />

        <rect x={74} y="52" width={Math.max(12, pct * 92)} height="148" rx="3" fill="#38bdf8" opacity=".16" />
        <g style={{ transform: `translate(${-sashOffset}px, 0)`, transformOrigin: '132px 47px', transition: 'transform .45s cubic-bezier(.22, 1, .36, 1)' }}>
          <rect x="133" y="47" width="70" height="158" rx="3" fill="#b9e2f2" fillOpacity=".42" stroke={accent} strokeWidth="3" />
          <rect x="139" y="58" width="4" height="136" rx="2" fill="#f8fafc" opacity=".88" />
          <circle cx="148" cy="126" r="4" fill={accent} />
        </g>

        {scrPct > 0.01 && (
          <g style={{ transition: 'height .45s ease, transform .45s ease' }}>
            <rect x="57" y="48" width="146" height={screenHeight} fill="url(#meshFill)" opacity=".9" />
            <rect x="55" y={screenBarY} width="150" height="7" rx="3.5" fill="#e2e8f0" />
          </g>
        )}

        <rect x="58" y="213" width="112" height="8" rx="4" fill="#1e293b" />
        <rect x="58" y="213" width={Math.max(8, pct * 112)} height="8" rx="4" fill="#38bdf8" />
        <circle cx={windowTrack} cy="217" r="6" fill={accent} />
        <rect x="58" y="228" width="112" height="8" rx="4" fill="#1e293b" />
        <rect x="58" y="228" width={Math.max(8, scrPct * 112)} height="8" rx="4" fill="#22c55e" />
        <circle cx={screenTrack} cy="232" r="6" fill="#22c55e" />

        <rect x="178" y="216" width="36" height="17" rx="6" fill="#f8fafc" stroke="#cbd5e1" />
        <circle cx="189" cy="224.5" r="4" fill={motorActive ? '#22c55e' : '#64748b'} />

        {rain && Array.from({ length: 8 }).map((_, index) => (
          <line
            key={index}
            x1={65 + index * 17}
            y1="54"
            x2={59 + index * 17}
            y2="70"
            stroke="#60a5fa"
            strokeWidth="2"
            strokeLinecap="round"
            className="wsvg-rain"
            style={{ animationDelay: `${index * 0.1}s` }}
          />
        ))}

        {wind > 5 && Array.from({ length: 3 }).map((_, index) => (
          <path
            key={index}
            d={`M38 ${92 + index * 34} C72 ${80 + index * 34}, 96 ${105 + index * 34}, 132 ${90 + index * 34}`}
            stroke="#e2e8f0"
            strokeOpacity=".55"
            strokeWidth="2"
            fill="none"
            className="wsvg-wind"
            style={{ animationDelay: `${index * 0.2}s` }}
          />
        ))}

        {alarm && <rect x="36" y="26" width="188" height="200" rx="8" fill="none" stroke="#f87171" strokeWidth="3" className="wsvg-alarm-frame" />}
      </svg>
      <div className="window-svg-label">
        <strong>{STATE_LABELS[state] || state}</strong>
        <span>窗 {Math.round(openPct)}%</span>
        <span>纱窗 {Math.round(screenPct)}%</span>
      </div>
    </div>
  )
}

export default memo(WindowSVG)
