const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

function resolveStartTarget() {
  if (process.env.NODE_ENV === 'development') {
    return { type: 'url', value: 'http://localhost:8081' };
  }

  if (app.isPackaged) {
    return {
      type: 'file',
      value: path.join(process.resourcesPath, 'docs', 'index.html'),
    };
  }

  return {
    type: 'file',
    value: path.join(__dirname, 'docs', 'index.html'),
  };
}

function resolveWindowIcon() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'assets', 'icons', 'icon.png'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [
        path.join(__dirname, 'assets', 'icons', 'icon.png'),
        path.join(__dirname, 'icon.png'),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function createWindow() {
  console.log('Starting Oscilloscope Simulator...');

  const startTarget = resolveStartTarget();
  const iconPath = resolveWindowIcon();
  const windowOptions = {
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
    },
    show: false,
    title: '示波器仿真系统',
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
    console.log('Using window icon:', iconPath);
  } else {
    console.log('No window icon found, continuing without a custom icon.');
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (startTarget.type === 'url') {
    console.log('Loading development URL:', startTarget.value);
    mainWindow.loadURL(startTarget.value);
    mainWindow.webContents.openDevTools();
  } else {
    console.log('Loading local file:', startTarget.value);
    mainWindow.loadFile(startTarget.value);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('Application started successfully.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
