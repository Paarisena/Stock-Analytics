// scripts/install-electron.js
import { download } from '@electron/get';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import extractZip from 'extract-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function installElectron() {
  console.log('🚀 Installing Electron 40.1.0 binary...');
  
  try {
    // Download Electron
    const zipPath = await download('40.1.0', {
      mirrorOptions: {
        mirror: 'https://npmmirror.com/mirrors/electron/',
      }
    });
    
    console.log('✅ Downloaded:', zipPath);
    
    // Find electron path in node_modules
    const electronPath = path.join(__dirname, '../node_modules/electron');
    const distPath = path.join(electronPath, 'dist');
    
    // Create dist directory
    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true });
    }
    
    // Extract
    console.log('📦 Extracting to:', distPath);
    await extractZip(zipPath, { dir: distPath });
    
    // Create path.txt with just the executable name
    const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron';
    fs.writeFileSync(path.join(electronPath, 'path.txt'), exeName);
    
    console.log('✅ Electron installed successfully!');
    console.log('✅ Path file created:', exeName);
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  }
}

installElectron();