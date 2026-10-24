package org.example.controller;


import org.example.dto.AnalyzeCode;
import org.example.dto.AnalyzeTest;
import org.example.dto.CodeRequestDTO;
import org.example.service.AiService;
import org.example.service.tools.AnalyzeCodeParser;
import org.example.service.tools.AnalyzeTestParser;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    @PostMapping("/tests")
    public List<AnalyzeTest> generateTests(@RequestBody CodeRequestDTO request) {
        String rawResponse = AiService.getTests(request.getCode());
        return AnalyzeTestParser.parse(rawResponse);
    }
    @PostMapping("/analyze")
    public List<AnalyzeCode> analyzeCode(@RequestBody CodeRequestDTO request) {
        String rawResponse = AiService.analyzeCode(request.getCode());
        return AnalyzeCodeParser.parse(rawResponse);
    }
}
