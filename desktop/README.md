# Fr3 Man - Desktop Standalone Environment

This is the localized Desktop version of the Fr3 Man framework, expertly packaged via **Electron.js**.

This is a **STANDALONE** product completely independent from the web browser or the Vite development server. It uses the compiled offline frontend files (`dist`) to run natively on your machine OS. This specific architecture establishes a robust foundation for future Computer Use integrations (like native RPA, Puppeteer scripts, and OS-level system triggers).

---

## 🛠️ How to Run the Desktop App (Development)

You no longer need to worry about manually transferring build files. From the **MAIN ROOT FOLDER** of your entire project (one directory above this one), simply run our all-in-one command:

```bash
npm run start:desktop
```

**What this command does automatically:**
1. Triggers the Vite production build of the React app.
2. Copies the freshly compiled UI offline files straight into `desktop/dist`.
3. Installs the required Electron dependencies (if skipped).
4. Launches the native standalone Electron window on your computer screen.

*(If you ever find yourself manually inside this `desktop` folder with a terminal and the `dist` folder is already populated, you can simply run `npm install` followed by `npm start`.)*

---

## 🚀 Misiunea 2 / Mission 2: How to Export an Installable `.exe` File

To generate a Windows Setup executable (NSIS format) that you can freely distribute, share with friends, or publish online, open a terminal in the **MAIN ROOT FOLDER** of the project and run:

```bash
npm run package:desktop
```

**What this command does automatically:**
1. Fully compiles and guarantees the offline `dist` UI presence.
2. Downloads the Electron builder modules.
3. Automatically triggers `electron-builder` to package your app into a redistributable setup format.

Once the automated packing finishes, look inside the **`/desktop/release/`** folder. You will find your final, installable `.exe` setup file completely ready for deployment!
