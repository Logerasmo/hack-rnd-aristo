import React, { useState, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import CodeGraph from './components/graph/CodeGraph';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Folder, FolderOpen, FileCode, Play, Upload, FolderUp,
  Download, Terminal, ChevronRight, ChevronDown,
  Maximize2, Minimize2, Trash2, X, Settings, Moon, Sun,
  ZoomIn, ZoomOut, CheckSquare, GitBranch, Code2, Send, Sparkles
} from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  content: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  fileData?: FileNode;
}

interface LogEntry {
  time: string;
  text: string;
  type?: 'info' | 'success' | 'error' | 'input';
}

interface AnalyzeTest {
  name: string;
  code: string;
}

interface AnalyzeCode {
  name: string;
  level: string;
  description: string;
  place: string;
  codeToFix?: string;
}

function buildFileTree(files: FileNode[]): TreeNode[] {
  const root: TreeNode[] = [];

  files.forEach((file) => {
    const parts = file.path.replace(/\\/g, '/').split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;

      if (isFile) {
        currentLevel.push({ name: part, path: file.path, type: 'file' });
      } else {
        let folder = currentLevel.find((n) => n.type === 'folder' && n.name === part);
        if (!folder) {
          folder = { name: part, path: currentPath, type: 'folder', children: [] };
          currentLevel.push(folder);
        }
        currentLevel = folder.children!;
      }
    });
  });

  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children && sortTree(n.children));
  };

  sortTree(root);
  return root;
}

// Автоматическое определение имени главного класса из исходного кода Java
function extractJavaClassName(code: string, fallbackFileName: string): string {
  // 1. Ищем public class Name
  const publicClassMatch = code.match(/public\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (publicClassMatch && publicClassMatch[1]) {
    return publicClassMatch[1];
  }

  // 2. Ищем любой class Name, если public нет
  const anyClassMatch = code.match(/class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (anyClassMatch && anyClassMatch[1]) {
    return anyClassMatch[1];
  }

  // 3. Фоллбэк на имя файла без .java
  return fallbackFileName.replace(/\.java$/i, '');
}

// Удаляем объявление package из кода при одиночной компиляции в корень tempDir, чтобы не было NoClassDefFoundError
function stripPackageDeclaration(code: string): string {
  return code.replace(/^\s*package\s+[a-zA-Z0-9_.]+\s*;/m, '// package removed for flat compilation');
}

const DEFAULT_JAVA_CODE = `public class Main {
    public static void main(String[] args) {
        int sum = 0;

        for (int i = 0; i < 10; i++) {
            if (i % 2 == 0) {
                sum += i;
                System.out.println("Четное: " + i);
            } else {
                sum -= i;
                System.out.println("Нечетное: " + i);
            }
        }

        System.out.println("Результат: " + sum);
    }
}`;

export default function App() {
  const [projectName, setProjectName] = useState<string>('Project');
  const [files, setFiles] = useState<FileNode[]>([
    { name: 'Main.java', path: 'Main.java', content: DEFAULT_JAVA_CODE }
  ]);
  const [activeFilePath, setActiveFilePath] = useState<string>('Main.java');

  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [stdinInput, setStdinInput] = useState<string>('');
  const sessionIdRef = useRef<string>('session-' + Math.random().toString(36).slice(2));

  const [openTabs, setOpenTabs] = useState<string[]>(() => [files[0]?.path || 'Main.java']);
  const [draggedTabPath, setDraggedTabPath] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleDateString('ru-RU'), text: 'Ready', type: 'info' }
  ]);

  const [showImportMenu, setShowImportMenu] = useState<boolean>(false);
  const [isCodeOpen, setIsCodeOpen] = useState<boolean>(true);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(true);
  const [isTestsOpen, setIsTestsOpen] = useState<boolean>(false);
  const [focusedDock, setFocusedDock] = useState<'code' | 'console' | 'tests'>('code');

  const [consoleHeight, setConsoleHeight] = useState<number>(260);
  const [isConsoleMaximized, setIsConsoleMaximized] = useState<boolean>(false);
  const [analysisTab, setAnalysisTab] = useState<'problems' | 'recs' | 'metrics'>('problems');
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const [generatedTests, setGeneratedTests] = useState<AnalyzeTest[]>([]);
  const [isGeneratingTests, setIsGeneratingTests] = useState<boolean>(false);
  const [hasGeneratedTests, setHasGeneratedTests] = useState<boolean>(false);

  const [analysisErrors, setAnalysisErrors] = useState<AnalyzeCode[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [hasAnalyzed, setHasAnalyzed] = useState<boolean>(false);

  const [graphZoom, setGraphZoom] = useState<number>(1);
  const [graphPan, setGraphPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingGraph, setIsDraggingGraph] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const activeFile = files.find((f) => f.path === activeFilePath) || files[0];
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ src: true });

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderPath]: !prev[folderPath] }));
  };

  const expandAll = (newFiles: FileNode[]) => {
    const nextExpanded: Record<string, boolean> = {};
    newFiles.forEach((f) => {
      const parts = f.path.replace(/\\/g, '/').split('/');
      let curr = '';
      for (let i = 0; i < parts.length - 1; i++) {
        curr = curr ? `${curr}/${parts[i]}` : parts[i];
        nextExpanded[curr] = true;
      }
    });
    setExpandedFolders(nextExpanded);
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setFocusedDock('code');
    setFiles((prev) =>
      prev.map((file) =>
        file.path === activeFilePath ? { ...file, content: value } : file
      )
    );
  };

  const handleOpenFile = (path: string) => {
    setActiveFilePath(path);
    setIsCodeOpen(true);
    setFocusedDock('code');
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path]);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const newTabs = openTabs.filter((t) => t !== path);
    setOpenTabs(newTabs);

    if (activeFilePath === path && newTabs.length > 0) {
      setActiveFilePath(newTabs[newTabs.length - 1]);
    } else if (newTabs.length === 0) {
      setIsCodeOpen(false);
    }
  };

  const handleTabDragStart = (e: React.DragEvent, path: string) => {
    setDraggedTabPath(path);
  };

  const handleTabDragOver = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    if (!draggedTabPath || draggedTabPath === targetPath) return;

    const draggedIndex = openTabs.indexOf(draggedTabPath);
    const targetIndex = openTabs.indexOf(targetPath);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newTabs = [...openTabs];
      newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, draggedTabPath);
      setOpenTabs(newTabs);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const newFiles: FileNode[] = [];

    for (let i = 0; i < importedFiles.length; i++) {
      const file = importedFiles[i];

      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        for (const relativePath of Object.keys(zip.files)) {
          const zipEntry = zip.files[relativePath];
          if (!zipEntry.dir && relativePath.endsWith('.java')) {
            const content = await zipEntry.async('string');
            const name = relativePath.split('/').pop() || relativePath;
            newFiles.push({ name, path: relativePath, content });
          }
        }
      } else if (file.name.endsWith('.java')) {
        const content = await file.text();
        newFiles.push({ name: file.name, path: file.name, content });
      }
    }

    if (newFiles.length > 0) {
      setFiles(newFiles);
      setActiveFilePath(newFiles[0].path);
      setOpenTabs([newFiles[0].path]);
      appendConsole(`Files imported: ${newFiles.length}`);
      expandAll(newFiles);
    }
    e.target.value = '';
  };

  const handleImportFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const newFiles: FileNode[] = [];
    let detectedProjectName = 'Project';
    for (let i = 0; i < importedFiles.length; i++) {
      const file = importedFiles[i];

      if (file.name.endsWith('.java')) {
        const content = await file.text();
        const rawPath: string = (file as any).webkitRelativePath || file.name;
        const normalized = rawPath.replace(/\\/g, '/');
        const parts = normalized.split('/');

        if (parts.length > 1) {
          detectedProjectName = parts[0];
        }
        const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : normalized;

        newFiles.push({ name: file.name, path: cleanPath, content });
      }
    }

    if (newFiles.length > 0) {
      setProjectName(detectedProjectName);
      setFiles(newFiles);
      setActiveFilePath(newFiles[0].path);
      setOpenTabs([newFiles[0].path]);
      expandAll(newFiles);
      appendConsole(`Project "${detectedProjectName}" imported! Java files loaded: ${newFiles.length}`);
    } else {
      appendConsole('The selected folder contains no .java files');
    }
    e.target.value = '';
  };

  const handleExport = async () => {
    if (files.length === 1) {
      const blob = new Blob([files[0].content], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, files[0].name);
    } else {
      const zip = new JSZip();
      files.forEach((file) => {
        zip.file(file.path, file.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${projectName}.zip`);
    }
    appendConsole('Project exported successfully');
  };

  const appendConsole = (text: string, type: 'info' | 'success' | 'error' | 'input' = 'info') => {
    const time = new Date().toLocaleTimeString('ru-RU');
    const lines = String(text).split('\n').filter((line) => line.trim() !== '');

    setLogs((prev) => [
      ...prev,
      ...lines.map((line) => ({ time, text: line, type }))
    ]);
    setTimeout(() => consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
  };

  const startResizingConsole = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsConsoleOpen(true);
    setIsConsoleMaximized(false);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = window.innerHeight - moveEvent.clientY;
      if (newHeight >= 80 && newHeight <= window.innerHeight * 0.85) {
        setConsoleHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleGraphMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.zoom-controls')) return;
    setIsDraggingGraph(true);
    dragStartRef.current = { x: e.clientX - graphPan.x, y: e.clientY - graphPan.y };
  };

  const handleGraphMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingGraph) return;
    setGraphPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleGraphMouseUp = () => {
    setIsDraggingGraph(false);
  };

  const handleGraphWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setGraphZoom((prev) => Math.min(Math.max(+(prev + delta).toFixed(2), 0.25), 3));
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGraphZoom((prev) => Math.min(+(prev + 0.15).toFixed(2), 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGraphZoom((prev) => Math.max(+(prev - 0.15).toFixed(2), 0.25));
  };

  const handleStartAnalysis = async () => {
    if (!activeFile) return;

    const javaCode = activeFile.content;
    setIsConsoleOpen(true);
    setIsAnalyzing(true);

    appendConsole(`Sending code "${activeFile.name}" to backend (/api/ai/analyze)...`, 'info');
    appendConsole('Starting code analysis...', 'info');

    try {
      let response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: javaCode }),
      }).catch(() => null);

      if (!response || response.status === 404) {
        response = await fetch('http://localhost:8081/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: javaCode }),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error status ${response.status}`);
      }

      const errors: AnalyzeCode[] = await response.json();
      setAnalysisErrors(Array.isArray(errors) ? errors : []);
      setHasAnalyzed(true);
      setAnalysisTab('problems');

      appendConsole(
        `Analysis completed successfully. Issues found: ${Array.isArray(errors) ? errors.length : 0}`,
        'success'
      );
    } catch (err: any) {
      appendConsole(`Error during analysis: ${err.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTests = async () => {
    if (!activeFile) return;

    const javaCode = activeFile.content;
    setIsConsoleOpen(true);
    setIsGeneratingTests(true);

    appendConsole(`Sending code "${activeFile.name}" to backend (/api/ai/tests)...`, 'info');
    appendConsole('Generating tests...', 'info');

    try {
      let response = await fetch('/api/ai/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: javaCode }),
      }).catch(() => null);

      if (!response || response.status === 404) {
        response = await fetch('http://localhost:8081/api/ai/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: javaCode }),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error status ${response.status}`);
      }

      const tests: AnalyzeTest[] = await response.json();
      setGeneratedTests(Array.isArray(tests) ? tests : []);
      setHasGeneratedTests(true);

      appendConsole(
        `Code successfully accepted by backend. Tests generated: ${Array.isArray(tests) ? tests.length : 0}`,
        'success'
      );
    } catch (err: any) {
      appendConsole(`Error generating tests: ${err.message}`, 'error');
    } finally {
      setIsGeneratingTests(false);
    }
  };

  // ИСПРАВЛЕННАЯ КОМПИЛЯЦИЯ: работает с любым именем файла (pervay.java, vtoray.java) и любой папкой
  const handleRun = async () => {
    if (!activeFile) return;
    setIsConsoleOpen(true);
    setFocusedDock('console');
    const now = () => new Date().toLocaleTimeString('ru-RU');

    setLogs([{ time: now(), text: `Compiling and running ${activeFile.name}...`, type: 'info' }]);
    setIsRunning(true);

    try {
      // Вычисляем настоящее имя public class внутри активного файла (например, "Main" внутри "pervay.java")
      const actualMainClass = extractJavaClassName(activeFile.content, activeFile.name);
      const cleanedCode = stripPackageDeclaration(activeFile.content);

      // Передаем файл под именем его public-класса (например, "Main.java") без вложенных папок,
      // чтобы:
      // 1) javac не ругался на "class Main is public, should be declared in a file named Main.java"
      // 2) Files.writeString на бэкенде не падал с NoSuchFileException из-за несозданных подпапок
      const compileFilesMap: Record<string, string> = {
        [`${actualMainClass}.java`]: cleanedCode,
      };

      // 1. Запрос к Java-бэкенду (/api/compile/run)
      let runResponse = await fetch('/api/compile/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: compileFilesMap,
          mainClass: actualMainClass,
        }),
      }).catch(() => null);

      if (!runResponse || runResponse.status === 404) {
        runResponse = await fetch('http://localhost:8081/api/compile/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: compileFilesMap,
            mainClass: actualMainClass,
          }),
        }).catch(() => null);
      }

      if (runResponse && runResponse.ok) {
        const result: { output?: string; error?: string } = await runResponse.json();
        if (result.output) {
          appendConsole(result.output, 'info');
        }
        if (result.error) {
          appendConsole(result.error, 'error');
        } else {
          appendConsole('Process finished with exit code 0', 'success');
        }
        return;
      }

      // 2. Фоллбэк на потоковый эндпоинт (/api/compile/stream), если запущен Node server.js
      let streamResponse = await fetch('/api/compile/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: compileFilesMap,
          mainClass: `${actualMainClass}.java`,
          sessionId: sessionIdRef.current,
        }),
      }).catch(() => null);

      if (!streamResponse || streamResponse.status === 404) {
        streamResponse = await fetch('http://localhost:8081/api/compile/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: compileFilesMap,
            mainClass: `${actualMainClass}.java`,
            sessionId: sessionIdRef.current,
          }),
        }).catch(() => null);
      }

      if (!streamResponse || !streamResponse.ok) {
        throw new Error(
          'Compile endpoint not found (404). Make sure ExecutionController.java is uncommented and backend on port 8081 is running.'
        );
      }

      if (!streamResponse.body) throw new Error('Stream reader unavailable');

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            const payload = JSON.parse(part.slice(6));
            if (payload.type === 'stdout') {
              appendConsole(payload.text, 'info');
            } else if (payload.type === 'success') {
              appendConsole(payload.text, 'success');
            } else if (payload.type === 'info') {
              appendConsole(payload.text, 'info');
            } else if (payload.type === 'error') {
              appendConsole(payload.text, 'error');
            } else if (payload.type === 'done') {
              if (payload.text) appendConsole(payload.text, 'info');
            }
          }
        }
      }
    } catch (err: any) {
      appendConsole(`Server connection error: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSendInteractiveInput = async () => {
    if (!stdinInput.trim() && stdinInput === '') return;
    const valueToSend = stdinInput;
    setStdinInput('');
    appendConsole(`> ${valueToSend}`, 'input');

    if (isRunning) {
      try {
        await fetch('http://localhost:8081/api/compile/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            input: valueToSend,
          }),
        });
      } catch (err: any) {
        appendConsole(`Failed to send input: ${err.message}`, 'error');
      }
    }
  };

  const handleApplyFix = (codeToFix: string) => {
    appendConsole(`Code snippet copied to clipboard`, 'success');
    navigator.clipboard?.writeText(codeToFix);
  };

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map((node) => {
      if (node.type === 'folder') {
        const isOpen = !!expandedFolders[node.path];
        return (
          <div key={node.path}>
            <div
              onClick={() => toggleFolder(node.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 6px',
                paddingLeft: `${depth * 14 + 6}px`,
                cursor: 'pointer',
                userSelect: 'none',
                color: isDarkMode ? '#cccccc' : '#444444',
                fontSize: '13px',
              }}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FolderOpen size={15} color="#7a889b" />
              <span>{node.name}</span>
            </div>
            {isOpen && node.children && (
              <div style={{ borderLeft: isDarkMode ? '1px solid #333' : '1px solid #ddd', marginLeft: `${depth * 14 + 12}px` }}>
                {renderTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const isSelected = node.path === activeFilePath;
      return (
        <div
          key={node.path}
          onClick={() => handleOpenFile(node.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 8px',
            paddingLeft: `${depth * 14 + 22}px`,
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '13px',
            backgroundColor: isSelected ? (isDarkMode ? '#2a2d34' : '#e4e6eb') : 'transparent',
            color: isDarkMode ? '#d4d4d4' : '#1f2328',
          }}
        >
          <FileCode size={15} color="#e5c07b" />
          <span>{node.name}</span>
        </div>
      );
    });
  };

  const getDockTabStyle = (tabType: 'code' | 'console' | 'tests', isOpen: boolean): React.CSSProperties => {
    const isFocused = focusedDock === tabType && isOpen;
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      padding: '6px 12px',
      fontSize: '12px',
      fontWeight: isFocused ? 600 : 500,
      cursor: 'pointer',
      userSelect: 'none',
      borderRadius: '6px 6px 0 0',
      backgroundColor: isFocused ? (isDarkMode ? '#162844' : '#d0e1fd') : isOpen ? (isDarkMode ? '#161b22' : '#f0f2f5') : 'transparent',
      color: isFocused ? (isDarkMode ? '#ffffff' : '#0969da') : isOpen ? (isDarkMode ? '#c9d1d9' : '#24292f') : (isDarkMode ? '#7d8590' : '#57606a'),
      borderBottom: isFocused ? '2px solid #388bfd' : '2px solid transparent',
      transition: 'all 0.15s ease',
    };
  };

  const anyBottomWindowOpen = isCodeOpen || isConsoleOpen || isTestsOpen;

  const theme = {
    bg: isDarkMode ? '#0b0e14' : '#f6f8fa',
    panelBg: isDarkMode ? '#11151c' : '#ffffff',
    headerBg: isDarkMode ? '#141923' : '#f0f2f5',
    border: isDarkMode ? '#1f242d' : '#d0d7de',
    text: isDarkMode ? '#e6edf3' : '#24292f',
    subText: isDarkMode ? '#8b949e' : '#57606a',
    editorTheme: isDarkMode ? 'vs-dark' : 'vs',
  };

  const scaledGridSize = Math.max(8, Math.round(24 * graphZoom));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: theme.bg,
        color: theme.text,
        overflow: 'hidden',
        padding: '6px',
        gap: '6px',
        transition: 'background-color 0.3s ease, color 0.3s ease',
      }}
    >
      <style>{`
        .hover-scale-btn {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease, box-shadow 0.2s ease !important;
        }
        .hover-scale-btn:hover:not(:disabled) {
          transform: scale(1.06) !important;
        }
        .hover-scale-btn:active:not(:disabled) {
          transform: scale(0.98) !important;
        }
        .start-analysis-btn {
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 600;
          color: #0b1f11;
          border: 1px solid #4ade80;
          cursor: pointer;
          background: linear-gradient(90deg, #16a34a 0%, #22c55e 25%, #86efac 50%, #98fb98 75%, #a7f3d0 100%);
          background-size: 250% 100%;
          background-position: 100% 0;
          box-shadow: 0 4px 14px rgba(74, 222, 128, 0.2);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-position 0.55s ease, box-shadow 0.3s ease, color 0.3s ease;
        }
        .start-analysis-btn:hover:not(:disabled) {
          transform: scale(1.08);
          background-position: 0% 0;
          color: #ffffff;
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.45);
        }
        .start-analysis-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .zoom-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px;
          border-radius: 4px;
          cursor: pointer;
          transition: transform 0.2s ease, color 0.2s ease, background-color 0.2s ease;
        }
        .zoom-icon-btn:hover {
          transform: scale(1.18);
          color: #58a6ff;
          background-color: rgba(88, 166, 255, 0.12);
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          backgroundColor: theme.panelBg,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '14px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '5px', backgroundColor: '#1f6feb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 800 }}>
            J
          </div>
          <span>Java IDE</span>
        </div>

        <input type="file" ref={fileInputRef} onChange={handleImport} multiple accept=".java,.zip" style={{ display: 'none' }} />
        <input type="file" ref={folderInputRef} onChange={handleImportFolder} {...({ webkitdirectory: '', directory: '' } as any)} style={{ display: 'none' }} />

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              className="hover-scale-btn"
              onClick={() => setShowImportMenu((prev) => !prev)}
              style={btnStyle(isDarkMode)}
            >
              <Upload size={15} color="#58a6ff" /> Import <ChevronDown size={14} />
            </button>

            {showImportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '115%',
                  left: 0,
                  backgroundColor: theme.panelBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  padding: '4px',
                  zIndex: 100,
                  minWidth: '175px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                <div onClick={() => { setShowImportMenu(false); fileInputRef.current?.click(); }} style={dropdownItemStyle(isDarkMode)}>
                  <FileCode size={15} color="#e5c07b" /> files (.java / .zip)
                </div>
                <div onClick={() => { setShowImportMenu(false); folderInputRef.current?.click(); }} style={dropdownItemStyle(isDarkMode)}>
                  <FolderUp size={15} color="#7a889b" /> Project directory
                </div>
              </div>
            )}
          </div>

          <button className="hover-scale-btn" onClick={handleExport} style={btnStyle(isDarkMode)}>
            <Download size={15} /> Export Java
          </button>

          <button
            className="hover-scale-btn"
            onClick={handleRun}
            disabled={isRunning}
            style={{ ...btnStyle(isDarkMode), backgroundColor: '#194a2d', borderColor: '#266d42', color: '#7ee787' }}
          >
            <Play size={15} /> {isRunning ? 'Running...' : 'Launch'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: theme.subText }}>
          <Settings size={16} style={{ cursor: 'pointer' }} />
          <div
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: isDarkMode ? '#21262d' : '#eaeef2',
              transition: 'transform 0.4s ease, background-color 0.3s ease',
              transform: isDarkMode ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
            title={isDarkMode ? 'Enable light theme' : 'Enable dark theme'}
          >
            {isDarkMode ? <Moon size={16} color="#58a6ff" /> : <Sun size={16} color="#d29922" />}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '6px', minHeight: 0, overflow: 'hidden' }}>

        <div style={{ ...panelCardStyle(theme), width: '240px', flexShrink: 0 }}>
          <div style={panelHeaderStyle(theme)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Folder size={16} color="#8b949e" />
              <span>{projectName}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            {renderTree(fileTree)}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, minHeight: 0 }}>
          
          <div style={{ flex: 1, display: 'flex', gap: '6px', minHeight: 0, overflow: 'hidden' }}>

            <div style={{ ...panelCardStyle(theme), flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: theme.headerBg,
                  borderBottom: `1px solid ${theme.border}`,
                  padding: '0 6px',
                  height: '35px',
                  gap: '2px',
                  overflowX: 'auto',
                  flexShrink: 0,
                }}
              >
                {openTabs.map((path) => {
                  const isTabActive = path === activeFilePath;
                  const fileNode = files.find((f) => f.path === path);
                  if (!fileNode) return null;

                  return (
                    <div
                      key={path}
                      draggable
                      onDragStart={(e) => handleTabDragStart(e, path)}
                      onDragOver={(e) => handleTabDragOver(e, path)}
                      onClick={() => {
                        setActiveFilePath(path);
                        setIsCodeOpen(true);
                        setFocusedDock('code');
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        padding: '0 12px',
                        height: '100%',
                        backgroundColor: isTabActive ? (isDarkMode ? '#162844' : '#ffffff') : 'transparent',
                        borderTop: isTabActive ? '2px solid #388bfd' : '2px solid transparent',
                        borderRight: `1px solid ${theme.border}`,
                        borderRadius: '6px 6px 0 0',
                        fontSize: '12px',
                        color: isTabActive ? (isDarkMode ? '#ffffff' : '#0969da') : theme.subText,
                        cursor: 'grab',
                        userSelect: 'none',
                      }}
                    >
                      <FileCode size={13} color={isTabActive ? '#58a6ff' : '#e5c07b'} />
                      <span>{fileNode.name}</span>
                      <X
                        size={13}
                        style={{ marginLeft: '2px', opacity: 0.75, cursor: 'pointer' }}
                        onClick={(e) => handleCloseTab(e, path)}
                      />
                    </div>
                  );
                })}
              </div>

              <div
                onMouseDown={handleGraphMouseDown}
                onMouseMove={handleGraphMouseMove}
                onMouseUp={handleGraphMouseUp}
                onMouseLeave={handleGraphMouseUp}
                onWheel={handleGraphWheel}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  flex: 1,
                  position: 'relative',
                  overflow: 'hidden',
                  backgroundColor: isDarkMode ? '#0c1017' : '#ffffff',
                  backgroundImage: `
                    linear-gradient(to right, rgba(56, 139, 253, 0.07) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(56, 139, 253, 0.07) 1px, transparent 1px)
                  `,
                  backgroundSize: `${scaledGridSize}px ${scaledGridSize}px`,
                  backgroundPosition: `${graphPan.x}px ${graphPan.y}px`,
                  cursor: isDraggingGraph ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
              >
                <div
                  className="zoom-controls"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 10px',
                    backgroundColor: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: theme.subText,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  }}
                >
                  <div className="zoom-icon-btn" onClick={handleZoomOut} title="Zoom Out">
                    <ZoomOut size={13} />
                  </div>
                  <div className="zoom-icon-btn" onClick={handleZoomIn} title="Zoom In">
                    <ZoomIn size={13} />
                  </div>
                  <span
                    onClick={() => { setGraphZoom(1); setGraphPan({ x: 0, y: 0 }); }}
                    style={{ cursor: 'pointer', minWidth: '34px', textAlign: 'right' }}
                    title="Click to reset view (100%)"
                  >
                    {Math.round(graphZoom * 100)}%
                  </span>
                </div>

                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `translate(${graphPan.x}px, ${graphPan.y}px) scale(${graphZoom})`,
                    transformOrigin: 'center center',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ color: isDarkMode ? '#30363d' : '#8c959f', fontSize: '13px', userSelect: 'none' }}>
                    Flowchart area ({activeFile?.name})
                  </span>
                </div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(theme), width: '310px', flexShrink: 0 }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.headerBg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasAnalyzed ? '8px' : '0' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>Analysis</span>
                  {hasAnalyzed && (
                    <button
                      className="hover-scale-btn"
                      onClick={handleStartAnalysis}
                      disabled={isAnalyzing}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        borderRadius: '4px',
                        backgroundColor: '#194a2d',
                        border: '1px solid #266d42',
                        color: '#7ee787',
                        cursor: 'pointer',
                      }}
                    >
                      {isAnalyzing ? '...' : 'Re-run'}
                    </button>
                  )}
                </div>

                {hasAnalyzed && (
                  <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? '#0b0e14' : '#eaeef2', padding: '3px', borderRadius: '6px' }}>
                    {[
                      { id: 'problems', label: 'Problem' },
                      { id: 'recs', label: 'Recommendations' },
                      { id: 'metrics', label: 'Metrics' },
                    ].map((t) => (
                      <div
                        key={t.id}
                        className="hover-scale-btn"
                        onClick={() => setAnalysisTab(t.id as any)}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          padding: '4px 6px',
                          fontSize: '11px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: analysisTab === t.id ? (isDarkMode ? '#162844' : '#ffffff') : 'transparent',
                          color: analysisTab === t.id ? '#58a6ff' : theme.subText,
                        }}
                      >
                        {t.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '12px' }}>
                {!hasAnalyzed ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <button
                      className="start-analysis-btn"
                      onClick={handleStartAnalysis}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analysisTab === 'problems' && (
                      <>
                        {analysisErrors.length === 0 ? (
                          <div style={{ textAlign: 'center', color: theme.subText, fontSize: '12px', marginTop: '24px' }}>
                            No problems detected in {activeFile?.name}
                          </div>
                        ) : (
                          analysisErrors.map((err, idx) => {
                            const lvl = (err.level || '').toLowerCase();
                            const isHigh = lvl.includes('высок') || lvl.includes('high');
                            const isMed = lvl.includes('средн') || lvl.includes('med');
                            const badgeBg = isHigh ? 'rgba(248, 81, 73, 0.18)' : isMed ? 'rgba(210, 153, 34, 0.18)' : 'rgba(56, 139, 253, 0.18)';
                            const badgeColor = isHigh ? '#f85149' : isMed ? '#d29922' : '#58a6ff';

                            return (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px',
                                  borderRadius: '6px',
                                  backgroundColor: theme.headerBg,
                                  border: `1px solid ${theme.border}`,
                                  fontSize: '12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                  <span style={{ fontWeight: 600, color: theme.text }}>{err.name}</span>
                                  {err.level && (
                                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: badgeBg, color: badgeColor, fontWeight: 600, flexShrink: 0 }}>
                                      {err.level}
                                    </span>
                                  )}
                                </div>

                                <div style={{ color: theme.subText, fontSize: '11.5px', lineHeight: 1.45 }}>
                                  {err.description}
                                </div>

                                {err.place && (
                                  <div style={{ fontSize: '11px', color: '#58a6ff', fontFamily: 'Consolas, monospace' }}>
                                    {err.place}
                                  </div>
                                )}

                                {err.codeToFix && (
                                  <div style={{ marginTop: '2px' }}>
                                    <pre
                                      style={{
                                        margin: 0,
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: isDarkMode ? '#0b0e14' : '#eaeef2',
                                        border: `1px solid ${theme.border}`,
                                        color: '#ffffff',
                                        fontSize: '11px',
                                        fontFamily: 'Consolas, monospace',
                                        overflowX: 'auto',
                                      }}
                                    >
                                      {err.codeToFix}
                                    </pre>
                                    <button
                                      className="hover-scale-btn"
                                      onClick={() => handleApplyFix(err.codeToFix!)}
                                      style={{
                                        marginTop: '6px',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        borderRadius: '4px',
                                        backgroundColor: '#162844',
                                        color: '#58a6ff',
                                        border: '1px solid #264473',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Copy fix
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </>
                    )}

                    {analysisTab === 'recs' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {analysisErrors.filter((e) => e.codeToFix).length === 0 ? (
                          <div style={{ textAlign: 'center', color: theme.subText, fontSize: '12px', marginTop: '24px' }}>
                            No additional recommendations.
                          </div>
                        ) : (
                          analysisErrors
                            .filter((e) => e.codeToFix)
                            .map((err, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px',
                                  borderRadius: '6px',
                                  backgroundColor: theme.headerBg,
                                  border: `1px solid ${theme.border}`,
                                  fontSize: '12px',
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{err.name}</div>
                                <div style={{ fontSize: '11px', color: theme.subText, marginBottom: '6px' }}>
                                  Suggested fix at <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{err.place}</span>:
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: isDarkMode ? '#0b0e14' : '#eaeef2',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontFamily: 'Consolas, monospace',
                                    overflowX: 'auto',
                                  }}
                                >
                                  {err.codeToFix}
                                </pre>
                              </div>
                            ))
                        )}
                      </div>
                    )}

                    {analysisTab === 'metrics' && (
                      <div
                        style={{
                          padding: '10px',
                          borderRadius: '6px',
                          backgroundColor: theme.headerBg,
                          border: `1px solid ${theme.border}`,
                          fontSize: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: theme.subText }}>Total issues found:</span>
                          <span style={{ fontWeight: 600 }}>{analysisErrors.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: theme.subText }}>Lines of code:</span>
                          <span style={{ fontWeight: 600 }}>{activeFile?.content.split('\n').length || 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

          {anyBottomWindowOpen && (
            <div
              style={{
                height: isConsoleMaximized ? '70vh' : `${consoleHeight}px`,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                minHeight: 0,
              }}
            >
              <div onMouseDown={startResizingConsole} style={{ height: '4px', cursor: 'ns-resize', backgroundColor: 'transparent', flexShrink: 0 }} />

              <div style={{ flex: 1, display: 'flex', gap: '6px', minHeight: 0, overflow: 'hidden' }}>

                {isCodeOpen && (
                  <div
                    onMouseDown={() => setFocusedDock('code')}
                    style={{
                      ...panelCardStyle(theme),
                      flex: 1.3,
                      minWidth: 0,
                      borderColor: focusedDock === 'code' ? '#264473' : theme.border,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: theme.headerBg,
                        borderBottom: `1px solid ${theme.border}`,
                        padding: '4px 8px 0 8px',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          onClick={(e) => { e.stopPropagation(); setFocusedDock('code'); }}
                          style={getDockTabStyle('code', isCodeOpen)}
                        >
                          <Code2 size={14} color={focusedDock === 'code' ? '#58a6ff' : theme.subText} />
                          <span>Code Java</span>
                          <X
                            size={13}
                            style={{ marginLeft: '4px', opacity: 0.7 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsCodeOpen(false);
                            }}
                          />
                        </div>

                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsConsoleOpen(true);
                            setFocusedDock('console');
                          }}
                          style={getDockTabStyle('console', isConsoleOpen)}
                        >
                          <GitBranch size={13} color={focusedDock === 'console' ? '#58a6ff' : theme.subText} />
                          <span>Console</span>
                          {isConsoleOpen && (
                            <X
                              size={13}
                              style={{ marginLeft: '4px', opacity: 0.7 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsConsoleOpen(false);
                                setFocusedDock('code');
                              }}
                            />
                          )}
                        </div>

                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsTestsOpen(true);
                            setFocusedDock('tests');
                          }}
                          style={getDockTabStyle('tests', isTestsOpen)}
                        >
                          <CheckSquare size={13} color={focusedDock === 'tests' ? '#58a6ff' : theme.subText} />
                          <span>Test</span>
                          {isTestsOpen && (
                            <X
                              size={13}
                              style={{ marginLeft: '4px', opacity: 0.7 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsTestsOpen(false);
                                setFocusedDock('code');
                              }}
                            />
                          )}
                        </div>
                      </div>

                      <div
                        style={{ cursor: 'pointer', display: 'flex', color: theme.subText, paddingBottom: '4px' }}
                        onClick={() => setIsConsoleMaximized((prev) => !prev)}
                      >
                        {isConsoleMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      </div>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <Editor
                        height="100%"
                        defaultLanguage="java"
                        theme={theme.editorTheme}
                        path={activeFile.path}
                        value={activeFile.content}
                        onChange={handleEditorChange}
                        options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true }}
                      />
                    </div>
                  </div>
                )}

                {isConsoleOpen && (
                  <div
                    onMouseDown={() => setFocusedDock('console')}
                    style={{
                      ...panelCardStyle(theme),
                      flex: 1,
                      minWidth: 0,
                      borderColor: focusedDock === 'console' ? '#264473' : theme.border,
                    }}
                  >
                    <div style={panelHeaderStyle(theme)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <Terminal size={14} color="#58a6ff" />
                        <span>Console</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.subText }}>
                        <Trash2 size={13} style={{ cursor: 'pointer' }} onClick={() => setLogs([])} />
                        <X size={14} style={{ cursor: 'pointer' }} onClick={() => setIsConsoleOpen(false)} />
                      </div>
                    </div>

                    <div style={{ flex: 1, padding: '10px 12px', fontFamily: 'Consolas, monospace', fontSize: '12.5px', lineHeight: '1.6', overflowY: 'auto', textAlign: 'left' }}>
                      {logs.map((log, index) => {
                        let textColor = theme.text;
                        if (log.type === 'success') textColor = '#3fb950';
                        if (log.type === 'error') textColor = '#f85149';
                        if (log.type === 'input') textColor = '#58a6ff';

                        return (
                          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                            <span style={{ color: '#6e7681', flexShrink: 0, userSelect: 'none' }}>[{log.time}]</span>
                            <span style={{ color: textColor, fontWeight: log.type === 'success' || log.type === 'input' ? 600 : 400, whiteSpace: 'pre-wrap' }}>
                              {log.text}
                            </span>
                          </div>
                        );
                      })}
                      <div ref={consoleEndRef} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.headerBg, fontSize: '12px' }}>
                      <span style={{ color: isRunning ? '#3fb950' : theme.subText, fontFamily: 'monospace', fontWeight: isRunning ? 600 : 400 }}>
                        System.in &gt;
                      </span>
                      <input
                        type="text"
                        value={stdinInput}
                        onChange={(e) => setStdinInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendInteractiveInput();
                          }
                        }}
                        placeholder={isRunning ? 'Type input and press Enter...' : 'Run the program for interactive input'}
                        style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', color: theme.text, fontFamily: 'Consolas, monospace', fontSize: '12px' }}
                      />
                      <Send
                        size={13}
                        color={isRunning ? '#58a6ff' : theme.subText}
                        style={{ cursor: 'pointer' }}
                        onClick={handleSendInteractiveInput}
                      />
                    </div>
                  </div>
                )}

                {isTestsOpen && (
                  <div
                    onMouseDown={() => setFocusedDock('tests')}
                    style={{
                      ...panelCardStyle(theme),
                      flex: 0.9,
                      minWidth: 0,
                      borderColor: focusedDock === 'tests' ? '#264473' : theme.border,
                    }}
                  >
                    <div style={panelHeaderStyle(theme)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <CheckSquare size={14} color="#58a6ff" />
                        <span>Test</span>
                      </div>
                      <X
                        size={14}
                        style={{ cursor: 'pointer', color: theme.subText }}
                        onClick={() => {
                          setIsTestsOpen(false);
                          setFocusedDock('code');
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px', gap: '12px', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          className="hover-scale-btn"
                          onClick={handleGenerateTests}
                          disabled={isGeneratingTests}
                          style={{
                            ...btnStyle(isDarkMode),
                            flex: 1,
                            justifyContent: 'center',
                            opacity: isGeneratingTests ? 0.7 : 1,
                          }}
                        >
                          <Sparkles size={14} color="#58a6ff" />
                          <span>{isGeneratingTests ? 'Generating...' : 'Generate tests'}</span>
                        </button>

                        <button
                          className="hover-scale-btn"
                          disabled={!hasGeneratedTests}
                          style={{
                            ...btnStyle(isDarkMode),
                            flex: 1,
                            justifyContent: 'center',
                            backgroundColor: hasGeneratedTests ? '#194a2d' : (isDarkMode ? '#181c24' : '#eaeef2'),
                            borderColor: hasGeneratedTests ? '#266d42' : theme.border,
                            color: hasGeneratedTests ? '#7ee787' : theme.subText,
                            cursor: hasGeneratedTests ? 'pointer' : 'not-allowed',
                            opacity: hasGeneratedTests ? 1 : 0.55,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <Play size={14} />
                          <span>Run tests</span>
                        </button>
                      </div>

                      {generatedTests.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.subText, fontSize: '12px', textAlign: 'center' }}>
                          Click 'Generate tests' to send code from the Code Java window to the backend
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {generatedTests.map((test, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                backgroundColor: theme.headerBg,
                                border: `1px solid ${theme.border}`,
                                fontSize: '12px',
                              }}
                            >
                              <div style={{ fontWeight: 600, color: theme.text, marginBottom: '4px' }}>
                                {idx + 1}. {test.name}
                              </div>
                              <pre style={{ margin: 0, fontSize: '11px', color: theme.subText, overflowX: 'auto', fontFamily: 'Consolas, monospace' }}>
                                {test.code}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const btnStyle = (isDark: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  backgroundColor: isDark ? '#21262d' : '#f0f2f5',
  color: isDark ? '#c9d1d9' : '#24292f',
  border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12.5px',
});

const dropdownItemStyle = (isDark: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '7px 10px',
  cursor: 'pointer',
  fontSize: '12.5px',
  borderRadius: '5px',
  color: isDark ? '#c9d1d9' : '#24292f',
});

const panelCardStyle = (theme: any): React.CSSProperties => ({
  backgroundColor: theme.panelBg,
  border: `1px solid ${theme.border}`,
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 0,
});

const panelHeaderStyle = (theme: any): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: theme.headerBg,
  borderBottom: `1px solid ${theme.border}`,
  fontSize: '12.5px',
  color: theme.text,
  userSelect: 'none',
  flexShrink: 0,
});