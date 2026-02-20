import { MongoClient } from 'mongodb';
import crypto from 'crypto';

interface EncryptedCredential {
    _id?: string;
    key: string;
    encryptedValue: string;
    iv: string;
    environment: 'development' | 'production';
    createdAt: Date;
    updatedAt: Date;
}

export class CredentialStore {
    private client: MongoClient;
    private db: any;
    private collection: any;
    
    constructor(mongoUrl: string) {
        this.client = new MongoClient(mongoUrl);
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
    
    async storeCredential(key: string, value: string, environment: string) {
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
    
    async getCredential(key: string, environment: string): Promise<string | null> {
        const doc = await this.collection.findOne({ key, environment });
        if (!doc) return null;
        
        return this.decrypt(doc.encryptedValue, doc.iv);
    }
    
    async getAllCredentials(environment: string): Promise<Record<string, string>> {
        const docs = await this.collection.find({ environment }).toArray();
        const credentials: Record<string, string> = {};
        
        for (const doc of docs) {
            try {
                credentials[doc.key] = this.decrypt(doc.encryptedValue, doc.iv);
            } catch (error: any) {
                console.warn(`⚠️ Failed to decrypt ${doc.key}:`, error.message);
            }
        }
        
        return credentials;
    }
    
    async listCredentials(environment: string): Promise<string[]> {
        const docs = await this.collection.find(
            { environment }, 
            { projection: { key: 1, updatedAt: 1 } }
        ).toArray();
        
        return docs.map((doc: EncryptedCredential) => `${doc.key} (updated: ${doc.updatedAt})`);
    }
    
    private encrypt(text: string) {
        const algorithm = 'aes-256-cbc';
        const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-change-in-production';
        const key = crypto.scryptSync(encryptionSecret, 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return { encryptedValue: encrypted, iv: iv.toString('hex') };
    }
    
    private decrypt(encryptedValue: string, ivHex: string): string {
        const algorithm = 'aes-256-cbc';
        const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-change-in-production';
        const key = crypto.scryptSync(encryptionSecret, 'salt', 32);
        const iv = Buffer.from(ivHex, 'hex');
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}
export default CredentialStore;