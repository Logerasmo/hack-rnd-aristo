package org.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.util.Collections;

@SpringBootApplication
public class HackrndApplication {

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(HackrndApplication.class);
        // Жестко ставим порт 8081 в обход любых файлов настроек
        app.setDefaultProperties(Collections.singletonMap("server.port", "8081"));
        app.run(args);
    }
}