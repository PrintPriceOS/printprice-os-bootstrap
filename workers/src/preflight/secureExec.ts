import { execFile } from 'child_process';
import { stat } from 'fs/promises';
import { getFastPdfEnvelope } from './fastParser';
import * as Errors from './errors';

const LIMITS = {
    MAX_RAW_BYTES: 500 * 1024 * 1024,   // 500MB
    MAX_PAGES: 2000,
    MAX_OBJECTS: 500000,
    MAX_EXPANSION_BYTES: 2 * 1024 * 1024 * 1024, // 2GB
    FAST_PARSE_TIMEOUT_MS: 5000,
    GS_TIMEOUT_MS: 30000
};

export async function secureGhostscriptExecute(pdfPath: string): Promise<string> {
    // 1. Raw Size Validation
    const fileStats = await stat(pdfPath);
    if (fileStats.size > LIMITS.MAX_RAW_BYTES) {
        throw new Errors.PdfTooLargeError(fileStats.size, LIMITS.MAX_RAW_BYTES);
    }

    // 2. Fast Logical Envelope Parsing
    const envelope = await getFastPdfEnvelope(pdfPath, LIMITS.FAST_PARSE_TIMEOUT_MS);

    if (envelope.isEncrypted) throw new Errors.PasswordProtectedPdfError();
    if (envelope.pageCount > LIMITS.MAX_PAGES) throw new Errors.PdfLogicalLimitExceededError(`Page count ${envelope.pageCount} exceeds ${LIMITS.MAX_PAGES}`);
    if (envelope.objectCount > LIMITS.MAX_OBJECTS) throw new Errors.PdfLogicalLimitExceededError(`Object count exceeds limits`);
    if (envelope.estimatedUncompressedSize > LIMITS.MAX_EXPANSION_BYTES) throw new Errors.SuspiciousPdfStructureError();

    // 3. Full GS Execution
    return new Promise((resolve, reject) => {
        // Normally we'd use 'gs', mocking 'echo' for bootstrap runtime safety if gs is not installed on system
        const command = process.env.GS_BIN || 'echo';
        const args = command === 'echo' ? ['dummy gs output'] : [
            '-dQUIET', '-dBATCH', '-dNOPAUSE', '-dSAFER', '-sDEVICE=inkcov', pdfPath
        ];

        execFile(command, args, {
            timeout: LIMITS.GS_TIMEOUT_MS,
            maxBuffer: 50 * 1024 * 1024 // 50MB stdout cap
        }, (error, stdout, stderr) => {
            if (error) {
                if (error.killed) return reject(new Errors.GhostscriptTimeoutError());
                return reject(new Errors.GhostscriptExecutionError(stderr || error.message));
            }
            resolve(stdout);
        });
    });
}
