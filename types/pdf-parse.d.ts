/**
 * Type definitions for pdf-parse v2.4.5
 */
declare module 'pdf-parse' {
    interface LoadParameters {
        data?: Buffer;
        url?: string | URL;
        password?: string;
        verbosity?: number;
        [key: string]: any;
    }

    interface TextResult {
        text: string;
        total: number;
        pages: Array<{ text: string }>;
    }

    export class PDFParse {
        constructor(params: LoadParameters);
        getText(): Promise<TextResult>;
        getInfo(): Promise<any>;
        destroy(): Promise<void>;
    }

    export const VerbosityLevel: {
        ERRORS: number;
        WARNINGS: number;
        INFOS: number;
    };
}
