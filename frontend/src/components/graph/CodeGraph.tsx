import { useEffect, useMemo, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, Handle,
  Position, MarkerType, useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import './CodeGraph.css';

type BackendNode = { id: string; type: string; label: string; line: number };
type BackendEdge = { id: string; source: string; target: string; label: string | null };
type GraphDTO = { nodes: BackendNode[]; edges: BackendEdge[] };
type GraphData = Record<string, unknown> & { label: string; kind: string; line: number };
type GraphNode = Node<GraphData>;
type Props = { code: string; fileName: string; isDarkMode: boolean };

function FlowBlock({ data }: NodeProps<GraphNode>) {
  const kind = data.kind.toLowerCase();
  const icon: Record<string, string> = {
    start: '▶', end: '■', operation: '≡', condition: '◆',
    loop: '↻', return: '↩', method: 'ƒ', class: '◇', merge: '•',
  };
  return (
    <div className={`cg-node cg-${kind}`} title={data.line > 0 ? `Строка ${data.line}` : undefined}>
      <Handle type="target" position={Position.Top} />
      <span className="cg-node-icon" aria-hidden="true">{icon[kind] ?? '≡'}</span>
      <span className="cg-node-label">{data.label}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { flowBlock: FlowBlock };

function buildGraph(graphs: GraphDTO[]): { nodes: GraphNode[]; edges: Edge[] } {
  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  // GraphConverter may reuse n0/e0 for every method; IDs must be unique within React Flow.
  graphs.forEach((graph, methodIndex) => {
    const prefix = `method-${methodIndex}-`;
    for (const node of graph.nodes) {
      nodes.push({
        id: prefix + node.id,
        type: 'flowBlock',
        position: { x: 0, y: 0 },
        data: { label: node.label, kind: node.type, line: node.line },
      });
    }
    for (const edge of graph.edges) {
      edges.push({
        id: prefix + edge.id,
        source: prefix + edge.source,
        target: prefix + edge.target,
        label: edge.label ?? undefined,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#8c9bb4', strokeWidth: 2 },
        labelBgPadding: [7, 4],
        labelBgBorderRadius: 5,
        labelBgStyle: { fill: '#142031', fillOpacity: 0.96 },
        labelStyle: { fill: '#b3c3d8', fontSize: 11 },
      });
    }
  });

  if (nodes.length === 0) return { nodes, edges };
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 85, marginx: 45, marginy: 45 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) g.setNode(node.id, { width: 220, height: 70 });
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);
  for (const node of nodes) {
    const pos = g.node(node.id);
    node.position = { x: pos.x - 110, y: pos.y - 35 };
  }
  return { nodes, edges };
}

function isGraphDTOArray(value: unknown): value is GraphDTO[] {
  return Array.isArray(value) && value.every(graph =>
    graph && typeof graph === 'object' &&
    Array.isArray(graph.nodes) && Array.isArray(graph.edges) &&
    graph.nodes.every((n: BackendNode) => typeof n.id === 'string' && typeof n.label === 'string' && typeof n.type === 'string') &&
    graph.edges.every((e: BackendEdge) => typeof e.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string')
  );
}

export default function CodeGraph({ code, fileName, isDarkMode }: Props) {
  const [graphs, setGraphs] = useState<GraphDTO[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const arranged = useMemo(() => buildGraph(graphs), [graphs]);

  useEffect(() => {
    setNodes(arranged.nodes);
    setEdges(arranged.edges);
  }, [arranged, setNodes, setEdges]);

  useEffect(() => {
    if (!code.trim()) {
      setGraphs([]);
      setError('');
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch('/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`API графа вернул HTTP ${response.status}`);
        }
        const result: unknown = await response.json();
        if (!isGraphDTOArray(result)) {
          throw new Error('Неверный формат ответа: ожидается массив GraphDTO с nodes и edges');
        }
        if (controller.signal.aborted) return;
        setGraphs(result);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted) {
          setGraphs([]);
          setError(cause instanceof Error ? cause.message : 'Ошибка построения графа');
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [code]);

  return (
    <div className={`cg-root ${isDarkMode ? 'cg-dark' : 'cg-light'}`}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        colorMode={isDarkMode ? 'dark' : 'light'}
        fitView fitViewOptions={{ padding: 0.2 }}
        nodesConnectable={false} minZoom={0.1} maxZoom={2}
      >
        <Background variant={BackgroundVariant.Lines} gap={20} size={1} color={isDarkMode ? '#223148' : '#dfe6f0'} />
        <Controls position="top-right" showInteractive={false} />
        <MiniMap position="bottom-right" pannable zoomable />
      </ReactFlow>
      <div className="cg-overlay">{fileName} · блок-схема {busy ? '· обновление…' : ''}</div>
      {error && <div className="cg-overlay cg-error">{error}</div>}
      {!busy && !error && nodes.length === 0 && <div className="cg-empty">Нет методов для отображения</div>}
    </div>
  );
}
