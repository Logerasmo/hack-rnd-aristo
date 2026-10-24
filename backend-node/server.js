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

app.post('/api/compile/run', (req, res) => {
    // принимаем stdin 
    const { files, mainClass, stdin = '' } = req.body;

    if (!files || Object.keys(files).length === 0) {
        return res.json({ output: null, error: 'Нет файлов для запуска' });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java-run-'));

    try {
        // сохранение файлов проекта в  кодировке utf8
        for (const [relativePath, content] of Object.entries(files)) {
            const normalizedRelPath = relativePath.replace(/\\/g, '/');
            const fullFilePath = path.join(tempDir, normalizedRelPath);
            fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });
            fs.writeFileSync(fullFilePath, content, 'utf8');
        }

        // определение главного файла
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

        // поддержка русского языка
        const args = [
            '-Dfile.encoding=UTF-8',
            '-Dstdout.encoding=UTF-8',
            '-Dstderr.encoding=UTF-8',
            '-Dstdin.encoding=UTF-8',
            '-Dsun.stdout.encoding=UTF-8',
            '-Dsun.stderr.encoding=UTF-8',
            mainFileRelPath
        ];

        // запускаем процесс и сохраняем ссылку на него в переменную child, чтобы передать System.in
        const child = execFile(
            JAVA_CMD,
            args,
            { cwd: sourceRootDir, timeout: 10000, encoding: 'utf8' },
            (error, stdout, stderr) => {
                fs.rmSync(tempDir, { recursive: true, force: true });

                if (error) {
                    // если программа упала на этапе компиляции
                    return res.json({
                        output: stdout || null, // cохрание, что успело вывестись в System.out до падения
                        error: stderr || error.message
                    });
                }

                // Возвращаем и System.out  System.err 
                res.json({
                    output: stdout || 'Программа успешно выполнилась (без вывода в консоль).',
                    error: stderr || null
                });
            }
        );

        // 6.  пользовательский ввод в System.in закрываем поток
        if (child.stdin) {
            if (stdin && stdin.length > 0) {
                child.stdin.write(stdin + '\n', 'utf8');
            }
            child.stdin.end();
        }
    } catch (err) {
        res.json({ output: null, error: 'Ошибка сервера: ' + err.message });
    }
});

const PORT = 8081;
app.listen(PORT, () => {
    console.log(`🚀 да наконец-то нахуй оно заработало тут http://localhost:${PORT}`);
});