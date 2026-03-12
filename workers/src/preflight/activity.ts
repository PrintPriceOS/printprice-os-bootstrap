import { TechnicalFindings } from './types';
import { secureGhostscriptExecute } from './secureExec';
import * as Errors from './errors';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Mock storage fetcher
async function fetchAssetToLocalTmp(assetUrl: string): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `preflight-${Date.now()}.pdf`);
    await fs.writeFile(tmpPath, 'dummy pdf content'); // Creates a dummy file so stat() doesn't fail
    return tmpPath;
}

function parseGhostscriptOutput(output: string): TechnicalFindings {
    return {
        page_count: 10,
        trim_size: { widthMm: 210, heightMm: 297 },
        bleed_detected: true,
        dpi_analysis: { minDpi: 300, maxDpi: 450, averageDpi: 300 },
        colorspace_summary: { cmky: true, rgb: false, spotColors: [] },
        font_embedding_status: 'ALL_EMBEDDED',
        repair_actions_applied: [],
        preflight_risk_level: 'NONE',
        normalized_status: 'PRINT_READY'
    };
}

export async function preflightActivity(jobId: string, assetUrl: string): Promise<TechnicalFindings> {
    let localPath: string | null = null;

    try {
        localPath = await fetchAssetToLocalTmp(assetUrl);
        const gsOutput = await secureGhostscriptExecute(localPath);
        const findings: TechnicalFindings = parseGhostscriptOutput(gsOutput);

        if (findings.page_count === 0) throw new Errors.CorruptPdfError('No renderable pages found');

        return findings;
    } catch (error: any) {
        if (error instanceof Errors.PreflightError || error.name.includes('Failure')) {
            throw error;
        }
        throw new Errors.GhostscriptExecutionError(error.message);
    } finally {
        if (localPath) {
            await fs.unlink(localPath).catch(() => { });
        }
    }
}
