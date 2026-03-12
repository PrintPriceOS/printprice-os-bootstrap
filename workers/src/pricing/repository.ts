import { db } from '../db';

export async function getPaperCostPerSheet(paperType: string, format: string): Promise<number> {
    const [rows]: any = await db.query(
        'SELECT cost_per_sheet FROM pricing_catalog_paper WHERE paper_type = ? AND format = ?',
        [paperType, format]
    );
    if (!rows || rows.length === 0) return 0;
    return parseFloat(rows[0].cost_per_sheet);
}

export async function getClickCharge(colorModel: string): Promise<number> {
    const [rows]: any = await db.query(
        'SELECT cost_per_click FROM pricing_catalog_ink WHERE color_model = ?',
        [colorModel]
    );
    if (!rows || rows.length === 0) return 0;
    return parseFloat(rows[0].cost_per_click);
}

export async function getBindingCost(bindingType: string): Promise<number> {
    const [rows]: any = await db.query(
        'SELECT base_cost FROM pricing_catalog_binding WHERE binding_type = ?',
        [bindingType]
    );
    if (!rows || rows.length === 0) return 0;
    return parseFloat(rows[0].base_cost);
}
