/**
 * Type definitions for pdfjs-dist/legacy (Node.js build)
 */

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
    export interface PDFDocumentLoadingTask {
        promise: Promise<PDFDocumentProxy>;
        destroy(): Promise<void>;
    }

    export interface PDFDocumentProxy {
        numPages: number;
        getPage(pageNumber: number): Promise<PDFPageProxy>;
        destroy(): Promise<void>;
    }

    export interface PDFPageProxy {
        pageNumber: number;
        getTextContent(): Promise<TextContent>;
    }

    export interface TextContent {
        items: TextItem[];
        styles: any;
    }

    export interface TextItem {
        str: string;
        dir: string;
        width: number;
        height: number;
        transform: number[];
        fontName: string;
    }

    export interface DocumentInitParameters {
        data?: Uint8Array | ArrayBuffer;
        url?: string;
        password?: string;
        useWorkerFetch?: boolean;
        isEvalSupported?: boolean;
        useSystemFonts?: boolean;
        disableWorker?: boolean;
    }

    export function getDocument(params: DocumentInitParameters): PDFDocumentLoadingTask;
}
