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
    const { files, mainClass } = req.body;

    if (!files || Object.keys(files).length === 0) {
        return res.json({ output: null, error: 'Нет файлов для запуска' });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java-run-'));

    try {
        for (const [fileName, content] of Object.entries(files)) {
            const filePath = path.join(tempDir, fileName);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, 'utf8');
        }

        
        let rawMainClass = mainClass;
        if (typeof rawMainClass === 'object' && rawMainClass !== null) {
            rawMainClass = rawMainClass.name || Object.keys(files)[0];
        }
        
        const safeMainClass = typeof rawMainClass === 'string' && rawMainClass.trim() !== ''
            ? rawMainClass 
            : (Object.keys(files)[0] || 'Main.java');

        // Очищаем от расширения .java 
        const cleanMainClass = safeMainClass.endsWith('.java') 
            ? safeMainClass.slice(0, -5) 
            : safeMainClass;
        
        const mainFile = `${cleanMainClass}.java`;

        execFile(JAVA_CMD, ['-Dfile.encoding=UTF-8', mainFile], { cwd: tempDir, timeout: 10000 }, (error, stdout, stderr) => {
            fs.rmSync(tempDir, { recursive: true, force: true });

            if (error) {
                return res.json({ output: null, error: stderr || error.message });
            }
            res.json({ output: stdout || 'Программа успешно выполнилась (без вывода в консоль).', error: stderr });
        });
    } catch (err) {
        res.json({ output: null, error: 'Ошибка сервера: ' + err.message });
    }
});

const PORT = 8081;
app.listen(PORT, () => {
    console.log(`🚀 да наконец-то нахуй оно заработало тут http://localhost:${PORT}`);
});