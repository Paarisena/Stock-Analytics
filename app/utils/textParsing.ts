/**
 * Text Parsing Utilities
 * Handles regex-based key-value extraction and JSON parsing
 */

/**
 * Parse key-value pairs from text using regex
 */
export function parseKeyValueText(
    text: string,
    keys: string[]
): Record<string, string | null> {
    const result: Record<string, string | null> = {};

    keys.forEach(key => {
        const match = text.match(new RegExp(`${key}:\\s*([^\n]+)`, 'i'));
        result[key] = match ? match[1].trim() : null;
    });

    return result;
}

/**
 * Parse a single key-value from text
 */
export function parseValue(text: string, key: string): string | null {
    const match = text.match(new RegExp(`${key}:\\s*([^\n]+)`, 'i'));
    return match ? match[1].trim() : null;
}

/**
 * Extract JSON from text that may contain markdown or extra content
 */
export function extractJSON<T = any>(text: string): T | null {
    try {
        // Try direct parse first
        return JSON.parse(text);
    } catch {
        // Try to find JSON within markdown or other text
         let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
         try{
            return JSON.parse(cleaned);
         }catch{
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}
}

/**
 * Parse float from text, returning default if invalid
 */
export function parseFloat(value: string | null, defaultValue: number = 0): number {
    if (!value) return defaultValue;
    const cleaned = value.replace(/[₹$,]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse integer from text, returning default if invalid
 */
export function parseInt(value: string | null, defaultValue: number = 0): number {
    if (!value) return defaultValue;
    const cleaned = value.replace(/[₹$,]/g, '');
    const parsed = Number.parseInt(cleaned, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse percentage from text (e.g., "15.5%" -> 15.5)
 */
export function parsePercentage(value: string | null, defaultValue: number = 0): number {
    if (!value) return defaultValue;
    const cleaned = value.replace(/%/g, '');
    const parsed = Number.parseFloat(cleaned);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Extract list items from bullet-pointed text
 */
export function extractBulletPoints(text: string): string[] {
    const matches = text.match(/^[\s]*[-•*]\s*(.+)$/gm);
    if (!matches) return [];
    return matches.map(line => line.replace(/^[\s]*[-•*]\s*/, '').trim());
}

/**
 * Extract a section from text and parse as list
 */
export function parseListSection(
    text: string,
    sectionName: string,
    itemPrefix: string = '-'
): string[] {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]+?)(?=[A-Z_]+:|$)`, 'i');
    const section = text.match(regex)?.[1] || '';
    return section
        .split('\n')
        .filter(line => line.trim().startsWith(itemPrefix))
        .map(line => line.replace(new RegExp(`^\\s*${itemPrefix}\\s*`), '').trim())
        .filter(line => line.length > 0);
}

/**
 * Parsed segment data structure
 */
export interface ParsedSegment {
    name: string;
    revenue: number;
    growth: number;
    margin: number;
}

/**
 * Parse business segments with growth percentages
 * Example: "Retail (+5.2%), Digital (-2.1%)" → [{name: "Retail", growth: 5.2}, ...]
 */
export function parseSegments(
    segmentsText: string,
    delimiter: string = ','
): ParsedSegment[] {
    if (!segmentsText || !segmentsText.trim()) return [];
    
    return segmentsText.split(delimiter).map(s => {
        const match = s.match(/(.+?)\s*\(([+-]?\d+(?:\.\d+)?)%?\)/);
        return {
            name: match?.[1]?.trim() || s.trim(),
            growth: match?.[2] ? Number.parseFloat(match[2]) : 0,
            revenue: 0,
            margin: 0
        };
    });
}

/**
 * Extract and format date from text
 */
export function parseDate(
    text: string,
    keyPattern: string = 'DATE',
    format: 'YYYY-MM-DD' | 'DD/MM/YYYY' = 'YYYY-MM-DD'
): string {
    const regex = new RegExp(`${keyPattern}:\\s*([0-9-/]+)`, 'i');
    const match = text.match(regex);
    
    if (!match) return new Date().toISOString().split('T')[0];
    
    const dateStr = match[1];
    
    // Convert DD/MM/YYYY to YYYY-MM-DD if needed
    if (format === 'YYYY-MM-DD' && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const [d, m, y] = parts;
            const year = y.length === 2 ? '20' + y : y;
            return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    
    return dateStr;
}

/**
 * Parse quarter information from text (Q1 2024, Q2 FY2024, etc.)
 */
export function parseQuarter(text: string): string {
    const match = text.match(/QUARTER:\s*(.+?)(?:\n|$)/i);
    if (match) return match[1].trim();
    
    // Try alternate patterns
    const altMatch = text.match(/(Q[1-4]\s+(?:FY)?20\d{2})/i);
    return altMatch ? altMatch[1].trim() : 'Latest';
}

/**
 * Parse sentiment from text (POSITIVE, NEGATIVE, NEUTRAL)
 */
export function parseSentiment(text: string): string {
    const match = text.match(/SENTIMENT:\s*(.+?)(?:\n|$)/i);
    return match ? match[1].trim() : 'NEUTRAL';
}

/**
 * Categorize risks into business, financial, regulatory, and operational
 */
export interface CategorizedRisks {
    business: string[];
    financial: string[];
    regulatory: string[];
    operational: string[];
    totalCount: number;
}

export function categorizeRisks(risks: string[]): CategorizedRisks {
    const businessKeywords = ['competition', 'market share', 'demand', 'customer', 'product', 'pricing'];
    const financialKeywords = ['debt', 'cash', 'capital', 'liquidity', 'credit', 'revenue', 'profit'];
    const regulatoryKeywords = ['regulation', 'compliance', 'legal', 'tax', 'policy', 'government'];
    
    const categorized: CategorizedRisks = {
        business: [],
        financial: [],
        regulatory: [],
        operational: [],
        totalCount: risks.length
    };
    
    risks.forEach(risk => {
        const lowerRisk = risk.toLowerCase();
        if (businessKeywords.some(kw => lowerRisk.includes(kw))) {
            categorized.business.push(risk);
        } else if (financialKeywords.some(kw => lowerRisk.includes(kw))) {
            categorized.financial.push(risk);
        } else if (regulatoryKeywords.some(kw => lowerRisk.includes(kw))) {
            categorized.regulatory.push(risk);
        } else {
            categorized.operational.push(risk);
        }
    });
    
    return categorized;
}

/**
 * Clean up AI-generated text (remove markdown, extra spaces, etc.)
 */
export function cleanAIText(text: string): string {
    return text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/\*\*/g, '')
        .trim();
}
