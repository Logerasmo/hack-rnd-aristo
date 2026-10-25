package org.example.controller;

import org.example.dto.ExecutionDto;
import org.example.service.ExecutionService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api/compile")
@CrossOrigin(origins = "*")
public class ExecutionController {

    private final ExecutionService executionService;

    public ExecutionController(ExecutionService executionService) {
        this.executionService = executionService;
    }

    @PostMapping("/run")
    public ExecutionDto.Response runCode(@RequestBody ExecutionDto.Request request) {
        return executionService.compileAndRun(request);
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamCode(@RequestBody ExecutionDto.Request request) {
        return executionService.compileAndRunStream(request);
    }

    @PostMapping("/input")
    public ResponseEntity<?> sendInput(@RequestBody ExecutionDto.InputRequest inputRequest) {
        boolean sent = executionService.sendInput(inputRequest.getSessionId(), inputRequest.getInput());
        if (sent) {
            return ResponseEntity.ok(Map.of("ok", true));
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "Нет активной программы, ожидающей ввода"));
        }
    }
}