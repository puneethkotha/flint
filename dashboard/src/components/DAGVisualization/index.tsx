import React, { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from 'reactflow'
import TaskNode, { TaskNodeData } from './TaskNode'
import AgentNode from '../AgentNode/AgentNode'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useTheme } from '../../theme'

const nodeTypes = { taskNode: TaskNode, AGENT: AgentNode }

interface DAGNode {
  id: string
  name: string
  type: string
  depends_on: string[]
}

interface Props {
  dag: Record<string, unknown>
  jobId: string | null
  taskStatuses: Record<string, string>
  onTaskStatusUpdate: (statuses: Record<string, string>) => void
}

function layoutNodes(dagNodes: DAGNode[]): { x: number; y: number; id: string }[] {
  const levelMap: Record<string, number> = {}

  const getLevel = (id: string): number => {
    if (id in levelMap) return levelMap[id]
    const node = dagNodes.find(n => n.id === id)
    if (!node || !node.depends_on?.length) {
      levelMap[id] = 0
      return 0
    }
    const max = Math.max(...node.depends_on.map(d => getLevel(d)))
    levelMap[id] = max + 1
    return levelMap[id]
  }

  dagNodes.forEach(n => getLevel(n.id))

  const levels: Record<number, string[]> = {}
  dagNodes.forEach(n => {
    const l = levelMap[n.id] ?? 0
    if (!levels[l]) levels[l] = []
    levels[l].push(n.id)
  })

  const positions: { x: number; y: number; id: string }[] = []
  Object.entries(levels).forEach(([level, ids]) => {
    const x = parseInt(level) * 230 + 60
    ids.forEach((id, i) => {
      const y = i * 90 + (Math.max(0, 3 - ids.length) * 45) + 60
      positions.push({ x, y, id })
    })
  })
  return positions
}

export default function DAGVisualization({ dag, jobId, taskStatuses, onTaskStatusUpdate }: Props) {
  const { colors } = useTheme()
  const dagNodes = (dag.nodes as DAGNode[]) || []
  const positions = useMemo(() => layoutNodes(dagNodes), [dagNodes])

  const edgeColor = '#2a2a2a'

  const buildNodes = useCallback((): Node<TaskNodeData>[] =>
    dagNodes.map(n => {
      const pos = positions.find(p => p.id === n.id) ?? { x: 0, y: 0 }
      const nodeType = n.type === 'AGENT' ? 'AGENT' : 'taskNode'
      const data = nodeType === 'AGENT'
        ? { label: n.name || n.id, type: n.type, status: taskStatuses[n.id] || 'pending', config: (n as { config?: unknown }).config, metadata: (n as { metadata?: unknown }).metadata }
        : { label: n.name || n.id, type: n.type, status: taskStatuses[n.id] || 'pending' }
      return {
        id: n.id, type: nodeType,
        position: { x: pos.x, y: pos.y },
        data,
      }
    }), [dagNodes, taskStatuses, positions])

  const buildEdges = useCallback((): Edge[] =>
    dagNodes.flatMap(n =>
      (n.depends_on || []).map(dep => {
        const depStatus = taskStatuses[dep]
        return {
          id: `${dep}->${n.id}`,
          source: dep, target: n.id,
          animated: taskStatuses[n.id] === 'running',
          style: {
            stroke: depStatus === 'completed' ? '#22c55e'
              : depStatus === 'failed' ? '#ef4444'
              : edgeColor,
            strokeWidth: 1.5,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
        }
      })
    ), [dagNodes, taskStatuses, edgeColor])

  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges())

  useEffect(() => {
    setNodes(buildNodes())
    setEdges(buildEdges())
  }, [taskStatuses, buildNodes, buildEdges, setNodes, setEdges])

  useWebSocket(jobId, (msg) => {
    if (msg.task_id && msg.status) {
      onTaskStatusUpdate({ ...taskStatuses, [msg.task_id]: msg.status })
    }
  })

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.25 }}
        style={{ background: colors.pageBg, transition: 'background 0.2s' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color='#1a1a1a'
          variant={BackgroundVariant.Dots}
          gap={28} size={1}
        />
        <Controls style={{
          background: colors.panelBg,
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: 6, boxShadow: 'none',
        }} />
      </ReactFlow>
    </div>
  )
}
