import React, { useState, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Folder, FolderOpen, FileCode, Play, Upload, FolderUp,
  Download, Terminal, ChevronRight, ChevronDown,
  Maximize2, Minimize2, Trash2, X, Settings, Moon, Sun,
  ZoomIn, ZoomOut, CheckSquare, GitBranch, Code2, Send
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

const DEFAULT_JAVA_CODE = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println("Введите первое число:");
        int a = scanner.nextInt();
        System.out.println("Введите второе число:");
        int b = scanner.nextInt();
        System.out.println("Сумма: " + (a + b));
        scanner.close();
    }
}`;

export default function App() {
  const [projectName, setProjectName] = useState<string>('Project');
  const [files, setFiles] = useState<FileNode[]>([
    { name: 'Main.java', path: 'Main.java', content: DEFAULT_JAVA_CODE }
  ]);
  const [activeFilePath, setActiveFilePath] = useState<string>('Main.java');

  // переключение темы
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // строка живого ввода в консоль во время работы кода
  const [stdinInput, setStdinInput] = useState<string>('');
  const sessionIdRef = useRef<string>('session-' + Math.random().toString(36).slice(2));

  // вкладки файлов сверху над блок-схемами
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

  // клик по файлу в дереве открывает вкладку сверху и код снизу
  const handleOpenFile = (path: string) => {
    setActiveFilePath(path);
    setIsCodeOpen(true);
    setFocusedDock('code');
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path]);
    }
  };

  // закрытие вкладки сверху крестиком
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

  // перетаскивание верхних вкладок мышкой
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

  // потоковый запуск программы с ожиданием ввода пользователя во время работы
  const handleRun = async () => {
    if (!activeFile) return;
    setIsConsoleOpen(true);
    setFocusedDock('console');
    const now = () => new Date().toLocaleTimeString('ru-RU');

    setLogs([{ time: now(), text: 'Начата компиляция...', type: 'info' }]);
    setIsRunning(true);

    try {
      const filesMap: Record<string, string> = {
        [activeFile.path]: activeFile.content
      };

      const response = await fetch('http://localhost:8081/api/compile/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesMap,
          mainClass: activeFile.path,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!response.body) throw new Error('Поток чтения недоступен');

      const reader = response.body.getReader();
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
      appendConsole(`Ошибка связи с сервером: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  // отправка введенного числа в работающую программу по нажатию Enter
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
        appendConsole(`Не удалось передать ввод: ${err.message}`, 'error');
      }
    }
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
              {isOpen ? <FolderOpen size={15} color="#7a889b" /> : <Folder size={15} color="#7a889b" />}
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
      {/* верхняя шапка с кнопками */}
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
          <span>Test Dev</span>
        </div>

        <input type="file" ref={fileInputRef} onChange={handleImport} multiple accept=".java,.zip" style={{ display: 'none' }} />
        <input type="file" ref={folderInputRef} onChange={handleImportFolder} {...({ webkitdirectory: '', directory: '' } as any)} style={{ display: 'none' }} />

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowImportMenu((prev) => !prev)} style={btnStyle(isDarkMode)}>
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

          <button onClick={handleExport} style={btnStyle(isDarkMode)}>
            <Download size={15} /> Export Java
          </button>

          <button onClick={handleRun} disabled={isRunning} style={{ ...btnStyle(isDarkMode), backgroundColor: '#194a2d', borderColor: '#266d42', color: '#7ee787' }}>
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

      {/* основная часть экрана */}
      <div style={{ display: 'flex', flex: 1, gap: '6px', minHeight: 0, overflow: 'hidden' }}>
        
        {/* дерево проекта слева */}
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

        {/* правая часть интерфейса */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, minHeight: 0 }}>
          
          <div style={{ flex: 1, display: 'flex', gap: '6px', minHeight: 0, overflow: 'hidden' }}>
            
            {/* центральное окно блок-схем с вкладками открытых файлов СВЕРХУ (как на фото 3) */}
            <div style={{ ...panelCardStyle(theme), flex: 1, minWidth: 0 }}>
              
              {/* панель вкладок открытых файлов сверху (с перетаскиванием мышкой и крестиками, без плюса) */}
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

              {/* поле в клетку под блок-схемы */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  backgroundColor: isDarkMode ? '#0c1017' : '#ffffff',
                  backgroundImage: `
                    linear-gradient(to right, rgba(56, 139, 253, 0.07) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(56, 139, 253, 0.07) 1px, transparent 1px)
                  `,
                  backgroundSize: '24px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', backgroundColor: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '12px', color: theme.subText }}>
                  <ZoomOut size={13} style={{ cursor: 'pointer' }} />
                  <ZoomIn size={13} style={{ cursor: 'pointer' }} />
                  <span>100%</span>
                </div>
                <span style={{ color: isDarkMode ? '#30363d' : '#8c959f', fontSize: '13px', userSelect: 'none' }}>
                  Flowchart area ({activeFile?.name})
                </span>
              </div>
            </div>

            {/* окно анализа справа */}
            <div style={{ ...panelCardStyle(theme), width: '300px', flexShrink: 0 }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.headerBg }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Анализ</div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? '#0b0e14' : '#eaeef2', padding: '3px', borderRadius: '6px' }}>
                  {[
                    { id: 'problems', label: 'Problem' },
                    { id: 'recs', label: 'Recommendations' },
                    { id: 'metrics', label: 'Metrics' },
                  ].map((t) => (
                    <div
                      key={t.id}
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
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.subText, fontSize: '12px' }}>
                Code analysis window
              </div>
            </div>

          </div>

          {/* нижний ярус окон: Code Java | Console | Test result */}
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
                
                {/* окно Code Java с 3 кнопками переключения окон */}
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
                          <span>Test result</span>
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

                {/* окно консоли с живым вводом во время работы программы */}
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

                    {/* живой ввод для Scanner: пишем число и жмем Enter прямо во время выполнения */}
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
                        placeholder={isRunning ? 'Программа ждет ввод... введите значение и нажмите Enter' : 'Запустите программу для интерактивного ввода'}
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

                {/* окно результатов тестов */}
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
                        <span>Result Tests</span>
                      </div>
                      <X size={14} style={{ cursor: 'pointer' }} onClick={() => setIsTestsOpen(false)} />
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.subText, fontSize: '12px' }}>
                      Test results window
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