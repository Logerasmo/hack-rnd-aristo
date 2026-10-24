package org.example;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import org.example.service.ParserService;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@SpringBootApplication
public class HackrndApplication {
    public static void main(String[] args) throws IOException {

        //SpringApplication.run(HackrndApplication.class, args);
        // Парсинг целого файла/класса → возвращает CompilationUnit (корень AST)


//        String code = Files.readString(Path.of("D:\\Coding\\proj\\hackrnd\\src\\main\\java\\org\\example\\service\\example.java"));
//        ParserService ps = new ParserService();
//        CompilationUnit cu = ps.getCompilation(code);
//        List<MethodDeclaration> methods = ps.getMethodsList(cu);
//        ps.printMethodTree(methods.get(0));

    }
}
