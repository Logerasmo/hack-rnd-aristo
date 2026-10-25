package org.example.service.tools;

import org.example.dto.AnalyzeCode;

import java.util.ArrayList;
import java.util.List;

public class AnalyzeCodeParser {

    public static List<AnalyzeCode> parse(String aiResponse) {
        List<AnalyzeCode> result = new ArrayList<>();

        if (aiResponse == null || aiResponse.isBlank()) {
            return result;
        }

        // Предполагаем, что ИИ разделяет сами ошибки маркером @@@@
        // (если у вас другой маркер для разделения ошибок — используйте его)
        String[] blocks = aiResponse.split("@@@@", -1);

        for (String block : blocks) {
            if (!block.isBlank()) {
                result.add(new AnalyzeCode(block));
            }
        }

        return result;
    }
}
