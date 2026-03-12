import { ApplicationFailure } from '@temporalio/workflow';

export abstract class PricingError extends ApplicationFailure {
    constructor(message: string, code: string, nonRetryable: boolean = true) {
        super(message, code, undefined, undefined, { nonRetryable });
    }
}

export class InvalidSkuError extends PricingError {
    constructor(sku: string) { super(`Invalid or missing SKU in catalog: ${sku}`, 'ERR_PRICING_INVALID_SKU', true); }
}

export class UnsupportedSpecError extends PricingError {
    constructor(reason: string) { super(`Specifications unsupported by pricing model: ${reason}`, 'ERR_PRICING_UNSUPPORTED_SPEC', true); }
}

export class NegativeMarginError extends PricingError {
    constructor(margin: number) { super(`Calculated margin is negative or below strict thresholds: ${margin}%`, 'ERR_PRICING_NEGATIVE_MARGIN', true); }
}
