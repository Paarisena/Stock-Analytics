// Test script to check screener.in structure
const cheerio = require('cheerio');

async function testScreener() {
    const symbol = 'TCS';
    
    // Login first
    console.log('🔐 Logging in...');
    const loginPage = await fetch('https://www.screener.in/login/');
    const loginHtml = await loginPage.text();
    const loginCookies = loginPage.headers.get('set-cookie') || '';
    const $login = cheerio.load(loginHtml);
    const csrfToken = $login('input[name="csrfmiddlewaretoken"]').val();
    
    console.log('CSRF Token:', csrfToken);
    console.log('Cookies:', loginCookies);
    
    const loginData = new URLSearchParams({
        'username': process.env.SCREENER_EMAIL,
        'password': process.env.SCREENER_PASSWORD,
        'csrfmiddlewaretoken': csrfToken
    });
    
    const loginResponse = await fetch('https://www.screener.in/login/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': loginCookies,
            'Referer': 'https://www.screener.in/login/',
            'User-Agent': 'Mozilla/5.0'
        },
        body: loginData.toString(),
        redirect: 'manual'
    });
    
    const sessionCookies = loginResponse.headers.get('set-cookie') || '';
    console.log('✅ Login response:', loginResponse.status);
    console.log('Session cookies:', sessionCookies);
    
    // Test company page
    console.log('\n📄 Fetching company page...');
    const companyUrl = `https://www.screener.in/company/${symbol}/`;
    const response = await fetch(companyUrl, {
        headers: {
            'Cookie': sessionCookies,
            'User-Agent': 'Mozilla/5.0'
        }
    });
    
    if (!response.ok) {
        console.error('❌ Failed:', response.status);
        return;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Check for concall links
    console.log('\n🔍 Looking for concall links...');
    const concallLinks = [];
    $('a[href*="concall"]').each((i, elem) => {
        concallLinks.push({
            href: $(elem).attr('href'),
            text: $(elem).text().trim()
        });
    });
    
    console.log('Found concall links:', concallLinks);
    
    // Check for transcript links
    console.log('\n🔍 Looking for transcript links...');
    const transcriptLinks = [];
    $('a[href*="transcript"]').each((i, elem) => {
        transcriptLinks.push({
            href: $(elem).attr('href'),
            text: $(elem).text().trim()
        });
    });
    
    console.log('Found transcript links:', transcriptLinks);
    
    // Check all links in the page
    console.log('\n🔍 All links containing "concall" or "transcript" or "con-call":');
    $('a').each((i, elem) => {
        const href = $(elem).attr('href') || '';
        const text = $(elem).text().trim();
        if (href.includes('concall') || href.includes('transcript') || href.includes('con-call') || text.toLowerCase().includes('concall') || text.toLowerCase().includes('transcript')) {
            console.log({
                href,
                text
            });
        }
    });
    
    // Try concalls page directly
    console.log('\n📄 Trying /concalls/ page...');
    const concallsUrl = `https://www.screener.in/company/${symbol}/concalls/`;
    const concallsResponse = await fetch(concallsUrl, {
        headers: {
            'Cookie': sessionCookies,
            'User-Agent': 'Mozilla/5.0'
        }
    });
    
    console.log('Concalls page status:', concallsResponse.status);
    
    if (concallsResponse.ok) {
        const concallsHtml = await concallsResponse.text();
        const $concalls = cheerio.load(concallsHtml);
        
        console.log('\n🔍 Links on /concalls/ page:');
        $concalls('a').each((i, elem) => {
            const href = $concalls(elem).attr('href') || '';
            const text = $concalls(elem).text().trim();
            if (href.includes('concall') || href.includes('transcript')) {
                console.log({
                    href,
                    text
                });
            }
        });
        
        // Look for any table or list structure
        console.log('\n📊 Tables found:');
        $concalls('table').each((i, elem) => {
            console.log(`Table ${i}:`, $concalls(elem).find('th').text());
        });
        
        console.log('\n📋 Lists found:');
        $concalls('ul, ol').each((i, elem) => {
            console.log(`List ${i}:`, $concalls(elem).find('li').first().text().substring(0, 100));
        });
    }
}

testScreener().catch(console.error);
