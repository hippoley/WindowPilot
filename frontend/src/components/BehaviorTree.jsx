import { useMemo } from 'react'

// ─── 常量 ────────────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  Selector: 'SEL',
  Sequence: 'SEQ',
  Behaviour: 'ACT',
}

const STATUS_COLOR = {
  success: 'var(--success)',
  failure: 'var(--danger)',
  running: 'var(--warning)',
  invalid: 'var(--text-muted)',
}

const STATUS_BG = {
  running: 'rgba(251,191,36,0.08)',
  success: 'rgba(52,211,153,0.07)',
  failure: 'transparent',
  invalid: 'transparent',
}

// ─── 统计工具 ─────────────────────────────────────────────────────────────────

function collectStats(node, acc = { running: 0, success: 0, failure: 0 }) {
  if (!node) return acc
  if (node.status === 'running') acc.running++
  else if (node.status === 'success') acc.success++
  else if (node.status === 'failure') acc.failure++
  if (node.children) node.children.forEach(c => collectStats(c, acc))
  return acc
}

// ─── 摘要卡片 ─────────────────────────────────────────────────────────────────

const summaryStyle = {
  display: 'flex',
  gap: 8,
  padding: '8px 10px',
  marginBottom: 10,
  borderRadius: 8,
  background: 'var(--surface)',
  border: '1px solid var(--glass-border)',
}

const statItemStyle = (color) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  color,
  flex: 1,
  justifyContent: 'center',
})

const statDotStyle = (color) => ({
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
})

function SummaryCard({ stats }) {
  return (
    <div style={summaryStyle}>
      <div style={statItemStyle('var(--warning)')}>
        <span style={statDotStyle('var(--warning)')} />
        {stats.running} 运行中
      </div>
      <div style={{ width: 1, background: 'var(--glass-border)', alignSelf: 'stretch' }} />
      <div style={statItemStyle('var(--success)')}>
        <span style={statDotStyle('var(--success)')} />
        {stats.success} 成功
      </div>
      <div style={{ width: 1, background: 'var(--glass-border)', alignSelf: 'stretch' }} />
      <div style={statItemStyle('var(--danger)')}>
        <span style={statDotStyle('var(--danger)')} />
        {stats.failure} 失败
      </div>
    </div>
  )
}

// ─── 单节点 ───────────────────────────────────────────────────────────────────

const INDENT_W = 18   // 每层缩进宽度 px
const LINE_COLOR = 'rgba(255,255,255,0.10)'

function BTNode({ node, depth, isLast }) {
  const isComposite = node.children && node.children.length > 0
  const typeLabel = TYPE_LABELS[node.type] || (isComposite ? 'CMP' : 'ACT')
  const dotColor = STATUS_COLOR[node.status] || 'var(--text-muted)'
  const bg = STATUS_BG[node.status] || 'transparent'
  const isRunning = node.status === 'running'

  return (
    <div style={{ position: 'relative' }}>
      {/* 节点行 */}
      <div
        title={`${node.type} — ${node.status}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px 4px 0',
          paddingLeft: depth * INDENT_W,
          borderRadius: 6,
          background: bg,
          cursor: 'default',
          transition: 'background 0.2s',
          position: 'relative',
        }}
        onMouseEnter={e => {
          if (!isRunning && node.status !== 'success')
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = bg
        }}
      >
        {/* 缩进连接线 */}
        {depth > 0 && (
          <div style={{
            position: 'absolute',
            left: (depth - 1) * INDENT_W + 8,
            top: 0,
            bottom: isLast ? '50%' : 0,
            width: 1,
            background: LINE_COLOR,
            pointerEvents: 'none',
          }} />
        )}
        {depth > 0 && (
          <div style={{
            position: 'absolute',
            left: (depth - 1) * INDENT_W + 8,
            top: '50%',
            width: INDENT_W - 8,
            height: 1,
            background: LINE_COLOR,
            pointerEvents: 'none',
          }} />
        )}

        {/* 状态圆点 */}
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
          boxShadow: isRunning ? `0 0 6px 2px ${dotColor}` : 'none',
          animation: isRunning ? 'btPulse 1.2s ease-in-out infinite' : 'none',
        }} />

        {/* 节点名称 */}
        <span style={{
          flex: 1,
          fontSize: 12,
          color: isRunning ? 'var(--text)' : 'var(--text-sub)',
          fontWeight: isRunning ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          transition: 'color 0.2s',
        }}>
          {node.name}
        </span>

        {/* 类型标签 */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.05em',
          padding: '1px 5px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--glass-border)',
          color: 'var(--text-muted)',
          flexShrink: 0,
          fontFamily: 'monospace',
        }}>
          {typeLabel}
        </span>
      </div>

      {/* 子节点 */}
      {isComposite && node.children.map((child, i) => (
        <BTNode
          key={child.id || i}
          node={child}
          depth={depth + 1}
          isLast={i === node.children.length - 1}
        />
      ))}
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function BehaviorTree({ node, depth = 0 }) {
  const stats = useMemo(() => collectStats(node), [node])

  if (!node) return null

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <style>{`
        @keyframes btPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>

      {depth === 0 && <SummaryCard stats={stats} />}

      <BTNode node={node} depth={depth} isLast={true} />
    </div>
  )
}
