import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FileCode, FileImage, FileText } from 'lucide-react';

interface FileExplorerProps {
  dirHandle: FileSystemDirectoryHandle | null;
  onFileClick: (path: string) => void;
  refreshTrigger?: number;
}

interface FileNode {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemHandle;
  path: string;
}

export function FileExplorer({ dirHandle, onFileClick, refreshTrigger = 0 }: FileExplorerProps) {
  if (!dirHandle) {
    return (
      <div className="p-4 text-sm text-gray-500 italic text-center">
        No project selected.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full p-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Project Explorer</div>
      <DirectoryNode dirHandle={dirHandle} path="" onFileClick={onFileClick} defaultOpen={true} refreshTrigger={refreshTrigger} />
    </div>
  );
}

interface DirectoryNodeProps {
  dirHandle: FileSystemDirectoryHandle;
  path: string;
  onFileClick: (path: string) => void;
  defaultOpen?: boolean;
  refreshTrigger?: number;
}

function DirectoryNode({ dirHandle, path, onFileClick, defaultOpen = false, refreshTrigger = 0 }: DirectoryNodeProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [children, setChildren] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadChildren = async () => {
    setIsLoading(true);
    try {
      const entries: FileNode[] = [];
      // @ts-ignore - TS doesn't fully support async iterators on FileSystemDirectoryHandle yet
      for await (const entry of dirHandle.values()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        entries.push({
          name: entry.name,
          kind: entry.kind,
          handle: entry,
          path: path ? `${path}/${entry.name}` : entry.name
        });
      }
      // Sort: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
      });
      setChildren(entries);
    } catch (e) {
      console.error("Failed to load directory", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadChildren();
    }
  }, [isOpen, refreshTrigger]);

  const toggleOpen = () => setIsOpen(!isOpen);

  const getFileIcon = (name: string) => {
    if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) return <FileCode className="w-3.5 h-3.5 text-blue-400" />;
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return <FileImage className="w-3.5 h-3.5 text-purple-400" />;
    if (name.endsWith('.md') || name.endsWith('.txt')) return <FileText className="w-3.5 h-3.5 text-gray-400" />;
    return <File className="w-3.5 h-3.5 text-gray-400" />;
  };

  return (
    <div className="pl-2">
      {path !== "" && (
        <div 
          className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#2f2f2f] rounded cursor-pointer text-sm text-gray-300 transition-colors"
          onClick={toggleOpen}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
          <Folder className="w-3.5 h-3.5 text-yellow-500" />
          <span className="truncate">{dirHandle.name}</span>
        </div>
      )}
      
      {(isOpen || path === "") && (
        <div className={path !== "" ? "pl-3 border-l border-gray-700/50 ml-2 mt-0.5" : ""}>
          {isLoading && <div className="text-xs text-gray-500 pl-4 py-1">Loading...</div>}
          {children.map(node => (
            <div key={node.name}>
              {node.kind === 'directory' ? (
                <DirectoryNode 
                  dirHandle={node.handle as FileSystemDirectoryHandle} 
                  path={node.path} 
                  onFileClick={onFileClick} 
                  refreshTrigger={refreshTrigger}
                />
              ) : (
                <div 
                  className="flex items-center gap-2 py-1 px-2 hover:bg-[#2f2f2f] rounded cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition-colors group"
                  onClick={() => onFileClick(node.path)}
                  title={node.path}
                >
                  <span className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 flex items-center justify-center text-[10px] text-green-500 font-bold">+</span>
                  {getFileIcon(node.name)}
                  <span className="truncate">{node.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
