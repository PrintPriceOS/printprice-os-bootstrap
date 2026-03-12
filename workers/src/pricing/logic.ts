import { ManufacturingSpecs, CostModel } from './types';
import * as Repository from './repository';
import * as Errors from './errors';

export async function calculateJobCost(specs: ManufacturingSpecs, pageCount: number): Promise<CostModel> {
    // 1. Paper Cost
    const sheetCost = await Repository.getPaperCostPerSheet(specs.paper_type, specs.format);
    if (sheetCost === 0) throw new Errors.InvalidSkuError(`Paper: ${specs.paper_type} / ${specs.format}`);

    // Assuming 2 pages per sheet (double-sided)
    const sheetsRequired = Math.ceil(pageCount / 2) * specs.quantity;
    const paperCost = sheetsRequired * sheetCost;

    // 2. Click Charge (Ink/Toner)
    const clickCost = await Repository.getClickCharge(specs.color_model);
    if (clickCost === 0) throw new Errors.InvalidSkuError(`Color Model: ${specs.color_model}`);
    const clickCharge = pageCount * specs.quantity * clickCost;

    // 3. Binding Cost
    const bindingCostUnit = await Repository.getBindingCost(specs.binding);
    if (bindingCostUnit === 0) throw new Errors.InvalidSkuError(`Binding: ${specs.binding}`);
    const bindingCost = bindingCostUnit * specs.quantity;

    // 4. Finishing Cost (simplified mock for complex logic)
    let finishingCost = 0;
    if (specs.finishing_options) {
        // In reality, this links to another DB table
        finishingCost = specs.finishing_options.length * 0.50 * specs.quantity;
    }

    const baseCost = 2.00; // Fixed routing fee

    const totalManufacturingCost = baseCost + paperCost + clickCharge + bindingCost + finishingCost;

    return {
        base_cost: baseCost,
        paper_cost: paperCost,
        click_charge: clickCharge,
        binding_cost: bindingCost,
        finishing_cost: finishingCost,
        total_manufacturing_cost: totalManufacturingCost,
        currency: 'USD',
        calculated_margin_percentage: 0, // Calculated later against customer price
        is_margin_healthy: true
    };
}

export function validateCostAgainstConstraint(cost: CostModel, quotedCustomerPrice: number, targetMarginPercent: number): CostModel {
    const marginGross = quotedCustomerPrice - cost.total_manufacturing_cost;
    const marginPercent = (marginGross / quotedCustomerPrice) * 100;

    cost.calculated_margin_percentage = marginPercent;
    cost.is_margin_healthy = marginPercent >= targetMarginPercent;

    if (!cost.is_margin_healthy) {
        throw new Errors.NegativeMarginError(marginPercent);
    }

    return cost;
}
