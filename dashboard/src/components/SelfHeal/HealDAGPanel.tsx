import React, { useEffect, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, Edge, MarkerType, Node, BackgroundVariant,
  useEdgesState, useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import HealNode, { HealStatus } from './HealNode'
import ReliabilityRing from './ReliabilityRing'
import { useTheme } from '../../theme'

const nodeTypes = { healNode: HealNode }

interface DAGNode {
  id: string
  name?: string
  type: string
  depends_on?: string[]
}

interface Props {
  dag: Record<string, unknown> | null
  statusMap: Record<string, HealStatus>
  vulnMap: Record<string, number>
  score: number
  grade: string
  phaseLabel: string
  edgeColor: string
}

function layout(nodes: DAGNode[]) {
  const level: Record<string, number> = {}
  const getLevel = (id: string): number => {
    if (id in level) return level[id]
    const n = nodes.find(x => x.id === id)
    if (!n || !n.depends_on?.length) { level[id] = 0; return 0 }
    level[id] = Math.max(...n.depends_on.map(getLevel)) + 1
    return level[id]
  }
  nodes.forEach(n => getLevel(n.id))
  const byLevel: Record<number, string[]> = {}
  nodes.forEach(n => { const l = level[n.id] ?? 0; (byLevel[l] ||= []).push(n.id) })
  const pos: Record<string, { x: number; y: number }> = {}
  Object.entries(byLevel).forEach(([lv, ids]) => {
    ids.forEach((id, i) => { pos[id] = { x: Number(lv) * 230, y: (i - (ids.length - 1) / 2) * 110 } })
  })
  return pos
}

export const HealDAGPanel: React.FC<Props> = ({
  dag, statusMap, vulnMap, score, grade, phaseLabel, edgeColor,
}) => {
  const { colors } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const dagNodes: DAGNode[] = useMemo(() => {
    const raw = (dag as Record<string, unknown> | null)?.['nodes']
    return Array.isArray(raw) ? (raw as DAGNode[]) : []
  }, [dag])

  useEffect(() => {
    if (!dagNodes.length) { setNodes([]); setEdges([]); return }
    const pos = layout(dagNodes)
    const flowNodes: Node[] = dagNodes.map(n => ({
      id: n.id,
      type: 'healNode',
      position: pos[n.id] ?? { x: 0, y: 0 },
      data: {
        label: n.name || n.id,
        type: (n.type || '').toLowerCase(),
        status: statusMap[n.id] ?? 'pending',
        vulnCount: vulnMap[n.id] ?? 0,
      },
    }))
    const ids = new Set(dagNodes.map(n => n.id))
    const flowEdges: Edge[] = []
    dagNodes.forEach(n => (n.depends_on ?? []).forEach(dep => {
      if (ids.has(dep)) flowEdges.push({
        id: `${dep}->${n.id}`, source: dep, target: n.id, type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: 1.5 }, animated: true,
      })
    }))
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [dagNodes, statusMap, vulnMap, edgeColor]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: colors.panelBg, borderRadius: 12, border: `1px solid ${colors.panelBorder}`, overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${colors.panelBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Reliability graph</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>{phaseLabel}</div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {!dagNodes.length ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10, color: colors.textMuted, padding: 24,
          }}>
            <div style={{ fontSize: 34, opacity: 0.3 }}>🛡</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>Reliability graph will appear here</div>
            <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6, maxWidth: 260 }}>
              Describe a workflow and run Self-Heal. Watch nodes turn red where
              they're fragile, then heal to green as Flint patches them.
            </div>
          </div>
        ) : (
          <>
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }} style={{ background: 'transparent' }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={colors.panelBorder} />
              <Controls style={{ background: colors.inputBg, border: `1px solid ${colors.panelBorder}` }} />
            </ReactFlow>

            {/* Live score ring overlay */}
            <div style={{
              position: 'absolute', top: 12, right: 12, zIndex: 5,
              background: colors.panelBg + 'cc', backdropFilter: 'blur(4px)',
              border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: '10px 12px',
            }}>
              <ReliabilityRing value={score} grade={grade} size={96} label="reliability" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default HealDAGPanel
