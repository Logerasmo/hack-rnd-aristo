package org.example.controller;

import org.example.dto.CodeRequestDTO;
import org.example.service.GraphConverter;
import org.example.service.ParserService;
import org.example.service.tools.GraphDTO;
import org.example.service.tools.TreeNode;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/graph")
public class GraphController {

    @PostMapping
    public List<GraphDTO> generateGraph(@RequestBody CodeRequestDTO request) {
        TreeNode classRoot = ParserService.getClassTree(request.getCode());

// Находим нужный метод (например, по имени)
        List<TreeNode> methods = classRoot.getChildren().stream()
                .filter(n -> n.getLabel().startsWith("method")).toList();

        GraphConverter converter = new GraphConverter();
        List<GraphDTO> result = new ArrayList<>();
        methods.forEach(x -> result.add(converter.convertMethod(x)));
        return result;

    }
}
