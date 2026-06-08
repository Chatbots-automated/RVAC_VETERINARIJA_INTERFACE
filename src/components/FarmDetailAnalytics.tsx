import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { allocationUnitPricesFromBatchAndInvoice } from '../lib/invoicePricing';
import { 
  ArrowLeft, 
  Package, 
  Download,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// Import properly converted font with Lithuanian character support
import '../assets/fonts/Roboto-Regular-normal';

// Helper to translate category names to Lithuanian
function translateCategory(category: string | null | undefined): string {
  if (!category) return 'Nenurodyta';
  
  const translations: Record<string, string> = {
    'medicines': 'Vaistai',
    'prevention': 'Profilaktika',
    'reproduction': 'Reprodukcija',
    'treatment_materials': 'Gydymo medžiagos',
    'hygiene': 'Higiena',
    'biocide': 'Biocidas',
    'technical': 'Techninė',
    'svirkstukai': 'Švirkštai',
    'bolusas': 'Bolusas',
    'vakcina': 'Vakcina',
    'ovules': 'Ovulės',
    'supplier_services': 'Tiekėjo paslaugos'
  };
  
  return translations[category] || category;
}

interface FarmDetailProps {
  farmId: string;
  farmName: string;
  farmCode: string;
  onBack: () => void;
}

interface AllocatedStockSummary {
  product_name: string;
  category: string;
  unit: string;
  total_allocated_qty: number;
  total_used_qty: number;
  remaining_qty: number;
  avg_purchase_price: number;
  avg_price_before_discount: number;
  total_discount: number;
  total_value: number;
  /** Remaining stock value at pre-discount unit price */
  remaining_value_before_discount: number;
  /** Series/lot number for this batch */
  series: string;
}

export function FarmDetailAnalytics({ farmId, farmName, farmCode, onBack }: FarmDetailProps) {
  const [allocatedStock, setAllocatedStock] = useState<AllocatedStockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isDetailedView, setIsDetailedView] = useState(true);

  useEffect(() => {
    loadFarmData();
  }, [farmId, dateFrom, dateTo]);

  const loadFarmData = async () => {
    try {
      setLoading(true);

      // Load allocated stock with warehouse batch prices and invoice items for discount info
      let query = supabase
        .from('farm_stock_allocations')
        .select(`
          id,
          product_id,
          allocated_qty,
          created_at,
          warehouse_batch_id,
          warehouse_batches (
            purchase_price,
            received_qty,
            invoice_id,
            lot,
            batch_number
          ),
          products (
            name,
            category,
            primary_pack_unit
          )
        `)
        .eq('farm_id', farmId);

      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

      const { data: allocationsData, error: allocError } = await query;
      
      if (allocError) {
        console.error('Error loading allocations:', allocError);
        throw allocError;
      }
      
      console.log('Loaded allocations for farm:', { 
        farmId, 
        count: allocationsData?.length || 0,
        allocations: allocationsData 
      });

      // Also check raw allocations without joins to see if data exists
      const { data: rawAllocations } = await supabase
        .from('farm_stock_allocations')
        .select('id, product_id, warehouse_batch_id, allocated_qty')
        .eq('farm_id', farmId);
      
      console.log('Raw allocations (no joins):', {
        count: rawAllocations?.length || 0,
        allocations: rawAllocations
      });

      // Check if warehouse batches exist for these allocation IDs
      if (rawAllocations && rawAllocations.length > 0) {
        const warehouseBatchIds = rawAllocations.map(a => a.warehouse_batch_id).filter(Boolean);
        const { data: warehouseBatches } = await supabase
          .from('warehouse_batches')
          .select('id, lot, batch_number, purchase_price')
          .in('id', warehouseBatchIds);
        
        console.log('Warehouse batches check:', {
          expectedCount: warehouseBatchIds.length,
          foundCount: warehouseBatches?.length || 0,
          missingBatches: warehouseBatchIds.filter(id => !warehouseBatches?.find(b => b.id === id))
        });
      }

      // Load batches: either from direct invoices OR orphaned warehouse allocations
      // (batches with allocation_id but no matching farm_stock_allocation record)
      let directBatchQuery = supabase
        .from('batches')
        .select(`
          id,
          product_id,
          received_qty,
          qty_left,
          purchase_price,
          invoice_id,
          created_at,
          allocation_id,
          lot,
          batch_number,
          products (
            name,
            category,
            primary_pack_unit
          )
        `)
        .eq('farm_id', farmId);

      if (dateFrom) directBatchQuery = directBatchQuery.gte('created_at', dateFrom);
      if (dateTo) directBatchQuery = directBatchQuery.lte('created_at', dateTo + 'T23:59:59');

      const { data: directBatchesData, error: directBatchError } = await directBatchQuery;
      
      if (directBatchError) {
        console.error('Error loading direct batches:', directBatchError);
      }

      // Also check raw batches without the invoice filter
      const { data: allBatches } = await supabase
        .from('batches')
        .select('id, product_id, invoice_id, allocation_id, received_qty, qty_left')
        .eq('farm_id', farmId);
      
      console.log('All batches for farm (raw):', {
        total: allBatches?.length || 0,
        withInvoice: allBatches?.filter(b => b.invoice_id).length || 0,
        withAllocation: allBatches?.filter(b => b.allocation_id).length || 0,
        withoutEither: allBatches?.filter(b => !b.invoice_id && !b.allocation_id).length || 0,
        batches: allBatches
      });

      // Also get usage data for allocated stock (from warehouse)
      const { data: batchesData, error: batchError } = await supabase
        .from('batches')
        .select('product_id, received_qty, qty_left, allocation_id')
        .eq('farm_id', farmId)
        .not('allocation_id', 'is', null);
      
      if (batchError) {
        console.error('Error loading batches:', batchError);
      }

      // Get invoice items with discount info using warehouse_batch_id
      const warehouseBatchIds = [...new Set(allocationsData?.map(a => a.warehouse_batch_id).filter(Boolean))];
      let invoiceItemsData: any[] = [];
      
      if (warehouseBatchIds.length > 0) {
        const { data, error: itemsError } = await supabase
          .from('invoice_items')
          .select('warehouse_batch_id, product_id, discount_percent, unit_price, quantity, total_price')
          .in('warehouse_batch_id', warehouseBatchIds);
        
        if (itemsError) {
          console.error('Error loading invoice items:', itemsError);
        }
        
        invoiceItemsData = data || [];
      }

      // Get invoice items for farm batches (both direct invoices and orphaned allocations)
      const directBatchIds = [...new Set(directBatchesData?.map(b => b.id).filter(Boolean))];
      let directInvoiceItemsData: any[] = [];
      
      if (directBatchIds.length > 0) {
        const { data, error: directItemsError } = await supabase
          .from('invoice_items')
          .select('batch_id, product_id, discount_percent, unit_price, quantity, total_price')
          .in('batch_id', directBatchIds);
        
        if (directItemsError) {
          console.error('Error loading direct invoice items:', directItemsError);
        }
        
        directInvoiceItemsData = data || [];
        
        console.log('Invoice items for farm batches:', {
          batchCount: directBatchIds.length,
          invoiceItemsFound: directInvoiceItemsData.length
        });
      }

      // Get supplier_services items from farm invoices (these don't create batches)
      let supplierServicesQuery = supabase
        .from('invoice_items')
        .select(`
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          discount_percent,
          sku,
          invoices!inner (
            id,
            farm_id,
            invoice_date,
            invoice_number
          ),
          products (
            id,
            name,
            category,
            primary_pack_unit
          )
        `)
        .eq('invoices.farm_id', farmId);

      if (dateFrom) supplierServicesQuery = supplierServicesQuery.gte('invoices.invoice_date', dateFrom);
      if (dateTo) supplierServicesQuery = supplierServicesQuery.lte('invoices.invoice_date', dateTo);

      const { data: supplierServicesData, error: supplierServicesError } = await supplierServicesQuery;
      
      if (supplierServicesError) {
        console.error('Error loading supplier services items:', supplierServicesError);
      }

      console.log('Supplier services items for farm:', {
        count: supplierServicesData?.length || 0,
        items: supplierServicesData
      });

      if (allocationsData) {
        // Group by product and series (each series gets its own row)
        const productMap = new Map<string, AllocatedStockSummary>();

        allocationsData.forEach(allocation => {
          const product = allocation.products as any;
          const warehouseBatch = allocation.warehouse_batches as any;
          if (!product || !warehouseBatch) {
            console.warn('Skipping allocation due to missing data:', {
              allocation_id: allocation.id,
              product_id: allocation.product_id,
              warehouse_batch_id: allocation.warehouse_batch_id,
              has_product: !!product,
              has_warehouse_batch: !!warehouseBatch
            });
            return;
          }

          const productName = product.name;
          const allocatedQty = parseFloat(allocation.allocated_qty) || 0;
          const purchasePrice = parseFloat(warehouseBatch.purchase_price) || 0;
          const warehouseReceivedQty = parseFloat(warehouseBatch.received_qty) || 1;

          const invoiceItem =
            invoiceItemsData?.find(
              (ii) =>
                ii.warehouse_batch_id === allocation.warehouse_batch_id &&
                (ii.product_id === allocation.product_id || !ii.product_id)
            ) ||
            invoiceItemsData?.find((ii) => ii.warehouse_batch_id === allocation.warehouse_batch_id);

          const { unitAfterDiscount, unitBeforeDiscount } = allocationUnitPricesFromBatchAndInvoice({
            purchasePrice,
            receivedQty: warehouseReceivedQty,
            invoiceItem,
          });

          // Find corresponding farm batch to get usage
          const farmBatch = batchesData?.find(b => b.allocation_id === allocation.id);
          const qtyLeft = farmBatch ? parseFloat(farmBatch.qty_left) || 0 : allocatedQty;
          const usedQty = allocatedQty - qtyLeft;

          const lineDiscountAmount = (unitBeforeDiscount - unitAfterDiscount) * allocatedQty;

          // Get series/lot number
          const series = warehouseBatch.lot || warehouseBatch.batch_number || '';
          
          // Create unique key combining product name and series
          const mapKey = `${productName}|||${series}`;

          if (productMap.has(mapKey)) {
            const existing = productMap.get(mapKey)!;
            existing.total_allocated_qty += allocatedQty;
            existing.total_used_qty += usedQty;
            existing.remaining_qty += qtyLeft;
            existing.total_discount += lineDiscountAmount;

            const prevTotalQty = existing.total_allocated_qty - allocatedQty;
            existing.avg_purchase_price =
              ((existing.avg_purchase_price * prevTotalQty) + (unitAfterDiscount * allocatedQty)) /
              existing.total_allocated_qty;
            existing.avg_price_before_discount =
              ((existing.avg_price_before_discount * prevTotalQty) + (unitBeforeDiscount * allocatedQty)) /
              existing.total_allocated_qty;
            existing.total_value = existing.total_allocated_qty * existing.avg_purchase_price;
            existing.remaining_value_before_discount =
              existing.total_allocated_qty * existing.avg_price_before_discount;
          } else {
            // Default unit: 'vnt' for supplier_services, 'ml' for others
            const defaultUnit = product.category === 'supplier_services' ? 'vnt' : 'ml';
            productMap.set(mapKey, {
              product_name: productName,
              category: product.category || 'N/A',
              unit: product.primary_pack_unit || defaultUnit,
              total_allocated_qty: allocatedQty,
              total_used_qty: usedQty,
              remaining_qty: qtyLeft,
              avg_purchase_price: unitAfterDiscount,
              avg_price_before_discount: unitBeforeDiscount,
              total_discount: lineDiscountAmount,
              total_value: allocatedQty * unitAfterDiscount,
              remaining_value_before_discount: allocatedQty * unitBeforeDiscount,
              series: series || '',
            });
          }
        });

        // Process all farm batches (direct invoices and orphaned warehouse allocations)
        // Skip batches that were already processed via allocationsData
        const processedAllocationIds = new Set(allocationsData?.map(a => a.id) || []);
        
        if (directBatchesData) {
          console.log('Processing farm batches:', { 
            count: directBatchesData.length,
            batches: directBatchesData,
            alreadyProcessedCount: directBatchesData.filter(b => b.allocation_id && processedAllocationIds.has(b.allocation_id)).length
          });
          
          directBatchesData.forEach(batch => {
            // Skip if this batch's allocation was already processed
            if (batch.allocation_id && processedAllocationIds.has(batch.allocation_id)) {
              console.log('Skipping batch - already processed via allocation:', batch.id);
              return;
            }
            
            const product = batch.products as any;
            if (!product) {
              console.warn('Skipping batch due to missing product:', {
                batch_id: batch.id,
                product_id: batch.product_id,
                has_allocation_id: !!batch.allocation_id,
                has_invoice_id: !!batch.invoice_id
              });
              return;
            }

            const productName = product.name;
            const receivedQty = parseFloat(batch.received_qty) || 0;
            const qtyLeft = parseFloat(batch.qty_left) || 0;
            const usedQty = receivedQty - qtyLeft;
            const purchasePrice = parseFloat(batch.purchase_price) || 0;

            // Find invoice item for this batch
            const invoiceItem = directInvoiceItemsData?.find(
              (ii) => ii.batch_id === batch.id && ii.product_id === batch.product_id
            );

            const { unitAfterDiscount, unitBeforeDiscount } = allocationUnitPricesFromBatchAndInvoice({
              purchasePrice,
              receivedQty,
              invoiceItem,
            });

            const lineDiscountAmount = (unitBeforeDiscount - unitAfterDiscount) * receivedQty;

            // Get series/lot number
            const series = batch.lot || batch.batch_number || '';
            
            // Create unique key combining product name and series
            const mapKey = `${productName}|||${series}`;

            if (productMap.has(mapKey)) {
              const existing = productMap.get(mapKey)!;
              existing.total_allocated_qty += receivedQty;
              existing.total_used_qty += usedQty;
              existing.remaining_qty += qtyLeft;
              existing.total_discount += lineDiscountAmount;

              const prevTotalQty = existing.total_allocated_qty - receivedQty;
              existing.avg_purchase_price =
                ((existing.avg_purchase_price * prevTotalQty) + (unitAfterDiscount * receivedQty)) /
                existing.total_allocated_qty;
              existing.avg_price_before_discount =
                ((existing.avg_price_before_discount * prevTotalQty) + (unitBeforeDiscount * receivedQty)) /
                existing.total_allocated_qty;
              existing.total_value = existing.total_allocated_qty * existing.avg_purchase_price;
              existing.remaining_value_before_discount =
                existing.total_allocated_qty * existing.avg_price_before_discount;
            } else {
              // Default unit: 'vnt' for supplier_services, 'ml' for others
              const defaultUnit = product.category === 'supplier_services' ? 'vnt' : 'ml';
              productMap.set(mapKey, {
                product_name: productName,
                category: product.category || 'N/A',
                unit: product.primary_pack_unit || defaultUnit,
                total_allocated_qty: receivedQty,
                total_used_qty: usedQty,
                remaining_qty: qtyLeft,
                avg_purchase_price: unitAfterDiscount,
                avg_price_before_discount: unitBeforeDiscount,
                total_discount: lineDiscountAmount,
                total_value: receivedQty * unitAfterDiscount,
                remaining_value_before_discount: receivedQty * unitBeforeDiscount,
                series: series || '',
              });
            }
          });
        }

        // Process supplier_services items from direct farm invoices
        if (supplierServicesData) {
          console.log('Processing supplier services items:', supplierServicesData.length);
          
          supplierServicesData.forEach(item => {
            const product = item.products as any;
            const invoice = (item as any).invoices;
            
            if (!product || product.category !== 'supplier_services') {
              return;
            }

            const productName = product.name;
            const quantity = parseFloat(item.quantity) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            const totalPrice = parseFloat(item.total_price) || 0;
            const discountPercent = item.discount_percent ? parseFloat(item.discount_percent) : 0;

            // Calculate prices before and after discount
            const unitBeforeDiscount = discountPercent > 0 
              ? unitPrice / (1 - discountPercent / 100)
              : unitPrice;
            const totalBeforeDiscount = discountPercent > 0
              ? totalPrice / (1 - discountPercent / 100)
              : totalPrice;
            
            const discountAmount = totalBeforeDiscount - totalPrice;

            // For supplier_services, we don't track usage, so allocated = remaining
            // Use empty string for series since supplier_services typically don't have batches
            const series = '';
            const mapKey = `${productName}|||${series}`;

            if (productMap.has(mapKey)) {
              const existing = productMap.get(mapKey)!;
              existing.total_allocated_qty += quantity;
              existing.total_used_qty = 0; // Services aren't "used" in the traditional sense
              existing.remaining_qty += quantity;
              existing.total_discount += discountAmount;

              const prevTotalQty = existing.total_allocated_qty - quantity;
              existing.avg_purchase_price =
                ((existing.avg_purchase_price * prevTotalQty) + (unitPrice * quantity)) /
                existing.total_allocated_qty;
              existing.avg_price_before_discount =
                ((existing.avg_price_before_discount * prevTotalQty) + (unitBeforeDiscount * quantity)) /
                existing.total_allocated_qty;
              existing.total_value = existing.total_allocated_qty * existing.avg_purchase_price;
              existing.remaining_value_before_discount =
                existing.total_allocated_qty * existing.avg_price_before_discount;
            } else {
              const defaultUnit = product.primary_pack_unit || 'vnt';
              productMap.set(mapKey, {
                product_name: productName,
                category: product.category || 'supplier_services',
                unit: defaultUnit,
                total_allocated_qty: quantity,
                total_used_qty: 0,
                remaining_qty: quantity,
                avg_purchase_price: unitPrice,
                avg_price_before_discount: unitBeforeDiscount,
                total_discount: discountAmount,
                total_value: totalPrice,
                remaining_value_before_discount: totalBeforeDiscount,
                series: series,
              });
            }
          });
        }

        productMap.forEach((row) => {
          row.remaining_value_before_discount = row.total_allocated_qty * row.avg_price_before_discount;
        });

        const finalStock = Array.from(productMap.values()).sort((a, b) => b.total_value - a.total_value);
        console.log('Final allocated stock:', {
          count: finalStock.length,
          items: finalStock
        });
        
        setAllocatedStock(finalStock);
      }
    } catch (error) {
      console.error('Error loading farm data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalStockValue = allocatedStock.reduce((sum, item) => sum + item.total_value, 0);
  const totalStockValueBeforeDiscount = allocatedStock.reduce(
    (sum, item) => sum + item.total_allocated_qty * item.avg_price_before_discount,
    0
  );

  const handleExportExcel = () => {
    const exportData = isDetailedView 
      ? allocatedStock.map(item => ({
          'Produktas': item.product_name,
          'Kategorija': translateCategory(item.category),
          'Serija': item.series || '-',
          'Paskirstyta': item.total_allocated_qty,
          'Sunaudota': item.total_used_qty,
          'Vienetas': item.unit,
          'Kaina': item.avg_price_before_discount.toFixed(4),
          'Kaina (su nuol.)': item.avg_purchase_price.toFixed(4),
          'Nuolaida': item.total_discount.toFixed(2),
          'Likutis vertė (be nuol.)': item.remaining_value_before_discount.toFixed(2),
          'Likutis vertė (su nuol.)': item.total_value.toFixed(2)
        }))
      : allocatedStock.map(item => ({
          'Vaistas': item.product_name,
          'Serija': item.series || '-',
          'Kiekis': item.total_allocated_qty.toFixed(2) + ' ' + item.unit,
          'Kaina': '€' + item.avg_price_before_discount.toFixed(4),
          'Likutis be nuol.': '€' + item.remaining_value_before_discount.toFixed(2)
        }));

    if (isDetailedView) {
      // Add summary rows for detailed view
      const totalDiscount = allocatedStock.reduce((sum, item) => sum + item.total_discount, 0);
      const vat = totalStockValue * 0.21;
      const totalWithVat = totalStockValue * 1.21;

      exportData.push({
        'Produktas': '',
        'Kategorija': '',
        'Serija': '',
        'Paskirstyta': '',
        'Sunaudota': '',
        'Vienetas': '',
        'Kaina': 'Bendra nuolaida:',
        'Kaina (su nuol.)': '',
        'Nuolaida': '€' + totalDiscount.toFixed(2),
        'Likutis vertė (be nuol.)': '',
        'Likutis vertė (su nuol.)': ''
      } as any);

      exportData.push({
        'Produktas': '',
        'Kategorija': '',
        'Serija': '',
        'Paskirstyta': '',
        'Sunaudota': '',
        'Vienetas': '',
        'Kaina': 'Likutis vertė be nuol.:',
        'Kaina (su nuol.)': '',
        'Nuolaida': '',
        'Likutis vertė (be nuol.)': '€' + totalStockValueBeforeDiscount.toFixed(2),
        'Likutis vertė (su nuol.)': ''
      } as any);

      exportData.push({
        'Produktas': '',
        'Kategorija': '',
        'Serija': '',
        'Paskirstyta': '',
        'Sunaudota': '',
        'Vienetas': '',
        'Kaina': 'Likutis vertė su nuol.:',
        'Kaina (su nuol.)': '',
        'Nuolaida': '',
        'Likutis vertė (be nuol.)': '',
        'Likutis vertė (su nuol.)': '€' + totalStockValue.toFixed(2)
      } as any);

      exportData.push({
        'Produktas': '',
        'Kategorija': '',
        'Serija': '',
        'Paskirstyta': '',
        'Sunaudota': '',
        'Vienetas': '',
        'Kaina': 'PVM (21%):',
        'Kaina (su nuol.)': '',
        'Nuolaida': '',
        'Likutis vertė (be nuol.)': '',
        'Likutis vertė (su nuol.)': '€' + vat.toFixed(2)
      } as any);

      exportData.push({
        'Produktas': '',
        'Kategorija': '',
        'Serija': '',
        'Paskirstyta': '',
        'Sunaudota': '',
        'Vienetas': '',
        'Kaina': 'IŠ VISO MOKĖTI (su PVM):',
        'Kaina (su nuol.)': '',
        'Nuolaida': '',
        'Likutis vertė (be nuol.)': '',
        'Likutis vertė (su nuol.)': '€' + totalWithVat.toFixed(2)
      } as any);
    } else if (!isDetailedView) {
      // Add summary rows for simple view
      const subtotalBeforeDiscount = totalStockValueBeforeDiscount;
      const vat = subtotalBeforeDiscount * 0.21;
      const totalWithVat = subtotalBeforeDiscount * 1.21;

      exportData.push({
        'Vaistas': '',
        'Serija': '',
        'Kiekis': '',
        'Kaina': 'Tarpinė suma (be PVM):',
        'Likutis be nuol.': '€' + subtotalBeforeDiscount.toFixed(2)
      } as any);

      exportData.push({
        'Vaistas': '',
        'Serija': '',
        'Kiekis': '',
        'Kaina': 'PVM (21%):',
        'Likutis be nuol.': '€' + vat.toFixed(2)
      } as any);

      exportData.push({
        'Vaistas': '',
        'Serija': '',
        'Kiekis': '',
        'Kaina': 'IŠ VISO MOKĖTI (su PVM):',
        'Likutis be nuol.': '€' + totalWithVat.toFixed(2)
      } as any);
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Paskirstytos atsargos');
    XLSX.writeFile(wb, `${farmName}_paskirstytos_atsargos.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Set the properly converted Roboto font (already registered via import)
    doc.setFont('Roboto-Regular', 'normal');
    
    // Company Header
    doc.setFontSize(16);
    doc.text('VET Praktika, UAB', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(9);
    doc.text('Įmonės kodas: 307592187', pageWidth / 2, 21, { align: 'center' });
    doc.text('PVM mokėtojo kodas: LT100019738210', pageWidth / 2, 26, { align: 'center' });
    
    // Draw separator line
    doc.setLineWidth(0.5);
    doc.line(20, 30, pageWidth - 20, 30);
    
    // Report Title
    doc.setFontSize(14);
    doc.text('PASKIRSTYTOS ATSARGOS', pageWidth / 2, 38, { align: 'center' });
    
    // Farm Information Box
    doc.setFontSize(10);
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, 43, pageWidth - 40, 18, 2, 2, 'FD');
    
    doc.text('Ūkis:', 25, 50);
    doc.text(farmName, 40, 50);
    
    doc.text('Kodas:', 25, 56);
    doc.text(farmCode, 40, 56);
    
    doc.text('Data:', pageWidth - 60, 50);
    doc.text(new Date().toLocaleDateString('lt-LT'), pageWidth - 45, 50);

    if (isDetailedView) {
      // Detailed view PDF
      const tableData = allocatedStock.map(item => [
        item.product_name,
        translateCategory(item.category),
        item.series || '-',
        `${item.total_allocated_qty.toFixed(2)} ${item.unit}`,
        `${item.total_used_qty.toFixed(2)} ${item.unit}`,
        `${item.avg_price_before_discount.toFixed(4)}`,
        `${item.avg_purchase_price.toFixed(4)}`,
        item.total_discount > 0 ? `${item.total_discount.toFixed(2)}` : '-',
        `${item.remaining_value_before_discount.toFixed(2)}`,
        `${item.total_value.toFixed(2)}`
      ]);

      const totalDiscount = allocatedStock.reduce((sum, item) => sum + item.total_discount, 0);
      const totalBeforeDiscount = totalStockValueBeforeDiscount;
      const totalWithDiscount = totalStockValue;
      const vat = totalWithDiscount * 0.21;
      const totalWithVat = totalWithDiscount * 1.21;

      // Add spacing row
      tableData.push(['', '', '', '', '', '', '', '', '', '']);

      // Add footer rows with better styling
      tableData.push([
        { content: 'Bendra nuolaida (paskirstyta):', colSpan: 7, styles: { fontStyle: 'normal', halign: 'right', fillColor: [255, 243, 205] } } as any,
        { content: `EUR ${totalDiscount.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fillColor: [255, 243, 205] } } as any,
        '', ''
      ]);

      tableData.push([
        { content: 'Likutis bendra vertė be nuolaidos:', colSpan: 8, styles: { fontStyle: 'normal', halign: 'right', fillColor: [241, 245, 249] } } as any,
        { content: `EUR ${totalBeforeDiscount.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fillColor: [241, 245, 249] } } as any,
        ''
      ]);

      tableData.push([
        { content: 'Likutis bendra vertė su nuolaida:', colSpan: 8, styles: { fontStyle: 'normal', halign: 'right', fillColor: [220, 252, 231] } } as any,
        '',
        { content: `EUR ${totalWithDiscount.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fillColor: [220, 252, 231] } } as any
      ]);

      tableData.push([
        { content: 'PVM (21%):', colSpan: 8, styles: { fontStyle: 'normal', halign: 'right', fillColor: [219, 234, 254] } } as any,
        '',
        { content: `EUR ${vat.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fillColor: [219, 234, 254] } } as any
      ]);

      tableData.push([
        { content: 'IŠ VISO MOKĖTI (su PVM):', colSpan: 8, styles: { fontStyle: 'normal', halign: 'right', fontSize: 10, fillColor: [220, 252, 231] } } as any,
        '',
        { content: `EUR ${totalWithVat.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fontSize: 10, fillColor: [220, 252, 231] } } as any
      ]);

      autoTable(doc, {
        startY: 67,
        head: [[
          { content: 'Produktas', styles: { halign: 'left' } },
          { content: 'Kategorija', styles: { halign: 'center' } },
          { content: 'Serija', styles: { halign: 'left' } },
          { content: 'Paskirstyta', styles: { halign: 'right' } },
          { content: 'Sunaudota', styles: { halign: 'right' } },
          { content: 'Kaina', styles: { halign: 'right' } },
          { content: 'Kaina (su nuol.)', styles: { halign: 'right' } },
          { content: 'Nuolaida', styles: { halign: 'right' } },
          { content: 'Likutis be nuol.', styles: { halign: 'right' } },
          { content: 'Likutis su nuol.', styles: { halign: 'right' } }
        ]],
        body: tableData,
        styles: { 
          fontSize: 7, 
          cellPadding: 2,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
          font: 'Roboto-Regular',
          fontStyle: 'normal'
        },
        headStyles: { 
          fillColor: [59, 130, 246],
          textColor: 255,
          fontSize: 7,
          font: 'Roboto-Regular',
          fontStyle: 'normal'
        },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' }
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251]
        },
        margin: { left: 10, right: 10 },
        didDrawPage: function (data) {
          // Footer
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFont('Roboto-Regular', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(128);
          doc.text(
            `Dokumentas sugeneruotas: ${new Date().toLocaleDateString('lt-LT')} ${new Date().toLocaleTimeString('lt-LT')}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      });
    } else {
      // Simple view PDF
      const tableData = allocatedStock.map(item => {
        const totalQty = item.total_allocated_qty;
        const priceBeforeDiscount = item.avg_price_before_discount;
        const remainingValueBeforeDiscount = item.remaining_value_before_discount;
        
        return [
          item.product_name,
          item.series || '-',
          `${totalQty.toFixed(2)} ${item.unit}`,
          `${priceBeforeDiscount.toFixed(4)}`,
          `${remainingValueBeforeDiscount.toFixed(2)}`
        ];
      });

      const subtotalBeforeDiscount = totalStockValueBeforeDiscount;
      const vat = subtotalBeforeDiscount * 0.21;
      const totalWithVat = subtotalBeforeDiscount * 1.21;

      // Add spacing row
      tableData.push(['', '', '', '', '']);

      // Add summary rows with better styling
      tableData.push([
        { content: 'Tarpinė suma (be PVM):', colSpan: 4, styles: { fontStyle: 'normal', halign: 'right', fillColor: [245, 247, 250] } } as any,
        { content: `EUR ${subtotalBeforeDiscount.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fillColor: [245, 247, 250] } } as any
      ]);
      
      tableData.push([
        { content: 'PVM (21%):', colSpan: 4, styles: { fontStyle: 'normal', halign: 'right', fillColor: [219, 234, 254] } } as any,
        { content: `EUR ${vat.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fillColor: [219, 234, 254] } } as any
      ]);

      tableData.push([
        { content: 'IŠ VISO MOKĖTI (su PVM):', colSpan: 4, styles: { fontStyle: 'normal', halign: 'right', fontSize: 11, fillColor: [220, 252, 231] } } as any,
        { content: `EUR ${totalWithVat.toFixed(2)}`, styles: { fontStyle: 'normal', halign: 'right', fontSize: 11, fillColor: [220, 252, 231] } } as any
      ]);

      autoTable(doc, {
        startY: 67,
        head: [[
          { content: 'Produktas', styles: { halign: 'left' } },
          { content: 'Serija', styles: { halign: 'left' } },
          { content: 'Kiekis', styles: { halign: 'right' } },
          { content: 'Kaina (EUR)', styles: { halign: 'right' } },
          { content: 'Vertė (EUR)', styles: { halign: 'right' } }
        ]],
        body: tableData,
        styles: { 
          fontSize: 10, 
          cellPadding: 4,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
          font: 'Roboto-Regular',
          fontStyle: 'normal'
        },
        headStyles: { 
          fillColor: [59, 130, 246],
          textColor: 255,
          fontSize: 10,
          font: 'Roboto-Regular',
          fontStyle: 'normal'
        },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 35, halign: 'left' },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' }
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251]
        },
        margin: { left: 20, right: 20 },
        didDrawPage: function (data) {
          // Footer
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFont('Roboto-Regular', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(128);
          doc.text(
            `Dokumentas sugeneruotas: ${new Date().toLocaleDateString('lt-LT')} ${new Date().toLocaleTimeString('lt-LT')}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      });
    }

    doc.save(`${farmName}_ataskaita_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Grįžti į sąrašą
        </button>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">{farmName}</h1>
            <p className="text-blue-100 mt-1">Ūkio kodas: {farmCode}</p>
          </div>
          <div className="text-right space-y-1">
            <div>
              <p className="text-sm text-blue-100">Vertė be nuolaidos (likutis)</p>
              <p className="text-2xl font-bold text-white/95">€{totalStockValueBeforeDiscount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-blue-100">Vertė su nuolaida (likutis)</p>
              <p className="text-4xl font-bold">€{totalStockValue.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Allocated Stock Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-3 rounded-xl">
              <Package className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Paskirstytos atsargos</h2>
              <p className="text-sm text-gray-600">Produktai paskirstyti iš sandėlio</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isDetailedView}
                onChange={(e) => setIsDetailedView(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              Detali peržiūra
            </label>
            <button
              onClick={handleExportPDF}
              disabled={allocatedStock.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleExportExcel}
              disabled={allocatedStock.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nuo datos</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Iki datos</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Išvalyti
            </button>
          </div>
        </div>

        {allocatedStock.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-lg text-gray-600">Nėra paskirstytų atsargų</p>
            <p className="text-sm text-gray-500 mt-2">Paskirstykite produktus iš Vetpraktika UAB sandėlio</p>
          </div>
        ) : isDetailedView ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Produktas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Kategorija</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Serija</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Paskirstyta</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Sunaudota</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Kaina</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Kaina (su nuol.)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Nuolaida</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Likutis be nuol.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Likutis su nuol.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allocatedStock.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {translateCategory(item.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {item.series || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {item.total_allocated_qty.toFixed(2)} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {item.total_used_qty.toFixed(2)} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      €{item.avg_price_before_discount.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-700 font-medium">
                      €{item.avg_purchase_price.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-amber-700 font-medium">
                      {item.total_discount > 0 ? `- €${item.total_discount.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">
                      €{item.remaining_value_before_discount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                      €{item.total_value.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-amber-50 border-t-2 border-amber-200">
                  <td colSpan={7} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    Bendra nuolaida (paskirstyta):
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-amber-700 text-right">
                    - €{allocatedStock.reduce((sum, item) => sum + item.total_discount, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                </tr>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={8} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    Likutis bendra vertė be nuolaidos:
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-800 text-right">
                    €{totalStockValueBeforeDiscount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={8} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    Likutis bendra vertė su nuolaida:
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                    €{totalStockValue.toFixed(2)}
                  </td>
                </tr>
                <tr className="bg-blue-50 border-t-2 border-blue-300">
                  <td colSpan={8} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    PVM (21%):
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm font-bold text-blue-700 text-right">
                    €{(totalStockValue * 0.21).toFixed(2)}
                  </td>
                </tr>
                <tr className="bg-green-50 border-t-2 border-green-400">
                  <td colSpan={8} className="px-4 py-4 text-base font-bold text-gray-900 text-right">
                    IŠ VISO MOKĖTI (su PVM):
                  </td>
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-base font-bold text-green-700 text-right">
                    €{(totalStockValue * 1.21).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Vaistas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Serija</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Kiekis</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Kaina</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Likutis be nuol.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allocatedStock.map((item, idx) => {
                  return (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {item.series || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {item.total_allocated_qty.toFixed(2)} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">
                        €{item.avg_price_before_discount.toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                        €{item.remaining_value_before_discount.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    Tarpinė suma (be PVM):
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    €{totalStockValueBeforeDiscount.toFixed(2)}
                  </td>
                </tr>
                <tr className="bg-blue-50 border-t border-blue-200">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    PVM (21%):
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-blue-700 text-right">
                    €{(totalStockValueBeforeDiscount * 0.21).toFixed(2)}
                  </td>
                </tr>
                <tr className="bg-green-50 border-t-2 border-green-300">
                  <td colSpan={4} className="px-4 py-4 text-base font-bold text-gray-900 text-right">
                    IŠ VISO MOKĖTI (su PVM):
                  </td>
                  <td className="px-4 py-4 text-base font-bold text-green-700 text-right">
                    €{(totalStockValueBeforeDiscount * 1.21).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
