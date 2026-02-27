export async function register() {
    // This runs ONCE when the server starts — before any API routes
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Import polyfills for serverless environment
        await import('./app/utils/serverPolyfills');
        console.log('✅ [Instrumentation] Server polyfills registered');
    }
}