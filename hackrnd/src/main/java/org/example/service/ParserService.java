package org.example.service;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.stmt.*;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class ParserService {
    private boolean isSimple(Statement stmt) {
        return stmt instanceof ExpressionStmt      // присваивание, вызов метода, counter++
                || stmt instanceof ReturnStmt         // return ...
                || stmt instanceof ThrowStmt          // throw ...
                || stmt instanceof BreakStmt          // break
                || stmt instanceof ContinueStmt       // continue
                || stmt instanceof ExplicitConstructorInvocationStmt; // this(...) / super(...)
    }
    public CompilationUnit getCompilation(String code){
        return StaticJavaParser.parse(code);
    }
    public List<MethodDeclaration> getMethodsList(CompilationUnit cu){
        return cu.findAll(MethodDeclaration.class);
    }
    public List<Statement> methodToStatements(MethodDeclaration md){
        List<Statement> lst = new ArrayList<>();
        md.getBody().ifPresent(body -> {
            lst.addAll(body.getStatements());
        });
        return lst;
    }

    public TreeNode getTree(Statement st){
        if (isSimple(st)){
            return new TreeNode(st, st.toString());
        }
        else {
            TreeNode cur;
            if (st instanceof WhileStmt whileStmt) {
                String header = "while (" + whileStmt.getCondition() + ")";
                cur = new TreeNode(st, header);
            } else if (st instanceof ForStmt forStmt) {
                String header = "for (" + forStmt.getCompare().map(Object::toString).orElse("") + ")";
                cur = new TreeNode(st, header);
            } else if (st instanceof ForEachStmt forEachStmt) {
                String header = "for (" + forEachStmt.getVariable() + " : " + forEachStmt.getIterable() + ")";
                cur = new TreeNode(st, header);
            } else if (st instanceof SynchronizedStmt sync){
                String header = "synchronized (" + sync.getExpression() + ")";
                cur = new TreeNode(st, header);
            } else{
                if (st instanceof IfStmt ifStmt){
                    String header = "if (" + ifStmt.getCondition() + ")";
                    cur = new TreeNode(st, header);
                    cur.addChild(getTree());
                    if (ifStmt.getElseStmt().isPresent()){

                    }
                }
            }
            st.findAll(Statement.class).stream().filter(s -> !(s instanceof BlockStmt)).forEach(x -> cur.addChild(getTree(x)));
            return cur;

        }
    }
}