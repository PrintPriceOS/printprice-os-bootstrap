import { ApplicationFailure } from '@temporalio/workflow';

// Base Preflight Error
export abstract class PreflightError extends ApplicationFailure {
    constructor(message: string, code: string, nonRetryable: boolean = true) {
        super(message, code, undefined, undefined, { nonRetryable });
    }
}

export class CorruptPdfError extends PreflightError {
    constructor(details: string) { super(`PDF corrupted: ${details}`, 'ERR_PDF_CORRUPT', true); }
}

export class PasswordProtectedPdfError extends PreflightError {
    constructor() { super('PDF is password protected', 'ERR_PDF_ENCRYPTED', true); }
}

export class PdfTooLargeError extends PreflightError {
    constructor(size: number, limit: number) { super(`PDF exceeds size limit: ${size} > ${limit}`, 'ERR_PDF_TOO_LARGE', true); }
}

export class PdfLogicalLimitExceededError extends PreflightError {
    constructor(reason: string) { super(`PDF structure rejected: ${reason}`, 'ERR_PDF_STRUCTURE_REJECTED', true); }
}

export class SuspiciousPdfStructureError extends PreflightError {
    constructor() { super('PDF exhibits potential Zip Bomb or hostile structure', 'ERR_PDF_SUSPICIOUS', true); }
}

export class GhostscriptTimeoutError extends PreflightError {
    // Retryable if it's a systemic load issue, but usually indicates an infinitely complex render.
    constructor() { super('Ghostscript execution timed out', 'ERR_GS_TIMEOUT', false); }
}

export class GhostscriptExecutionError extends Error {
    constructor(public stderr: string) { super(`Ghostscript failed unexpectedly: ${stderr}`); }
}
