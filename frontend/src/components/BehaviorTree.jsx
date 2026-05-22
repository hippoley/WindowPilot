import { useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background, Controls, useReactFlow, ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'

// ─── Constants ──────────────────────────────────────────────────────────────
const TYPE_LABELS = { Selector: 'SEL', Sequence: 'SEQ', Behaviour: 'ACT' }
const NODE_SIZES = { Selector: { w: 140, h: 36 }, Sequence: { w: 130, h: 32 }, Behaviour: { w: 120, h: 28 } }
const H_GAP = 20, V_GAP = 70

const STATUS_COLORS = {
  success: { border: '#34d399', bg: 'rgba(52,211,153,0.12)', shadow: '0 0 8px #34d399' },
  failure: { border: '#6b7280', bg: 'rgba(107,114,128,0.08)', shadow: 'none' },
  running: { border: '#fbbf24', bg: 'rgba(251,191,36,0.12)', shadow: '0 0 10px #fbbf24' },
  invalid: { border: '#4b5563', bg: 'transparent', shadow: 'none' },
}

// ─── Stats ──────────────────────────────────────────────────────────────────
function collectStats(node, acc = { running: 0, success: 0, failure: 0 }) {
  if (!node) return acc
  if (node.status === 'running') acc.running++
  else if (node.status === 'success') acc.success++
  else if (node.status === 'failure') acc.failure++
  if (node.children) node.children.forEach(c => collectStats(c, acc))
  return acc
}

// ─── Summary Card ───────────────────────────────────────────────────────────
function SummaryCard({ stats }) {
  const item = (color, count, label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color, flex: 1, justifyContent: 'center' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {count} {label}
    </div>
  )
  const sep = <div style={{ width: 1, background: 'var(--glass-border)', alignSelf: 'stretch' }} />
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 10px', marginBottom: 6, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--glass-border)' }}>
      {item('var(--warning)', stats.running, '运行中')}{sep}{item('var(--success)', stats.success, '成功')}{sep}{item('var(--danger)', stats.failure, '失败')}
    </div>
  )
}

// ─── Tree layout ────────────────────────────────────────────────────────────
function measureSubtree(node) {
  const size = NODE_SIZES[node.type] || NODE_SIZES.Behaviour
  if (!node.children || node.children.length === 0) return size.w
  const childrenWidth = node.children.reduce((sum, c) => sum + measureSubtree(c), 0)
  return Math.max(size.w, childrenWidth + (node.children.length - 1) * H_GAP)
}

function getActivePath(node, path = new Set()) {
  if (!node) return path
  if (node.status === 'success' || node.status === 'running') {
    path.add(node.id)
    if (node.children) node.children.forEach(c => getActivePath(c, path))
  }
  return path
}

function buildFlowData(node, x, y, parentId, nodes, edges, activePath) {
  const size = NODE_SIZES[node.type] || NODE_SIZES.Behaviour
  const isActive = activePath.has(node.id)

  nodes.push({
    id: node.id,
    position: { x: x - size.w / 2, y },
    data: { label: node.name, type: node.type, status: node.status },
    type: 'btNode',
    style: { width: size.w, height: size.h },
  })

  if (parentId) {
    edges.push({
      id: `${parentId}->${node.id}`,
      source: parentId,
      target: node.id,
      type: 'smoothstep',
      animated: node.status === 'running',
      style: { stroke: isActive ? '#D4A574' : 'rgba(255,255,255,0.15)', strokeWidth: isActive ? 2.5 : 1.2 },
    })
  }

  if (node.children && node.children.length > 0) {
    const totalWidth = node.children.reduce((s, c) => s + measureSubtree(c), 0) + (node.children.length - 1) * H_GAP
    let offsetX = x - totalWidth / 2
    for (const child of node.children) {
      const cw = measureSubtree(child)
      buildFlowData(child, offsetX + cw / 2, y + V_GAP, node.id, nodes, edges, activePath)
      offsetX += cw + H_GAP
    }
  }
}

// ─── Custom Node ────────────────────────────────────────────────────────────
function BTNodeComponent({ data }) {
  const { label, type, status } = data
  const sc = STATUS_COLORS[status] || STATUS_COLORS.invalid
  const typeLabel = TYPE_LABELS[type] || 'ACT'
  const isRunning = status === 'running'
  const borderRadius = type === 'Sequence' ? 4 : 14

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      background: sc.bg, border: `1.5px solid ${sc.border}`, borderRadius,
      boxShadow: sc.shadow, padding: '0 8px', boxSizing: 'border-box',
      animation: isRunning ? 'btPulse 1.8s ease-in-out infinite' : 'none',
      transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
    }}>
      <span style={{ fontSize: 10, color: '#e5e5e5', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#a3a3a3', fontFamily: 'monospace', flexShrink: 0 }}>
        {typeLabel}
      </span>
    </div>
  )
}

const nodeTypes = { btNode: BTNodeComponent }

// ─── Flow wrapper (needs ReactFlowProvider context) ─────────────────────────
function FlowCanvas({ nodes, edges }) {
  const { fitView } = useReactFlow()
  useEffect(() => { fitView({ padding: 0.15, duration: 300 }) }, [nodes, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.3}
      maxZoom={2}
      style={{ background: 'transparent' }}
    >
      <Background color="rgba(255,255,255,0.03)" gap={20} />
      <Controls showInteractive={false} style={{ background: '#1a1510', borderColor: 'rgba(255,255,255,0.1)' }} />
    </ReactFlow>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function BehaviorTree({ node }) {
  const stats = useMemo(() => collectStats(node), [node])
  const { nodes, edges } = useMemo(() => {
    if (!node) return { nodes: [], edges: [] }
    const n = [], e = []
    const activePath = getActivePath(node)
    buildFlowData(node, 0, 0, null, n, e, activePath)
    return { nodes: n, edges: e }
  }, [node])

  if (!node) return null

  return (
    <div style={{ fontFamily: 'inherit', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes btPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; }
        .react-flow__controls button { background: #1a1510; color: #D4A574; border-color: rgba(255,255,255,0.1); }
        .react-flow__controls button:hover { background: #2a2015; }
      `}</style>
      <SummaryCard stats={stats} />
      <div style={{ flex: 1, minHeight: 200 }}>
        <ReactFlowProvider>
          <FlowCanvas nodes={nodes} edges={edges} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
