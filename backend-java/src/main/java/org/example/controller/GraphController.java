package org.example.controller;

import org.example.dto.CodeRequestDTO;
import org.example.service.ParserService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/graph")
public class GraphController {

    @PostMapping
    public Object generateGraph(@RequestBody CodeRequestDTO request) {
        return ParserService.getClassTree(request.getCode());
    }
}
