package org.example.service.tools;

import org.example.dto.AnalyzeTest;

import java.util.ArrayList;
import java.util.List;

public class AnalyzeTestParser {


    public static List<AnalyzeTest> parse(String aiResponse) {
        List<AnalyzeTest> tests = new ArrayList<>();

        // Если ответ пустой или null — возвращаем пустой список
        if (aiResponse == null || aiResponse.isBlank()) {
            return tests;
        }

        // 1. Разделяем весь ответ по маркеру @@@@ (с -1, чтобы не потерять хвост)
        String[] blocks = aiResponse.split("@@@@", -1);

        // 2. Проходим по каждому блоку
        for (String block : blocks) {
            // Пропускаем пустые блоки (часто появляются в начале/конце из-за разделителей)
            if (block.isBlank()) {
                continue;
            }

            // 3. Конструктор AnalyzeTest сам разобьет блок по ####
            // и заполнит поля name и code
            tests.add(new AnalyzeTest(block));
        }

        return tests;
    }
}
