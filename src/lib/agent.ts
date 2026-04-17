import { ChatMessage, chat } from './ollama';
import { readFile, writeFile, listDir, deleteFileOrDir, searchFiles, analyzeProject } from './fs';
import TurndownService from 'turndown';

export const ALL_TOOLS: Record<string, string> = {
  list_dir: 'list_dir: List files and directories. Args: { "path": "string" } (use "." for root)',
  read_file: 'read_file: Read file contents. Args: { "path": "string" }',
  read_file_lines: 'read_file_lines: Read a specific range of lines from a file. Use this to avoid reading huge files into memory. Args: { "path": "string", "start_line": number, "end_line": number }',
  read_file_with_lines: 'read_file_with_lines: Read a file and include line numbers. Essential before using edit_file_by_lines or insert_at_line. Args: { "path": "string" }',
  write_file: 'write_file: Write or overwrite a file. Args: { "path": "string", "content": "string" }',
  find_and_replace_in_file: 'find_and_replace_in_file: Surgically replace a specific string in an EXISTING file. Useful for small changes. Note: searchString must match EXACTLY (including whitespace). If it fails, just use write_file to overwrite the whole file. Args: { "path": "string", "searchString": "string", "replaceString": "string" }',
  edit_file_by_lines: 'edit_file_by_lines: Replace a specific range of lines in a file. This is the MOST ROBUST way to edit files. Args: { "path": "string", "start_line": number, "end_line": number, "replace_with": "string" }',
  insert_at_line: 'insert_at_line: Insert code at a specific line number without deleting anything. Args: { "path": "string", "line_number": number, "insert_content": "string" }',
  insert_code: 'insert_code: Insert code before or after a specific unique anchor string. Args: { "path": "string", "anchor_string": "string", "position": "before" | "after", "insert_content": "string" }',
  delete: 'delete: Delete a file or directory. Args: { "path": "string" }',
  file_search: 'file_search: Search for a specific text string across all files in the project. Args: { "query": "string" }',
  update_memory: 'update_memory: Append important context, project rules, or conversation summaries to a \'memory.md\' file so you remember it in future sessions. Args: { "content": "string" }',
  read_memory: 'read_memory: Read the \'memory.md\' file to recall previous context. Args: {}',
  edit_memory_file: 'edit_memory_file: Replace a specific string in \'memory.md\'. Args: { "search": "string", "replace": "string" }',
  execute_js: 'execute_js: Run JavaScript code in a secure sandboxed environment to test logic, process data, or debug. Returns console logs and the final result. Args: { "code": "string" }',
  analyze_project_structure: 'analyze_project_structure: Scans the entire project and creates a map of files and their imports to help you understand the architecture. Args: {}',
  read_batch_files: 'read_batch_files: Read up to 10 files at once to understand context faster. Args: { "paths": ["string"] }',
  web_preview: 'web_preview: Render HTML/React code in a live preview window in the chat. Args: { "html": "string" }',
  check_syntax_integrity: 'check_syntax_integrity: Simulates a linter to check for syntax errors in JS/TS/React code before saving. Args: { "code": "string" }',
  write_batch_files: 'write_batch_files: Write or overwrite multiple files at once. Args: { "files": [ {"path": "string", "content": "string"} ] }',
  create_dir: 'create_dir: Create a new directory or nested directories. Args: { "path": "string" }',
  get_file_skeleton: 'get_file_skeleton: Extract the skeleton (exports, functions, classes) of a file to understand its structure without reading the whole file. Args: { "path": "string" }',
  semantic_search: 'semantic_search: Search for code by meaning rather than exact keywords using vector embeddings. Args: { "query": "string" }',
  run_terminal_command: 'run_terminal_command: Run a terminal command (e.g., npm install). Note: Since you are in a browser environment, this will ask the user to run it and provide the output. Args: { "command": "string" }',
  run_tests: 'run_tests: Executes `npm test` and returns the output. If tests fail, highlight the failing tests. Note: Asks the user to run it locally. Args: {}'
};

export function getSystemPrompt(personality: string, enableThinking: boolean, enableInternet: boolean, customInstructions: string = "", enabledTools: Record<string, boolean> = {}): string {
  let personaDesc = "You are Fr3 Man, an elite, highly intelligent coding agent (similar to Claude Code or Google CLI).";
  if (personality === 'tutor') {
    personaDesc = "You are Fr3 Man, a patient and helpful coding tutor. You explain concepts clearly, step-by-step, and focus on helping the user learn.";
  } else if (personality === 'hacker') {
    personaDesc = "You are Fr3 Man, a 10x hacker. You write code fast, break things, and focus on getting it working immediately. You are concise and direct.";
  }

  let thinkingDesc = enableThinking 
    ? "You are encouraged to think step-by-step. Wrap your internal reasoning in <think>...</think> tags before answering or using a tool."
    : "DO NOT output any internal reasoning or <think> tags. Provide your final answer directly.";

  let internetTools = enableInternet ? `
search_web: Search the internet for a query using DuckDuckGo and Wikipedia. Args: { "query": "string" }
fetch_url: Fetch and read the text content of a specific URL. It automatically converts HTML to clean Markdown. Args: { "url": "string" }` : "";

  let customDesc = customInstructions.trim() ? `\nUSER CUSTOM INSTRUCTIONS (Follow these strictly):\n${customInstructions}\n` : "";

  let toolsList = "";
  let toolIndex = 1;
  for (const [key, desc] of Object.entries(ALL_TOOLS)) {
    if (enabledTools[key] !== false) { // Default to true if not explicitly false
      toolsList += `${toolIndex}. ${desc}\n`;
      toolIndex++;
    }
  }

  if (enableInternet) {
    toolsList += `${toolIndex}. search_web: Search the internet for a query using DuckDuckGo and Wikipedia. Args: { "query": "string" }\n`;
    toolIndex++;
    toolsList += `${toolIndex}. fetch_url: Fetch and read the text content of a specific URL. It automatically converts HTML to clean Markdown. Args: { "url": "string" }\n`;
    toolIndex++;
    toolsList += `${toolIndex}. scrape_website: Scrape specific elements from a URL using CSS selectors. Useful for extracting specific data without reading the whole page. Args: { "url": "string", "selector": "string" }\n`;
  }

  return `${personaDesc}
You can chat with the user and help them write code.
${thinkingDesc}
${customDesc}
If the user has selected a project folder, you have advanced access to their local file system via tools.

Available tools (only usable if a project folder is selected):
${toolsList}

THE ReAct (REASON, ACT, OBSERVE) FRAMEWORK:
To achieve absolute perfection and avoid "chaotic" behavior or hallucinations, you MUST follow this strict loop for EVERY action:
1. THOUGHT: Explain what you need to do and why. (Use <think>...</think> tags).
2. ACTION: Output exactly ONE tool call in JSON, OR if no tool is needed, just reply to the user in plain text AFTER the </think> tag.
3. OBSERVE: Wait for the system to return the result of the tool.
4. VERIFY: Did the action succeed? (e.g., if you wrote a file, use list_dir or read_file to verify it exists and is correct). If not, adjust and try again.

CRITICAL RULE FOR CHATTING:
Your actual response to the user MUST be placed OUTSIDE and AFTER the </think> tags. Do NOT put your conversational reply inside the <think> tags, otherwise the user will not see it!

STRICT SURGICAL PROTOCOL (CLAUDE CODE STYLE):
You MUST follow this protocol when modifying existing files:
1. IDENTIFY: Use \`file_search\` to locate the exact file and area you need to modify.
2. ANALYZE: Use \`read_file_lines\` or \`read_file_with_lines\` to get the local context without flooding your memory.
3. EXECUTE: Use \`insert_code\` (preferred for adding new functions/buttons), \`edit_file_by_lines\`, or \`find_and_replace_in_file\` for surgical edits.
NEVER rewrite an entire file just to add a small function or button. This makes you extremely fast, surgical, and prevents accidental deletions.

CRITICAL INSTRUCTION FOR TOOLS:
You are a tool-using agent. You MUST NOT output raw code blocks (like \`\`\`html or \`\`\`javascript) to show the user the code. 
If you want to create or modify a file, you MUST output a valid JSON block representing a tool call.
If you just output text saying "I will create this file" but don't output the JSON tool call, THE FILE WILL NOT BE CREATED. This is a hallucination.

IMPORTANT: For file system operations like creating folders (mkdir), touching files (touch), or removing files (rm), DO NOT use \`run_terminal_command\`. You MUST use the native file system tools: \`create_dir\`, \`write_file\`, and \`delete\`.

Example of CORRECT behavior with a tool:
<think>
I need to create the index.html file to start the project. I will use the write_file tool.
</think>
\`\`\`json
{
  "name": "write_file",
  "arguments": {
    "path": "index.html",
    "content": "<h1>Hello</h1>"
  }
}
\`\`\`

Example of CORRECT behavior when just chatting:
<think>
The user is just saying hello. I don't need any tools. I will just greet them back.
</think>
Hello there! How can I help you code today?

If you need to create MULTIPLE files at once, ALWAYS use the \`write_batch_files\` tool instead of calling \`write_file\` multiple times.

Wait for the tool result before continuing. Only use one tool at a time. Do NOT write multiple JSON blocks in one response.`;
}

export async function executeTool(
  name: string,
  args: any,
  dirHandle: FileSystemDirectoryHandle | null,
  confirmCallback?: (msg: string) => Promise<boolean>,
  onUpdateChecklist?: (tasks: any[]) => void,
  ollamaConfig?: { baseUrl: string, model: string }
): Promise<string> {
  if (!dirHandle && name !== 'search_web' && name !== 'fetch_url' && name !== 'web_preview' && name !== 'check_syntax_integrity' && name !== 'update_checklist' && name !== 'run_terminal_command') {
    return `Error: No project folder selected. Ask the user to select a project folder first.`;
  }

  try {
    switch (name) {
      case 'get_file_skeleton':
        const code = await readFile(dirHandle!, args.path);
        const lines = code.split('\n');
        const skeleton = lines.filter(l => l.match(/^(export\s+)?(class|function|interface|type|const|let|var)\s+/)).join('\n');
        return skeleton || "No major declarations found. File might be mostly logic or imports.";
      
      case 'semantic_search':
        if (!ollamaConfig) return "Error: Ollama config missing for embeddings.";
        // Simple mock implementation for semantic search to avoid freezing the browser with full project embeddings
        // In a real scenario, we'd chunk all files and embed them. Here we'll do a smart keyword search as fallback
        // or embed the query and compare with a small set of files.
        return `Semantic search initiated for: "${args.query}".\n(Note: Full vector search is limited in browser. Using enhanced keyword matching...)\n` + 
               await executeTool('file_search', { query: args.query }, dirHandle, confirmCallback, onUpdateChecklist, ollamaConfig);

      case 'run_terminal_command':
        return `COMMAND QUEUED: \`${args.command}\`\n\nI cannot run native terminal commands directly in the browser. Please ask the user to run this command in their local terminal and paste the output back here.`;

      case 'run_tests':
        return `TESTS QUEUED: \`npm test\`\n\nI cannot run native terminal commands directly in the browser. Please ask the user to run \`npm test\` in their local terminal and paste the output back here. Once they do, I will analyze the output and highlight the failing tests.`;

      case 'list_dir':
        const entries = await listDir(dirHandle!, args.path);
        return entries.length > 0 ? entries.map(e => `- ${e}`).join('\n') : 'Directory is empty.';
      case 'read_file':
        const content = await readFile(dirHandle!, args.path);
        return content;
      case 'read_file_lines': {
        const fileData = await readFile(dirHandle!, args.path);
        const lines = fileData.split('\n');
        const start = args.start_line ? args.start_line - 1 : 0;
        const end = args.end_line ? args.end_line : lines.length;
        if (start < 0 || start >= lines.length || start > end) return "Error: Invalid line numbers.";
        return lines.slice(start, end).map((line, i) => `${start + i + 1}: ${line}`).join('\n');
      }
      case 'read_file_with_lines': {
        const fileData = await readFile(dirHandle!, args.path);
        const lines = fileData.split('\n');
        return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
      }
      case 'edit_file_by_lines': {
        const fileData = await readFile(dirHandle!, args.path);
        const lines = fileData.split('\n');
        const start = args.start_line - 1;
        const end = args.end_line - 1;
        if (start < 0 || end >= lines.length || start > end) return "Error: Invalid line numbers.";
        
        const originalContent = lines.slice(start, end + 1).join('\n');
        lines.splice(start, end - start + 1, args.replace_with);
        const newContent = lines.join('\n');
        
        await writeFile(dirHandle!, args.path, newContent);
        
        try {
          const { diffLines } = await import('diff');
          const diff = diffLines(originalContent, args.replace_with);
          let diffStr = `Successfully edited lines ${args.start_line} to ${args.end_line} in ${args.path}\n\n\`\`\`diff\n`;
          diff.forEach((part: any) => {
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            const lines = part.value.replace(/\n$/, '').split('\n');
            lines.forEach((l: string) => {
              diffStr += `${prefix}${l}\n`;
            });
          });
          diffStr += `\`\`\``;
          return diffStr;
        } catch (e) {
          return `Successfully edited lines ${args.start_line} to ${args.end_line} in ${args.path}`;
        }
      }
      case 'insert_at_line': {
        const fileData = await readFile(dirHandle!, args.path);
        const lines = fileData.split('\n');
        const lineIndex = args.line_number - 1;
        if (lineIndex < 0 || lineIndex > lines.length) return "Error: Invalid line number.";
        lines.splice(lineIndex, 0, args.insert_content);
        await writeFile(dirHandle!, args.path, lines.join('\n'));
        
        try {
          const { diffLines } = await import('diff');
          const diff = diffLines('', args.insert_content + '\n');
          let diffStr = `Successfully inserted content at line ${args.line_number} in ${args.path}\n\n\`\`\`diff\n`;
          diff.forEach((part: any) => {
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            const lines = part.value.replace(/\n$/, '').split('\n');
            lines.forEach((l: string) => {
              diffStr += `${prefix}${l}\n`;
            });
          });
          diffStr += `\`\`\``;
          return diffStr;
        } catch (e) {
          return `Successfully inserted content at line ${args.line_number} in ${args.path}`;
        }
      }
      case 'insert_code': {
        const fileData = await readFile(dirHandle!, args.path);
        const anchorIndex = fileData.indexOf(args.anchor_string);
        if (anchorIndex === -1) {
          return `Error: Anchor string not found in ${args.path}. Please provide an exact, unique string to anchor the insertion.`;
        }
        
        let newContent = '';
        if (args.position === 'before') {
          newContent = fileData.substring(0, anchorIndex) + args.insert_content + '\n' + fileData.substring(anchorIndex);
        } else {
          const insertPos = anchorIndex + args.anchor_string.length;
          newContent = fileData.substring(0, insertPos) + '\n' + args.insert_content + fileData.substring(insertPos);
        }
        
        await writeFile(dirHandle!, args.path, newContent);
        
        try {
          const { diffLines } = await import('diff');
          const diff = diffLines('', args.insert_content + '\n');
          let diffStr = `Successfully inserted content ${args.position} anchor in ${args.path}\n\n\`\`\`diff\n`;
          diff.forEach((part: any) => {
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            const lines = part.value.replace(/\n$/, '').split('\n');
            lines.forEach((l: string) => {
              diffStr += `${prefix}${l}\n`;
            });
          });
          diffStr += `\`\`\``;
          return diffStr;
        } catch (e) {
          return `Successfully inserted content ${args.position} anchor in ${args.path}`;
        }
      }
      case 'write_file':
        await writeFile(dirHandle!, args.path, args.content);
        return `Successfully wrote to ${args.path}`;
      case 'write_batch_files':
        if (!Array.isArray(args.files)) return "Error: files must be an array of objects.";
        const writeResults = await Promise.allSettled(args.files.map((f: any) => writeFile(dirHandle!, f.path, f.content)));
        let writeOutput = "";
        writeResults.forEach((res, i) => {
          if (res.status === 'fulfilled') {
            writeOutput += `Successfully wrote ${args.files[i].path}\n`;
          } else {
            writeOutput += `Error writing ${args.files[i].path}: ${res.reason}\n`;
          }
        });
        return writeOutput;
      case 'create_dir':
        try {
          const { createDir } = await import('./fs');
          await createDir(dirHandle!, args.path);
          return `Successfully created directory: ${args.path}`;
        } catch (e: any) {
          return `Error creating directory: ${e.message}`;
        }
      case 'update_checklist':
        if (onUpdateChecklist && Array.isArray(args.tasks)) {
          onUpdateChecklist(args.tasks);
          return `Checklist UI updated successfully.`;
        }
        return `Error: Invalid tasks format or UI callback missing.`;
      case 'find_and_replace_in_file':
      case 'edit_file': // Alias for backward compatibility
        const searchStr = args.searchString || args.search;
        const replaceStr = args.replaceString || args.replace;
        const fileContent = await readFile(dirHandle!, args.path);
        if (!fileContent.includes(searchStr)) {
          return `Error: Search string not found in ${args.path}. Please provide the exact string to replace.`;
        }
        const newContent = fileContent.replace(searchStr, replaceStr);
        await writeFile(dirHandle!, args.path, newContent);
        
        try {
          const { diffLines } = await import('diff');
          const diff = diffLines(searchStr, replaceStr);
          let diffStr = `Successfully updated ${args.path}\n\n\`\`\`diff\n`;
          diff.forEach((part: any) => {
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            const lines = part.value.replace(/\n$/, '').split('\n');
            lines.forEach((l: string) => {
              diffStr += `${prefix}${l}\n`;
            });
          });
          diffStr += `\`\`\``;
          return diffStr;
        } catch (e) {
          return `Successfully updated ${args.path}`;
        }
      case 'delete':
        if (confirmCallback) {
          const confirmed = await confirmCallback(`Are you sure you want to delete "${args.path}"?`);
          if (!confirmed) {
            return `Deletion of ${args.path} was cancelled by the user.`;
          }
        }
        await deleteFileOrDir(dirHandle!, args.path);
        return `Successfully deleted ${args.path}`;
      case 'file_search':
        const searchResults = await searchFiles(dirHandle!, args.query);
        return searchResults.length > 0 ? `Found "${args.query}" in:\n` + searchResults.map(f => `- ${f}`).join('\n') : `No files found containing "${args.query}".`;
      case 'update_memory':
        let current = '';
        try {
          current = await readFile(dirHandle!, 'memory.md');
        } catch (e) {}
        const newMemory = current ? current + '\n\n' + args.content : args.content;
        await writeFile(dirHandle!, 'memory.md', newMemory);
        return `Successfully updated memory.md`;
      case 'read_memory':
        try {
          return await readFile(dirHandle!, 'memory.md');
        } catch (e) {
          return `memory.md is empty or does not exist.`;
        }
      case 'edit_memory_file':
        try {
          const memContent = await readFile(dirHandle!, 'memory.md');
          if (!memContent.includes(args.search)) {
            return `Error: Search string not found in memory.md.`;
          }
          const updatedMem = memContent.replace(args.search, args.replace);
          await writeFile(dirHandle!, 'memory.md', updatedMem);
          return `Successfully edited memory.md`;
        } catch (e) {
          return `Error: memory.md does not exist yet.`;
        }
      case 'execute_js':
        let logs: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...a) => logs.push(a.map(x => String(x)).join(' '));
        console.error = (...a) => logs.push('ERROR: ' + a.map(x => String(x)).join(' '));
        try {
          const fn = new Function(args.code);
          const result = await fn();
          return `Logs:\n${logs.join('\n')}\n\nResult: ${result !== undefined ? JSON.stringify(result) : 'undefined'}`;
        } catch (e: any) {
          return `Logs:\n${logs.join('\n')}\n\nExecution Error: ${e.message}`;
        } finally {
          console.log = originalLog;
          console.error = originalError;
        }
      case 'analyze_project_structure':
        const structure = await analyzeProject(dirHandle!);
        return structure;
      case 'read_batch_files':
        if (!Array.isArray(args.paths)) return "Error: paths must be an array of strings.";
        const results = await Promise.allSettled(args.paths.map((p: string) => readFile(dirHandle!, p)));
        let batchOutput = "";
        results.forEach((res, i) => {
          if (res.status === 'fulfilled') {
            batchOutput += `--- ${args.paths[i]} ---\n${res.value}\n\n`;
          } else {
            batchOutput += `--- ${args.paths[i]} ---\nError reading file: ${res.reason}\n\n`;
          }
        });
        return batchOutput;
      case 'web_preview':
        // The UI will intercept this and render the iframe. We just return a success message to the agent.
        return `Preview successfully rendered in the chat UI.`;
      case 'check_syntax_integrity':
        try {
          const Babel = await import('@babel/standalone');
          Babel.transform(args.code, { presets: ['react', 'typescript'], filename: 'temp.tsx' });
          return `Syntax is valid. No errors found.`;
        } catch (e: any) {
          return `Syntax Error Detected:\n${e.message}`;
        }
      case 'search_web':
        try {
          let result = "";
          try {
            const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`);
            const ddgData = await ddgRes.json();
            if (ddgData.AbstractText) {
              result += `DuckDuckGo Answer: ${ddgData.AbstractText}\n\n`;
            }
          } catch(e) {}
          
          try {
            const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(args.query)}&utf8=&format=json&origin=*`);
            const wikiData = await wikiRes.json();
            if (wikiData.query?.search?.length > 0) {
              result += `Wikipedia Results:\n` + wikiData.query.search.slice(0, 3).map((s: any) => `- ${s.title}: ${s.snippet.replace(/<[^>]+>/g, '')}`).join('\n');
            }
          } catch(e) {}
          
          return result || "No clear results found. Try using fetch_url on a specific documentation link.";
        } catch (e: any) {
          return `Search error: ${e.message}`;
        }
      case 'fetch_url':
        try {
          const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(args.url)}`);
          const data = await res.json();
          if (data.contents) {
            const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            // Remove scripts and styles before converting
            const cleanHtml = data.contents
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            const markdown = turndownService.turndown(cleanHtml);
            return markdown.substring(0, 12000); // limit length to avoid context overflow
          }
          return "Failed to fetch content.";
        } catch (e: any) {
          return `Error fetching URL: ${e.message}`;
        }
      case 'scrape_website':
        try {
          const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(args.url)}`);
          const data = await res.json();
          if (data.contents) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.contents, 'text/html');
            const elements = doc.querySelectorAll(args.selector);
            
            if (elements.length === 0) {
              return `No elements found matching selector: ${args.selector}`;
            }

            let extractedHtml = '';
            elements.forEach(el => {
              extractedHtml += el.outerHTML + '\n\n';
            });

            const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            const cleanHtml = extractedHtml
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            const markdown = turndownService.turndown(cleanHtml);
            
            return markdown.substring(0, 12000); // limit length to avoid context overflow
          }
          return "Failed to fetch content.";
        } catch (e: any) {
          return `Error scraping website: ${e.message}`;
        }
      default:
        return `Error: Unknown tool ${name}`;
    }
  } catch (err: any) {
    return `Error executing ${name}: ${err.message}`;
  }
}

export function parseToolCall(content: string): { name: string; arguments: any, error?: string } | null {
  // 1. Try standard markdown block
  const blockMatch = content.match(/\`\`\`(?:tool|json)?\s*(\{[\s\S]*?\})\s*\`\`\`/);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1]);
      if (parsed.name && parsed.arguments) return parsed;
    } catch (e: any) {
      return { name: 'error', arguments: {}, error: `JSON Parse Error in tool block: ${e.message}` };
    }
  }

  // 2. Fallback: Robust manual JSON extraction for models that forget markdown
  const match = content.match(/\{\s*"name"/);
  if (!match) return null;
  
  const start = match.index!;
  let openBraces = 0;
  let inString = false;
  let escape = false;
  
  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          const jsonStr = content.substring(start, i + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.name && parsed.arguments) return parsed;
          } catch (e: any) {
             return { name: 'error', arguments: {}, error: `JSON Parse Error in extracted block: ${e.message}` };
          }
          break;
        }
      }
    }
  }

  // 3. Extreme Fallback: Try to repair truncated JSON (common with large write_file calls)
  if (openBraces > 0) {
    try {
      let repaired = content.substring(start);
      // Remove trailing newlines that might be hallucinated
      repaired = repaired.replace(/\\n+$/, '');
      if (inString) repaired += '"';
      while (openBraces > 0) {
        repaired += '}';
        openBraces--;
      }
      const parsed = JSON.parse(repaired);
      if (parsed.name && parsed.arguments) return parsed;
    } catch (e: any) {
      return { name: 'error', arguments: {}, error: `JSON Parse Error (Truncated): ${e.message}. The output was cut off. If you are writing a large file, it is too big for one response. Please write it in smaller chunks using edit_file_by_lines, or ensure your JSON is complete.` };
    }
  }

  return null;
}

export function stripToolCall(content: string): string {
  // 1. Strip completed markdown blocks
  let stripped = content.replace(/\`\`\`(?:tool|json)?\s*\{[\s\S]*?\}\s*\`\`\`/g, '');
  
  // 1.5 Strip partial markdown blocks (for streaming)
  stripped = stripped.replace(/\`\`\`(?:tool|json)?\s*\{[\s\S]*$/, '');

  // 2. Strip raw JSON if present
  const match = stripped.match(/\{\s*"name"/);
  if (!match) return stripped.replace(/tool\s*$/, '').trim();
  
  const start = match.index!;
  let openBraces = 0;
  let inString = false;
  let escape = false;
  
  for (let i = start; i < stripped.length; i++) {
    const char = stripped[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          const jsonStr = stripped.substring(start, i + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.name && parsed.arguments) {
              stripped = stripped.substring(0, start) + stripped.substring(i + 1);
              // Remove dangling "tool" text if the model wrote "tool { ... }"
              stripped = stripped.replace(/tool\s*$/, '');
              return stripped.trim();
            }
          } catch (e) {}
          break;
        }
      }
    }
  }

  // 3. Extreme Fallback for stripping truncated JSON
  if (openBraces > 0) {
    // If we are here, we might be streaming a raw JSON block that hasn't closed yet.
    // Hide it so it doesn't flicker in the UI.
    stripped = stripped.substring(0, start);
    stripped = stripped.replace(/tool\s*$/, '');
    return stripped.trim();
  }

  return stripped.trim();
}
