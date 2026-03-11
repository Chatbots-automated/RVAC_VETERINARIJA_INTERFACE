import { Batch, ProductUnitCost } from './types';

/**
 * Calculate the unit cost from a batch
 * Unit cost = purchase_price / received_qty
 */
export function calculateUnitCostFromBatch(batch: Batch): number {
  if (!batch.purchase_price || !batch.received_qty || batch.received_qty === 0) {
    return 0;
  }

  return batch.purchase_price / batch.received_qty;
}

/**
 * Calculate the total cost for a quantity of product from a batch
 */
export function calculateTotalCost(quantity: number, batch: Batch): number {
  const unitCost = calculateUnitCostFromBatch(batch);
  return quantity * unitCost;
}

/**
 * Format cost as EUR currency
 */
export function formatCost(cost: number): string {
  return `€${cost.toFixed(2)}`;
}

/**
 * Format unit cost with appropriate precision
 * Shows more decimals for small unit costs to avoid confusion
 */
export function formatUnitCost(unitCost: number): string {
  // If cost is very small (< 0.01), show 4 decimals
  if (unitCost < 0.01 && unitCost > 0) {
    return `€${unitCost.toFixed(4)}`;
  }
  // If cost is small (< 0.10), show 3 decimals
  if (unitCost < 0.10) {
    return `€${unitCost.toFixed(3)}`;
  }
  // Otherwise show 2 decimals
  return `€${unitCost.toFixed(2)}`;
}

/**
 * Calculate unit cost with fallback for missing data
 */
export function calculateSafeUnitCost(
  purchasePrice: number | null,
  receivedQty: number | null
): number {
  if (!purchasePrice || !receivedQty || receivedQty === 0) {
    return 0;
  }

  return purchasePrice / receivedQty;
}

/**
 * Configuration for treatment costs
 */
export const TREATMENT_COST_CONFIG = {
  VISIT_BASE_COST: 10, // EUR per visit
  MASTITIS_GROUP_NUMBER: 5, // Group number for mastitis tracking
  SHOW_ZERO_COSTS: false, // Whether to show items with zero cost
};

/**
 * Calculate total costs from different components
 */
export function calculateTotalTreatmentCost(
  visitCount: number,
  medicationCost: number,
  vaccinationCost: number = 0,
  materialCost: number = 0
): number {
  const visitCost = visitCount * TREATMENT_COST_CONFIG.VISIT_BASE_COST;
  return visitCost + medicationCost + vaccinationCost + materialCost;
}
