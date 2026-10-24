package org.example.service;

import org.example.dto.ExecutionDto;
import org.springframework.stereotype.Service;

import javax.tools.*;
import java.io.*;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;



@Service 
public class ExecutionService {
    public ExecutionDto.Response compileAndRun(ExecutionDto.Request request) {
        try {

            // криейт временной папки под скомпилированные .class файлы
            Path tempDir = Files.createTempDirectory("java_compiler_");
            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();

            if (compiler == null ) {
                return new ExecutionDto.Response(null, "Ошибка: JDK не найден на сервере (нужен JDK, а не JRE).");

            }
            DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
            StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, null, null);

            List<JavaFileObject> javaFiles = new ArrayList<>();
            for (Map.Entry<String, String> entry : request.getFiles().entrySet()) {
                Path javaFilePath = tempDir.resolve(entry.getKey());
                Files.writeString(javaFilePath, entry.getValue());
                javaFiles.add(new SimpleJavaFileObjectImpl(javaFilePath.toUri(), entry.getValue()));

            }
            // настройка компиляции 
            List<String> options = java.util.Arrays.asList("-d", tempDir.toString());

            JavaCompiler.CompilationTask task = compiler.getTask(null, fileManager, diagnostics, options, null, javaFiles);
            
            boolean success = task.call();
            fileManager.close();

            if (!success) {
                StringBuilder compileErrors = new StringBuilder("Ошибка компиляции:\n");
                for (Diagnostic<?> diagnostic : diagnostics.getDiagnostics()) {
                    compileErrors.append(diagnostic.getMessage(null)).append("\n");
                }
                return new ExecutionDto.Response(null, compileErrors.toString());

            }

            // перехват вывода систем аут
            ByteArrayOutputStream outStream = new ByteArrayOutputStream();
            PrintStream origOut = System.out;
            System.setOut(new PrintStream(outStream));
            try {
                // загружаем и выполняем метод мейн
                URLClassLoader classLoader = URLClassLoader.newInstance(new URL[]{tempDir.toUri().toURL()});
                Class<?> cls = Class.forName(request.getMainClass(), true, classLoader);
                Method mainMethod = cls.getMethod("main", String[].class);

                String[] params = new String[]{};
                mainMethod.invoke(null, (Object) params);
            } finally {
                System.setOut(origOut); // возвращаем консоль назад

            } 
            return new ExecutionDto.Response(outStream.toString(), null);

        } catch (Exception e) {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            return new ExecutionDto.Response(null, "Ошибка выполнения: " + e.getMessage() + "\n" + sw);
        }
    }
    // сохранение исходного кода в память компилятора
    private static class SimpleJavaFileObjectImpl extends SimpleJavaFileObject {
        private final String content;

        protected SimpleJavaFileObjectImpl(java.net.URI uri, String content) {
            super(uri, Kind.SOURCE);
            this.content = content;
 
        }
        @Override
        public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return content;
        }
    }
}
