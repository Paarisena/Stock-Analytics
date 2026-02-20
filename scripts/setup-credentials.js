import { CredentialStore } from '../DB/CredentialStore.ts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupCredentials() {
    console.log('🚀 Starting credential setup...');
    
    // Load environment variables from .env.local
    const envPath = path.join(__dirname, '..', '.env');
    dotenv.config({ path: envPath });
    
    const mongoUrl = process.env.MONGO_URL;
    const environment = process.argv[2] || 'production'; // Allow environment override
    const Quotes = process.env.QUOTES;
    
    // Validation
    if (!mongoUrl) {
        console.error('❌ MONGO_URL not found in .env.local file');
        console.log('💡 Please add MONGO_URL to your .env.local file');
        process.exit(1);
    }
    
    if (!Quotes) {
        console.warn('⚠️ QUOTES not found, using default (not secure for production!)');
        console.log('💡 Add QUOTES=your-32-char-secret to .env.local');
    }
    
    console.log(`🔐 Setting up credentials for environment: ${environment}`);
    console.log(`📁 Loading from: ${envPath}`);
    
    const store = new CredentialStore(mongoUrl);
    await store.connect();
    
    // Define credentials to store
    const credentialsToStore = [
        'MONGO_URL',
        'GEMINI_API_KEY',
        'O_EMAIL', 
        'O_PASSWORD',
        'OPENAI_API_KEY',

    ];
    
    console.log('\n📝 Storing credentials...');
    let storedCount = 0;
    
    for (const key of credentialsToStore) {
        const value = process.env[key];
        if (value) {
            await store.storeCredential(key, value, environment);
            console.log(`✅ Stored ${key}`);
            storedCount++;
        } else {
            console.warn(`⚠️ ${key} not found in environment variables`);
        }
    }
    
    // Verification
    console.log('\n🔍 Verifying stored credentials...');
    const storedCredentials = await store.getAllCredentials(environment);
    const storedKeys = Object.keys(storedCredentials);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Attempted to store: ${credentialsToStore.length} credentials`);
    console.log(`   Successfully stored: ${storedCount} credentials`);
    console.log(`   Verified in database: ${storedKeys.length} credentials`);
    
    console.log(`\n📋 Stored credentials:`);
    storedKeys.forEach(key => {
        const value = storedCredentials[key];
        const preview = value.length > 20 ? value.substring(0, 20) + '...' : value;
        console.log(`   ${key}: ${preview}`);
    });
    
    await store.disconnect();
    console.log('\n✅ Credential setup complete!');
}

// Run if script is executed directly
if (process.argv[1] === __filename) {
    setupCredentials().catch(error => {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    });
}

export default setupCredentials;