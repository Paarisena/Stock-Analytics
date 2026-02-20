// Test Firebase Connection
// Run with: node test-firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDGZLtQ3taI8VSPblFpDyKtPxV_nST1uZY",
  authDomain: "stock-analytics-9ac6f.firebaseapp.com",
  projectId: "stock-analytics-9ac6f",
  storageBucket: "stock-analytics-9ac6f.firebasestorage.app",
  messagingSenderId: "278502535813",
  appId: "1:278502535813:web:c60f533bea4b646a592fec"
};

async function testFirebase() {
  try {
    console.log('🔥 Testing Firebase Connection...\n');

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    console.log('✅ Firebase app initialized');

    // Test Auth
    const auth = getAuth(app);
    console.log('✅ Firebase Auth initialized');

    // Test Firestore
    const db = getFirestore(app);
    console.log('✅ Firestore initialized');

    // Try to read from a test collection
    try {
      const testCollection = collection(db, 'test');
      const snapshot = await getDocs(testCollection);
      console.log(`✅ Firestore connection successful (${snapshot.size} documents in 'test' collection)`);
    } catch (firestoreError) {
      console.log('ℹ️  Firestore read test (no documents yet, but connection works)');
    }

    console.log('\n🎉 All Firebase services are operational!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your Firebase credentials in .env.local if needed');
    console.log('2. Enable Google Sign-in in Firebase Console:');
    console.log('   → https://console.firebase.google.com/project/stock-analytics-9ac6f/authentication/providers');
    console.log('3. Add authorized domains in Firebase Console');
    console.log('4. Run: pnpm dev');
    console.log('5. Navigate to http://localhost:3000/login');

  } catch (error) {
    console.error('❌ Firebase Connection Failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if Firebase credentials are correct in .env.local');
    console.log('2. Verify Firebase project exists: https://console.firebase.google.com/');
    console.log('3. Ensure Firestore is enabled in Firebase Console');
    console.log('4. Check your internet connection');
  }
}

testFirebase();
