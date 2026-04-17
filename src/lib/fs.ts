export async function verifyPermission(fileHandle: FileSystemHandle, readWrite: boolean = false) {
  const options: FileSystemHandlePermissionDescriptor = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

export async function getFileHandle(dirHandle: FileSystemDirectoryHandle, path: string, create = false): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(p => p);
  let currentHandle = dirHandle;
  
  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create });
  }
  
  return await currentHandle.getFileHandle(parts[parts.length - 1], { create });
}

export async function readFile(dirHandle: FileSystemDirectoryHandle, path: string): Promise<string> {
  const fileHandle = await getFileHandle(dirHandle, path);
  const file = await fileHandle.getFile();
  return await file.text();
}

export async function writeFile(dirHandle: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const fileHandle = await getFileHandle(dirHandle, path, true);
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function createDir(dirHandle: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = path.split('/').filter(p => p);
  let currentHandle = dirHandle;
  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
  }
}

export async function listDir(dirHandle: FileSystemDirectoryHandle, path: string = ''): Promise<string[]> {
  let targetHandle = dirHandle;
  if (path && path !== '.' && path !== '/') {
    const parts = path.split('/').filter(p => p);
    for (const part of parts) {
      targetHandle = await targetHandle.getDirectoryHandle(part);
    }
  }

  const entries: string[] = [];
  // @ts-ignore - async iterator is supported
  for await (const entry of targetHandle.values()) {
    entries.push(entry.kind === 'directory' ? `${entry.name}/` : entry.name);
  }
  return entries;
}

export async function deleteFileOrDir(dirHandle: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = path.split('/').filter(p => p);
  const targetName = parts.pop();
  if (!targetName) throw new Error("Invalid path");
  
  let currentHandle = dirHandle;
  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part);
  }
  await currentHandle.removeEntry(targetName, { recursive: true });
}

export async function searchFiles(dirHandle: FileSystemDirectoryHandle, query: string, currentPath: string = ''): Promise<string[]> {
  const results: string[] = [];
  // @ts-ignore
  for await (const entry of dirHandle.values()) {
    const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') continue;
      const subResults = await searchFiles(entry as FileSystemDirectoryHandle, query, entryPath);
      results.push(...subResults);
    } else {
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size < 1024 * 1024) { // 1MB limit to avoid memory issues
          const text = await file.text();
          if (text.includes(query)) {
            results.push(entryPath);
          }
        }
      } catch (e) {
        // Ignore read errors for individual files
      }
    }
  }
  return results;
}

export async function analyzeProject(dirHandle: FileSystemDirectoryHandle): Promise<string> {
  let tree = '';
  const routes: string[] = [];
  const businessLogic: string[] = [];
  const stateManagement: string[] = [];
  const packageJsonDeps: string[] = [];
  let isNextJs = false;
  let isReact = false;
  let isExpress = false;

  async function scan(handle: FileSystemDirectoryHandle, currentPath: string, depth: number) {
    const indent = '  '.repeat(depth);
    // @ts-ignore
    for await (const entry of handle.values()) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      
      if (entry.kind === 'directory') {
        if (['node_modules', '.git', 'dist', '.next', 'build', '.cache'].includes(entry.name)) continue;
        tree += `${indent}📁 ${entry.name}/\n`;
        
        // Identify business logic folders
        if (['services', 'utils', 'lib', 'hooks', 'controllers', 'models', 'api'].includes(entry.name.toLowerCase())) {
          businessLogic.push(entryPath);
        }
        // Identify state management folders
        if (['store', 'context', 'redux', 'state'].includes(entry.name.toLowerCase())) {
          stateManagement.push(entryPath);
        }

        await scan(entry as FileSystemDirectoryHandle, entryPath, depth + 1);
      } else {
        tree += `${indent}📄 ${entry.name}`;
        
        if (entry.name === 'package.json' && depth === 0) {
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            const text = await file.text();
            const pkg = JSON.parse(text);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['next']) isNextJs = true;
            if (deps['react']) isReact = true;
            if (deps['express']) isExpress = true;
            packageJsonDeps.push(...Object.keys(deps).filter(d => !d.startsWith('@types/')));
          } catch (e) {}
        }

        // Identify Next.js App Router routes
        if (entryPath.startsWith('app/') && (entry.name === 'page.tsx' || entry.name === 'route.ts')) {
          routes.push(`/${entryPath.replace('app/', '').replace('/page.tsx', '').replace('page.tsx', '').replace('/route.ts', '')}`);
        }
        // Identify Next.js Pages Router routes
        if (entryPath.startsWith('pages/') && !entry.name.startsWith('_')) {
          routes.push(`/${entryPath.replace('pages/', '').replace(/\.tsx?$/, '').replace(/\/index$/, '')}`);
        }

        if (entry.name.match(/\.(ts|tsx|js|jsx)$/)) {
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            if (file.size < 500 * 1024) {
              const text = await file.text();
              
              // Extract imports
              const imports = Array.from(text.matchAll(/import\s+.*?\s+from\s+['"](.*?)['"]/g)).map(m => m[1]);
              if (imports.length > 0) {
                const localImports = imports.filter(i => i.startsWith('.') || i.startsWith('@/'));
                if (localImports.length > 0) {
                  const displayImports = localImports.slice(0, 3);
                  tree += ` (imports: ${displayImports.join(', ')}${localImports.length > 3 ? ', ...' : ''})`;
                }
              }

              // Identify React Router routes
              if (text.includes('<Route ') || text.includes('createBrowserRouter')) {
                routes.push(`Defined in ${entryPath} (React Router)`);
              }
              // Identify Express routes
              if (text.includes('app.get(') || text.includes('router.get(')) {
                routes.push(`Defined in ${entryPath} (Express)`);
              }
            }
          } catch (e) {}
        }
        tree += '\n';
      }
    }
  }

  await scan(dirHandle, '', 0);

  let report = `=== PROJECT ARCHITECTURE OVERVIEW ===\n\n`;
  
  report += `[Tech Stack]\n`;
  if (isNextJs) report += `- Framework: Next.js\n`;
  else if (isReact) report += `- Framework: React SPA\n`;
  if (isExpress) report += `- Backend: Express.js\n`;
  if (packageJsonDeps.length > 0) {
    report += `- Key Dependencies: ${packageJsonDeps.slice(0, 10).join(', ')}${packageJsonDeps.length > 10 ? '...' : ''}\n`;
  }
  report += `\n`;

  report += `[Main Routes / Entry Points]\n`;
  if (routes.length > 0) {
    [...new Set(routes)].forEach(r => report += `- ${r || '/'}\n`);
  } else {
    report += `- No explicit routes detected (might be a single-view app or custom routing).\n`;
  }
  report += `\n`;

  report += `[Business Logic & State]\n`;
  if (businessLogic.length > 0) report += `- Logic Directories: ${businessLogic.join(', ')}\n`;
  if (stateManagement.length > 0) report += `- State Directories: ${stateManagement.join(', ')}\n`;
  if (businessLogic.length === 0 && stateManagement.length === 0) report += `- No standard logic/state directories found. Logic might be co-located with components.\n`;
  report += `\n`;

  report += `[File Tree & Local Imports]\n`;
  report += tree;

  return report;
}
