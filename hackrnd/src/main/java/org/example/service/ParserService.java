package org.example.service;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.stmt.*;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ParserService {
    private boolean isSimple(Statement stmt) {
        return stmt instanceof ExpressionStmt      // присваивание, вызов метода, counter++
                || stmt instanceof ReturnStmt         // return ...
                || stmt instanceof ThrowStmt          // throw ...
                || stmt instanceof BreakStmt          // break
                || stmt instanceof ContinueStmt       // continue
                || stmt instanceof ExplicitConstructorInvocationStmt
                || stmt instanceof AssertStmt
                || stmt instanceof EmptyStmt;// this(...) / super(...)
    }

    public CompilationUnit getCompilation(String code) {
        return StaticJavaParser.parse(code);
    }

    public List<MethodDeclaration> getMethodsList(CompilationUnit cu) {
        return cu.findAll(MethodDeclaration.class);
    }

    public List<Statement> methodToStatements(MethodDeclaration md) {
        List<Statement> lst = new ArrayList<>();
        md.getBody().ifPresent(body -> {
            lst.addAll(body.getStatements());
        });
        return lst;
    }

    private void addToBranch(TreeNode parent, Statement body, int num) {
        if (body instanceof BlockStmt block) {
            for (Statement s : block.getStatements()) {
                if (num < 0) parent.addChild(getTree(s));
                else parent.addChild2(getTree(s), num);
            }
        } else {
            if (num < 0) parent.addChild(getTree(body));
            else parent.addChild2(getTree(body), num);
        }
    }

    public TreeNode getTree(Statement st) {
        TreeNode cur;
        if (isSimple(st)) {
            return new TreeNode(st, st.toString());
        } else if (st instanceof BlockStmt blockStmt) {
            cur = new TreeNode(st, "");
            blockStmt.getStatements().forEach(x -> cur.addChild(getTree(x)));
            return cur;
        } else {
            if (st instanceof WhileStmt whileStmt) {
                String header = "while (" + whileStmt.getCondition() + ")";
                TreeNode node = new TreeNode(st, header);
                addToBranch(node, whileStmt.getBody(), -1); // тело в children
                return node;
            } else if (st instanceof ForStmt forStmt) {
                String init = forStmt.getInitialization().stream()
                        .map(Object::toString).collect(Collectors.joining(", "));
                String compare = forStmt.getCompare().map(Object::toString).orElse("");
                String update = forStmt.getUpdate().stream()
                        .map(Object::toString).collect(Collectors.joining(", "));
                String header = "for (" + init + "; " + compare + "; " + update + ")";
                TreeNode node = new TreeNode(st, header);
                addToBranch(node, forStmt.getBody(), -1); // тело в children
                return node;
            } else if (st instanceof ForEachStmt forEachStmt) {
                String header = "for (" + forEachStmt.getVariable() + " : " + forEachStmt.getIterable() + ")";
                TreeNode node = new TreeNode(st, header);
                addToBranch(node, forEachStmt.getBody(), -1); // тело в children
                return node;
            } else if (st instanceof SynchronizedStmt sync) {
                String header = "synchronized (" + sync.getExpression() + ")";
                TreeNode node = new TreeNode(st, header);
                addToBranch(node, sync.getBody(), -1); // тело в children
                return node;
            } else {
                if (st instanceof DoStmt doStmt) {
                    String header = "do { ... } while (" + doStmt.getCondition() + ")";
                    cur = new TreeNode(st, header);
                    addToBranch(cur, doStmt.getBody(), -1);
                    return cur;
                } else if (st instanceof TryStmt tryStmt) {
                    String header;
                    if (!tryStmt.getResources().isEmpty()) {
                        String resources = tryStmt.getResources().stream()
                                .map(Object::toString)
                                .collect(Collectors.joining("; "));
                        header = "try (" + resources + ")";
                    } else {
                        header = "try";
                    }
                    cur = new TreeNode(st, header);

                    // try-блок → children (основная ветка)
                    tryStmt.getTryBlock().getStatements()
                            .forEach(x -> cur.addChild(getTree(x)));

                    // catch и finally → children2 с номерами
                    int branchNum = 0;

                    for (CatchClause catchClause : tryStmt.getCatchClauses()) {
                        cur.setLabel2("catch (" + catchClause.getParameter() + ")", branchNum);
                        int finalBranchNum = branchNum;
                        catchClause.getBody().getStatements()
                                .forEach(x -> cur.addChild2(getTree(x), finalBranchNum));
                        branchNum++;
                    }

                    if (tryStmt.getFinallyBlock().isPresent()) {
                        cur.setLabel2("finally", branchNum);
                        int finalBranchNum1 = branchNum;
                        tryStmt.getFinallyBlock().get().getStatements()
                                .forEach(x -> cur.addChild2(getTree(x), finalBranchNum1));
                        branchNum++;
                    }
                    return cur;
                } else if (st instanceof SwitchStmt switchStmt) { //ВСЯ ветка switchStmt - нейрослоп
                    String header = "switch (" + switchStmt.getSelector() + ")";
                    cur = new TreeNode(st, header);
                    int branchNum = 0;
                    for (SwitchEntry entry : switchStmt.getEntries()) {
                        String label;
                        if (entry.isDefault()) {
                            label = "default";
                        } else {
                            label = entry.getLabels().stream()
                                    .map(Object::toString)
                                    .collect(Collectors.joining(", ", "case ", ""));
                        }
                        cur.setLabel2(label, branchNum);

                        // инструкции entry → в ветку branchNum
                        for (Statement s : entry.getStatements()) {
                            cur.addChild2(getTree(s), branchNum);
                        }
                        branchNum++;
                    }
                    return cur;
                } else if (st instanceof IfStmt ifStmt) { //ВСЯ ветка ifStmt - нейрослоп
                    String header = "if (" + ifStmt.getCondition() + ")";
                    cur = new TreeNode(st, header);

                    // then-ветка → children
                    addToBranch(cur, ifStmt.getThenStmt(), -1); // -1 = children

                    // Разворачиваем цепочку else if / else
                    int branchNum = 0;
                    Optional<Statement> elseOpt = ifStmt.getElseStmt();
                    while (elseOpt.isPresent()) {
                        Statement elseStmt = elseOpt.get();

                        if (elseStmt instanceof IfStmt elseIf) {
                            // это else if — отдельная ветка
                            cur.setLabel2("else if (" + elseIf.getCondition() + ")", branchNum);
                            addToBranch(cur, elseIf.getThenStmt(), branchNum);
                            branchNum++;
                            elseOpt = elseIf.getElseStmt(); // идём дальше по цепочке
                        } else {
                            // последний else
                            cur.setLabel2("else", branchNum);
                            addToBranch(cur, elseStmt, branchNum);
                            break;
                        }
                    }
                    return cur;
                }else {
                    throw new RuntimeException();
                }
            }
        }
    }
    public void printMethodTree(MethodDeclaration method) {
        String header = method.getNameAsString() + "("
                + method.getParameters().stream()
                .map(p -> p.getTypeAsString() + " " + p.getNameAsString())
                .collect(Collectors.joining(", "))
                + ") : " + method.getTypeAsString();

        TreeNode root = new TreeNode(method.getBody().orElse(null), header);

        // тело метода — BlockStmt, разворачиваем его инструкции как детей корня
        method.getBody().ifPresent(body -> {
            for (Statement s : body.getStatements()) {
                TreeNode child = getTree(s);
                if (child != null) root.addChild(child);
            }
        });

        System.out.println(root);
    }
}