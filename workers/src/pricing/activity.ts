import { ManufacturingSpecs, CostModel } from './types';
import { calculateJobCost, validateCostAgainstConstraint } from './logic';
import { TechnicalFindings } from '../preflight/types';
import * as Errors from './errors';

export async function pricingActivity(jobId: string, findings: TechnicalFindings, specs: ManufacturingSpecs): Promise<CostModel> {
    try {
        // 1. Calculate raw manufacturing cost
        const costModel = await calculateJobCost(specs, findings.page_count);

        // 2. Retrieve customer's quoted price (Mocked retrieval, usually from initial order payload)
        const mockCustomerQuotedPrice = 150.00;
        const targetMargin = 15.0; // 15% threshold

        // 3. Validate Business Margin
        const validatedModel = validateCostAgainstConstraint(costModel, mockCustomerQuotedPrice, targetMargin);

        return validatedModel;
    } catch (error: any) {
        if (error instanceof Errors.PricingError) {
            throw error;
        }
        // Convert generic DB errors to unretryable Spec Errors assuming DB is stable
        throw new Errors.UnsupportedSpecError(`Internal Pricing Failure: ${error.message}`);
    }
}
