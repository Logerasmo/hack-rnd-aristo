package org.example.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.dto.ExecutionDto;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.tools.*;
import java.io.*;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ExecutionService {

    private final Map<String, Process> activeProcesses = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Потоковый интерактивный запуск (полный аналог server.js на Java)
    public SseEmitter compileAndRunStream(ExecutionDto.Request request) {
        SseEmitter emitter = new SseEmitter(0L); // без таймаута, пока пользователь вводит данные
        String sessionId = (request.getSessionId() != null && !request.getSessionId().isBlank())
                ? request.getSessionId()
                : "default-session";

        CompletableFuture.runAsync(() -> {
            Path tempDir = null;
            try {
                if (request.getFiles() == null || request.getFiles().isEmpty()) {
                    sendEvent(emitter, "error", "Нет файлов для запуска");
                    emitter.complete();
                    return;
                }

                // Если старый процесс для этой сессии еще висит — убиваем его
                Process oldProc = activeProcesses.remove(sessionId);
                if (oldProc != null && oldProc.isAlive()) {
                    oldProc.destroyForcibly();
                }

                tempDir = Files.createTempDirectory("java-run-");

                // Берем активный файл
                Map.Entry<String, String> firstEntry = request.getFiles().entrySet().iterator().next();
                String rawContent = firstEntry.getValue();

                // Удаляем package, чтобы компиляция в плоской временной папке всегда проходила без ошибок
                String cleanedContent = rawContent.replaceFirst("(?m)^\\s*package\\s+[a-zA-Z0-9_.]+\\s*;", "// package removed");

                // Определяем реальное имя главного класса внутри кода (например, Main внутри pervay.java)
                String className = extractClassName(cleanedContent, request.getMainClass());
                Path targetFilePath = tempDir.resolve(className + ".java");
                Files.writeString(targetFilePath, cleanedContent, StandardCharsets.UTF_8);

                String javaBin = Path.of(System.getProperty("java.home"), "bin", "java").toString();
                JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();

                List<String> command = new ArrayList<>();
                command.add(javaBin);
                command.add("-Dfile.encoding=UTF-8");
                command.add("-Dstdout.encoding=UTF-8");
                command.add("-Dstderr.encoding=UTF-8");
                command.add("-Dstdin.encoding=UTF-8");
                command.add("-Dsun.stdout.encoding=UTF-8");
                command.add("-Dsun.stderr.encoding=UTF-8");

                if (compiler != null) {
                    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
                    try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
                        Iterable<? extends JavaFileObject> compUnits = fileManager.getJavaFileObjectsFromFiles(List.of(targetFilePath.toFile()));
                        List<String> options = List.of("-encoding", "UTF-8", "-d", tempDir.toString());
                        boolean success = compiler.getTask(null, fileManager, diagnostics, options, null, compUnits).call();

                        if (!success) {
                            StringBuilder sb = new StringBuilder("Ошибка компиляции:\n");
                            for (Diagnostic<?> d : diagnostics.getDiagnostics()) {
                                sb.append(d.getMessage(null)).append("\n");
                            }
                            sendEvent(emitter, "error", sb.toString());
                            sendEvent(emitter, "done", "");
                            emitter.complete();
                            deleteDirectory(tempDir);
                            return;
                        }
                    }
                    command.add("-cp");
                    command.add(tempDir.toString());
                    command.add(className);
                } else {
                    // Если запущено на JRE (например, RedHat Java 25 в VS Code), запускаем .java файл напрямую (JEP 330)
                    command.add(targetFilePath.toString());
                }

                sendEvent(emitter, "success", "Компиляция успешна ✓");
                sendEvent(emitter, "info", "Запуск программы...");

                ProcessBuilder pb = new ProcessBuilder(command);
                pb.directory(tempDir.toFile());
                Process process = pb.start();
                activeProcesses.put(sessionId, process);

                emitter.onCompletion(() -> killProcess(sessionId));
                emitter.onTimeout(() -> killProcess(sessionId));
                emitter.onError((e) -> killProcess(sessionId));

                // Поток чтения stdout (посимвольно, чтобы System.out.print без \n сразу появлялся в консоли!)
                CompletableFuture<Void> outFuture = CompletableFuture.runAsync(() -> {
                    try (InputStreamReader reader = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
                        char[] buf = new char[256];
                        int n;
                        while ((n = reader.read(buf)) != -1) {
                            sendEvent(emitter, "stdout", new String(buf, 0, n));
                        }
                    } catch (IOException ignored) {
                    }
                });

                // Поток чтения stderr
                CompletableFuture<Void> errFuture = CompletableFuture.runAsync(() -> {
                    try (InputStreamReader reader = new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8)) {
                        char[] buf = new char[256];
                        int n;
                        while ((n = reader.read(buf)) != -1) {
                            sendEvent(emitter, "error", new String(buf, 0, n));
                        }
                    } catch (IOException ignored) {
                    }
                });

                int exitCode = process.waitFor();
                outFuture.join();
                errFuture.join();

                activeProcesses.remove(sessionId);
                sendEvent(emitter, "done", "Процесс завершен (код " + exitCode + ")");
                emitter.complete();

            } catch (Exception e) {
                sendEvent(emitter, "error", "Ошибка сервера: " + e.getMessage());
                emitter.complete();
            } finally {
                activeProcesses.remove(sessionId);
                if (tempDir != null) {
                    deleteDirectory(tempDir);
                }
            }
        });

        return emitter;
    }

    // Передача введенной строки из консоли в живой процесс (System.in)
    // Передача введенной строки из консоли в живой процесс (System.in)
    public boolean sendInput(String sessionId, String input) {
        if (sessionId == null) return false;
        Process process = activeProcesses.get(sessionId);
        if (process != null && process.isAlive()) {
            try {
                OutputStream os = process.getOutputStream();
                if (input == null || input.isEmpty()) {
                    // Если пользователь нажал Enter на пустой строке — закрываем stdin (EOF),
                    // чтобы scanner.hasNext() мгновенно вернул false и сработали дефолтные значения!
                    os.close();
                } else {
                    // Отправляем строку + перенос строки и пробел, чтобы Scanner.hasNextInt() / next() срабатывал мгновенно
                    os.write((input + System.lineSeparator()).getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
                return true;
            } catch (IOException e) {
                return false;
            }
        }
        return false;
    }

    private void killProcess(String sessionId) {
        Process proc = activeProcesses.remove(sessionId);
        if (proc != null && proc.isAlive()) {
            proc.destroyForcibly();
        }
    }

    private void sendEvent(SseEmitter emitter, String type, String text) {
        try {
            String json = objectMapper.writeValueAsString(Map.of("type", type, "text", text != null ? text : ""));
            emitter.send(SseEmitter.event().data(json));
        } catch (Exception ignored) {
        }
    }

    private String extractClassName(String code, String fallback) {
        Matcher pubMatcher = Pattern.compile("public\\s+class\\s+([A-Za-z_$][A-Za-z0-9_$]*)").matcher(code);
        if (pubMatcher.find()) return pubMatcher.group(1);

        Matcher anyMatcher = Pattern.compile("class\\s+([A-Za-z_$][A-Za-z0-9_$]*)").matcher(code);
        if (anyMatcher.find()) return anyMatcher.group(1);

        if (fallback != null && !fallback.isBlank()) {
            return fallback.replace("\\", "/").replaceAll("^.*/", "").replaceAll("\\.java$", "");
        }
        return "Main";
    }

    private void deleteDirectory(Path path) {
        try {
            if (Files.exists(path)) {
                Files.walk(path)
                        .sorted(Comparator.reverseOrder())
                        .map(Path::toFile)
                        .forEach(File::delete);
            }
        } catch (IOException ignored) {
        }
    }

    // Оставляем синхронный метод как запасной
    public ExecutionDto.Response compileAndRun(ExecutionDto.Request request) {
        try {
            Path tempDir = Files.createTempDirectory("java_compiler_");
            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
            if (compiler == null) {
                return new ExecutionDto.Response(null, "Ошибка: JDK не найден на сервере.");
            }

            DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
            StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8);

            List<File> filesToCompile = new ArrayList<>();
            for (Map.Entry<String, String> entry : request.getFiles().entrySet()) {
                Path javaFilePath = tempDir.resolve(entry.getKey());
                if (javaFilePath.getParent() != null) {
                    Files.createDirectories(javaFilePath.getParent());
                }
                Files.writeString(javaFilePath, entry.getValue(), StandardCharsets.UTF_8);
                filesToCompile.add(javaFilePath.toFile());
            }

            Iterable<? extends JavaFileObject> compilationUnits = fileManager.getJavaFileObjectsFromFiles(filesToCompile);
            List<String> options = List.of("-encoding", "UTF-8", "-d", tempDir.toString());
            boolean success = compiler.getTask(null, fileManager, diagnostics, options, null, compilationUnits).call();
            fileManager.close();

            if (!success) {
                StringBuilder compileErrors = new StringBuilder("Ошибка компиляции:\n");
                for (Diagnostic<?> diagnostic : diagnostics.getDiagnostics()) {
                    compileErrors.append(diagnostic.getMessage(null)).append("\n");
                }
                return new ExecutionDto.Response(null, compileErrors.toString());
            }

            ByteArrayOutputStream outStream = new ByteArrayOutputStream();
            PrintStream origOut = System.out;
            System.setOut(new PrintStream(outStream, true, StandardCharsets.UTF_8));

            try {
                URLClassLoader classLoader = URLClassLoader.newInstance(new URL[]{tempDir.toUri().toURL()});
                String mainClassName = request.getMainClass();
                if (mainClassName != null && mainClassName.toLowerCase().endsWith(".java")) {
                    mainClassName = mainClassName.substring(0, mainClassName.length() - 5);
                }
                Class<?> cls = Class.forName(mainClassName, true, classLoader);
                Method mainMethod = cls.getMethod("main", String[].class);
                mainMethod.invoke(null, (Object) new String[]{});
            } finally {
                System.setOut(origOut);
            }

            return new ExecutionDto.Response(outStream.toString(StandardCharsets.UTF_8), null);
        } catch (Exception e) {
            return new ExecutionDto.Response(null, "Ошибка выполнения: " + e.getMessage());
        }
    }
}