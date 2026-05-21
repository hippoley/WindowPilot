// 窗户 SVG 可视化组件 — 栖息地智能家居 · 黄昏暖光城市
import { useId } from 'react'

const STATUS_COLORS = {
  closed: '#D4A574',
  opening: '#7EC8A0',
  open: '#7EC8A0',
  closing: '#E8B86D',
  stopped: '#E07070',
  error: '#E07070',
}

const STATUS_LABELS = {
  closed: '已关闭',
  opening: '▲ 开启中',
  open: '已开启',
  closing: '▼ 关闭中',
  stopped: '⚠ 紧急停止',
  error: '✕ 故障',
}

const BUILDINGS = [
  [0, 178, 28, 82], [30, 155, 22, 105], [54, 168, 16, 92],
  [72, 148, 26, 112], [100, 162, 18, 98], [120, 172, 30, 88],
  [152, 155, 24, 105], [178, 168, 22, 92],
]

const LIGHTS = [
  [3, 185], [3, 196], [3, 207],
  [33, 162], [33, 173], [33, 184], [40, 162],
  [57, 175], [57, 186],
  [75, 155], [75, 166], [75, 177], [84, 155], [84, 166],
  [103, 169], [103, 180], [110, 169],
  [123, 179], [123, 190], [130, 179],
  [155, 162], [155, 173], [162, 162], [162, 173],
  [181, 175], [181, 186],
]

const STARS = [
  [22, 18, 1.0, 0.5], [55, 10, 0.8, 0.4], [80, 22, 0.9, 0.45],
  [110, 8, 1.1, 0.5], [140, 20, 0.7, 0.35], [165, 12, 1.0, 0.45],
]

export default function WindowSVG({
  position = 0,
  screenPosition = 0,
  status = 'closed',
  motorRunning = false,
  size = 280,
  scenarioColor = '#D4A574',
}) {
  const uid = useId().replace(/:/g, '')
  const W = 200, H = 280
  // 产品结构：顶部卷纱盒 + 中间纱网区 + 底部控制条
  const TOPBOX_H = 18  // 顶部卷纱盒
  const CTRL_H = 16    // 底部控制条
  const FX = 14, FY = 14, FW = 172, FH = 240
  // 窗口可视区域（纱网/窗户区域）
  const GX = FX + 6, GY = FY + TOPBOX_H + 4
  const GW = FW - 12, GH = FH - TOPBOX_H - CTRL_H - 8

  // 窗户是向外推开的：position=0 关闭（窗扇平面），position=1 全开（窗扇推出去）
  // 视觉表现：窗扇从底部向外推开，形成一个梯形缝隙
  const openGap = position * 40  // 窗扇推出的视觉距离（透视效果）

  // 纱窗从顶部卷纱盒往下放：screenPosition=0 收起，=1 全放下
  const screenH = GH * screenPosition

  const TRANS = '0.6s cubic-bezier(0.4,0,0.2,1)'

  const statusColor = STATUS_COLORS[status] || scenarioColor
  const svgH = Math.round(size * (H / W))
  const glowBlur = motorRunning ? 24 : 10
  const glowAlpha = motorRunning ? 0.5 : 0.25

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }

  const glowRgba = hexToRgba(statusColor, glowAlpha)

  const kf = [
    '@keyframes motor-' + uid + ' { 0%,100%{opacity:0.3} 50%{opacity:1} }',
  ].join('\n')

  // 窗扇推开的梯形路径（透视效果）
  // 关闭时：矩形覆盖整个窗口
  // 打开时：底部缩窄，形成向外推开的视觉
  const sashTop = GY
  const sashBot = GY + GH
  const shrink = openGap * 0.6  // 底部缩窄量
  const sashPath = position > 0.02
    ? `M${GX},${sashTop} L${GX + GW},${sashTop} L${GX + GW - shrink},${sashBot} L${GX + shrink},${sashBot} Z`
    : `M${GX},${sashTop} L${GX + GW},${sashTop} L${GX + GW},${sashBot} L${GX},${sashBot} Z`


  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <style>{kf}</style>
      <div style={{
        filter: 'drop-shadow(0 0 ' + glowBlur + 'px ' + glowRgba + ')',
        transition: 'filter 0.6s ease',
      }}>
        <svg width={size} height={svgH} viewBox={'0 0 ' + W + ' ' + H} fill="none">
          <defs>
            <linearGradient id={'frame-' + uid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4A4A4A" />
              <stop offset="50%" stopColor="#2D2D2D" />
              <stop offset="100%" stopColor="#1A1A1A" />
            </linearGradient>
            <clipPath id={'clip-' + uid}>
              <rect x={GX} y={GY} width={GW} height={GH} rx="1" />
            </clipPath>
          </defs>

          {/* 产品外框（深灰金属） */}
          <rect x={FX} y={FY} width={FW} height={FH} rx="5"
            fill={'url(#frame-' + uid + ')'} />
          <rect x={FX} y={FY} width={FW} height={FH} rx="5"
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />

          {/* 顶部卷纱盒 */}
          <rect x={FX + 4} y={FY + 3} width={FW - 8} height={TOPBOX_H} rx="3"
            fill="#1A1A1A" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <line x1={FX + 10} y1={FY + TOPBOX_H + 2} x2={FX + FW - 10} y2={FY + TOPBOX_H + 2}
            stroke="rgba(212,165,116,0.15)" strokeWidth="0.5" />

          {/* 窗口区域背景（室外） */}
          <g clipPath={'url(#clip-' + uid + ')'}>
            <rect x={GX} y={GY} width={GW} height={GH} fill="#1a2a3a" />
            {BUILDINGS.map(([x, y, w, h], i) => (
              <rect key={i} x={GX + (x / 200) * GW} y={GY + GH * 0.4 + (i % 4) * 15} width={w * 0.8} height={h * 0.5}
                fill="#0a1520" opacity="0.7" />
            ))}
            {LIGHTS.slice(0, 12).map(([x, y], i) => (
              <rect key={i} x={GX + (x / 200) * GW} y={GY + GH * 0.45 + (i % 4) * 15} width={2.5} height={2}
                fill="#FFD080" opacity={0.4 + (i % 3) * 0.15} rx="0.3" />
            ))}
          </g>

          {/* 窗扇（向外推开，透视梯形） */}
          <g clipPath={'url(#clip-' + uid + ')'}>
            <path d={sashPath}
              fill={position < 0.02 ? "rgba(180,210,240,0.06)" : "rgba(180,210,240,0.03)"}
              stroke={position > 0.02 ? statusColor : "rgba(255,255,255,0.08)"}
              strokeWidth={position > 0.02 ? "1.5" : "0.5"}
            />
            {/* 开窗缝隙光 */}
            {position > 0.05 && (
              <rect x={GX + shrink + 5} y={sashBot - 4} width={Math.max(0, GW - shrink * 2 - 10)} height={4}
                fill={statusColor} opacity={Math.min(0.7, position * 0.8)}
                rx="2" />
            )}
          </g>

          {/* 纱窗网格（从卷纱盒往下展开） */}
          {screenPosition > 0.01 && (
            <g clipPath={'url(#clip-' + uid + ')'}>
              <rect x={GX} y={GY} width={GW} height={screenH}
                fill="rgba(50,50,50,0.4)"
                style={{ transition: 'height ' + TRANS }} />
              {Array.from({ length: Math.min(35, Math.floor(screenH / 5)) }).map((_, i) => (
                <line key={'h' + i}
                  x1={GX} y1={GY + i * 5 + 2}
                  x2={GX + GW} y2={GY + i * 5 + 2}
                  stroke="rgba(120,120,120,0.2)" strokeWidth="0.3" />
              ))}
              {Array.from({ length: Math.floor(GW / 5) }).map((_, i) => (
                <line key={'v' + i}
                  x1={GX + i * 5 + 2} y1={GY}
                  x2={GX + i * 5 + 2} y2={GY + screenH}
                  stroke="rgba(120,120,120,0.15)" strokeWidth="0.3" />
              ))}
              {/* 纱窗底边横条 */}
              <rect x={GX} y={GY + screenH - 3} width={GW} height={3.5}
                fill="rgba(80,80,80,0.9)" rx="1.5"
                style={{ transition: 'y ' + TRANS }} />
            </g>
          )}

          {/* 两侧导轨 */}
          <rect x={FX + 3} y={GY} width={3} height={GH} fill="#2A2A2A" />
          <rect x={FX + FW - 6} y={GY} width={3} height={GH} fill="#2A2A2A" />

          {/* 底部交互控制条 */}
          <rect x={FX + 4} y={FY + FH - CTRL_H - 3} width={FW - 8} height={CTRL_H} rx="3"
            fill="#0A0A0A" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          {/* 指示灯 */}
          <circle cx={W / 2 - 20} cy={FY + FH - CTRL_H / 2 - 3} r="2.5"
            fill={motorRunning ? statusColor : "rgba(255,255,255,0.12)"}
            style={{ animation: motorRunning ? 'motor-' + uid + ' 1s ease-in-out infinite' : 'none' }} />
          <circle cx={W / 2} cy={FY + FH - CTRL_H / 2 - 3} r="2" fill="rgba(255,255,255,0.1)" />
          <circle cx={W / 2 + 20} cy={FY + FH - CTRL_H / 2 - 3} r="2" fill="rgba(255,255,255,0.1)" />
          {/* 百分比 */}
          <text x={W / 2} y={FY + FH - 4} textAnchor="middle"
            fill={statusColor} fontSize="7" fontFamily="monospace" opacity="0.7">
            {Math.round(position * 100)}%
          </text>
        </svg>
      </div>

      {/* 底部状态 */}
      <div style={{ textAlign: 'center', userSelect: 'none' }}>
        <div style={{
          fontSize: Math.round(size * 0.11),
          fontWeight: 800,
          fontFamily: "'SF Mono','Fira Code',monospace",
          color: statusColor,
          lineHeight: 1,
          transition: 'color 0.3s',
        }}>
          {Math.round(position * 100)}%
        </div>
        <div style={{
          fontSize: Math.round(size * 0.036),
          color: 'var(--text-muted)',
          marginTop: 4,
          letterSpacing: '0.5px',
        }}>
          {STATUS_LABELS[status] ?? status}
          {screenPosition > 0.01 && ' · 纱窗 ' + Math.round(screenPosition * 100) + '%'}
        </div>
      </div>
    </div>
  )
}

