// 窗户 SVG 可视化组件 — 2.5D 游戏引擎风格
import { memo } from 'react'

const STATE_LABELS = {
  closed: '已关闭', opening: '开启中', open_partial: '半开',
  open_full: '全开', closing: '关闭中', locked: '🔒 已锁定',
}

function WindowSVG({
  openPct = 0, screenPct = 0, state = 'closed', motion = 'stopped',
  actuatorState = 'idle', rain = false, wind = 0, alarm = false,
}) {
  const W = 200, H = 280
  const pct = Math.max(0, Math.min(100, openPct)) / 100
  const scrPct = Math.max(0, Math.min(100, screenPct)) / 100

  // Frame geometry
  const FX = 20, FY = 20, FW = 160, FH = 230
  const GX = FX + 8, GY = FY + 8, GW = FW - 16, GH = FH - 16

  // Sash perspective (skewY + scaleX simulates outward rotation)
  const skew = pct * 12
  const scaleX = 1 - pct * 0.15
  const sashTransform = `skewY(${skew}deg) scaleX(${scaleX})`

  // Screen mesh height & actuator arm
  const screenH = GH * scrPct
  const armLen = 10 + pct * 30

  const motorActive = actuatorState === 'extending' || actuatorState === 'retracting'
  const statusColor = alarm ? '#E07070' : motion !== 'stopped' ? '#7EC8A0' : '#D4A574'

  return (
    <div className="window-svg-container">
      <svg width={200} height={280} viewBox={`0 0 ${W} ${H}`} fill="none" className="window-svg">
        <defs>
          <linearGradient id="wsvg-fg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5A5A5A" /><stop offset="100%" stopColor="#2A2A2A" />
          </linearGradient>
          <linearGradient id="wsvg-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(100,180,255,0.15)" />
            <stop offset="100%" stopColor="rgba(100,180,255,0.05)" />
          </linearGradient>
          <pattern id="wsvg-mesh" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 3h6M3 0v6" stroke="rgba(80,200,80,0.4)" strokeWidth="0.4" />
          </pattern>
          <clipPath id="wsvg-clip"><rect x={GX} y={GY} width={GW} height={GH} /></clipPath>
        </defs>

        {/* Window frame */}
        <rect x={FX} y={FY} width={FW} height={FH} rx="4"
          fill="url(#wsvg-fg)" stroke={alarm ? '#E07070' : '#4A4A4A'} strokeWidth="2"
          className={alarm ? 'wsvg-alarm-frame' : ''} />

        {/* Glass pane */}
        <rect x={GX} y={GY} width={GW} height={GH} fill="url(#wsvg-glass)" />

        {/* Window sash */}
        <g style={{ transformOrigin: `${GX + GW / 2}px ${GY}px`, transform: sashTransform, transition: 'transform 0.5s ease' }}>
          <rect x={GX} y={GY} width={GW} height={GH}
            fill="rgba(100,180,255,0.08)" stroke={statusColor} strokeWidth="1"
            style={{ transition: 'stroke 0.5s ease' }} />
          <line x1={GX + GW / 2} y1={GY} x2={GX + GW / 2} y2={GY + GH} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <line x1={GX} y1={GY + GH / 2} x2={GX + GW} y2={GY + GH / 2} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        </g>

        {/* Screen mesh */}
        {scrPct > 0.01 && (
          <g clipPath="url(#wsvg-clip)">
            <rect x={GX} y={GY} width={GW} height={screenH}
              fill="url(#wsvg-mesh)" style={{ transition: 'height 0.5s ease' }} />
            <rect x={GX} y={GY} width={GW} height={screenH}
              fill="rgba(80,200,80,0.12)" style={{ transition: 'height 0.5s ease' }} />
            <rect x={GX} y={GY + screenH - 2} width={GW} height={3}
              fill="#555" rx="1.5" style={{ transition: 'y 0.5s ease' }} />
          </g>
        )}

        {/* Actuator arm */}
        <rect x={GX + GW / 2 - 3} y={FY + FH - 12} width={6} height={8} fill="#3A3A3A" rx="1" />
        <rect x={GX + GW / 2 - 1.5} y={FY + FH - 12 - armLen} width={3} height={armLen}
          fill="#D4A574" rx="1" style={{ transition: 'height 0.5s ease' }} />
        <circle cx={GX + GW / 2} cy={FY + FH - 12 - armLen} r="2.5"
          fill={motorActive ? statusColor : '#555'} style={{ transition: 'fill 0.3s, cy 0.5s ease' }} />

        {/* Motor spinning indicator */}
        {motorActive && (
          <g className="wsvg-spin" style={{ transformOrigin: `${FX + FW - 18}px ${FY + FH - 18}px` }}>
            <circle cx={FX + FW - 18} cy={FY + FH - 18} r="5" fill="none" stroke={statusColor} strokeWidth="1.5" strokeDasharray="8 6" />
          </g>
        )}

        {/* Rain droplets */}
        {rain && (
          <g clipPath="url(#wsvg-clip)">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <line key={i} x1={GX + 10 + i * 16} y1={GY} x2={GX + 8 + i * 16} y2={GY + 8}
                stroke="rgba(100,180,255,0.7)" strokeWidth="1" strokeLinecap="round"
                className="wsvg-rain"
                style={{ animationDelay: `${i * 0.15}s`, animationDuration: `${0.6 + i * 0.1}s` }} />
            ))}
          </g>
        )}

        {/* Wind arrows */}
        {wind > 5 && (
          <g clipPath="url(#wsvg-clip)">
            {[0, 1, 2].map(i => (
              <line key={i} x1={GX} y1={GY + 30 + i * 40} x2={GX + 20} y2={GY + 28 + i * 40}
                stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round"
                className="wsvg-wind"
                style={{ animationDelay: `${i * 0.3}s`, animationDuration: `${1.2 - i * 0.2}s` }} />
            ))}
          </g>
        )}

        {/* Percentage label */}
        <text x={W / 2} y={H - 8} textAnchor="middle" fill={statusColor} fontSize="9" fontFamily="monospace" opacity="0.8">
          {Math.round(openPct)}%
        </text>
      </svg>

      {/* Status text */}
      <div className="window-svg-label" style={{ color: statusColor }}>
        {STATE_LABELS[state] ?? state}
        {scrPct > 0.01 && <span className="window-svg-screen-pct"> · 纱窗 {Math.round(screenPct)}%</span>}
      </div>
    </div>
  )
}

export default memo(WindowSVG)
