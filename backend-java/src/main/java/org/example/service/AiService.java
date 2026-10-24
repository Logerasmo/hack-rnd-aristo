package org.example.service;

import org.example.controller.AnalyzeTest;

import java.util.ArrayList;
import java.util.List;

public class AiService {
    public static String getTests(String code){
        // TODO: Здесь вызов OpenAI / Gemini / локальной модели
        // Например:
        // String prompt = "Сгенерируй тесты для кода:\n" + code;
        // return aiClient.sendPrompt(prompt);

        // Пока возвращаем заглушку для теста
        return """
                @@@@
                Тест на пустой массив
                ####
                @Test
                public void testEmpty() {
                    assertTrue(service.process(new int[]{}).isEmpty());
                }
                @@@@
                Тест на сумму
                ####
                @Test
                public void testSum() {
                    assertEquals(6, service.process(new int[]{1, 2, 3}));
                }
                """;

        //todo
        //Формат который ожидается при ответе от ии:
        //@@@@
        //Тест1
        //####
        //код...
        //@@@@
        //Тест2
        //...
    }
    public static String analyzeCode(String code){
        //todo
        //Формат который ожидается при ответе от ии:
        //@@@@
        //Неправильно названа переменная
        //####
        //Легкая
        //####
        //Измените имя переменной с camelCase
        //####
        //... и так далее
        //@@@@
        //Лишнее прохождение по циклу
        //...
        return """
            @@@@
            Неправильно названа переменная
            ####
            Легкая
            ####
            Имя переменной 'my_var' не соответствует camelCase. В Java принято использовать 'myVar'.
            ####
            main.java:12
            ####
            int myVar = 10;
            @@@@
            Избыточный цикл
            ####
            Средняя
            ####
            Цикл выполняет только одно действие. Можно заменить его на прямое присваивание или использовать Stream API.
            ####
            main.java:25
            ####
            int sum = list.stream().mapToInt(Integer::intValue).sum();
            @@@@
            Отсутствует проверка на null
            ####
            Высокая
            ####
            Метод не проверяет входящий массив на null, что может привести к NullPointerException.
            ####
            main.java:5-8
            ####
            if (data == null) {
                return Collections.emptyList();
            }
            """;
    }
}
