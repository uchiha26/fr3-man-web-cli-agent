# Fr3 Man - Desktop Standalone Environment

This is the localized Desktop version of the Fr3 Man framework, expertly packaged via **Electron.js**.

This is a **STANDALONE** product completely independent from the web browser or the Vite development server. It uses the compiled offline frontend files (`dist`) to run natively on your machine OS. This specific architecture establishes a robust foundation for future Computer Use integrations (like native RPA, Puppeteer scripts, and OS-level system triggers).

---

## ✨ Latest Core Enhancements

- **Native Cloud and Local LLM Auto-Heal:** Feature fallback methodologies dynamically drop restricted context limits to "0" (server default) on 500 errors to ensure uninterrupted remote processing.
- **Stop Generation Control:** Integrated internal AbortControllers to enable immediate action halting.
- **Remote Security Validation:** Full support for custom API Keys / Bearer Tokens meant explicitly for remote cloud Ollama endpoints.

---

## ⚡ Quick Start: All-In-One Native Command

To leap directly into testing the native windows architecture straight from your OS terminal, simply paste the following string:

```bash
git clone https://github.com/uchiha26/fr3-man-web-cli-agent.git && cd fr3-man-web-cli-agent && npm run start:desktop
```

**What this command sequence does automatically:**
1. Clones the remote base repository automatically.
2. Triggers the Vite production build of the React app inside the main root folder.
3. Copies the freshly compiled UI offline files inside `desktop/dist`.
4. Installs the required Electron desktop-layer dependencies.
5. Launches the native standalone GUI window directly onto your local machine.

---

## 🚀 Mission 2: How to Export an Installable `.exe` File

To generate a Windows Setup executable (NSIS format) that you can freely distribute, share with friends, or publish online, open a terminal in the **MAIN ROOT FOLDER** of the project and run:

```bash
npm run package:desktop
```

**What this command does automatically:**
1. Fully compiles and guarantees the offline `dist` UI presence.
2. Downloads the Electron builder modules.
3. Automatically triggers `electron-builder` to package your app into a redistributable setup format.

Once the automated packing finishes, look inside the **`/desktop/release/`** folder. You will find your final, installable `.exe` or `.dmg` setup file completely ready for deployment!
