package org.example.service.tools;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public class FeaturesDemo {

    // 1. ENUM (бонус)
    public enum TaskStatus {
        OPEN, IN_PROGRESS, DONE
    }
    public boolean isTrue;
    // 2. RECORD (бонус) - неизменяемый класс данных
    public record Task(Long id, String title, TaskStatus status, int priority) {}

    // 3. ДЖЕНЕРИКИ (бонус) + 4. ЛЯМБДЫ (бонус)
    public <T> Map<String, List<T>> groupByField(List<T> items, Function<T, String> classifier) {
        return items.stream()
                .collect(Collectors.groupingBy(classifier));
    }

    // 5. STREAM API И COLLECTORS (бонус)
    public List<String> getHighPriorityTitles(List<Task> tasks) {
        return tasks.stream()
                // Лямбда в filter
                .filter(t -> t.priority() > 5)
                // Использование метода из record
                .map(Task::title)
                .sorted()
                .collect(Collectors.toList());
    }

    // Обычная логика с if/else, чтобы граф не был пустым
    public String getStatusDescription(TaskStatus status) {
        if (status == TaskStatus.OPEN) {
            return "Задача ждет выполнения";
        } else if (status == TaskStatus.IN_PROGRESS) {
            return "Задача в работе";
        } else {
            return "Задача завершена";
        }
    }
}
