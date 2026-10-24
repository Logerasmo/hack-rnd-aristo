package org.example.controller;

import org.example.dto.ExecutionDto;
import org.example.service.ExecutionService;
import org.springframework.web.bind.annotation.*;



@RestController
@RequestMapping("/api/compile")
@CrossOrigin(origins = "*") // разрешаем запросы с реакт фронтенда
public class ExecutionController {

    private final ExecutionService executionService;

    public ExecutionController(ExecutionService executionService) {
        this.executionService = executionService;
    }

    @PostMapping("/run")
    public ExecutionDto.Response runCode(@RequestBody ExecutionDto.Request request) {
        return executionService.compileAndRun(request);
    }
}