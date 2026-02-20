// electron/main.js - FIXED for production
import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import CredentialStore from '../DB/CredentialStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

// ==========================================
// SERVER MANAGEMENT
// ==========================================

function cleanupServer() {
    if (serverProcess) {
        console.log('🛑 [Server] Cleaning up server process...');
        
        if (process.platform === 'win32') {
            try {
                spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/T', '/F']);
            } catch (error) {
                console.warn('⚠️ [Server] Failed to kill process tree:', error.message);
            }
        } else {
            serverProcess.kill('SIGTERM');
        }
        
        serverProcess = null;
    }
}

async function startNextServer(config) {
    return new Promise((resolve) => {
        const isDev = !app.isPackaged;
        
        // Create window first
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });
        
        // Open DevTools automatically
        mainWindow.webContents.openDevTools();
        
        if (isDev) {
            // Dev mode
            const appPath = path.join(__dirname, '..');
            const nextBin = path.join(appPath, 'node_modules', 'next', 'dist', 'bin', 'next');
            
            serverProcess = spawn('node', [nextBin, 'dev'], {
                cwd: appPath,
                env: { ...process.env, NODE_ENV: 'development', ...config },
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            serverProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[Next.js] ${output}`);
                
                // Debug: show what we're trying to match
                console.log(`[DEBUG] Checking output for port...`);
                
                const match = output.match(/(localhost|127\.0\.0\.1):(\d+)/);
                if (match) {
                    const port = match[2];
                    console.log(`✅ Server ready on port ${port}`);
                    console.log(`🌐 Loading URL: http://localhost:${port}`);
                    mainWindow.loadURL(`http://localhost:${port}`);
                    setTimeout(() => resolve(), 2000);
                } else {
                    console.log(`[DEBUG] No port match in: "${output}"`);
                }
            });
            
        } else {
            // Production
            const appPath = path.join(process.resourcesPath, 'app');
            const serverJs = path.join(appPath, '.next', 'standalone', 'server.js');
            
            const envVars = { 
                NODE_ENV: 'production',
                HOSTNAME: '127.0.0.1',
                PORT: '0'
            };
            
            for (const [key, value] of Object.entries(config)) {
                if (value !== undefined && value !== null) {
                    envVars[key] = String(value);
                }
            }
            
            serverProcess = spawn('node', [serverJs], {
                cwd: path.join(appPath, '.next', 'standalone'),
                env: envVars,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            serverProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[Next.js] ${output}`);
                
                const match = output.match(/localhost:(\d+)/);
                if (match) {
                    const port = match[1];
                    console.log(`✅ Server ready on port ${port}`);
                    mainWindow.loadURL(`http://localhost:${port}`);
                    setTimeout(() => resolve(), 2000);
                }
            });
        }
        
        serverProcess.stderr.on('data', (data) => {
            console.error(`[Next.js Error] ${data.toString().trim()}`);
        });
        
        setTimeout(() => {
            console.log('⏱️ Timeout - loading default port 3000');
            mainWindow.loadURL('http://localhost:3000');
            resolve();
        }, 5000);
        
        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    });
}

async function createWindow(config) {
    await startNextServer(config);
}

// ==========================================
// APP LIFECYCLE
// ==========================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
    
    app.whenReady().then(async () => {
        try {
            console.log('🚀 [App] Starting AIStockAnalyzer...');
            
            const config = await loadSecureConfig();
            await createWindow(config);
            
            console.log('✅ [App] Application started successfully');
        } catch (error) {
            console.error('❌ [App] Startup failed:', error);
            app.quit();
        }
    });
}

app.on('window-all-closed', () => {
    cleanupServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    console.log('🛑 [App] Before quit event');
    cleanupServer();
});

app.on('will-quit', () => {
    console.log('🛑 [App] Will quit event');
    cleanupServer();
});

process.on('exit', () => {
    console.log('🛑 [Process] Exit event');
    cleanupServer();
});

// ==========================================
// SECURE CONFIGURATION LOADER
// ==========================================

async function loadSecureConfig() {
    const isDev = !app.isPackaged;
    const appPath = isDev 
        ? path.join(__dirname, '..')
        : path.join(process.resourcesPath, 'app');
    
    if (isDev) {
        // Development: Load from .env files
        const envFiles = [ '.env.local'];
        let loaded = false;
        
        for (const envFile of envFiles) {
            const envPath = path.join(appPath, envFile);
            if (fs.existsSync(envPath)) {
                console.log(`🔐 [Config] Loading from ${envFile} (dev mode)`);
                dotenv.config({ path: envPath });
                loaded = true;
                break;
            }
        }
        
        if (!loaded) {
            console.warn('⚠️ [Config] No .env files found in development mode');
            return {};
        }
        
        const config = {};
        const importantVars = [
            'MONGO_URL', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'O_EMAIL', 'O_PASSWORD', 'O_URL', 'QUOTES'
        ];
        
        for (const [key, value] of Object.entries(process.env)) {
            if (importantVars.some(prefix => key.startsWith(prefix)) || 
                key.includes('API') || key.includes('SECRET') || key.includes('KEY')) {
                config[key] = value;
            }
        }
        
        console.log(`✅ [Config] Loaded ${Object.keys(config).length} environment variables`);
        return config;
    }
    
    // Production: First load .env file, then try MongoDB
    console.log('🔐 [Config] Loading production configuration...');
    
    // STEP 1: Load .env file first!
    const envPath = path.join(appPath, '.env.local');
    if (fs.existsSync(envPath)) {
        console.log(`📄 [Config] Loading .env file from: ${envPath}`);
        dotenv.config({ path: envPath });
        console.log(`✅ [Config] .env file loaded`);
    } else {
        console.error(`❌ [Config] .env file not found at: ${envPath}`);
    }
    
    // STEP 2: Check what we got from .env
    const bootstrapMongoUrl = process.env.MONGO_URL;
    const encryptionSecret = process.env.QUOTES;
    
    console.log(`🔍 [Config] MONGO_URL available: ${!!bootstrapMongoUrl}`);
    console.log(`🔍 [Config] QUOTES available: ${!!encryptionSecret}`);
    
    // STEP 3: If no MongoDB credentials, use .env values directly
    if (!bootstrapMongoUrl || !encryptionSecret) {
        console.warn('⚠️ [Config] MongoDB URL or QUOTES not available, using .env values directly');
        
        return {
            MONGO_URL: process.env.MONGO_URL,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            O_EMAIL: process.env.O_EMAIL,
            O_PASSWORD: process.env.O_PASSWORD,
            O_URL: process.env.O_URL,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            QUOTES: process.env.QUOTES,
            
            // Public Firebase config
            NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDGZLtQ3taI8VSPblFpDyKtPxV_nST1uZY',
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'stock-analytics-9ac6f.firebaseapp.com',
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'stock-analytics-9ac6f',
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'stock-analytics-9ac6f.firebasestorage.app',
            NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '278502535813',
            NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:278502535813:web:c60f533bea4b646a592fec'
        };
    }
    
    // STEP 4: Try to load from MongoDB
    console.log('🔐 [Config] Attempting to load encrypted credentials from MongoDB...');
    
    try {
        // Set ENCRYPTION_SECRET for CredentialStore to use
        process.env.ENCRYPTION_SECRET = encryptionSecret;
        
        console.log('🔗 [Config] Connecting to MongoDB...');
        const store = new CredentialStore(bootstrapMongoUrl);
        await store.connect();
        
        console.log('📥 [Config] Fetching and decrypting credentials...');
        const credentials = await store.getAllCredentials('production');
        await store.disconnect();
        
        console.log(`📊 [Config] Retrieved ${Object.keys(credentials).length} credentials from MongoDB`);
        
        if (Object.keys(credentials).length > 0) {
            console.log(`📋 [Config] Keys: ${Object.keys(credentials).join(', ')}`);
            console.log('✅ [Config] Using MongoDB credentials');
            
            return {
                ...credentials,
                
                // Public Firebase config
                NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDGZLtQ3taI8VSPblFpDyKtPxV_nST1uZY',
                NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'stock-analytics-9ac6f.firebaseapp.com',
                NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'stock-analytics-9ac6f',
                NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'stock-analytics-9ac6f.firebasestorage.app',
                NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '278502535813',
                NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:278502535813:web:c60f533bea4b646a592fec'
            };
        }
    } catch (error) {
        console.error('❌ [Config] MongoDB credential fetch failed:', error.message);
        console.warn('⚠️ [Config] Falling back to .env values');
    }
    
    // STEP 5: Fallback to .env values
    console.log('🔄 [Config] Using .env values as fallback...');
    
    return {
        MONGO_URL: process.env.MONGO_URL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        O_EMAIL: process.env.O_EMAIL,
        O_PASSWORD: process.env.O_PASSWORD,
        O_URL: process.env.O_URL,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        QUOTES: process.env.QUOTES,
        
        // Public Firebase config
        NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDGZLtQ3taI8VSPblFpDyKtPxV_nST1uZY',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'stock-analytics-9ac6f.firebaseapp.com',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'stock-analytics-9ac6f',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'stock-analytics-9ac6f.firebasestorage.app',
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '278502535813',
        NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:278502535813:web:c60f533bea4b646a592fec'
    };
}