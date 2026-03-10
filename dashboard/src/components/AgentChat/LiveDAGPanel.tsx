/**
 * LiveDAGPanel: right-panel that animates the DAG being built node-by-node
 * as the Agent Mode conversation progresses.
 *
 * Nodes appear one-by-one with a staggered animation when the DAG arrives
 * from the SSE stream. Uses the same ReactFlow nodeTypes as DAGVisualization.
 */

import React, { useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  BackgroundVariant,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import TaskNode from '../DAGVisualization/TaskNode'
import AgentNode from '../AgentNode/AgentNode'
import { useTheme } from '../../theme'

const nodeTypes = { taskNode: TaskNode, AGENT: AgentNode }

interface DAGNode {
  id: string
  name: string
  type: string
  depends_on?: string[]
  config?: Record<string, unknown>
}

interface StatusEvent {
  type: string
  message?: string
}

interface Props {
  dag: Record<string, unknown> | null
  buildingMessage: string | null
  statusEvent: StatusEvent | null
  doneMessage: string | null
  workflowId: string | null
}

// ── Layout (same algorithm as DAGVisualization) ────────────────────────────

function layoutNodes(dagNodes: DAGNode[]) {
  const levelMap: Record<string, number> = {}

  const getLevel = (id: string): number => {
    if (id in levelMap) return levelMap[id]
    const node = dagNodes.find(n => n.id === id)
    if (!node || !node.depends_on?.length) {
      levelMap[id] = 0
      return 0
    }
    const max = Math.max(...(node.depends_on ?? []).map(d => getLevel(d)))
    levelMap[id] = max + 1
    return levelMap[id]
  }

  dagNodes.forEach(n => getLevel(n.id))

  const levels: Record<number, string[]> = {}
  dagNodes.forEach(n => {
    const lv = levelMap[n.id] ?? 0
    if (!levels[lv]) levels[lv] = []
    levels[lv].push(n.id)
  })

  const X_STEP = 220
  const Y_STEP = 100
  const positions: Record<string, { x: number; y: number }> = {}

  Object.entries(levels).forEach(([lvStr, ids]) => {
    const lv = Number(lvStr)
    ids.forEach((id, i) => {
      positions[id] = {
        x: lv * X_STEP,
        y: (i - (ids.length - 1) / 2) * Y_STEP,
      }
    })
  })

  return positions
}

function buildFlow(dagNodes: DAGNode[], visibleCount: number) {
  const visible = dagNodes.slice(0, visibleCount)
  const positions = layoutNodes(dagNodes)  // layout all for stable positions

  const nodes: Node[] = visible.map(n => ({
    id: n.id,
    type: n.type === 'AGENT' ? 'AGENT' : 'taskNode',
    position: positions[n.id] ?? { x: 0, y: 0 },
    data: {
      label: n.name,
      type: n.type,
      status: 'pending',
      config: n.config ?? {},
    },
  }))

  const visibleIds = new Set(visible.map(n => n.id))
  const edges: Edge[] = []
  visible.forEach(n => {
    (n.depends_on ?? []).forEach(dep => {
      if (visibleIds.has(dep)) {
        edges.push({
          id: `${dep}->${n.id}`,
          source: dep,
          target: n.id,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#F59E0B' },
          style: { stroke: '#F59E0B', strokeWidth: 1.5 },
          animated: true,
        })
      }
    })
  })

  return { nodes, edges }
}

// ── Component ─────────────────────────────────────────────────────────────────

function getSubtitle(dag: Record<string, unknown> | null, dagNodes: DAGNode[], statusEvent: StatusEvent | null, buildingMessage: string | null): string {
  if (dag && dagNodes.length > 0) return `${dagNodes.length} nodes · built by agent`
  if (statusEvent) {
    switch (statusEvent.type) {
      case 'thinking': return statusEvent.message || 'Thinking…'
      case 'building': return statusEvent.message || buildingMessage || 'Building workflow…'
      case 'running': return statusEvent.message || 'Running workflow…'
      default: return statusEvent.message || 'Processing…'
    }
  }
  if (buildingMessage) return buildingMessage
  return 'Start a conversation to build a workflow'
}

export const LiveDAGPanel: React.FC<Props> = ({
  dag,
  buildingMessage,
  statusEvent,
  doneMessage,
  workflowId,
}) => {
  const { colors } = useTheme()
  const [visibleCount, setVisibleCount] = useState(0)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const dagNodes: DAGNode[] = useMemo(() => {
    if (!dag) return []
    const raw = (dag as Record<string, unknown>)['nodes']
    if (!Array.isArray(raw)) return []
    return raw as DAGNode[]
  }, [dag])

  // Animate nodes appearing one-by-one
  useEffect(() => {
    if (!dagNodes.length) {
      setVisibleCount(0)
      setNodes([])
      setEdges([])
      return
    }

    setVisibleCount(0)
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleCount(i)
      const { nodes: n, edges: e } = buildFlow(dagNodes, i)
      setNodes(n)
      setEdges(e)
      if (i >= dagNodes.length) clearInterval(timer)
    }, 300)

    return () => clearInterval(timer)
  }, [dagNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  const showEmpty = !dag && !buildingMessage

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: colors.panelBg,
      borderRadius: 12,
      border: `1px solid ${colors.panelBorder}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${colors.panelBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
            Live DAG
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {getSubtitle(dag, dagNodes, statusEvent, buildingMessage)}
          </div>
        </div>
        {workflowId && (
          <div style={{
            fontSize: 10,
            color: '#10b981',
            background: '#022c22',
            border: '1px solid #10b981',
            borderRadius: 6,
            padding: '3px 8px',
            fontFamily: 'ui-monospace, monospace',
          }}>
            live
          </div>
        )}
      </div>

      {/* Flow canvas or placeholder */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {showEmpty && (
          <EmptyState colors={colors} />
        )}

        {buildingMessage && !dag && (
          <BuildingState message={buildingMessage} colors={colors} />
        )}

        {dag && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color={colors.panelBorder}
            />
            <Controls
              style={{ background: colors.inputBg, border: `1px solid ${colors.panelBorder}` }}
            />
          </ReactFlow>
        )}

        {/* Done overlay badge */}
        {doneMessage && (
          <div style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#022c22',
            border: '1px solid #10b981',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            color: '#10b981',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
            animation: 'fadeInUp 0.3s ease',
          }}>
            {doneMessage}
          </div>
        )}
      </div>

      {/* Node count progress bar */}
      {dag && dagNodes.length > 0 && (
        <div style={{
          padding: '8px 14px',
          borderTop: `1px solid ${colors.panelBorder}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: colors.textMuted }}>Nodes rendered</span>
            <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
              {Math.min(visibleCount, dagNodes.length)} / {dagNodes.length}
            </span>
          </div>
          <div style={{ height: 2, background: colors.panelBorder, borderRadius: 1 }}>
            <div style={{
              height: '100%',
              background: '#F59E0B',
              borderRadius: 1,
              width: `${dagNodes.length ? (Math.min(visibleCount, dagNodes.length) / dagNodes.length) * 100 : 0}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}

const EmptyState: React.FC<{ colors: ReturnType<typeof useTheme>['colors'] }> = ({ colors }) => (
  <div style={{
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, color: colors.textMuted, padding: 24,
  }}>
    <div style={{ fontSize: 36, opacity: 0.3 }}>◈</div>
    <div style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>
      DAG will appear here
    </div>
    <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
      Start a conversation on the left.<br />
      nodes build in real time as the agent designs your workflow.
    </div>
    {/* Placeholder skeleton */}
    <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', opacity: 0.18 }}>
      {['◯', '→', '◯', '→', '◯'].map((s, i) => (
        <span key={i} style={{ fontSize: i % 2 === 0 ? 22 : 14, color: colors.textMuted }}>{s}</span>
      ))}
    </div>
  </div>
)

const BuildingState: React.FC<{ message: string; colors: ReturnType<typeof useTheme>['colors'] }> = ({ message, colors }) => (
  <div style={{
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 14, padding: 24,
  }}>
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      border: `3px solid ${colors.panelBorder}`,
      borderTop: '3px solid #F59E0B',
      animation: 'spin 0.8s linear infinite',
    }} />
    <div style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 240 }}>
      {message}
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

export default LiveDAGPanel
