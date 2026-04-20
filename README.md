# Fr3 Man - Web CLI Environment

Welcome to the main repository for the **Fr3 Man** project. This root directory contains the modern, React-based web application powered by Vite, functioning as the primary browser interface for the agent.

## ✨ Latest Features & Improvements

- **Cloud & Local Auto-Fallback (Auto-Heal):** Dynamically adjusts memory (`num_ctx`). If an Ollama Cloud model or out-of-memory local model throws a `500 Internal Server Error`, the agent catches it instantly and auto-recovers by sending standard cloud-allowed payload context parameters.
- **Enhanced Working Memory (32k+):** `num_ctx` settings are easily accessible via the UI parameters. Configured to handle massive context windows for local hardware while keeping logic intact.
- **Remote Model Authorization:** Added specific support for Ollama Auth Tokens (`Authorization: Bearer <token>`) making it easy and secure to connect to remote or cloud Ollama instances.
- **Instant 'Stop Generation' Capability:** Just like standard LLM chat interfaces, you can click the visual stop button to immediately cancel active streaming via an internal `AbortController` without needing to wait for a long response to finish. 
- **Unblocked Interaction Flow:** Text inputs remain interactive even during background thought processes, allowing you to scroll, edit, and keep working smoothly while the agent streams data.
- **The Board of Agents System:** Featuring a Prompt Architect, Senior Reviewer, Security Auditor, Tool Verifier, and Auto-Git Committer running asynchronously under the hood.

---

## ⚡ Quick Start: All-In-One Commands

Get up and running in literal seconds directly from your terminal. Open your command line and paste one of the following commands depending on the environment you prefer:

### 1. Launch the Browser Web CLI
*Automatically clones, installs dependencies, and boots the local web interface instance on port 3000.*
```bash
git clone https://github.com/uchiha26/fr3-man-web-cli-agent.git && cd fr3-man-web-cli-agent && npm install && npm run dev
```

### 2. Launch the Standalone Desktop Application
*Clones, compiles production frontend files, installs electron packages, and snaps open the native Windows/Mac container.*
```bash
git clone https://github.com/uchiha26/fr3-man-web-cli-agent.git && cd fr3-man-web-cli-agent && npm run start:desktop
```

---

## 🌐 Alternative Start (Browser Version Instructions)

### Windows Quick Run:
The absolute easiest way to start the browser version on Windows is to download the repo and double-click the **`run.bat`** file located in this root directory. It will automatically handle NPM installations and launch the server for you.

### Build & Deploy Production
When you are ready to prepare the frontend for hosting:
```bash
npm run build
```
**What this does automatically:**
- Compiles the highly-optimized React frontend files.
- Automatically archives the output into a clean, deployable **`dist.zip`** file located directly in this root folder.

---

## 💻 Desktop Standalone Architecture

This repository also contains a powerful, fully independent **Desktop Version** built with Electron. The desktop iteration operates safely offline via the compiled CLI UI.

- **Generate Windows `.exe` Installer:**
  ```bash
  npm run package:desktop
  ```
  *(Packages the entire application into a redistributable Setup file located in `desktop/release`).*

For deeper configuration details regarding the standalone structure, navigate to the `desktop` folder and read the [Desktop README](./desktop/README.md).
