//  import { useState } from 'react'

// function App() {
//   const [response, setResponse] = useState('')

//   const checkAi = async () => {
//     const res = await fetch('/api/ai/ping?message=Привет, скажи что-нибудь')
//     const text = await res.text()
//     setResponse(text)
//   }

//   return (
//     <div style={{ padding: '2rem' }}>
//       <h1>Hackathon Skeleton</h1>
//       <button onClick={checkAi}>Проверить связь с AI</button>
//       <p><strong>Ответ:</strong> {response}</p>
//     </div>
//   )
// }

// export default App 

import React, { useState, useRef, useMemo } from 'react';
import Editor  from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Folder, FolderOpen, FileCode, Play, Upload, FolderUp,
  Download, Terminal, ChevronRight, ChevronDown,
  ChevronUp, Maximize2, Minimize2, Trash2, X, Plus, Search, Sparkles, Bug, Settings, Moon,
  ZoomIn, ZoomOut, CheckSquare, GitBranch, Code2, Crosshair, MoreVertical
} from 'lucide-react';


interface FileNode {
  name: string;
  path: string;
  content: string;
}
// отрисовка визуального дерева (папка или файл .java)
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
  type?: 'info' | 'success' | 'error';
}

// превращает  список FileNode в вложенное дерево TreeNode

function buildFileTree(files: FileNode[]): TreeNode[] {
  const root: TreeNode[] = [];

  files.forEach((file) => {
    // деление пути файла на куски (\)
    const parts = file.path.replace(/\\/g, '/').split('/');

    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length -1;
      
      if (isFile) {
        // проверка: если файл, то кладем на некст уровень
        currentLevel.push({ name: part, path: file.path, type: 'file'});

      } else {
        // если папка - проверка не создавали ли мы ее раньше на этом лвле
        let folder = currentLevel.find((n) => n.type === 'folder' && n.name === part);
        if (!folder) {
          // креатим папку если ее нема
          folder = { name: part, path: currentPath, type: 'folder', children: []};
          currentLevel.push(folder);
        }
        // падаем в папку и повтор цикла
        currentLevel = folder.children!;

      }
    });
  });

  // cортировка по алф
  const sortTree = (nodes : TreeNode[]) => {
    nodes.sort((a,b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1: 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children && sortTree(n.children));
  };

  sortTree(root);
  return root;
}

const DEFAULT_JAVA_CODE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java Blueprints!");
    }
}`;

export default function App() {
  const [projectName, setProjectName] = useState<string>('Project');
  const [files, setFiles] = useState<FileNode[]>([
    { name: 'Main.java', path: 'Main.java', content: DEFAULT_JAVA_CODE}
  ]);
  const [activeFilePath, setActiveFilePath] = useState<string>('Main.java');
  
  //входные данные юзеров
  const [stdinInput, setStdinInput] = useState<string>('');
  // жесткая консолька
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleDateString('ru-RU'), text: 'Ready', type: 'info'}

  ]);
  //cостояние
  const [showImportMenu, setShowImportMenu] = useState<boolean>(false);
  //сворачивание
 const [isCodeOpen, setIsCodeOpen] = useState<boolean>(true);
 const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(true);
 const [isTestsOpen, setIsTestsOpen] = useState<boolean>(false);
// проверка какой из окон открыт сейчас (код, консоллька, тесты)
 const [focusedDock, setFocusedDock] = useState<'code' | 'console' | 'tests'>('code');

 const [consoleHeight, setConsoleHeight] = useState<number>(250);
 const [isConsoleMaximized, setIsConsoleMaximized] = useState<boolean>(false);

  // вкладка анализ
  const [analysisTab, setAnalysisTab] = useState<'problems' | 'recs' | 'metrics'>('problems')



  const [isRunning, setIsRunning] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFile = files.find((f) => f.path === activeFilePath) || files[0];
  
const folderInputRef = useRef<HTMLInputElement>(null);

// хранит пути открытых папок (умолчание : раскрытое src)
const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ src: true });

const fileTree = useMemo(() => buildFileTree(files), [files]);
// функция раскрытия папок (открыта/открыта)
const toggleFolder = (folderPath: string) => {
  setExpandedFolders((prev) => ({...prev, [folderPath]: !prev[folderPath]}));

};

//автоматическое расскрытие всех папок при импорте проекта
const expandAll = (newFiles : FileNode[]) => {
  const nextExpanded: Record<string, boolean> = {};
  newFiles.forEach((f) => {
    const parts = f.path.replace(/\\/g, '/').split('/');
    let curr = '';
    for (let i = 0; i < parts.length -1; i++) {
      curr = curr ? `${curr}/${parts[i]}` : parts[i];
      nextExpanded[curr] = true;
    }
  });
  setExpandedFolders(nextExpanded);
};

  // редактирование кода в файле
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setFocusedDock('code');
    setFiles((prev) =>
      prev.map((file) =>
        file.path === activeFilePath ? { ...file, content: value} : file
      )
    );
  };

  // импорт кода джава
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const newFiles: FileNode[] = [];

    for (let i = 0; i < importedFiles.length; i++) {
      const file = importedFiles[i]

      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        for (const relativePath of Object.keys(zip.files)) {
          const zipEntry = zip.files[relativePath];
          if (!zipEntry.dir && relativePath.endsWith('.java')) {
            const content = await zipEntry.async('string');
            const name = relativePath.split('/').pop() || relativePath;
            newFiles.push({ name, path: relativePath, content});
          }
        }
      } else if (file.name.endsWith('.java')) {
        const content = await file.text();
        newFiles.push({ name: file.name, path: file.name, content});
      }
    }

    if (newFiles.length > 0) {
      setFiles(newFiles);
      setActiveFilePath(newFiles[0].path);
      appendConsole(`Files imported: ${newFiles.length}`);
      expandAll(newFiles);
    }
  };
  // импорт папки с ПК + очистка мусора ( текстовики, картинки и прочий мусор, кроме файлов .java)
  const handleImportFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const importedFiles = e.target.files;
    if (!importedFiles || importedFiles.length === 0) return;

    const newFiles: FileNode[]=[];
    let detectedProjectName = 'Project';
    for (let i = 0; i< importedFiles.length; i++ ) {
      const file = importedFiles[i];

      //убираем мусор из папки
      if (file.name.endsWith('.java')) {
        const content = await file.text();
        const rawPath : string= (file as any).webkitRelativePath || file.name;
        const normalized = rawPath.replace(/\\/g, '/');
        const parts = normalized.split('/');

        if (parts.length > 1) {
          detectedProjectName = parts[0];
        }
        const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : normalized;

        newFiles.push({
          name: file.name,
          path: cleanPath,
          content,
        });
      }
    }

    if (newFiles.length > 0) {
      setProjectName(detectedProjectName); // название проекта
      setFiles(newFiles);
      setActiveFilePath(newFiles[0].path);
      expandAll(newFiles); 
      appendConsole(` Project "${detectedProjectName}" imported! Java files loaded: ${newFiles.length}`);

    } else {
      appendConsole('The selected folder contains no .java files');
    }
    e.target.value = ''; 
  };
  // экспорт кода джава в виде zip или отдельным файлом
  const handleExport = async () => {
    if (files.length === 1) {
      const blob = new Blob([files[0].content], { type: 'text/plain;charset=utf-8'});
      saveAs(blob, files[0].name);
    } else {
      const zip = new JSZip();
      files.forEach((file) => {
        zip.file(file.path, file.content);
      });
      const  blob = await zip.generateAsync({ type: 'blob'});
      saveAs(blob, `${projectName}.zip`);
    }
    appendConsole('Project exported successfully');
  };

  // компиляция кода и запуск его
  

  // Умное добавление строк в консоль с автоматическим временем и цветом
  const appendConsole = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('ru-RU'); 
    const lines = String(text).split('\n').filter((line) => line.trim() !== '');

    setLogs((prev) => [
      ...prev,
      ...lines.map((line) => ({ time, text: line, type }))
    ]);
  };

  
  
  // автоматически открывается и сбрасывает режим максимизации
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

  const handleRun = async () => {
    if (!activeFile) return;
    setIsConsoleOpen(true); // авто открытие консполи при лаунче
    setFocusedDock('console');
    const now = () => new Date().toLocaleTimeString('ru-RU');

    // очистка старого вывода
    setLogs([{ time: now(), text: 'Начата компиляция...', type: 'info' }]);
    setIsRunning(true);

    try {
      const filesMap: Record<string, string> = {};
      files.forEach((f) => {
        filesMap[f.path] = f.content;
      });

      const currentMainFileName = activeFile?.path || (files.length > 0 ? files[0].path : 'Main.java');

    const response = await fetch('http://localhost:8081/api/compile/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesMap,
          mainClass: currentMainFileName,
          stdin: stdinInput, // отправка данных для сканннер
        }),
      });

      const data = await response.json();

      if (data.error && !data.output) {
        // ошикбка компиляции или падение на старте 
        appendConsole('Ошибка компиляции / выполнения:', 'error');
        appendConsole(data.error, 'error');
      } else {
        appendConsole('Компиляция успешна ✓', 'success');
        appendConsole('Запуск программы...', 'info');
        // 
        if (data.output) {
          appendConsole(data.output, 'info');
        }
        // если  программа писала еще и в System.err
        if (data.error) {
          appendConsole(data.error, 'error');
        }
      } 
    } catch (err: any) {
      appendConsole(`Server connection error: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };
  // рекурсия отрисовки дерево папок с файлами

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map((node) => {
      // для случая если это папка
      if (node.type === 'folder') {
        const isOpen = !!expandedFolders[node.path];
        return(
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
                color: '#cccccc',
                fontSize: '13px',
              }}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {isOpen ? <FolderOpen size={15} color="#7a889b" /> : <Folder size={15} color="#7a889b" />}
              <span>{node.name}</span>

            </div>
            {/* если папка открыта — рекурсивно рисуем её содержимое на глубине depth + 1 */}
            {isOpen && node.children && (
              <div style={{ borderLeft: '1px solid #333', marginLeft: `${depth * 14 + 12}px` }}>
                {renderTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      // если это уже наш .java ффайлик
      const isSelected = node.path === activeFilePath;
      return (
        <div
          key = {node.path}
          onClick={() => {
            setActiveFilePath(node.path);
            setIsCodeOpen(true);    // Возвращаем окно Кода Java, если оно было закрыто крестиком!
            setFocusedDock('code'); // И сразу подсвечиваем кнопку "Код Java"
          }}
          style= {{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 8px',
            paddingLeft: `${depth * 14 + 22}px`,
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '13px',
            backgroundColor: isSelected ? '#2a2d34' : 'transparent',
            color: '#d4d4d4',
          }}
          >
            <FileCode size={15} color='#e5c07b' />
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
      backgroundColor: isFocused ? '#162844' : isOpen ? '#161b22' : 'transparent',
      color: isFocused ? '#ffffff' : isOpen ? '#c9d1d9' : '#7d8590',
      borderBottom: isFocused ? '2px solid #388bfd' : '2px solid transparent',
      transition: 'all 0.15s ease',
    };
  };

  // тест открыто ли хотя бы одно окно
  const anyBottomWindowOpen = isCodeOpen || isConsoleOpen || isTestsOpen;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0b0e14',
        color: '#e6edf3',
        overflow: 'hidden',
        padding: '6px',
        gap: '6px',
      }}
    >
      {/* ВЕРХНЯЯ ПАНЕЛЬ С КНОПКАМИ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          backgroundColor: '#11151c',
          border: '1px solid #1f242d',
          borderRadius: '8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '14px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '5px', backgroundColor: '#1f6feb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>
            J
          </div>
          <span>Test Dev</span>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          multiple
          accept=".java,.zip"
          style={{ display: 'none' }}
        />
        <input
          type="file"
          ref={folderInputRef}
          onChange={handleImportFolder}
          {...({ webkitdirectory: '', directory: '' } as any)}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/*  кнопка Import */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowImportMenu((prev) => !prev)} style={btnStyle}>
              <Upload size={15} color="#58a6ff" /> Import <ChevronDown size={14} />
            </button>

            {showImportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '115%',
                  left: 0,
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  padding: '4px',
                  zIndex: 100,
                  minWidth: '175px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}
              >
                <div
                  onClick={() => { setShowImportMenu(false); fileInputRef.current?.click(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '13px', borderRadius: '4px' }}
                >
                  <FileCode size={15} color="#e5c07b" /> files (.java / .zip)
                </div>
                <div
                  onClick={() => { setShowImportMenu(false); folderInputRef.current?.click(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '13px', borderRadius: '4px' }}
                >
                  <FolderUp size={15} color="#7a889b" /> Project directory
                </div>
              </div>
            )}
          </div>

          <button onClick={handleExport} style={btnStyle}>
            <Download size={15} /> Export Java
          </button>

          <button onClick={handleRun} disabled={isRunning} style={{ ...btnStyle, backgroundColor: '#194a2d', borderColor: '#266d42', color: '#7ee787' }}>
            <Play size={15} /> {isRunning ? 'Launch...' : 'Launch'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#8b949e' }}>
          <Settings size={16} style={{ cursor: 'pointer' }} />
          <Moon size={16} style={{ cursor: 'pointer' }} />
        </div>
      </div>

      {/* ОСНОВНАЯ ЧАСТЬ ЭКРАНА  */}
      <div style={{ display: 'flex', flex: 1, gap: '6px', minHeight: 0, overflow: 'hidden' }}>
        
        {/*Дерево проекта (Фото 1) */}
        <div style={{ ...panelCardStyle, width: '240px', flexShrink: 0 }}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Folder size={16} color="#8b949e" />
              <span>{projectName}</span>
            </div>
            <MoreVertical size={14} color="#8b949e" style={{ cursor: 'pointer' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            {renderTree(fileTree)}
          </div>
        </div>

        {/*  ВЕРХ (Блок-схемы + Анализ) и НИЗ (Код Java + Консоль + Результат тестов) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, minHeight: 0 }}>
          
          {/* ЦЕНТРАЛЬНОЕ ОКНО БЛОК-СХЕМ  */}
          <div style={{ flex: 1, display: 'flex', gap: '6px', minHeight: 0, overflow: 'hidden' }}>
            
            {/*  Окно Блок-схем  */}
            <div style={{ ...panelCardStyle, flex: 1, minWidth: 0 }}>
              {/* Шапка с открытым файлом (Фото 6, обведено красным) */}
              <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#141923', borderBottom: '1px solid #1f242d', padding: '0 8px', height: '34px', gap: '4px' }}>
                {activeFile && (
                  <div
                    onClick={() => { setIsCodeOpen(true); setFocusedDock('code'); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 12px',
                      backgroundColor: '#162844',
                      borderTop: '2px solid #388bfd',
                      borderRadius: '6px 6px 0 0',
                      fontSize: '12px',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <FileCode size={14} color="#58a6ff" />
                    <span>{activeFile.name}</span>
                  </div>
                )}
                <Plus size={14} color="#8b949e" style={{ marginLeft: '6px', cursor: 'pointer' }} />
              </div>

              {/* окно под блок схемы */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  backgroundColor: '#0c1017',
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
                {/* Кнопки масштаба в правом верхнем углу клетчатого поля */}
                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', backgroundColor: '#161b22', border: '1px solid #262c36', borderRadius: '6px', fontSize: '12px', color: '#8b949e' }}>
                  <ZoomOut size={13} style={{ cursor: 'pointer' }} />
                  <ZoomIn size={13} style={{ cursor: 'pointer' }} />
                  <span>100%</span>
                </div>
                <span style={{ color: '#30363d', fontSize: '13px', userSelect: 'none' }}>
                  Flowchart area ({activeFile?.name})
                </span>
              </div>
            </div>

            {/* окно анализа */}
            <div style={{ ...panelCardStyle, width: '300px', flexShrink: 0 }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #1f242d', backgroundColor: '#141923' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Анализ</div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0b0e14', padding: '3px', borderRadius: '6px' }}>
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
                        backgroundColor: analysisTab === t.id ? '#162844' : 'transparent',
                        color: analysisTab === t.id ? '#58a6ff' : '#8b949e',
                      }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: '12px', padding: '16px', textAlign: 'center' }}>
                Code analysis window
              </div>
            </div>

          </div>

          {/* нижний ярус окошек*/}
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
              {/* Полоска перетаскивания высоты нижних окон */}
              <div
                onMouseDown={startResizingConsole}
                style={{ height: '4px', cursor: 'ns-resize', backgroundColor: 'transparent', flexShrink: 0 }}
                title="Drag up or down to resize"
              />

              <div style={{ flex: 1, display: 'flex', gap: '6px', minHeight: 0, overflow: 'hidden' }}>
                
                {/* окно код джавы */}
                {isCodeOpen && (
                  <div
                    onMouseDown={() => setFocusedDock('code')}
                    style={{
                      ...panelCardStyle,
                      flex: 1.3,
                      minWidth: 0,
                      borderColor: focusedDock === 'code' ? '#264473' : '#1f242d',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#141923', borderBottom: '1px solid #1f242d', padding: '4px 8px 0 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        
                        {/* кнопка код джава*/}
                        <div
                          onClick={(e) => { e.stopPropagation(); setFocusedDock('code'); }}
                          style={getDockTabStyle('code', isCodeOpen)}
                        >
                          <Code2 size={14} color={focusedDock === 'code' ? '#58a6ff' : '#8b949e'} />
                          <span>Code Java</span>
                          <X
                            size={13}
                            style={{ marginLeft: '4px', opacity: 0.7 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsCodeOpen(false); // Закрывает окно Кода Java 
                            }}
                          />
                        </div>

                        {/* кнопка консоль */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsConsoleOpen(true);
                            setFocusedDock('console');
                          }}
                          style={getDockTabStyle('console', isConsoleOpen)}
                        >
                          <GitBranch size={13} color={focusedDock === 'console' ? '#58a6ff' : '#8b949e'} />
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

                        {/* кнопка тесты */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsTestsOpen(true);
                            setFocusedDock('tests');
                          }}
                          style={getDockTabStyle('tests', isTestsOpen)}
                        >
                          <CheckSquare size={13} color={focusedDock === 'tests' ? '#58a6ff' : '#8b949e'} />
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

                      {/* Кнопка максимизации нижнего дока */}
                      <div
                        style={{ cursor: 'pointer', display: 'flex', color: '#8b949e', paddingBottom: '4px' }}
                        onClick={() => setIsConsoleMaximized((prev) => !prev)}
                      >
                        {isConsoleMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      </div>
                    </div>

                    {/* monaco editor*/}
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <Editor
                        height="100%"
                        defaultLanguage="java"
                        theme="vs-dark"
                        path={activeFile.path}
                        value={activeFile.content}
                        onChange={handleEditorChange}
                        options={{
                          fontSize: 13,
                          minimap: { enabled: false },
                          automaticLayout: true,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* окно конспольки */}
                {isConsoleOpen && (
                  <div
                    onMouseDown={() => setFocusedDock('console')}
                    style={{
                      ...panelCardStyle,
                      flex: 1,
                      minWidth: 0,
                      borderColor: focusedDock === 'console' ? '#264473' : '#1f242d',
                    }}
                  >
                    <div style={panelHeaderStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <Terminal size={14} color={focusedDock === 'console' ? '#58a6ff' : '#8b949e'} />
                        <span>Console</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e' }}>
                        <div style={{ cursor: 'pointer', display: 'flex' }} onClick={() => setLogs([])}>
                          <Trash2 size={13} />
                        </div>
                        <div
                          style={{ cursor: 'pointer', display: 'flex' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsConsoleOpen(false);
                            setFocusedDock('code');
                          }}
                        >
                          <X size={14} />
                        </div>
                      </div>
                    </div>

                    <div style={{ flex: 1, padding: '10px 12px', fontFamily: 'Consolas, monospace', fontSize: '12.5px', lineHeight: '1.6', overflowY: 'auto', textAlign: 'left' }}>
                      {logs.map((log, index) => {
                        let textColor = '#c9d1d9';
                        if (log.type === 'success') textColor = '#3fb950';
                        if (log.type === 'error') textColor = '#f85149';

                        return (
                          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                            <span style={{ color: '#6e7681', flexShrink: 0, userSelect: 'none' }}>[{log.time}]</span>
                            <span style={{ color: textColor, fontWeight: log.type === 'success' ? 600 : 400, whiteSpace: 'pre-wrap' }}>
                              {log.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* поле ввода данных сканер */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderTop: '1px solid #1f242d',
                        backgroundColor: '#0d1117',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ color: '#8b949e', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        System.in &gt;
                      </span>
                      <input
                        type="text"
                        value={stdinInput}
                        onChange={(e) => setStdinInput(e.target.value)}
                        placeholder="Scanner data"
                        style={{
                          flex: 1,
                          backgroundColor: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#e6edf3',
                          fontFamily: 'Consolas, monospace',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* окно тесты */}
                {isTestsOpen && (
                  <div
                    onMouseDown={() => setFocusedDock('tests')}
                    style={{
                      ...panelCardStyle,
                      flex: 0.9,
                      minWidth: 0,
                      borderColor: focusedDock === 'tests' ? '#264473' : '#1f242d',
                    }}
                  >
                    <div style={panelHeaderStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <CheckSquare size={14} color={focusedDock === 'tests' ? '#58a6ff' : '#8b949e'} />
                        <span>Result Tests</span>
                      </div>
                      <div
                        style={{ cursor: 'pointer', display: 'flex', color: '#8b949e' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTestsOpen(false);
                          setFocusedDock('code');
                        }}
                      >
                        <X size={14} />
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: '12px' }}>
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

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  backgroundColor: '#3c3c3c',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
};
const panelCardStyle: React.CSSProperties = {
  backgroundColor: '#11151c',
  border: '1px solid #1f242d',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 0,
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: '#141923',
  borderBottom: '1px solid #1f242d',
  fontSize: '12.5px',
  color: '#c9d1d9',
  userSelect: 'none',
  flexShrink: 0,
};