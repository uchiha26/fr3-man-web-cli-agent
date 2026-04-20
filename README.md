# Fr3 Man - Web Agent Environment

Welcome to the main repository for the **Fr3 Man** project. This root directory contains the modern, React-based web application powered by Vite, functioning as the primary browser interface for the agent.

## 🌐 Browser Version Instructions (Web App)

### Development Mode
To start the local development server (useful for editing frontend interface components):
1. Open your terminal in this root directory.
2. Install all standard web dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
The browser app will instantly be available at `http://localhost:3000`.

### Production Build & Zipping
When you are ready to prepare the frontend for production or web hosting deployment:
```bash
npm run build
```
**What this does automatically:**
- Compiles the highly-optimized React frontend files into the `dist` directory.
- Automatically archives the output into a clean, deployable **`dist.zip`** file located directly in this root folder.

---

## 💻 Desktop Standalone Architecture

This repository also contains a powerful, fully independent **Desktop Version** built with Electron. The desktop iteration is meant to be a standalone desktop automation agent that operates offline via the compiled UI.

You can control the entire Desktop build process straight from this root directory using the "all-in-one" commands we prepared:

- **Launch Desktop Mode Locally:**
  ```bash
  npm run start:desktop
  ```
  *(Auto-compiles the UI, pushes it into the Electron folder, installs desktop-specific packages, and opens the native app).*

- **Generate Windows `.exe` Installer:**
  ```bash
  npm run package:desktop
  ```
  *(Packages the entire application into a redistributable NSIS Setup file located in `desktop/release`).*

For deeper details regarding the desktop environment, please navigate to the `desktop` folder and read the [Desktop README](./desktop/README.md).
