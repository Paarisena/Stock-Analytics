/**
 * Fiscal Year Utilities
 * Handles normalization and detection of Indian fiscal years
 */

/**
 * Normalize various fiscal year formats to standard "FY2025" format
 * @param input - Various formats: "FY2025", "2024-25", "Mar 2025", "Financial Year 2025", etc.
 * @returns Normalized format like "FY2025"
 */
export function normalizeFiscalYear(input: string | number): string {
    if (!input) {
        return getLatestFiscalYear();
    }
    
    const inputStr = input.toString().trim();
    
    // Already in FY2025 format
    if (/^FY\d{4}$/i.test(inputStr)) {
        return inputStr.toUpperCase();
    }
    
    // Just a year: "2025" -> "FY2025"
    if (/^\d{4}$/.test(inputStr)) {
        return `FY${inputStr}`;
    }
    
    // Year range: "2024-25" or "2024-2025" -> "FY2025"
    const rangeMatch = inputStr.match(/(\d{4})[-\/](\d{2,4})/);
    if (rangeMatch) {
        const endYear = rangeMatch[2].length === 2 
            ? `20${rangeMatch[2]}` 
            : rangeMatch[2];
        return `FY${endYear}`;
    }
    
    // Month year format: "Mar 2025", "March 2025" -> "FY2025"
    const monthMatch = inputStr.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+['']?(\d{2,4})/i);
    if (monthMatch) {
        const year = monthMatch[1].length === 2 ? `20${monthMatch[1]}` : monthMatch[1];
        return `FY${year}`;
    }
    
    // "Financial Year 2025" or similar
    const fyMatch = inputStr.match(/(?:Financial\s+Year|FY|Fiscal\s+Year)\s+['']?(\d{2,4})/i);
    if (fyMatch) {
        const year = fyMatch[1].length === 2 ? `20${fyMatch[1]}` : fyMatch[1];
        return `FY${year}`;
    }
    
    // Extract any 4-digit year
    const yearMatch = inputStr.match(/\b(20\d{2})\b/);
    if (yearMatch) {
        return `FY${yearMatch[1]}`;
    }
    
    // Fallback to latest
    console.warn(`⚠️ [Fiscal Year] Could not parse "${inputStr}", using latest FY`);
    return getLatestFiscalYear();
}

/**
 * Get the latest fiscal year based on current date
 * Indian fiscal year runs from Apr 1 to Mar 31
 * @returns Current fiscal year like "FY2025"
 */
export function getLatestFiscalYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed (0 = Jan, 3 = Apr)
    
    // If we're in Jan-Mar, we're in the previous FY
    // If we're in Apr-Dec, we're in the current FY
    // Example: Jan 2025 = FY2025 (Apr 2024 - Mar 2025)
    //          Apr 2025 = FY2026 (Apr 2025 - Mar 2026)
    const fiscalYear = month >= 3 ? year + 1 : year;
    
    return `FY${fiscalYear}`;
}

/**
 * Compare two fiscal years
 * @returns positive if fy1 > fy2, negative if fy1 < fy2, 0 if equal
 */
export function compareFiscalYears(fy1: string, fy2: string): number {
    const year1 = parseInt(fy1.replace(/\D/g, ''));
    const year2 = parseInt(fy2.replace(/\D/g, ''));
    return year1 - year2;
}
