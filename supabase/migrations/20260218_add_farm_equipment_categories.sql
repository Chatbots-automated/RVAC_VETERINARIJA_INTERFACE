-- ============================================================================
-- ADD FARM EQUIPMENT ASSIGNMENT CATEGORIES
-- ============================================================================
-- Adds specific categories for farm equipment maintenance and repairs
-- ============================================================================

-- Update assignment_type constraint to include new farm equipment categories
ALTER TABLE equipment_invoice_item_assignments 
DROP CONSTRAINT IF EXISTS equipment_invoice_item_assignments_assignment_type_check;

ALTER TABLE equipment_invoice_item_assignments 
ADD CONSTRAINT equipment_invoice_item_assignments_assignment_type_check 
CHECK (assignment_type = ANY (ARRAY[
  'vehicle'::text,
  'tool'::text,
  'building'::text,
  'general_farm'::text,
  'cost_center'::text,
  'transport_service'::text,
  'periodic_service'::text,
  'breakdown_repair'::text,
  'parts_replacement'::text,
  'modernization'::text,
  'safety_inspection'::text,
  'cleaning_maintenance'::text
]));

-- Add service_category column to store the specific service type
ALTER TABLE equipment_invoice_item_assignments 
ADD COLUMN IF NOT EXISTS service_category text;

-- Add farm_equipment_id to link directly to farm equipment
ALTER TABLE equipment_invoice_item_assignments 
ADD COLUMN IF NOT EXISTS farm_equipment_id uuid REFERENCES farm_equipment(id);

COMMENT ON COLUMN equipment_invoice_item_assignments.service_category IS 'Specific category of service performed (for farm equipment)';
COMMENT ON COLUMN equipment_invoice_item_assignments.farm_equipment_id IS 'Reference to specific farm equipment (milking machine, feeder, etc.)';

-- Create index for farm equipment assignments
CREATE INDEX IF NOT EXISTS idx_equipment_invoice_item_assignments_farm_equipment 
ON equipment_invoice_item_assignments(assignment_type, farm_equipment_id) 
WHERE assignment_type IN ('periodic_service', 'breakdown_repair', 'parts_replacement', 'modernization', 'safety_inspection', 'cleaning_maintenance');

-- ============================================================================
-- ASSIGNMENT TYPE DESCRIPTIONS
-- ============================================================================
-- periodic_service: Periodinis servisas - Regular scheduled maintenance
-- breakdown_repair: Gedimo taisymas - Emergency repairs when equipment breaks
-- parts_replacement: Dalių keitimas - Replacing worn or damaged parts
-- modernization: Modernizavimas - Upgrades and improvements to equipment
-- safety_inspection: Saugos patikra - Safety inspections and compliance checks
-- cleaning_maintenance: Valymas ir priežiūra - Routine cleaning and upkeep
-- ============================================================================
