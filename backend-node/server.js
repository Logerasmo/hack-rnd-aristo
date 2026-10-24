const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const VSCODE_JAVA = 'C:\\Users\\igori\\.vscode\\extensions\\redhat.java-1.58.0-win32-x64\\jre\\25.0.4.1-win32-x86_64\\bin\\java.exe';
const JAVA_CMD = fs.existsSync(VSCODE_JAVA) ? VSCODE_JAVA : 'java';

const VSCODE_JAVAC = VSCODE_JAVA.replace('java.exe', 'javac.exe');
const JAVAC_CMD = fs.existsSync(VSCODE_JAVAC) ? VSCODE_JAVAC : 'javac';

app.post('/api/compile/run', (req, res) => {
    const { files, mainClass, stdin = '' } = req.body;

    if (!files || Object.keys(files).length === 0) {
        return res.json({ output: null, error: 'Нет файлов для запуска' });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java-run-'));

    try {
        // Сохраняем все файлы проекта в кодировке UTF-8 с сохранением структуры папок
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

        // Получаем содержимое активного файла
        const absoluteActivePath = path.join(sourceRootDir, mainFileRelPath);
        const fileContent = fs.existsSync(absoluteActivePath) 
            ? fs.readFileSync(absoluteActivePath, 'utf8') 
            : Object.values(files)[0];

        // УМНЫЙ АНАЛИЗ: находим имя public класса внутри файла (например, "public class Main")
        const publicClassMatch = fileContent.match(/public\s+class\s+(\w+)/);
        const className = publicClassMatch ? publicClassMatch[1] : path.basename(mainFileRelPath, '.java');
        
        // Создаем правильный файл для компиляции с именем класса, чтобы обйти ограничение Java
        const targetFileName = `${className}.java`;
        const targetFilePath = path.join(path.dirname(absoluteActivePath), targetFileName);
        fs.writeFileSync(targetFilePath, fileContent, 'utf8');

        // Компилируем файл по его реальному классу
        execFile(JAVAC_CMD, ['-encoding', 'UTF-8', targetFileName], { cwd: path.dirname(targetFilePath) }, (compError, compStdout, compStderr) => {
            if (compError) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                return res.json({ output: null, error: compStderr || compError.message });
            }

            const runArgs = [
                '-Dfile.encoding=UTF-8',
                '-Dstdout.encoding=UTF-8',
                '-Dstderr.encoding=UTF-8',
                '-Dstdin.encoding=UTF-8',
                '-Dsun.stdout.encoding=UTF-8',
                '-Dsun.stderr.encoding=UTF-8',
                '-cp',
                '.',
                className
            ];

            const child = execFile(
                JAVA_CMD,
                runArgs,
                { cwd: path.dirname(targetFilePath), timeout: 10000, encoding: 'utf8' },
                (runError, stdout, stderr) => {
                    fs.rmSync(tempDir, { recursive: true, force: true });

                    if (runError) {
                        return res.json({
                            output: stdout || null,
                            error: stderr || runError.message
                        });
                    }
                    res.json({
                        output: stdout || 'Программа успешно выполнилась (без вывода в консоль).',
                        error: stderr || null
                    });
                }
            );

            if (child.stdin) {
                if (stdin && stdin.length > 0) {
                    child.stdin.write(stdin + '\n', 'utf8');
                }
                child.stdin.end();
            }
        });
    } catch (err) {
        res.json({ output: null, error: 'Ошибка сервера: ' + err.message });
    }
});

const PORT = 8081;
app.listen(PORT, () => {
    console.log(`🚀 Бэкенд запущен на http://localhost:${PORT}`);
});