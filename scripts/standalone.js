import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

console.log('📦 Preparing standalone build...');

// Copy static folder
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(root, '.next', 'standalone', '.next', 'static');

if (fs.existsSync(staticSrc)) {
    fs.copySync(staticSrc, staticDest);
    console.log('✅ Copied .next/static');
} else {
    console.error('❌ .next/static not found!');
}

// Copy public folder
const publicSrc = path.join(root, 'public');
const publicDest = path.join(root, '.next', 'standalone', 'public');

if (fs.existsSync(publicSrc)) {
    fs.copySync(publicSrc, publicDest);
    console.log('✅ Copied public folder');
}

console.log('✅ Standalone ready!');