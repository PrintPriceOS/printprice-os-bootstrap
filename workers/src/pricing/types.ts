export interface ManufacturingSpecs {
    format: string; // e.g., 'A4', 'US_LETTER'
    pages: number;
    quantity: number;
    paper_type: string;
    color_model: 'CMYK' | 'BW' | 'MIXED';
    binding: string;
    finishing_options?: string[];
    target_country: string; // Added for geography optimization
}

export interface PricingConstraint {
    maxAcceptableCost: number;
    currency: string;
    targetMarginPercentage: number;
}

export interface CostModel {
    base_cost: number;
    paper_cost: number;
    click_charge: number; // ink/toner cost
    binding_cost: number;
    finishing_cost: number;
    total_manufacturing_cost: number;
    total_price: number; // Added for risk/margin calculation
    currency: string;
    calculated_margin_percentage: number;
    is_margin_healthy: boolean;
}
