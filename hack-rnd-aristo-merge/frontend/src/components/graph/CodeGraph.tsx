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
type GraphData = Record<string, unknown> & {
  label: string;
  kind: string;
  line: number;
  childCount?: number;
  groupKind?: string;
};
type GraphNode = Node<GraphData>;
type Props = { code: string; fileName: string; isDarkMode: boolean };

const BLOCK_WIDTH = 232;
const GROUP_GAP = 140;

function FlowBlock({ data }: NodeProps<GraphNode>) {
  const kind = data.kind.toLowerCase();
  const icon: Record<string, string> = {
    start: '▶', end: '■', operation: '≡', condition: '◆',
    loop: '↻', return: '↩', method: 'ƒ', class: '◇',
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

/** A visual parent rectangle. Every block of one Java method is its child in React Flow. */
function FunctionFrame({ data }: NodeProps<GraphNode>) {
  const nested = data.groupKind === 'loop' || data.groupKind === 'condition';
  return (
    <div className={`cg-function-frame ${nested ? `cg-nested-frame cg-frame-${data.groupKind}` : ''}`}>
      <Handle type="target" position={Position.Top} className="cg-frame-input" />
      <Handle type="source" position={Position.Bottom} className="cg-frame-output" />
      <div className="cg-function-header">
        <span className="cg-function-icon" aria-hidden="true">{data.groupKind === 'loop' ? '↻' : data.groupKind === 'condition' ? '◆' : 'ƒ'}</span>
        <div className="cg-function-heading">
          <span className="cg-function-eyebrow">{data.groupKind === 'loop' ? 'ЦИКЛ' : data.groupKind === 'condition' ? 'УСЛОВИЕ' : 'ФУНКЦИЯ'}</span>
          <span className="cg-function-title" title={data.label}>{data.label}</span>
        </div>
        <span className="cg-function-count">{data.childCount ?? 0} блоков</span>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  flowBlock: FlowBlock,
  functionGroup: FunctionFrame,
};

/**
 * Drop backend join markers, but preserve every connection through them.
 * This is a rendering-only transformation; the original GraphDTO is untouched.
 */
function removeMergeMarkers(graph: GraphDTO): GraphDTO {
  const mergeIds = new Set(
    graph.nodes
      .filter(node => node.type.toLowerCase() === 'merge' || node.label.trim().toLowerCase() === 'merge')
      .map(node => node.id),
  );
  if (mergeIds.size === 0) return graph;

  let edges = [...graph.edges];
  for (const mergeId of mergeIds) {
    const incoming = edges.filter(edge => edge.target === mergeId && edge.source !== mergeId);
    const outgoing = edges.filter(edge => edge.source === mergeId && edge.target !== mergeId);
    edges = edges.filter(edge => edge.source !== mergeId && edge.target !== mergeId);

    for (const before of incoming) {
      for (const after of outgoing) {
        if (before.source === after.target) continue;
        edges.push({
          id: `${before.id}-via-${mergeId}-${after.id}`,
          source: before.source,
          target: after.target,
          label: before.label ?? after.label ?? null,
        });
      }
    }
  }

  // Some backends can produce parallel duplicates after collapsing join points.
  const deduplicated = new Map<string, BackendEdge>();
  for (const edge of edges) {
    if (mergeIds.has(edge.source) || mergeIds.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target, edge.label]);
    if (!deduplicated.has(key)) deduplicated.set(key, edge);
  }
  return {
    nodes: graph.nodes.filter(node => !mergeIds.has(node.id)),
    edges: [...deduplicated.values()],
  };
}

/**
 * The API currently returns List<GraphDTO> with no method names.
 * Read top-level method declarations from the supplied source for display only.
 * If parsing a name is ambiguous, use a neutral sequential title.
 */
function getMethodTitles(code: string, count: number): string[] {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n\r]*/g, ' ');
  const declaration = /(?:^|[;{}]\s*|\n\s*)(?:(?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^(){};\n]+>\s+)?(?:[\w$.<>?,\[\]]+\s+)+([\w$]+)\s*\(([^{};]*)\)\s*(?:throws\s+[\w$.,\s<>?]+)?\{/g;
  const titles: string[] = [];
  for (const match of withoutComments.matchAll(declaration)) {
    const methodName = match[1];
    if (['if', 'else', 'for', 'while', 'switch', 'catch', 'new'].includes(methodName)) continue;
    titles.push(`${methodName}()`);
  }
  return Array.from({ length: count }, (_, index) => titles[index] ?? `Метод ${index + 1}`);
}

function approximateBlockHeight(node: BackendNode): number {
  // Dagre must know the approximate rendered size so labels don't overlap.
  const estimatedLines = Math.ceil(node.label.length / 26);
  return Math.max(node.type.toLowerCase() === 'condition' ? 80 : 68, Math.min(130, 36 + estimatedLines * 17));
}

type Container = {
  id: string;
  kind: 'loop' | 'condition';
  members: Set<string>;
  parent: string | null;
};

/** Recover structured scopes from the original CFG, without requiring backend changes. */
function discoverContainers(graph: GraphDTO): Container[] {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, BackendEdge[]>();
  const incoming = new Map<string, BackendEdge[]>();
  for (const node of graph.nodes) { outgoing.set(node.id, []); incoming.set(node.id, []); }
  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge);
    incoming.get(edge.target)?.push(edge);
  }
  const containers: Container[] = [];
  const traverse = (starts: string[], stop: Set<string>): Set<string> => {
    const seen = new Set<string>();
    const stack = [...starts];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || stop.has(id) || !byId.has(id)) continue;
      seen.add(id);
      for (const edge of outgoing.get(id) ?? []) stack.push(edge.target);
    }
    return seen;
  };
  // Backend loop shape: loop --> Exit Loop (false), loop --> body --> loop.
  for (const node of graph.nodes) {
    if (node.type.toLowerCase() !== 'loop') continue;
    const exits = (outgoing.get(node.id) ?? []).filter(e => e.label?.toLowerCase() === 'false' || byId.get(e.target)?.label === 'Exit Loop');
    const exitIds = new Set(exits.map(e => e.target));
    if (!exitIds.size) continue;
    const bodyStarts = (outgoing.get(node.id) ?? []).filter(e => !exitIds.has(e.target)).map(e => e.target);
    const memberIds = traverse(bodyStarts, new Set([...exitIds, node.id]));
    // Only group when the loop really has a body; keep the header node inside its frame.
    if (!memberIds.size) continue;
    memberIds.add(node.id);
    containers.push({ id: node.id, kind: 'loop', members: memberIds, parent: null });
  }
  // For conditions find first common reachable successor of all branches.
  // This is the Merge node in this backend, and remains a join after Merge removal.
  for (const node of graph.nodes) {
    if (node.type.toLowerCase() !== 'condition') continue;
    const branches = outgoing.get(node.id) ?? [];
    if (branches.length < 2) continue;
    const reachable = branches.map(edge => traverse([edge.target], new Set([node.id])));
    const common = [...reachable[0]].filter(id => reachable.every(group => group.has(id)));
    // Restrict candidate join to a node reachable from multiple branches.
    const candidate = common.find(id => (incoming.get(id)?.length ?? 0) > 1);
    if (!candidate) continue;
    const members = new Set<string>([node.id]);
    for (const edge of branches) {
      for (const id of traverse([edge.target], new Set([node.id, candidate]))) members.add(id);
    }
    if (members.size > 1) containers.push({ id: node.id, kind: 'condition', members, parent: null });
  }
  // Only structural constructs containing another condition/loop become frames.
  // A plain if/else with assignments and print calls remains a diamond node.
  const hasNestedControl = (container: Container) => [...container.members].some(id => {
    if (id === container.id) return false;
    const kind = byId.get(id)?.type.toLowerCase();
    return kind === 'condition' || kind === 'loop';
  });
  const nestedOnly = containers.filter(hasNestedControl);
  // Avoid ambiguous intersecting scopes. Every retained scope must nest or be disjoint.
  const accepted: Container[] = [];
  for (const candidate of nestedOnly.sort((a, b) => b.members.size - a.members.size)) {
    const crossing = accepted.some(existing => {
      const overlap = [...candidate.members].some(id => existing.members.has(id));
      const candidateInside = [...candidate.members].every(id => existing.members.has(id));
      const existingInside = [...existing.members].every(id => candidate.members.has(id));
      return overlap && !candidateInside && !existingInside;
    });
    if (!crossing) accepted.push(candidate);
  }
  for (const container of accepted) {
    const parents = accepted.filter(other => other !== container && other.members.size > container.members.size &&
      [...container.members].every(id => other.members.has(id)));
    container.parent = parents.sort((a, b) => a.members.size - b.members.size)[0]?.id ?? null;
  }
  return accepted;
}

function buildGraph(graphs: GraphDTO[], sourceCode: string): { nodes: GraphNode[]; edges: Edge[] } {
  const resultNodes: GraphNode[] = [];
  const resultEdges: Edge[] = [];
  const titles = getMethodTitles(sourceCode, graphs.length);
  let nextGroupY = 60;
  graphs.forEach((rawGraph, methodIndex) => {
    const graph = removeMergeMarkers(rawGraph);
    const prefix = `method-${methodIndex}-`;
    const methodId = `${prefix}frame`;
    const containers = discoverContainers(graph);
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const byContainer = new Map(containers.map(c => [c.id, c]));
    const owner = new Map<string, string | null>();
    for (const node of graph.nodes) {
      // Header belongs to its own container. Other nodes belong to their smallest surrounding group.
      const candidate = containers.filter(c => c.id !== node.id && c.members.has(node.id))
        .sort((a, b) => a.members.size - b.members.size)[0];
      owner.set(node.id, candidate?.id ?? null);
    }
    for (const c of containers) owner.set(c.id, c.parent);
    const children = new Map<string | null, string[]>();
    children.set(null, []);
    for (const c of containers) children.set(c.id, []);
    // Only show group nodes at a given level, and regular nodes not represented by a group.
    for (const node of graph.nodes) {
      const parent = owner.get(node.id) ?? null;
      if (byContainer.has(node.id)) children.get(parent)!.push(node.id);
      else children.get(parent)!.push(node.id);
    }
    type LayoutInfo = { width: number; height: number; positions: Map<string, { x: number; y: number }> };
    const dimensions = new Map<string, { width: number; height: number }>();
    const levelLayouts = new Map<string | null, LayoutInfo>();
    const HEADER = 88;
    const PAD = 66;
    const repAtLevel = (id: string, level: string | null): string | null => {
      let current = id;
      let parent = owner.get(current) ?? null;
      let guard = 0;
      while (parent !== level && parent !== null && guard++ < containers.length + 2) {
        current = parent;
        parent = owner.get(current) ?? null;
      }
      return parent === level ? current : level === null && parent === null ? current : null;
    };
    // Project a CFG connection onto visible boxes at a given nesting level.
    // Internal header-to-body connections must remain invisible, while
    // connections crossing a box boundary must attach to the box itself.
    const levelEdge = (edge: BackendEdge, level: string | null) => {
      const source = repAtLevel(edge.source, level);
      const target = repAtLevel(edge.target, level);
      if (!source || !target || source === target) return null;
      return { source, target };
    };
    const layoutLevel = (level: string | null): LayoutInfo => {
      const ids = children.get(level) ?? [];
      for (const id of ids) {
        if (byContainer.has(id)) {
          const child = layoutLevel(id);
          dimensions.set(id, { width: child.width, height: child.height });
        } else {
          dimensions.set(id, { width: BLOCK_WIDTH, height: approximateBlockHeight(byId.get(id)!) });
        }
      }
      const dag = new dagre.graphlib.Graph({ multigraph: false });
      dag.setGraph({ rankdir: 'TB', nodesep: 78, ranksep: 102, marginx: 0, marginy: 0 });
      dag.setDefaultEdgeLabel(() => ({}));
      for (const id of ids) dag.setNode(id, dimensions.get(id)!);
      for (const edge of graph.edges) {
        const projected = levelEdge(edge, level);
        if (projected && dag.hasNode(projected.source) && dag.hasNode(projected.target)) {
          dag.setEdge(projected.source, projected.target);
        }
      }
      dagre.layout(dag);
      const positions = new Map<string, { x: number; y: number }>();
      let maxX = 0, maxY = 0;
      for (const id of ids) {
        const pos = dag.node(id);
        if (!pos) continue;
        const d = dimensions.get(id)!;
        positions.set(id, { x: pos.x - d.width / 2 + PAD, y: pos.y - d.height / 2 + HEADER });
        maxX = Math.max(maxX, pos.x + d.width / 2);
        maxY = Math.max(maxY, pos.y + d.height / 2);
      }
      const info = { width: Math.max(level === null ? 650 : 400, maxX + PAD * 2),
        height: Math.max(level === null ? 290 : 220, maxY + HEADER + 80), positions };
      levelLayouts.set(level, info);
      return info;
    };
    const outer = layoutLevel(null);
    // React Flow requires parent nodes to precede descendants in the nodes array.
    resultNodes.push({
      id: methodId, type: 'functionGroup', position: { x: 60, y: nextGroupY },
      data: { label: titles[methodIndex], kind: 'functionGroup', line: 0, childCount: graph.nodes.length, groupKind: 'method' },
      style: { width: outer.width, height: outer.height },
    });
    const addLevel = (level: string | null, parentId: string) => {
      const info = levelLayouts.get(level)!;
      for (const id of children.get(level) ?? []) {
        const original = byId.get(id)!;
        const pos = info.positions.get(id) ?? { x: PAD, y: HEADER };
        if (byContainer.has(id)) {
          const container = byContainer.get(id)!;
          const d = dimensions.get(id)!;
          resultNodes.push({
            id: prefix + id + '-group', type: 'functionGroup', parentId,
            position: pos, style: { width: d.width, height: d.height },
            data: { label: original.label, kind: container.kind, groupKind: container.kind,
              line: original.line, childCount: container.members.size },
          });
          addLevel(id, prefix + id + '-group');
        } else {
          resultNodes.push({
            id: prefix + id, type: 'flowBlock', parentId, position: pos,
            data: { label: original.label, kind: original.type, line: original.line },
          });
        }
      }
    };
    addLevel(null, methodId);
    // Draw an arrow to/from the outer box when a connection crosses a
    // container boundary. Within a box, preserve arrows between regular
    // nodes, but omit arrows from the box header to its first child.
    const seenConnections = new Set<string>();
    for (const edge of graph.edges) {
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
      const sourceOwner = owner.get(edge.source) ?? null;
      const targetOwner = owner.get(edge.target) ?? null;
      const sourceAncestors = [edge.source, ...(() => {
        const ancestors: string[] = [];
        let at = sourceOwner;
        while (at) { ancestors.push(at); at = owner.get(at) ?? null; }
        return ancestors;
      })()];
      const targetAncestors = [edge.target, ...(() => {
        const ancestors: string[] = [];
        let at = targetOwner;
        while (at) { ancestors.push(at); at = owner.get(at) ?? null; }
        return ancestors;
      })()];
      // First common container is the smallest scope containing both endpoints.
      const common = sourceAncestors.find(id => targetAncestors.includes(id) && byContainer.has(id)) ?? null;
      const projected = levelEdge(edge, common);
      if (!projected) continue;
      const source = prefix + projected.source + (byContainer.has(projected.source) ? '-group' : '');
      const target = prefix + projected.target + (byContainer.has(projected.target) ? '-group' : '');
      const key = `${source}|${target}|${edge.label ?? ''}`;
      if (seenConnections.has(key)) continue;
      seenConnections.add(key);
      resultEdges.push({
        id: prefix + edge.id, source, target,
        label: edge.label ?? undefined, type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#8c9bb4', strokeWidth: 2 },
        labelBgPadding: [7, 4], labelBgBorderRadius: 5,
        labelBgStyle: { fill: '#142031', fillOpacity: 0.96 },
        labelStyle: { fill: '#b3c3d8', fontSize: 11 }, zIndex: 2,
      });
    }
    nextGroupY += outer.height + GROUP_GAP;
  });
  return { nodes: resultNodes, edges: resultEdges };
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
  const arranged = useMemo(() => buildGraph(graphs, code), [graphs, code]);

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
                    fitView fitViewOptions={{ padding: 0.12 }}
                    nodesConnectable={false} minZoom={0.1} maxZoom={2}
                    style={{ background: 'transparent' }} // ДЕЛАЕМ ФОН ПРОЗРАЧНЫМ
                    panOnDrag={true} // ВКЛЮЧАЕМ ПЕРЕТАСКИВАНИЕ ФОНА МЫШЬЮ
                    zoomOnScroll={true} // ВКЛЮЧАЕМ ЗУМ КОЛЕСИКОМ
                  >
                    {/* УДАЛЯЕМ ИЛИ КОММЕНТИРУЕМ <Background>, ЧТОБЫ НЕ БЫЛО ДВОЙНОЙ СЕТКИ */}
                    {/* <Background variant={BackgroundVariant.Lines} gap={20} size={1} color={isDarkMode ? '#223148' : '#dfe6f0'} /> */}

                    {/* Если встроенные кнопки зума ReactFlow вам не нужны, удалите <Controls> */}
                    <Controls position="top-right" showInteractive={false} />
                    <MiniMap position="bottom-right" pannable zoomable />
                  </ReactFlow>
      <div className="cg-overlay">{fileName} · блок-схема {busy ? '· обновление…' : ''}</div>
      {error && <div className="cg-overlay cg-error">{error}</div>}
      {!busy && !error && graphs.length === 0 && <div className="cg-empty">Нет методов для отображения</div>}
    </div>
  );
}
