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

        //SpringApplication.run(HackrndApplication.class, args);
        // Парсинг целого файла/класса → возвращает CompilationUnit (корень AST)

        ;
//        System.out.println(AnalyzeTestParser.parse(AiService.getTests("")));
        String code = Files.readString(Path.of("D:\\Coding\\proj\\backend-java\\src\\main\\java\\org\\example\\service\\tools\\FeaturesDemo.java"));
////        ParserService ps = new ParserService();
////        CompilationUnit cu = ps.getCompilation(code);
////        List<MethodDeclaration> methods = ps.getMethodsList(cu);
////        ps.printMethodTree(methods.get(0));
//        System.out.println(ParserService.getClassTree(code));

        TreeNode classRoot = ParserService.getClassTree(code);

// Находим нужный метод (например, по имени)
        TreeNode targetMethod = classRoot.getChildren().stream()
                .filter(n -> n.getLabel().startsWith("method: getHighPriorityTitles"))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Метод не найден"));

        GraphConverter converter = new GraphConverter();
        GraphDTO graph = converter.convertMethod(targetMethod);
        System.out.println(graph);
//        SpringApplication app = new SpringApplication(HackrndApplication.class);
//        // Жестко ставим порт 8081 в обход любых файлов настроек
//        app.setDefaultProperties(Collections.singletonMap("server.port", "8081"));
//        app.run(args);
    }
}