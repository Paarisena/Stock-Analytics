// vitest.setup.ts
import '@testing-library/jest-dom';

// Mock environment variables for tests
process.env.MONGO_URL = 'mongodb://localhost:27017/test';
process.env.GEMINI_API_KEY = 'test-key';
process.env.SCREENER_EMAIL = 'test@example.com';
process.env.SCREENER_PASSWORD = 'test-password';