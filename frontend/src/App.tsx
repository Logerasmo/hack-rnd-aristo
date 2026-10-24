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
  ChevronUp, Maximize2, Minimize2, Trash2, X
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
  

  // жесткая консолька
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleDateString('ru-RU'), text: 'Ready', type: 'info'}

  ]);
  //cостояние
  const [showImportMenu, setShowImportMenu] = useState<boolean>(false);
  //сворачивание
  const [consoleHeight, setConsoleHeight] = useState<number>(200);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(true);
  const [isConsoleMaximized, setIsConsoleMaximized] = useState<boolean>(false);



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

  
  const startResizingConsole = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsConsoleOpen(true);
    setIsConsoleMaximized(false);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = window.innerHeight - moveEvent.clientY;
      if (newHeight >= 80 && newHeight <= window.innerHeight * 0.8) {
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
        }),
      });

      const data = await response.json();

      if (data.error && !data.output) {
        appendConsole(' Compilation error / Execution error', 'error');
        appendConsole(data.error, 'error');
      } else {
        appendConsole('Сompilation successful', 'success');
        appendConsole('Program launch...', 'info');
        if (data.output) {
          appendConsole(data.output, 'info');
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
          onClick={()=> setActiveFilePath(node.path)}
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
            <FileCode size={15} color={isSelected ? '#61afef' : '#e5c07b'} />
            <span>{node.name}</span>
          </div>
      );
    });
  };




  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e', color: '#fff', fontFamily: 'sans-serif' }}>
        {/* Кнопки ипорта и экспорта*/}
        <div style={{ display: 'flex', gap: '10px', padding: '10px', backgroundColor: '#252526', borderBottom: '1px solid #3c3c3c' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            multiple
            accept=".java,.zip"
            style={{ display: 'none' }}
          />
          <input 
            type='file'
            ref={folderInputRef}
            onChange={handleImportFolder}
            {...({webkitdirectory: '', directory: ''} as any)}
            style={{display: 'none'}}
            />
          {/*  импорт с выбором файл или папка */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowImportMenu((prev) => !prev)}
            style={btnStyle}
          >
            <Upload size={16} /> Import <ChevronDown size={14} />
          </button>

          {showImportMenu && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                left: 0,
                backgroundColor: '#252526',
                border: '1px solid #3c3c3c',
                borderRadius: '6px',
                padding: '4px',
                zIndex: 100,
                minWidth: '175px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              <div
                onClick={() => {
                  setShowImportMenu(false);
                  fileInputRef.current?.click();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '13px', borderRadius: '4px' }}
              >
                <FileCode size={15} color="#e5c07b" /> files (.java / .zip)
              </div>
              <div
                onClick={() => {
                  setShowImportMenu(false);
                  folderInputRef.current?.click();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '13px', borderRadius: '4px' }}
              >
                <FolderUp size={15} color="#7a889b" /> Project directory
              </div>
            </div>
          )}
        </div>
          <button onClick={handleExport} style={btnStyle}>
            <Download size={16} /> Export Java
          </button>
          <button onClick={handleRun} disabled={isRunning} style={{ ...btnStyle, backgroundColor: '#0e639c' }}>
            <Play size={16} /> {isRunning ? 'Launch...' : 'Launch'}
          </button>
        </div>
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/*дерево файлов */}
          <div style={{ width: '240px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #3c3c3c', fontWeight: 'bold', fontSize: '14px', color: '#e5e5e5' }}>
            <Folder size={18} color="#8b949e" />
            <span>{projectName}</span>
          </div>
            {/* Дерево файлов */}
            {renderTree(fileTree)}
          </div>
          {/* использование Monaco Editor в окошке */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <Editor
                height="100%"
                defaultLanguage="java"
                theme="vs-dark"
                path={activeFile.name}
                value={activeFile.content}
                onChange={handleEditorChange}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  automaticLayout: true,
                }}
              />
            </div>
          <div
            style={{
              height: !isConsoleOpen ? '32px' : isConsoleMaximized ? '75vh' : `${consoleHeight}px`,
              backgroundColor: '#14171d',
              borderTop: '1px solid #2b313a',
              display: 'flex',
              flexDirection: 'column',
              transition: isConsoleMaximized ? 'height 0.15s ease' : 'none',
            }}
          >
            <div
              onMouseDown={startResizingConsole}
              style={{
                height: '4px',
                cursor: 'ns-resize',
                backgroundColor: 'transparent',
              }}
              title="Drag up or down to resize the console"
            />
            <div
              style={{
                padding: '5px 12px',
                backgroundColor: '#1c2026',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#c9d1d9',
                userSelect: 'none',
                borderBottom: isConsoleOpen ? '1px solid #2b313a' : 'none',
              }}
            >
              <div
                onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                <Terminal size={14} color="#8b949e" />
                <span>Консоль</span>
              </div>

              {/* кнопки управления консолькой */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#8b949e' }}>
                <div
                  style={{ cursor: 'pointer', display: 'flex' }}
                  title="Clear console"
                  onClick={() => setLogs([])}
                >
                  <Trash2 size={14} />
                </div>
                <div
                  style={{ cursor: 'pointer', display: 'flex' }}
                  title={isConsoleMaximized ? 'Reset size' : 'Expand panel'}
                  onClick={() => {
                    setIsConsoleOpen(true);
                    setIsConsoleMaximized(!isConsoleMaximized);
                  }}
                >
                  {isConsoleMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </div>
                <div
                  style={{ cursor: 'pointer', display: 'flex' }}
                  title={isConsoleOpen ? 'Hide Panel' : 'Open panel'}
                  onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                >
                  {isConsoleOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </div>
              </div>
            </div>

            {isConsoleOpen && (
              <div
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                  fontSize: '13px',
                  lineHeight: '1.6',
                  overflowY: 'auto',
                  textAlign: 'left', 
                }}
              >
                {logs.map((log, index) => {
                  
                  let textColor = '#c9d1d9'; 
                  if (log.type === 'success') textColor = '#3fb950'; 
                  if (log.type === 'error') textColor = '#f85149';  

                  return (
                    <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                      <span style={{ color: '#6e7681', flexShrink: 0, userSelect: 'none' }}>
                        [{log.time}]
                      </span>
                      {/* текст*/}
                      <span
                        style={{
                          color: textColor,
                          fontWeight: log.type === 'success' ? 600 : 400,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {log.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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