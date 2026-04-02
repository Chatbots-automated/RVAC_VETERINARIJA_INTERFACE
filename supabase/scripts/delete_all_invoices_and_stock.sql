-- Delete all invoices, warehouse stock, and farm-level stock
-- This will:
-- 1. Delete all usage_items (stock usage records)
-- 2. Delete all farm_stock_allocations (warehouse to farm allocations)
-- 3. Delete all warehouse_batches (central warehouse inventory)
-- 4. Delete all batches (farm-level inventory)
-- 5. Delete all invoice_items (CASCADE from invoices)
-- 6. Delete all invoices
-- 7. Preserve: products, farms, suppliers, animals, treatments, visits

-- Step 1: Delete all usage_items (stock usage from treatments/vaccinations/biocides)
DELETE FROM public.usage_items;

-- Step 2: Delete all farm stock allocations
DELETE FROM public.farm_stock_allocations;

-- Step 3: Delete all warehouse batches (this will CASCADE delete any remaining farm_stock_allocations)
DELETE FROM public.warehouse_batches;

-- Step 4: Delete all farm-level batches (atsargos)
DELETE FROM public.batches;

-- Step 5: Delete all invoices (this will CASCADE delete invoice_items)
DELETE FROM public.invoices;

-- Step 6: Clean up any orphaned invoice_items (shouldn't exist due to CASCADE, but just in case)
DELETE FROM public.invoice_items WHERE invoice_id IS NULL;

-- Verification: Show what remains
-- Products should still exist (product catalog)
-- Farms should still exist (clients)
-- Suppliers should still exist
-- Animals, treatments, visits should still exist
-- All inventory and invoices are cleared
