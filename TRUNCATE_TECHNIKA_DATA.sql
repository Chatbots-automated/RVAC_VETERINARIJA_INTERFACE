-- =====================================================
-- TRUNCATE ALL TECHNIKA MODULE DATA
-- This will DELETE all rows but keep table structures
-- Run this in Supabase SQL Editor
-- =====================================================

-- IMPORTANT: This will delete ALL data from technika module!
-- Make sure you have a backup if needed!

BEGIN;

-- Disable triggers temporarily for faster truncation
SET session_replication_role = replica;

-- 1. VEHICLE/TRANSPORT TABLES (delete in order due to foreign keys)
TRUNCATE TABLE vehicle_visit_parts CASCADE;
TRUNCATE TABLE vehicle_service_visits CASCADE;
TRUNCATE TABLE vehicle_fuel_records CASCADE;
TRUNCATE TABLE vehicle_documents CASCADE;
TRUNCATE TABLE vehicle_assignments CASCADE;
TRUNCATE TABLE work_order_labor CASCADE;
TRUNCATE TABLE work_order_parts CASCADE;
TRUNCATE TABLE maintenance_work_orders CASCADE;
TRUNCATE TABLE vehicles CASCADE;

-- 2. FARM EQUIPMENT TABLES
TRUNCATE TABLE farm_equipment_service_parts CASCADE;
TRUNCATE TABLE farm_equipment_service_records CASCADE;
TRUNCATE TABLE farm_equipment_items CASCADE;
TRUNCATE TABLE farm_equipment CASCADE;

-- 3. EQUIPMENT/INVENTORY TABLES
TRUNCATE TABLE equipment_invoice_item_assignments CASCADE;
TRUNCATE TABLE equipment_issuance_items CASCADE;
TRUNCATE TABLE equipment_issuances CASCADE;
TRUNCATE TABLE equipment_stock_movements CASCADE;
TRUNCATE TABLE equipment_batches CASCADE;
TRUNCATE TABLE equipment_invoice_items CASCADE;
TRUNCATE TABLE equipment_invoices CASCADE;
TRUNCATE TABLE equipment_products CASCADE;

-- 4. COST CENTERS
TRUNCATE TABLE cost_centers CASCADE;

-- 5. CLEAN UP CUSTOM MEASUREMENT UNITS AND WORK DESCRIPTIONS
-- Keep default ones, remove custom ones (those created after initial setup)
DELETE FROM measurement_units WHERE created_at > '2024-01-01';
DELETE FROM work_descriptions WHERE created_at > '2024-01-01';

-- Re-enable triggers
SET session_replication_role = DEFAULT;

COMMIT;

-- =====================================================
-- VERIFICATION: Check row counts
-- =====================================================
SELECT 'vehicles' as table_name, COUNT(*) as row_count FROM vehicles
UNION ALL
SELECT 'farm_equipment', COUNT(*) FROM farm_equipment
UNION ALL
SELECT 'equipment_invoices', COUNT(*) FROM equipment_invoices
UNION ALL
SELECT 'equipment_products', COUNT(*) FROM equipment_products
UNION ALL
SELECT 'equipment_batches', COUNT(*) FROM equipment_batches
UNION ALL
SELECT 'maintenance_work_orders', COUNT(*) FROM maintenance_work_orders
UNION ALL
SELECT 'cost_centers', COUNT(*) FROM cost_centers
UNION ALL
SELECT 'measurement_units', COUNT(*) FROM measurement_units
UNION ALL
SELECT 'work_descriptions', COUNT(*) FROM work_descriptions
ORDER BY table_name;

-- =====================================================
-- DONE! All technika data has been cleared.
-- Suppliers, categories, and locations are preserved.
-- =====================================================
