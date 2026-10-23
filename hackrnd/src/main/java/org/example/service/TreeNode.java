package org.example.service;

import com.github.javaparser.ast.stmt.Statement;
import groovy.transform.ToString;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class TreeNode {
    private String label; // например, "for loop", "int x = 1"
    private Statement statement;  // cur_statement
    private List<TreeNode> children = new ArrayList<>(); // порядок гарантирован
    private Optional<String> label2;
    private List<TreeNode> children2 = new ArrayList<>();
    // конструктор, геттеры, сеттеры
    public TreeNode(Statement statement, String label){
        this.statement = statement;
        this.label = label;
    }
    public void addChild(TreeNode child) { children.add(child); }
    public List<TreeNode> getChildren() { return children; }

    public void addChild2(TreeNode child) { children2.add(child); }
    @Override
    public String toString() {
        return super.toString();
    }

    public Optional<String> getLabel2() {
        return label2;
    }

    public void setLabel2(String label2) {
        this.label2 = Optional.of(label2);
    }
}
