export type PreflightRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TechnicalFindings {
    page_count: number;
    trim_size: { widthMm: number; heightMm: number };
    bleed_detected: boolean;
    dpi_analysis: { minDpi: number; maxDpi: number; averageDpi: number };
    colorspace_summary: { cmky: boolean; rgb: boolean; spotColors: string[] };
    font_embedding_status: 'ALL_EMBEDDED' | 'PARTIAL' | 'NONE';
    repair_actions_applied: string[];
    preflight_risk_level: PreflightRiskLevel;
    normalized_status: 'PRINT_READY' | 'NEEDS_REPAIR' | 'REJECTED';
}
