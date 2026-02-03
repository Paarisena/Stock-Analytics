// electron/main.js - Production-ready version
import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let mainWindow;
let nextServer;
let serverStarted = false;

function startNextServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Next.js server...');
    console.log('📂 isDev:', isDev);
    console.log('📂 isPackaged:', app.isPackaged);
    
    const isWindows = process.platform === 'win32';
    const serverMode = isDev ? 'dev' : 'start';
    
    let nextPath;
    let cwd;
    
    if (app.isPackaged) {
      // ✅ FIX: Correct paths for production
      const appPath = path.join(process.resourcesPath, 'app.asar.unpacked');
      cwd = appPath;
      
      // Check if Next.js exists
      const possiblePaths = [
        path.join(appPath, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next'),
        path.join(appPath, 'node_modules', 'next', 'dist', 'bin', 'next'),
      ];
      
      nextPath = possiblePaths.find(p => {
        const exists = fs.existsSync(p);
        console.log(`   Checking: ${p} → ${exists ? '✅' : '❌'}`);
        return exists;
      });
      
      if (!nextPath) {
        console.error('❌ Next.js binary not found in production build!');
        console.error('   Searched in:', possiblePaths);
        reject(new Error('Next.js binary not found. Please rebuild the app.'));
        return;
      }
      
      console.log('✅ Using Next.js at:', nextPath);
      console.log('📂 Working directory:', cwd);
      
    } else {
      // Development mode
      cwd = path.join(__dirname, '..');
      const nextCommand = isWindows ? 'next.cmd' : 'next';
      nextPath = path.join(cwd, 'node_modules', '.bin', nextCommand);
      console.log('🔧 Dev mode - Next.js at:', nextPath);
    }
    
    // ✅ FIX: Spawn with correct environment
    nextServer = spawn(nextPath, [serverMode], {
      cwd: cwd,
      env: { 
        ...process.env,
        NODE_ENV: isDev ? 'development' : 'production',
        PORT: '3000',
        // Load .env file if exists
        ...loadEnvFile(cwd)
      },
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    nextServer.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Next.js]:', output);
      
      // Detect server ready (works for both dev and production)
      if (output.includes('Local:') || 
          output.includes('localhost:3000') || 
          output.includes('started server') ||
          output.includes('Ready in')) {
        if (!serverStarted) {
          serverStarted = true;
          console.log('✅ Server detected as ready!');
          resolve();
        }
      }
    });

    nextServer.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('[Next.js Error]:', error);
      
      // Don't fail on warnings
      if (!error.toLowerCase().includes('warning')) {
        // Still continue if server starts
      }
    });

    nextServer.on('error', (error) => {
      console.error('❌ Failed to spawn Next.js:', error);
      reject(error);
    });

    nextServer.on('exit', (code) => {
      console.log(`⚠️ Next.js exited with code ${code}`);
      if (code !== 0 && !serverStarted) {
        reject(new Error(`Next.js exited with code ${code}`));
      }
    });

    // ✅ FIX: Longer timeout for production (first start can be slow)
    const timeout = isDev ? 15000 : 30000;
    setTimeout(() => {
      if (!serverStarted) {
        console.log(`⏱️ Timeout after ${timeout}ms - checking server manually...`);
        
        // Try to ping the server
        fetch('http://localhost:3000')
          .then(() => {
            console.log('✅ Server is responding!');
            serverStarted = true;
            resolve();
          })
          .catch(() => {
            console.error('❌ Server not responding after timeout');
            reject(new Error('Server failed to start within timeout'));
          });
      }
    }, timeout);
  });
}

// ✅ NEW: Load .env file manually for production
function loadEnvFile(basePath) {
  const envVars = {};
  const envPath = path.join(basePath, '.env');
  const envLocalPath = path.join(basePath, '.env.local');
  
  [envPath, envLocalPath].forEach(filePath => {
    if (fs.existsSync(filePath)) {
      console.log('📄 Loading env file:', filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          envVars[key] = value;
        }
      });
    }
  });
  
  return envVars;
}

async function createWindow() {
  let splashWindow = null;
  
  try {
    // Show splash/loading window immediately
    splashWindow = new BrowserWindow({
      width: 400,
      height: 300,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false
      }
    });

    splashWindow.loadURL(`data:text/html;charset=utf-8,
      <html>
        <body style="margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-family:system-ui">
          <div style="text-align:center;color:white">
            <h1 style="font-size:32px;margin:0">📊</h1>
            <h2 style="font-size:20px;margin:20px 0 10px">AI Stock Analyzer</h2>
            <p style="font-size:14px;opacity:0.8">Starting server...</p>
            <div style="margin-top:20px">
              <div style="width:200px;height:3px;background:rgba(255,255,255,0.3);border-radius:3px;overflow:hidden">
                <div style="width:0%;height:100%;background:white;animation:load 2s ease-in-out infinite">
                </div>
              </div>
            </div>
            <style>
              @keyframes load {
                0% { width: 0% }
                50% { width: 100% }
                100% { width: 0% }
              }
            </style>
          </div>
        </body>
      </html>
    `);

    // Start server in background
    await startNextServer();

    console.log('✅ Server started, creating main window...');

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        devTools: isDev
      },
      icon: path.join(__dirname, '../public/icon.png')
    });

    const url = 'http://localhost:3000';
    console.log('🌐 Loading URL:', url);
    
    await mainWindow.loadURL(url);
    
    console.log('✅ URL loaded, showing window...');

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    
    mainWindow.show();
    mainWindow.focus();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

  } catch (error) {
    console.error('❌ Failed to create window:', error);
    
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    
    dialog.showErrorBox(
      'Startup Error', 
      `Failed to start the application.\n\n` +
      `Error: ${error.message}\n\n` +
      `Please check if:\n` +
      `1. Port 3000 is not in use\n` +
      `2. Your antivirus is not blocking the app\n` +
      `3. You have proper firewall permissions\n\n` +
      `If the problem persists, please reinstall the application.`
    );
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});