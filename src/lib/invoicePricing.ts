/**
 * Matches pricing logic in ReportTemplates InvoicesReport (sąskaitos section).
 * Invoice line total_price is net after discount; warehouse batch purchase_price is the same line total.
 */
export function allocationUnitPricesFromBatchAndInvoice(params: {
  purchasePrice: number;
  receivedQty: number;
  invoiceItem?: {
    total_price?: number | string | null;
    discount_percent?: number | string | null;
  } | null;
}): { unitAfterDiscount: number; unitBeforeDiscount: number } {
  const recv = params.receivedQty > 0 ? params.receivedQty : 1;
  const lineFromBatch = Number.isFinite(params.purchasePrice) ? params.purchasePrice : 0;

  const invTotal = params.invoiceItem?.total_price != null
    ? parseFloat(String(params.invoiceItem.total_price))
    : NaN;
  const lineAfterDiscount =
    Number.isFinite(invTotal) && invTotal > 0 ? invTotal : lineFromBatch;

  const discRaw = params.invoiceItem?.discount_percent;
  const discount = discRaw != null && discRaw !== '' ? parseFloat(String(discRaw)) : 0;

  const unitAfterDiscount = lineAfterDiscount / recv;

  if (discount > 0 && discount < 100) {
    const lineBeforeDiscount = lineAfterDiscount / (1 - discount / 100);
    return {
      unitAfterDiscount,
      unitBeforeDiscount: lineBeforeDiscount / recv,
    };
  }

  return { unitAfterDiscount, unitBeforeDiscount: unitAfterDiscount };
}
