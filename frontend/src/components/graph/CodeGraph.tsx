import { useEffect, useMemo, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, Handle,
  Position, MarkerType, useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import './CodeGraph.css';

type ParsedTree = {
  label?: string;
  children?: ParsedTree[];
  label2?: string[];
  children2?: ParsedTree[][];
};
type GraphKind = 'class' | 'method' | 'condition' | 'loop' | 'return' | 'action' | 'merge';
type GraphData = Record<string, unknown> & { label: string; kind: GraphKind };
type GraphNode = Node<GraphData>;
type GraphResult = { nodes: GraphNode[]; edges: Edge[] };
type Props = { code: string; fileName: string; isDarkMode: boolean };

const kindOf = (label: string): GraphKind => {
  const lower = label.trim().toLowerCase();
  if (/^(class|interface|enum|record)\b/.test(lower)) return 'class';
  if (/^(method|constructor)\b/.test(lower)) return 'method';
  if (/^(if|switch|condition)\b/.test(lower)) return 'condition';
  if (/^(for|while|do|loop)\b/.test(lower)) return 'loop';
  if (/^(return|throw)\b/.test(lower)) return 'return';
  return 'action';
};

function graphFromTree(root: ParsedTree): GraphResult {
  let next = 0;
  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  const add = (label: string, kind: GraphKind): string => {
    const id = `graph-${++next}`;
    nodes.push({ id, type: 'flowBlock', data: { label, kind }, position: { x: 0, y: 0 } });
    return id;
  };
  const connect = (from: string | null, to: string, label?: string) => {
    if (!from) return;
    edges.push({ id: `edge-${edges.length}`, source: from, target: to, label, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#8796ac', strokeWidth: 1.7 } });
  };
  const walkSequence = (children: ParsedTree[], start: string | null, branchLabel?: string): string | null => {
    let tail = start;
    for (const [index, child] of children.entries()) {
      if (tail === null) break;
      tail = walk(child, tail, index === 0 ? branchLabel : undefined);
    }
    return tail;
  };
  const walk = (tree: ParsedTree, incoming: string | null, via?: string): string | null => {
    const label = String(tree.label ?? '').trim();
    const children = Array.isArray(tree.children) ? tree.children : [];
    const branches = Array.isArray(tree.children2) ? tree.children2 : [];
    if (!label) return walkSequence(children, incoming, via);
    const kind = kindOf(label);
    const current = add(label, kind);
    connect(incoming, current, via);
    if (kind === 'return') return null;
    if ((kind === 'condition' || kind === 'loop' || branches.length > 0) && (children.length || branches.length)) {
      const merge = add('Продолжение', 'merge');
      const bodyEnd = walkSequence(children, current, kind === 'condition' ? 'Да' : 'Тело');
      if (kind === 'loop') {
        connect(bodyEnd, current, 'Повтор');
        connect(current, merge, 'Выход');
      } else {
        connect(bodyEnd, merge);
        if (branches.length === 0) connect(current, merge, 'Нет');
        for (const [index, branch] of branches.entries()) {
          const branchName = tree.label2?.[index] || `Ветка ${index + 1}`;
          if (branch.length) connect(walkSequence(branch, current, branchName), merge);
          else connect(current, merge, branchName);
        }
      }
      return merge;
    }
    return walkSequence(children, current);
  };
  walk(root, null);
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: 'TB', nodesep: 54, ranksep: 75, marginx: 40, marginy: 36 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) layout.setNode(node.id, { width: 220, height: 70 });
  for (const edge of edges) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);
  for (const node of nodes) {
    const pos = layout.node(node.id);
    node.position = { x: pos.x - 110, y: pos.y - 35 };
  }
  return { nodes, edges };
}

function FlowBlock({ data }: NodeProps<GraphNode>) {
  return <div className={`cg-node cg-${data.kind}`}>
    <Handle type="target" position={Position.Top} />
    {data.label}
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes: NodeTypes = { flowBlock: FlowBlock };

export default function CodeGraph({ code, fileName, isDarkMode }: Props) {
  const [tree, setTree] = useState<ParsedTree | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const arranged = useMemo(() => tree ? graphFromTree(tree) : { nodes: [], edges: [] }, [tree]);
  useEffect(() => { setNodes(arranged.nodes); setEdges(arranged.edges); }, [arranged, setNodes, setEdges]);

  useEffect(() => {
    if (!code.trim()) { setTree(null); setError(''); setBusy(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch('/graph', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ code }),
  signal: controller.signal,
});
        if (!response.ok) throw new Error(`API графа вернул HTTP ${response.status}`);
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || !('label' in result)) {
          throw new Error('Сервер не вернул дерево JavaParser');
        }
        setTree(result as ParsedTree);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted) {
          setTree(null);
          setError(cause instanceof Error ? cause.message : 'Ошибка построения графа');
        }
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [code]);

  return <div className={`cg-root ${isDarkMode ? 'cg-dark' : 'cg-light'}`}>
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} colorMode={isDarkMode ? 'dark' : 'light'} fitView
      fitViewOptions={{ padding: 0.2 }} nodesConnectable={false} minZoom={0.1} maxZoom={2}>
      <Background variant={BackgroundVariant.Lines} gap={24} size={1} color={isDarkMode ? '#243147' : '#e3e9f3'} />
      <Controls position="top-right" showInteractive={false} />
      <MiniMap position="bottom-right" pannable zoomable />
    </ReactFlow>
    <div className="cg-overlay">{fileName} · блок-схема {busy ? '· обновление…' : ''}</div>
    {error && <div className="cg-overlay cg-error">{error}</div>}
    {!busy && !error && nodes.length === 0 && <div className="cg-empty">Нет данных для графа</div>}
  </div>;
}
