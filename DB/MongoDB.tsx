import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGO_URL!;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGO_URL environment variable inside .env.local');
}

declare global {
    var mong:{
        conn:typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    }
}

let cached = global.mong;

if (!cached) {
        cached = global.mong = { conn: null, promise: null };
    }

async function connectToDatabase() {
    if (cached.conn) {
        console.log("Using existing connection");
        return cached.conn;
    }   
    if (!cached.promise) {
        console.log("Creating new connection");
        const opts = {
            bufferCommands: false,
        };
        cached.promise = mongoose.connect(MONGODB_URI, opts)
    }

    try{
    cached.conn = await cached.promise;
    console.log("Connected to MongoDB");

    }catch(err){
        cached.promise = null;
        console.log("Error connecting to MongoDB:", err);
        throw err;  
    }
    return cached.conn;
}
export default connectToDatabase;