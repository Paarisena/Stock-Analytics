import { MongoClient } from 'mongodb';
import crypto from 'crypto';

export class CredentialStore {
    constructor(mongoUrl) {
        this.client = new MongoClient(mongoUrl);
        this.db = null;
        this.collection = null;
    }
    
    async connect() {
        await this.client.connect();
        this.db = this.client.db('aisearch_app');
        this.collection = this.db.collection('encrypted_credentials');
        console.log('✅ Connected to MongoDB credential store');
    }
    
    async disconnect() {
        await this.client.close();
        console.log('✅ Disconnected from MongoDB credential store');
    }
    
    async storeCredential(key, value, environment) {
        if (!value) {
            console.warn(`⚠️ Skipping empty value for ${key}`);
            return;
        }
        
        const { encryptedValue, iv } = this.encrypt(value);
        
        await this.collection.updateOne(
            { key, environment },
            {
                $set: {
                    encryptedValue,
                    iv,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );
        
        console.log(`🔐 Stored encrypted credential: ${key}`);
    }
    
    async getCredential(key, environment) {
        const doc = await this.collection.findOne({ key, environment });
        if (!doc) return null;
        
        return this.decrypt(doc.encryptedValue, doc.iv);
    }
    
    async getAllCredentials(environment) {
        const docs = await this.collection.find({ environment }).toArray();
        const credentials = {};
        
        for (const doc of docs) {
            try {
                credentials[doc.key] = this.decrypt(doc.encryptedValue, doc.iv);
            } catch (error) {
                console.warn(`⚠️ Failed to decrypt ${doc.key}:`, error.message);
            }
        }
        
        return credentials;
    }
    
    async listCredentials(environment) {
        const docs = await this.collection.find(
            { environment }, 
            { projection: { key: 1, updatedAt: 1 } }
        ).toArray();
        
        return docs.map(doc => `${doc.key} (updated: ${doc.updatedAt})`);
    }
    
    encrypt(text) {
        const algorithm = 'aes-256-cbc';
        const encryptionSecret = process.env.QUOTES || 'If-you-dont-find-a-way-to-make-money-while-you-sleep,-you-will-work-until-you-die'
        const key = crypto.scryptSync(encryptionSecret, 'salt', 32 );
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return { encryptedValue: encrypted, iv: iv.toString('hex') };
    }
    
    decrypt(encryptedValue, ivHex) {
        const algorithm = 'aes-256-cbc';
        const encryptionSecret = process.env.QUOTES || 'If-you-dont-find-a-way-to-make-money-while-you-sleep,-you-will-work-until-you-die';
        const key = crypto.scryptSync(encryptionSecret, 'salt', 32);
        const iv = Buffer.from(ivHex, 'hex');
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}

export default CredentialStore;