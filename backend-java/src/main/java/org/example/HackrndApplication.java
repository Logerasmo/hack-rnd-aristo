package org.example;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import org.example.service.ParserService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.util.Collections;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@SpringBootApplication
public class HackrndApplication {
    public static void main(String[] args) throws IOException {

        //SpringApplication.run(HackrndApplication.class, args);
        // Парсинг целого файла/класса → возвращает CompilationUnit (корень AST)


        String code = Files.readString(Path.of("D:\\Coding\\proj\\backend-java\\src\\main\\java\\org\\example\\service\\tools\\example.java"));
        ParserService ps = new ParserService();
        CompilationUnit cu = ps.getCompilation(code);
        List<MethodDeclaration> methods = ps.getMethodsList(cu);
        ps.printMethodTree(methods.get(0));
        System.out.println(ParserService.getClassTree(code));

//        SpringApplication app = new SpringApplication(HackrndApplication.class);
//        // Жестко ставим порт 8081 в обход любых файлов настроек
//        app.setDefaultProperties(Collections.singletonMap("server.port", "8081"));
//        app.run(args);
    }
}