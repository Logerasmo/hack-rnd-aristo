package org.example.service.tools;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.stmt.Statement;
import java.util.ArrayList;
import java.util.List;

public class TreeNode {
    private final String label; // например, "for loop", "int x = 1"
    private final Node statement;  // cur_statement
    private final List<TreeNode> children = new ArrayList<>(); // порядок гарантирован
    private final List<String> label2 = new ArrayList<>();
    private final List<List<TreeNode>> children2 = new ArrayList<>();

    // конструктор, геттеры, сеттеры
    public TreeNode(Node statement, String label) {
        this.statement = statement;
        this.label = label;
    }

    public void addChild(TreeNode child) {
        children.add(child);
    }

    public List<TreeNode> getChildren() {
        return children;
    }

    public void addChild2(TreeNode child, Integer num) {
        while (children2.size() <= num) {
            children2.add(new ArrayList<>());
        }
        children2.get(num).add(child);
    }


    public void setLabel2(String label, Integer num) {
        while (label2.size() <= num) {
            label2.add(null);
        }
        label2.set(num, label);
    }


    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        buildString(sb, "", true);
        return sb.toString();
    }

    private void buildString(StringBuilder sb, String prefix, boolean isLast) {
        // Главная метка узла (например, "if (a > 0)" или "try")
        sb.append(prefix)
                .append(isLast ? "└── " : "├── ")
                .append(label == null ? "(без метки)" : label)
                .append("\n");

        // Отступ для детей главной ветки
        String mainChildPrefix = prefix + (isLast ? "    " : "│   ");

        // Дети главной ветки (then у if, try-блок у try)
        for (int i = 0; i < children.size(); i++) {
            boolean last = (i == children.size() - 1)
                    && (children2.isEmpty() || !hasAnyBranch());
            children.get(i).buildString(sb, mainChildPrefix, last);
        }

        // Ветки children2 — печатаем на уровне главной метки,
        // то есть с тем же prefix, что и label
        for (int b = 0; b < children2.size(); b++) {
            String branchLabel = b < label2.size() && label2.get(b) != null
                    ? label2.get(b) : "ветка " + b;
            boolean lastBranch = (b == children2.size() - 1);

            sb.append(prefix)
                    .append(lastBranch ? "└── " : "├── ")
                    .append("[").append(branchLabel).append("]")
                    .append("\n");

            String branchPrefix = prefix + (lastBranch ? "    " : "│   ");
            List<TreeNode> branchChildren = children2.get(b);
            for (int i = 0; i < branchChildren.size(); i++) {
                boolean last = (i == branchChildren.size() - 1);
                branchChildren.get(i).buildString(sb, branchPrefix, last);
            }
            if (branchChildren.isEmpty()) {
                sb.append(branchPrefix).append("└── (пусто)\n");
            }
        }
    }

    private boolean hasAnyBranch() {
        for (List<TreeNode> b : children2) {
            if (!b.isEmpty()) return true;
        }
        return false;
    }

    public String getLabel() {
        return label;
    }

    public Node getStatement() {
        return statement;
    }

    public List<List<TreeNode>> getChildren2() {
        return children2;
    }
    public List<String> getLabel2() {
        return label2;
    }
}
