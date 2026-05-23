import { useMemo } from 'react'
import ReactFlow, { Background, Controls, ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'

// ─── Constants ──────────────────────────────────────────────────────────────
const TYPE_LABELS = { Selector: 'SEL', Sequence: 'SEQ', Behaviour: 'ACT' }
const NODE_SIZES = { Selector: { w: 200, h: 44 }, Sequence: { w: 180, h: 40 }, Behaviour: { w: 160, h: 36 } }
const H_GAP = 24, V_GAP = 80

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
  return (
    <div className="bt-summary">
      <div className="bt-stat">
        <span className="bt-stat-dot warning" />
        {stats.running} 运行中
      </div>
      <div className="bt-stat-sep" />
      <div className="bt-stat">
        <span className="bt-stat-dot success" />
        {stats.success} 成功
      </div>
      <div className="bt-stat-sep" />
      <div className="bt-stat">
        <span className="bt-stat-dot danger" />
        {stats.failure} 失败
      </div>
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

// ─── Custom Node (uses CSS custom properties for dynamic colors) ─────────────
function BTNodeComponent({ data }) {
  const { label, type, status } = data
  const sc = STATUS_COLORS[status] || STATUS_COLORS.invalid
  const typeLabel = TYPE_LABELS[type] || 'ACT'
  const isSequence = type === 'Sequence'

  return (
    <div
      className={`bt-node ${status === 'running' ? 'bt-node--running' : ''} ${isSequence ? 'bt-node--seq' : ''}`}
      style={{ '--node-border': sc.border, '--node-bg': sc.bg, '--node-shadow': sc.shadow }}
    >
      <span className="bt-node-label">{label}</span>
      <span className="bt-node-type">{typeLabel}</span>
    </div>
  )
}

const nodeTypes = { btNode: BTNodeComponent }

// ─── Flow wrapper ────────────────────────────────────────────────────────────
function FlowCanvas({ nodes, edges }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      defaultViewport={{ x: 50, y: 20, zoom: 0.55 }}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.2}
      maxZoom={3}
      style={{ background: 'transparent' }}
    >
      <Background color="rgba(255,255,255,0.03)" gap={20} />
      <Controls showInteractive={false} />
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
    <div className="bt-wrapper">
      <SummaryCard stats={stats} />
      <div className="bt-canvas">
        <ReactFlowProvider>
          <FlowCanvas nodes={nodes} edges={edges} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
