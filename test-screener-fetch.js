/**
 * Test Screener.in Fundamentals Fetching
 * Run with: node test-screener-fetch.js RELIANCE
 */

const symbol = process.argv[2] || 'RELIANCE';

async function testFetch() {
    console.log(`\n🧪 Testing fetchScreenerFundamentals for: ${symbol}\n`);
    
    try {
        // Dynamic import
        const module = await import('./app/utils/screenerScraper.ts');
        const fetchScreenerFundamentals = module.fetchScreenerFundamentals || module.default?.fetchScreenerFundamentals;
        
        if (!fetchScreenerFundamentals) {
            throw new Error('fetchScreenerFundamentals not found in module. Available exports: ' + Object.keys(module).join(', '));
        }
        
        console.log('⏳ Fetching data...\n');
        const result = await fetchScreenerFundamentals(symbol);
        
        if (result) {
            console.log('\n✅ SUCCESS! Got fundamentals:');
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('\n❌ FAILED: fetchScreenerFundamentals returned null');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }
}

testFetch();
