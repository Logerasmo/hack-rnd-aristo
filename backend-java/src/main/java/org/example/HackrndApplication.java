package org.example;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import org.example.service.AiService;
import org.example.service.GraphConverter;
import org.example.service.ParserService;
import org.example.service.tools.AnalyzeTestParser;
import org.example.service.tools.GraphDTO;
import org.example.service.tools.TreeNode;
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

        SpringApplication app = new SpringApplication(HackrndApplication.class);
        // Жестко ставим порт 8081 в обход любых файлов настроек
        app.setDefaultProperties(Collections.singletonMap("server.port", "8081"));
        app.run(args);
    }
}