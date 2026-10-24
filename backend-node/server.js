const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const VSCODE_JAVA = 'C:\\Users\\igori\\.vscode\\extensions\\redhat.java-1.58.0-win32-x64\\jre\\25.0.4.1-win32-x86_64\\bin\\java.exe';
const JAVA_CMD = fs.existsSync(VSCODE_JAVA) ? VSCODE_JAVA : 'java';

const VSCODE_JAVAC = VSCODE_JAVA.replace('java.exe', 'javac.exe');
const HAS_VSCODE_JAVAC = fs.existsSync(VSCODE_JAVAC);

// храним запущенные процессы по id сессии для интерактивного Scanner
const activeProcesses = new Map();

app.post('/api/compile/stream', (req, res) => {
    const { files, mainClass, sessionId } = req.body;

    // заголовки для мгновенной потоковой передачи без буферизации
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    const sendEvent = (type, text) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
        }
    };

    if (!files || Object.keys(files).length === 0) {
        sendEvent('error', 'Нет файлов для запуска');
        return res.end();
    }

    // если старый процесс с этим sessionId еще запущен — завершаем его
    if (activeProcesses.has(sessionId)) {
        try { activeProcesses.get(sessionId).kill(); } catch (e) {}
        activeProcesses.delete(sessionId);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java-run-'));

    try {
        for (const [relativePath, content] of Object.entries(files)) {
            const normalizedRelPath = relativePath.replace(/\\/g, '/');
            const fullFilePath = path.join(tempDir, normalizedRelPath);
            fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });
            fs.writeFileSync(fullFilePath, content, 'utf8');
        }

        let rawMain = mainClass;
        if (typeof rawMain === 'object' && rawMain !== null) {
            rawMain = rawMain.path || rawMain.name || Object.keys(files)[0];
        }

        const safeMainPath = (typeof rawMain === 'string' && rawMain.trim() !== '')
            ? rawMain.replace(/\\/g, '/')
            : (Object.keys(files)[0] || 'Main.java').replace(/\\/g, '/');

        const mainFileRelPath = safeMainPath.endsWith('.java')
            ? safeMainPath
            : `${safeMainPath}.java`;

        const hasSrcRoot = mainFileRelPath.startsWith('src/');
        const sourceRootDir = hasSrcRoot ? path.join(tempDir, 'src') : tempDir;

        const absoluteActivePath = path.join(sourceRootDir, mainFileRelPath);
        const fileContent = fs.existsSync(absoluteActivePath)
            ? fs.readFileSync(absoluteActivePath, 'utf8')
            : Object.values(files)[0];

        // определяем имя главного класса внутри файла (чтобы файл vtoray.java с public class Main работал без ошибок)
        const publicClassMatch = fileContent.match(/public\s+class\s+(\w+)/);
        const anyClassMatch = fileContent.match(/class\s+(\w+)/);
        const className = publicClassMatch
            ? publicClassMatch[1]
            : (anyClassMatch ? anyClassMatch[1] : path.basename(mainFileRelPath, '.java'));

        const workDir = fs.existsSync(path.dirname(absoluteActivePath))
            ? path.dirname(absoluteActivePath)
            : tempDir;

        const targetFileName = `${className}.java`;
        const targetFilePath = path.join(workDir, targetFileName);

        // удаляем исходный файл с неправильным именем в этой же папке, чтобы не было дубликата класса Main
        if (fs.existsSync(absoluteActivePath) && path.resolve(absoluteActivePath) !== path.resolve(targetFilePath)) {
            try { fs.unlinkSync(absoluteActivePath); } catch (e) {}
        }
        fs.writeFileSync(targetFilePath, fileContent, 'utf8');

        // функция запуска интерактивного процесса Java (живой stdin/stdout)
        const startInteractiveJava = (args) => {
            sendEvent('success', 'Компиляция успешна ✓');
            sendEvent('info', 'Запуск программы...');

            const child = spawn(JAVA_CMD, args, { cwd: workDir });
            activeProcesses.set(sessionId, child);

            child.stdout.on('data', (chunk) => {
                sendEvent('stdout', chunk.toString('utf8'));
            });

            child.stderr.on('data', (chunk) => {
                sendEvent('error', chunk.toString('utf8'));
            });

            child.on('error', (err) => {
                sendEvent('error', 'Ошибка процесса Java: ' + err.message);
            });

            child.on('close', (code) => {
                activeProcesses.delete(sessionId);
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                sendEvent('done', `Процесс завершен (код ${code ?? 0})`);
                if (!res.writableEnded) {
                    res.end();
                }
            });

            // ВАЖНО: слушаем закрытие ответа (res), а не запроса (req), чтобы процесс не убивался на старте!
            res.on('close', () => {
                if (!res.writableEnded && activeProcesses.has(sessionId)) {
                    try { child.kill(); } catch (e) {}
                    activeProcesses.delete(sessionId);
                }
            });
        };

        const encodingFlags = [
            '-Dfile.encoding=UTF-8',
            '-Dstdout.encoding=UTF-8',
            '-Dstderr.encoding=UTF-8',
            '-Dstdin.encoding=UTF-8',
            '-Dsun.stdout.encoding=UTF-8',
            '-Dsun.stderr.encoding=UTF-8'
        ];

        // если есть javac.exe — компилируем через него, иначе запускаем напрямую через Java 25
        if (HAS_VSCODE_JAVAC) {
            execFile(VSCODE_JAVAC, ['-encoding', 'UTF-8', targetFileName], { cwd: workDir }, (compError, compStdout, compStderr) => {
                if (compError) {
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                    sendEvent('error', 'Ошибка компиляции:\n' + (compStderr || compError.message));
                    sendEvent('done', '');
                    return res.end();
                }
                startInteractiveJava([...encodingFlags, '-cp', '.', className]);
            });
        } else {
            // прямой запуск исходника через java.exe (поддерживает и несколько классов в одном файле, и Scanner)
            startInteractiveJava([...encodingFlags, targetFileName]);
        }

    } catch (err) {
        sendEvent('error', 'Ошибка сервера: ' + err.message);
        res.end();
    }
});

// передача введенного числа в работающий Scanner по нажатию Enter
app.post('/api/compile/input', (req, res) => {
    const { sessionId, input } = req.body;
    const child = activeProcesses.get(sessionId);

    if (!child || !child.stdin) {
        return res.status(400).json({ error: 'Нет активной программы, ожидающей ввода' });
    }

    child.stdin.write(input + '\n', 'utf8');
    res.json({ ok: true });
});

const PORT = 8081;
app.listen(PORT, () => {
    console.log(`🚀 Бэкенд запущен на http://localhost:${PORT}`);
});