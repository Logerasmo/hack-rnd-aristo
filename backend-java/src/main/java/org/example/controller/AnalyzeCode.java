package org.example.controller;

public class AnalyzeCode {
    private String name;
    private String level;
    private String description;
    private String place;
    private String codeToFix;

    public AnalyzeCode(String rawBlock) {
        //!!!
        //Формат который ожидается при ответе от ии:
        //Неправильно названа переменная
        //####
        //Легкая
        //####
        //Измените имя переменной с camelCase
        //####
        //... и так далее

        // Разбиваем блок по разделителю ####
        // Флаг -1 нужен, чтобы сохранить пустые строки в конце, если код отсутствует
        String[] parts = rawBlock.split("####", -1);

        // Заполняем поля по порядку
        // trim() убирает лишние пробелы и переносы строк по краям
        this.name = parts.length > 0 ? parts[0].trim() : "";
        this.level = parts.length > 1 ? parts[1].trim() : "";
        this.description = parts.length > 2 ? parts[2].trim() : "";
        this.place = parts.length > 3 ? parts[3].trim() : "";
        this.codeToFix = parts.length > 4 ? parts[4].trim() : "";
    }

    // Геттеры (нужны для Jackson, чтобы отдать JSON на фронт)
    public String getName() { return name; }
    public String getLevel() { return level; }
    public String getDescription() { return description; }
    public String getPlace() { return place; }
    public String getCodeToFix() { return codeToFix; }

    @Override
    public String toString() {
        return "AnalizeCode{\n" +
                "  name='" + name + "'\n" +
                "  level='" + level + "'\n" +
                "  description='" + description + "'\n" +
                "  place='" + place + "'\n" +
                "  codeToFix='" + codeToFix + "'\n" +
                '}';
    }
}
