// app/utils/remoteConfig.ts
import { getRemoteConfig, fetchAndActivate, getValue, RemoteConfig } from 'firebase/remote-config';
import { app } from '@/lib/firebase'; // Import your Firebase app

let remoteConfig: RemoteConfig | null = null;

/**
 * Initialize Firebase Remote Config
 */
export async function initializeRemoteConfig() {
  if (typeof window === 'undefined') {
    // Server-side: don't initialize
    return null;
  }

  try {
    remoteConfig = getRemoteConfig(app);
    
    // Configure Remote Config settings
    remoteConfig.settings = {
      minimumFetchIntervalMillis: 3600000, // 1 hour
      fetchTimeoutMillis: 60000, // 60 seconds
    };
    
    // Set default values (fallback if fetch fails)
    remoteConfig.defaultConfig = {
      'GEMINI_API_KEY': '',
      'OPENAI_API_KEY': '',
      'GROQ_API_KEY': '',
      'MONGO_URL': '',
      'O_EMAIL': '',
      'O_PASSWORD': '',
    };
    
    // Fetch and activate the config
    await fetchAndActivate(remoteConfig);
    console.log('✅ [Remote Config] Initialized and activated');
    
    return remoteConfig;
  } catch (error) {
    console.error('❌ [Remote Config] Failed to initialize:', error);
    return null;
  }
}

/**
 * Get a config value
 */
export function getRemoteConfigValue(key: string): string {
  if (!remoteConfig) {
    console.warn(`⚠️ [Remote Config] Not initialized, cannot get ${key}`);
    return '';
  }
  
  try {
    const value = getValue(remoteConfig, key);
    return value.asString();
  } catch (error) {
    console.error(`❌ [Remote Config] Failed to get ${key}:`, error);
    return '';
  }
}

/**
 * Get all required config values
 */
export function getAllRemoteConfig(): Record<string, string> {
  const keys = [
    'GEMINI_API_KEY',
    'OPENAI_API_KEY', 
    'GROQ_API_KEY',
    'MONGO_URL',
    'O_EMAIL',
    'O_PASSWORD'
  ];
  
  const config: Record<string, string> = {};
  
  for (const key of keys) {
    config[key] = getRemoteConfigValue(key);
  }
  
  return config;
}

/**
 * Load config into process.env (client-side only)
 */
export async function loadRemoteConfigToEnv() {
  if (typeof window === 'undefined') return;
  
  await initializeRemoteConfig();
  const config = getAllRemoteConfig();
  
  // Set in window object (not process.env since it's client-side)
  (window as any).__REMOTE_CONFIG__ = config;
  
  console.log('✅ [Remote Config] Loaded config for client-side use');
}