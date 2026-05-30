import { useMemo } from 'react'
import ReactFlow, { Background, Controls, Panel, ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'

const TYPE_LABELS = {
  Selector: 'SEL',
  Sequence: 'SEQ',
  Behaviour: 'ACT',
}

const NODE_SIZES = {
  Selector: { w: 210, h: 48 },
  Sequence: { w: 190, h: 44 },
  Behaviour: { w: 170, h: 40 },
}

const STATUS_META = {
  success: { label: '成功', className: 'success', color: '#22c55e' },
  failure: { label: '失败', className: 'failure', color: '#64748b' },
  running: { label: '运行', className: 'running', color: '#f59e0b' },
  invalid: { label: '未运行', className: 'invalid', color: '#334155' },
}

const H_GAP = 30
const V_GAP = 88

function collectStats(node, acc = { running: 0, success: 0, failure: 0, invalid: 0, total: 0 }) {
  if (!node) return acc
  acc.total += 1
  if (acc[node.status] !== undefined) acc[node.status] += 1
  else acc.invalid += 1
  node.children?.forEach(child => collectStats(child, acc))
  return acc
}

function findActiveLeaves(node, leaves = []) {
  if (!node) return leaves
  if ((node.status === 'success' || node.status === 'running') && !node.children?.length) {
    leaves.push(node)
  }
  node.children?.forEach(child => findActiveLeaves(child, leaves))
  return leaves
}

function measureSubtree(node) {
  const size = NODE_SIZES[node.type] || NODE_SIZES.Behaviour
  if (!node.children?.length) return size.w
  const childrenWidth = node.children.reduce((sum, child) => sum + measureSubtree(child), 0)
  return Math.max(size.w, childrenWidth + (node.children.length - 1) * H_GAP)
}

function buildFlowData(node, x, y, parentId, nodes, edges) {
  const size = NODE_SIZES[node.type] || NODE_SIZES.Behaviour
  const status = node.status || 'invalid'

  nodes.push({
    id: node.id,
    position: { x: x - size.w / 2, y },
    data: { label: node.name, type: node.type, status },
    type: 'btNode',
    style: { width: size.w, height: size.h },
  })

  if (parentId) {
    const isLive = status === 'success' || status === 'running'
    edges.push({
      id: `${parentId}->${node.id}`,
      source: parentId,
      target: node.id,
      type: 'smoothstep',
      animated: status === 'running',
      style: {
        stroke: isLive ? STATUS_META[status].color : 'rgba(148, 163, 184, .22)',
        strokeWidth: isLive ? 2.2 : 1.2,
      },
    })
  }

  if (!node.children?.length) return

  const totalWidth = node.children.reduce((sum, child) => sum + measureSubtree(child), 0) + (node.children.length - 1) * H_GAP
  let offsetX = x - totalWidth / 2
  node.children.forEach((child) => {
    const childWidth = measureSubtree(child)
    buildFlowData(child, offsetX + childWidth / 2, y + V_GAP, node.id, nodes, edges)
    offsetX += childWidth + H_GAP
  })
}

function BTNodeComponent({ data }) {
  const meta = STATUS_META[data.status] || STATUS_META.invalid
  const typeLabel = TYPE_LABELS[data.type] || 'ACT'

  return (
    <div className={`bt-node bt-node--${meta.className} bt-node--${data.type?.toLowerCase() || 'behaviour'}`}>
      <span className="bt-node-status" />
      <span className="bt-node-label" title={data.label}>{data.label}</span>
      <span className="bt-node-type">{typeLabel}</span>
    </div>
  )
}

const nodeTypes = { btNode: BTNodeComponent }

function FlowCanvas({ nodes, edges }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      defaultViewport={{ x: 170, y: 72, zoom: 0.76 }}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.28}
      maxZoom={2}
      style={{ background: 'transparent' }}
    >
      <Background color="rgba(148, 163, 184, .14)" gap={24} />
      <Controls showInteractive={false} />
      <Panel position="top-left" className="bt-legend">
        {Object.entries(STATUS_META).slice(0, 4).map(([key, meta]) => (
          <span key={key}><i className={`legend-dot legend-dot--${meta.className}`} />{meta.label}</span>
        ))}
      </Panel>
    </ReactFlow>
  )
}

function SummaryCard({ stats, activeBranch, activeLeaves }) {
  return (
    <div className="bt-summary">
      <div className="bt-summary-main">
        <span>当前分支</span>
        <strong>{activeBranch || activeLeaves[0]?.name || '等待命中'}</strong>
      </div>
      <div className="bt-stat-row">
        <span><i className="legend-dot legend-dot--running" />{stats.running} 运行</span>
        <span><i className="legend-dot legend-dot--success" />{stats.success} 成功</span>
        <span><i className="legend-dot legend-dot--failure" />{stats.failure} 失败</span>
        <span>{stats.total} 节点</span>
      </div>
      {activeLeaves.length > 0 && (
        <div className="bt-active-strip">
          {activeLeaves.map(leaf => <span key={leaf.id}>{leaf.name}</span>)}
        </div>
      )}
    </div>
  )
}

export default function BehaviorTree({ node, activeBranch }) {
  const stats = useMemo(() => collectStats(node), [node])
  const activeLeaves = useMemo(() => findActiveLeaves(node).slice(0, 4), [node])
  const { nodes, edges } = useMemo(() => {
    if (!node) return { nodes: [], edges: [] }
    const nextNodes = []
    const nextEdges = []
    buildFlowData(node, 0, 0, null, nextNodes, nextEdges)
    return { nodes: nextNodes, edges: nextEdges }
  }, [node])

  if (!node) return null

  return (
    <div className="bt-wrapper">
      <SummaryCard stats={stats} activeBranch={activeBranch} activeLeaves={activeLeaves} />
      <div className="bt-canvas">
        <ReactFlowProvider>
          <FlowCanvas nodes={nodes} edges={edges} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
