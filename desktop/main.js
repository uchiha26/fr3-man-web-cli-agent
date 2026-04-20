const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // Grant all required permissions automatically (File System Access API)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });

  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.8),
    height: Math.floor(height * 0.8),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'Fr3 Man - Desktop Agent'
  });

  // Încărcare din fișierul compilat local (Independent de dev server-ul web)
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(() => {
    // Fallback dacă fișierul nu a fost găsit sau nu a fost dat build corect
    mainWindow.loadFile(path.join(__dirname, 'fallback.html'));
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Aici vom configura viitoarele acțiuni de tip RPA (Robotic Process Automation) 
// prin integrare cu Puppeteer sau native key injections.
ipcMain.on('agent:executeAutomatedTask', async (event, actionParams) => {
  console.log('[Fr3 Man Desktop] Intercepted Action Request:', actionParams);
  // Exemplu viitor: await runSocialMediaBot(actionParams.platform, actionParams.credentials);
});
