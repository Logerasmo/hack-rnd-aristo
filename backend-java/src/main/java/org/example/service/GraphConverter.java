package org.example.service;

import org.example.service.tools.EdgeDTO;
import org.example.service.tools.GraphDTO;
import org.example.service.tools.NodeDTO;
import org.example.service.tools.TreeNode;

import java.util.*;

public class GraphConverter {
    private final List<NodeDTO> nodes = new ArrayList<>();
    private final List<EdgeDTO> edges = new ArrayList<>();
    private int nodeCounter = 0;
    private int edgeCounter = 0;

    private String currentLoopEndId = null;
    private String currentLoopStartId = null;

    // Принимаем на вход конкретный метод (например, "method: getStatusDescription...")
    public GraphDTO convertMethod(TreeNode methodNode) {
        String startId = createNode("start", "Start", 0);

        String lastId = startId;
        for (TreeNode child : methodNode.getChildren()) {
            lastId = processNode(child, lastId);
        }

        // ВСЕГДА создаем узел End
        String endId = createNode("end", "End", 0);

        // Если последняя операция не была return (lastId != null),
        // просто соединяем её с End
        if (lastId != null) {
            addEdge(lastId, endId, null);
        }

        // А теперь самое важное: находим все узлы, из которых нет исходящих стрелок
        // (это те самые return), и соединяем их с End.
        // Для этого проверим, у каких узлов нет исходящих ребер.
        Set<String> nodesWithOutgoingEdges = new HashSet<>();
        for (EdgeDTO edge : edges) {
            nodesWithOutgoingEdges.add(edge.source());
        }

        for (NodeDTO node : nodes) {
            // Если из узла нет стрелок, и это не сам End — ведем стрелку в End
            if (!nodesWithOutgoingEdges.contains(node.id()) && !node.id().equals(endId)) {
                addEdge(node.id(), endId, null);
            }
        }

        return new GraphDTO(nodes, edges);
    }

    private String processNode(TreeNode node, String incomingId) {
        if (node == null) return incomingId;

        String label = node.getLabel();

        // Пропускаем пустые блоки и Merge-заглушки, если они не нужны
        if (label.isEmpty() || label.equals("Merge")) {
            for (TreeNode child : node.getChildren()) {
                incomingId = processNode(child, incomingId);
            }
            return incomingId;
        }

        // 1. Обработка простых операций
        if (node.getChildren().isEmpty() && node.getChildren2().isEmpty()) {
            String type = "operation";

            if (label.startsWith("return") || label.startsWith("throw")) {
                String id = createNode(type, label, 0);
                addEdge(incomingId, id, null);
                return null; // Обрываем цепочку
            }
            if (label.startsWith("break")) {
                String id = createNode(type, label, 0);
                addEdge(incomingId, id, null);
                if (currentLoopEndId != null) addEdge(id, currentLoopEndId, null);
                return null;
            }
            if (label.startsWith("continue")) {
                String id = createNode(type, label, 0);
                addEdge(incomingId, id, null);
                if (currentLoopStartId != null) addEdge(id, currentLoopStartId, null);
                return null;
            }

            String id = createNode(type, label, 0);
            addEdge(incomingId, id, null);
            return id;
        }

        // 2. Обработка IF / ELSE IF / ELSE
        if (label.startsWith("if")) {
            String condId = createNode("condition", label, 0);
            addEdge(incomingId, condId, null);

            // Собираем точки выхода из всех веток
            List<String> branchEnds = new ArrayList<>();

            // Ветка THEN (children)
            String lastTrue = condId;
            for (TreeNode child : node.getChildren()) {
                lastTrue = processNode(child, lastTrue);
            }
            if (lastTrue != null) branchEnds.add(lastTrue);

            // Ветки ELSE IF / ELSE (children2)
            String lastFalse = condId;
            if (!node.getChildren2().isEmpty()) {
                for (int i = 0; i < node.getChildren2().size(); i++) {
                    String branchLabel = node.getLabel2().get(i);

                    // Для "else" создаем обычный узел, для "else if" - condition
                    String branchStart = branchLabel.equals("else")
                            ? createNode("operation", "else", 0)
                            : createNode("condition", branchLabel, 0);

                    addEdge(lastFalse, branchStart, "false"); // false от предыдущего условия

                    String branchEnd = branchStart;
                    for (TreeNode child : node.getChildren2().get(i)) {
                        branchEnd = processNode(child, branchEnd);
                    }
                    if (branchEnd != null) branchEnds.add(branchEnd);

                    lastFalse = branchStart; // Для следующего else if
                }
            } else {
                // Если нет else, то false-ветка идет сразу на слияние
                branchEnds.add(condId);
            }

            // Слияние всех веток
            if (branchEnds.isEmpty()) return null;
            String mergeId = createNode("operation", "Merge", 0);
            for (String endId : branchEnds) {
                addEdge(endId, mergeId, null);
            }
            return mergeId;
        }

        // 3. Обработка ЦИКЛОВ (while, for, foreach, do-while)
        if (label.startsWith("while") || label.startsWith("for") || label.startsWith("do")) {
            String condId = createNode("loop", label, 0);
            addEdge(incomingId, condId, null);

            String prevLoopEnd = currentLoopEndId;
            String prevLoopStart = currentLoopStartId;

            // Создаем узел выхода из цикла
            String exitId = createNode("operation", "Exit Loop", 0);
            currentLoopStartId = condId;
            currentLoopEndId = exitId;

            // Тело цикла
            String lastBody = condId;
            for (TreeNode child : node.getChildren()) {
                lastBody = processNode(child, lastBody);
            }

            // Обратная связь
            if (lastBody != null) addEdge(lastBody, condId, null);

            // Связь false -> выход
            addEdge(condId, exitId, "false");

            currentLoopEndId = prevLoopEnd;
            currentLoopStartId = prevLoopStart;

            return exitId;
        }

        // 4. Обработка Switch (упрощенно)
        if (label.startsWith("switch")) {
            String switchId = createNode("condition", label, 0);
            addEdge(incomingId, switchId, null);

            List<String> branchEnds = new ArrayList<>();
            for (int i = 0; i < node.getChildren2().size(); i++) {
                String branchLabel = node.getLabel2().get(i);
                String caseId = createNode("operation", branchLabel, 0);
                addEdge(switchId, caseId, null);

                String caseEnd = caseId;
                for (TreeNode child : node.getChildren2().get(i)) {
                    caseEnd = processNode(child, caseEnd);
                }
                if (caseEnd != null) branchEnds.add(caseEnd);
            }

            // Если есть break, они уже улетели в currentLoopEndId (если switch внутри цикла)
            // Для простоты просто сливаем все в Merge
            String mergeId = createNode("operation", "Merge", 0);
            for (String endId : branchEnds) {
                addEdge(endId, mergeId, null);
            }
            return mergeId;
        }

        // Fallback для всего остального (например, блоков)
        String current = incomingId;
        for (TreeNode child : node.getChildren()) {
            current = processNode(child, current);
        }
        return current;
    }

    private String createNode(String type, String label, int line) {
        String id = "n" + (nodeCounter++);
        nodes.add(new NodeDTO(id, type, label, line));
        return id;
    }

    private void addEdge(String source, String target, String label) {
        if (source == null || target == null || source.equals(target)) return;
        String id = "e" + (edgeCounter++);
        edges.add(new EdgeDTO(id, source, target, label));
    }
}