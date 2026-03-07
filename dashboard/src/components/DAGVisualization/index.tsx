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
import { useWebSocket } from '../../hooks/useWebSocket'

const nodeTypes = { taskNode: TaskNode }

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
  // Simple layered layout
  const levelMap: Record<string, number> = {}

  const getLevel = (id: string): number => {
    if (id in levelMap) return levelMap[id]
    const node = dagNodes.find(n => n.id === id)
    if (!node || !node.depends_on?.length) {
      levelMap[id] = 0
      return 0
    }
    const maxParentLevel = Math.max(...node.depends_on.map(d => getLevel(d)))
    levelMap[id] = maxParentLevel + 1
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
    const x = parseInt(level) * 220 + 80
    ids.forEach((id, i) => {
      const y = i * 100 + (4 - ids.length) * 50 + 80
      positions.push({ x, y, id })
    })
  })
  return positions
}

export default function DAGVisualization({ dag, jobId, taskStatuses, onTaskStatusUpdate }: Props) {
  const dagNodes = (dag.nodes as DAGNode[]) || []

  const positions = useMemo(() => layoutNodes(dagNodes), [dagNodes])

  const buildNodes = useCallback((): Node<TaskNodeData>[] =>
    dagNodes.map(n => {
      const pos = positions.find(p => p.id === n.id) ?? { x: 0, y: 0 }
      return {
        id: n.id,
        type: 'taskNode',
        position: { x: pos.x, y: pos.y },
        data: {
          label: n.name || n.id,
          type: n.type,
          status: taskStatuses[n.id] || 'pending',
        },
      }
    }), [dagNodes, taskStatuses, positions])

  const buildEdges = useCallback((): Edge[] =>
    dagNodes.flatMap(n =>
      (n.depends_on || []).map(dep => ({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        animated: taskStatuses[dep] === 'running' || taskStatuses[n.id] === 'running',
        style: {
          stroke: taskStatuses[dep] === 'completed' ? '#22c55e' :
                  taskStatuses[dep] === 'failed' ? '#ef4444' : '#444',
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#444' },
      }))
    ), [dagNodes, taskStatuses])

  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges())

  // Update nodes/edges when statuses change
  useEffect(() => {
    setNodes(buildNodes())
    setEdges(buildEdges())
  }, [taskStatuses, buildNodes, buildEdges, setNodes, setEdges])

  // WebSocket for live updates
  useWebSocket(jobId, (msg) => {
    if (msg.task_id && msg.status) {
      onTaskStatusUpdate(prev => ({ ...prev, [msg.task_id!]: msg.status! }))
    }
  })

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: '#0f0f0f' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a1a" variant={BackgroundVariant.Dots} gap={24} />
        <Controls style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }} />
      </ReactFlow>
    </div>
  )
}
