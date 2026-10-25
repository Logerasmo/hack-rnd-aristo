package org.example.service;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

@Service
public class AiService {
    private final ChatClient chatClient;

    public AiService(ChatClient.Builder chatClientBuilder) {
        this.chatClient = chatClientBuilder.build();
    }

    public String getTests(String code) {
        String prompt = """
                Ты — senior Java-разработчик. Сгенерируй JUnit тесты для следующего кода.
                Верни ответ строго в формате:
                @@@@
                Название теста
                ####
                Код теста
                @@@@
                Название теста
                ####
                Код теста
                (и так далее для каждого теста)
                
                Код:
                """ + code;

        return chatClient.prompt()
                .user(prompt)
                .call()
                .content();
    }

    public String analyzeCode(String code) {
        String prompt = """
                Проанализируй код и найди ошибки.
                Формат ответа:
                @@@@
                Название ошибки
                ####
                Уровень (Легкая/Средняя/Высокая)
                ####
                Описание
                ####
                Место (например main.java:12)
                ####
                Код для исправления
                @@@@
                Название ошибки... (и так далее)
                Код:
                """ + code;

        return chatClient.prompt()
                .user(prompt)
                .call()
                .content();
    }
}