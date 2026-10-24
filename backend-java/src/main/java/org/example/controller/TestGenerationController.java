package org.example.controller;

import org.example.service.AiService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tests")
public class TestGenerationController {

    @PostMapping(value = "/generate", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<Resource> generateTests(@RequestBody CodeRequestDTO request) {
        // 1. Генерируем код тестов (ваша логика)
        String testCode = AiService.getTests(request.getCode());
        //String testCode = testService.generateTests(request.getCode());

        // 2. Превращаем строку в байты
        byte[] testBytes = testCode.getBytes();
        ByteArrayResource resource = new ByteArrayResource(testBytes);

        // 3. Настраиваем заголовки для скачивания файла
        HttpHeaders headers = new HttpHeaders();
        // Важно: filename нужно указывать в кавычках, если там есть пробелы или спецсимволы
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"GeneratedTests.java\"");

        return ResponseEntity.ok()
                .headers(headers)
                .contentLength(testBytes.length)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }
}
