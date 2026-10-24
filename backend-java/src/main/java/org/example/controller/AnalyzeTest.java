package org.example.controller;

public class AnalyzeTest {
    private String name;
    private String code;

    public AnalyzeTest(String rawBlock) {
        // Разбиваем блок по разделителю ####
        // Флаг -1 сохраняет пустые строки в конце
        String[] parts = rawBlock.split("####", -1);

        this.name = parts.length > 0 ? parts[0].trim() : "";
        this.code = parts.length > 1 ? parts[1].trim() : "";
    }

    // Геттеры
    public String getName() { return name; }
    public String getCode() { return code; }

    @Override
    public String toString() {
        return "AnalyzeTest{\n" +
                "  name='" + name + "'\n" +
                "  code='" + code + "'\n" +
                '}';
    }
}