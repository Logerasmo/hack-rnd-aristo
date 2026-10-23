package org.example;

import org.springframework.stereotype.Service;

@Service
public class ParserService {
    public String analyze(String javaCode) {
        // Пока просто заглушка, чтобы убедиться, что класс доступен
        return "JavaParser доступен. Длина кода: " + javaCode.length();
    }
}