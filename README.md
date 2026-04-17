# Fr3 Man Web CLI Agent

Welcome to the **Fr3 Man Web CLI Agent**, a highly intelligent, browser-based coding assistant and terminal companion. The agent is designed to interact directly with your local file system, modify code natively, debug issues, and streamline your software development workflow. 

It provides an intuitive ChatGPT-like terminal interface stacked with robust file-system operations, mimicking an elite 10x coding agent experience.

![Fr3 Man UI](https://i.ibb.co/Q7KBqw0n/image-2026-04-17-164827801.png)

## ⚠️ Browser Compatibility

**CRITICAL:** This application heavily relies on the native `File System Access API` to directly read and write files on your local machine without a backend server. 

Because of this, **Fr3 Man officially only supports chromium-based browsers**:
- ✅ **Google Chrome** 
- ✅ **Microsoft Edge** 
- ❌ Safari (Not Supported)
- ❌ Mozilla Firefox (Not Supported)

## 🚀 Features

- **Direct File System Access:** Browser-native code editing locally securely.
- **Model Agnostic & Local AI:** Out-of-the-box integration with [Ollama](https://ollama.com/) or Cloud providers (OpenAI, Anthropic, Gemini).
- **Multi-Phase Pipeline:**
  - *Prompt Architect:* Enhances instructions transparently.
  - *Senior Reviewer:* Automatically reviews the agent's code.
  - *Mission Checklist:* Generates and manages complex tasks.
- **Sandboxed Execution:** Runs JavaScript natively in browser.
- **Project File Explorer:** Interactive and auto-refreshing project navigation.

## 🛠 Available Tools & Capabilities

The agent operates securely on your folder through these internal tools:

1. **`list_dir`**: Traverse project folders and file trees.
2. **`read_file` / `read_file_lines`**: Read and inspect local code files.
3. **`write_file` / `write_batch_files`**: Save completely new source code.
4. **`edit_file_by_lines` / `find_and_replace_in_file` / `insert_at_line`**: Surgically modify parts of files.
5. **`create_dir` / `delete`**: Standard file/folder handling.
6. **`file_search` / `semantic_search`**: Search via exact terms or generate vector embeddings for navigation.
7. **`update_memory` / `read_memory`**: Maintains persistent knowledge inside a `.agent-memory.json` file.
8. **`execute_js`**: Runs arbitrary JS for sandboxed debugging.
9. **`analyze_project_structure`**: Instantly maps imports and code architecture automatically.
10. **`check_syntax_integrity`**: Hooks into Babel to verify code syntax.

## 💻 How to Run (Windows)

The repository provides a smart `run.bat` payload for Windows environments. It dynamically finds resources, avoids port conflicts, and launches you automatically.

1. **Extract the ZIP file** to a dedicated folder.
2. Double-click the **`run.bat`** file.
3. The script will automatically:
   - Check and run `npm install` (only on its first execution).
   - **[NEW]** Scan your system to locate an **available, unused network port**.
   - Output a notice that only **Chrome** and **Edge** are supported natively.
   - Boot up your default web browser on that specific safe port (e.g., `http://localhost:8542`).
   - Run the development server cleanly without conflicts.

*For Linux/Mac:*
```bash
npm install
npm run dev
# Then open Chrome or Edge and navigate to the localhost URL shown in terminal.
```

## ⚙️ Configuration & Setup

Once the app is running in your supported browser:
1. Click **Select Project** to choose the local folder the agent will inhabit. 
2. Accept the Chrome/Edge permission prompt to "View" and "Save" files.
3. Use the **Settings Icon (⚙️)** in the top right to configure your connection:
   - Set up your **Ollama API URL** (default is `http://localhost:11434`). *Make sure Ollama is run with `OLLAMA_ORIGINS="*"` so the browser can connect to it.*
   - Input your Cloud APIs (OpenAI, Anthropic, Google Gemini) if you prefer cloud intelligence over local execution.
   - Adjust the **Agent Persona** and toggle pipelines (Reviewer, Architect).

Happy Coding!
