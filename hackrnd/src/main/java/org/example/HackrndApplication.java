package org.example;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.stmt.BlockStmt;
import com.github.javaparser.ast.stmt.ForStmt;
import com.github.javaparser.ast.stmt.Statement;
import org.example.service.ParserService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@SpringBootApplication
public class HackrndApplication {
    public static void main(String[] args) throws IOException {

        //SpringApplication.run(HackrndApplication.class, args);
        // Парсинг целого файла/класса → возвращает CompilationUnit (корень AST)


        String code = Files.readString(Path.of("D:\\Coding\\proj\\hackrnd\\src\\main\\java\\org\\example\\service\\example.java"));
        ParserService ps = new ParserService();
        MethodDeclaration cu = ps.getMethodsList(ps.getCompilation(code)).get(1);
        System.out.println(ps.methodToStatements(cu));

    }
}
