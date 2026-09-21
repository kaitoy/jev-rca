import { Link } from '@tanstack/react-router'
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { Crosshair, Flame } from 'lucide-react'
import { Badge, cx, type Tone } from './ui.tsx'

export type GraphNode = {
  id: string; name: string; type: string; rank: number; col: number
  muted?: boolean; target?: boolean; origin?: boolean; badge?: { tone: Tone; label: string }
}
type GraphEdge = { from_ci: string; to_ci: string; label: string }
type CiNode = Node<GraphNode, 'ci'>
const W = 176, H = 56, GX = 200, GY = 100

function CiNodeView({ data }: NodeProps<CiNode>) {
  // Same row vocabulary as the Member CIs list: mono id link · name · mono type
  return (
    <div className={cx('flex h-14 w-44 flex-col justify-center rounded-xl px-3 glass-panel', data.muted && 'border-dashed! border-outline! opacity-70', data.origin && 'border-error! ring-2 ring-error', data.target && 'border-accent! ring-2 ring-accent shadow-glow')}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-baseline gap-2 truncate">
        {data.target && <Crosshair strokeWidth={1.8} aria-label="Target" className="h-3.5 w-3.5 shrink-0 self-center text-accent" />}
        <Link to="/cis/$id" params={{ id: data.id }} className="nodrag font-mono text-xs text-accent hover:underline">{data.id}</Link>
        <span className="truncate text-sm">{data.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-on-surface-variant">{data.type}</span>
        {data.origin
          ? <Badge tone="error" className="ml-auto gap-1"><Flame strokeWidth={2.2} aria-hidden className="h-3 w-3" />Origin</Badge>
          : data.badge && <Badge tone={data.badge.tone} className="ml-auto">{data.badge.label}</Badge>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
const nodeTypes = { ci: CiNodeView }

export function CiGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const perRank = new Map<number, number>()
  for (const n of nodes) perRank.set(n.rank, (perRank.get(n.rank) ?? 0) + 1)
  const widest = Math.max(...perRank.values())
  const rfNodes: CiNode[] = nodes.map((n) => ({
    id: n.id, type: 'ci', data: n, width: W, height: H,
    position: { x: n.col * GX + ((widest - perRank.get(n.rank)!) * GX) / 2, y: n.rank * GY }, // centre each rank
  }))
  const rfEdges: Edge[] = edges.map((e) => ({
    id: `${e.from_ci}>${e.to_ci}:${e.label}`, source: e.from_ci, target: e.to_ci, label: e.label, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed },
  }))
  return (
    <div className="h-[560px] overflow-hidden rounded-xl border border-outline-variant bg-surface-dim/40 shadow-(--inner-track-shadow) max-sm:h-[400px]">
      {/* key: uncontrolled flow re-lays out when membership changes after the loader is invalidated */}
      <ReactFlow key={nodes.map((n) => n.id).join()} defaultNodes={rfNodes} defaultEdges={rfEdges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ maxZoom: 1 }} nodesConnectable={false} elementsSelectable={false} defaultMarkerColor="var(--c-on-surface-variant)" />
    </div>
  )
}
