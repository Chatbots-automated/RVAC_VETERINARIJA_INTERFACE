-- Farm Equipment Maintenance System
-- This system allows tracking maintenance for farm equipment/systems (e.g., Carousel, Milking System)
-- Each equipment can have multiple components/items that need regular servicing

-- Main farm equipment/systems table (e.g., "Carousel", "Milking System")
CREATE TABLE IF NOT EXISTS public.farm_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  location text,  -- Where on the farm (e.g., "Barn 1", "Main Milking Parlor")
  category text,  -- e.g., "Milking", "Feeding", "Cleaning", "Ventilation"
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Components/items within each equipment (e.g., "Filters", "Paddings", "Scrubbers")
CREATE TABLE IF NOT EXISTS public.farm_equipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_equipment_id uuid NOT NULL REFERENCES public.farm_equipment(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  description text,
  
  -- Service interval configuration
  service_interval_value integer NOT NULL,  -- e.g., 3
  service_interval_type text NOT NULL CHECK (service_interval_type IN ('days', 'weeks', 'months', 'years')),
  
  -- Reminder settings (how many days before to remind)
  reminder_days_before integer DEFAULT 14 NOT NULL,
  
  -- Last and next service tracking
  last_service_date date,
  next_service_date date,
  
  -- Status and notes
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Service records - logs each time an item is serviced
CREATE TABLE IF NOT EXISTS public.farm_equipment_service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_equipment_item_id uuid NOT NULL REFERENCES public.farm_equipment_items(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  
  -- Parts/products used during this service
  notes text,
  
  -- Link to equipment invoice items if parts were used
  -- This allows tracking what was consumed during service
  
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Junction table for linking service records to equipment invoice items (parts used)
CREATE TABLE IF NOT EXISTS public.farm_equipment_service_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES public.farm_equipment_service_records(id) ON DELETE CASCADE,
  invoice_item_id uuid NOT NULL REFERENCES public.equipment_invoice_items(id) ON DELETE CASCADE,
  quantity_used numeric NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Function to calculate next service date based on interval
CREATE OR REPLACE FUNCTION calculate_next_service_date(
  p_last_service_date date,
  p_interval_value integer,
  p_interval_type text
)
RETURNS date AS $$
BEGIN
  IF p_last_service_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN CASE p_interval_type
    WHEN 'days' THEN p_last_service_date + (p_interval_value || ' days')::interval
    WHEN 'weeks' THEN p_last_service_date + (p_interval_value || ' weeks')::interval
    WHEN 'months' THEN p_last_service_date + (p_interval_value || ' months')::interval
    WHEN 'years' THEN p_last_service_date + (p_interval_value || ' years')::interval
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to automatically update next_service_date when last_service_date or interval changes
CREATE OR REPLACE FUNCTION update_farm_equipment_item_next_service_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.next_service_date := calculate_next_service_date(
    NEW.last_service_date,
    NEW.service_interval_value,
    NEW.service_interval_type
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER farm_equipment_items_update_next_service
  BEFORE INSERT OR UPDATE OF last_service_date, service_interval_value, service_interval_type
  ON public.farm_equipment_items
  FOR EACH ROW
  EXECUTE FUNCTION update_farm_equipment_item_next_service_date();

-- Trigger to automatically update last_service_date when a service record is created
CREATE OR REPLACE FUNCTION update_last_service_date_on_new_record()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.farm_equipment_items
  SET last_service_date = NEW.service_date
  WHERE id = NEW.farm_equipment_item_id
    AND (last_service_date IS NULL OR NEW.service_date > last_service_date);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER farm_equipment_service_records_update_last_service
  AFTER INSERT ON public.farm_equipment_service_records
  FOR EACH ROW
  EXECUTE FUNCTION update_last_service_date_on_new_record();

-- Update timestamp trigger for farm_equipment
CREATE TRIGGER farm_equipment_update_timestamp
  BEFORE UPDATE ON public.farm_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for farm_equipment_service_records
CREATE TRIGGER farm_equipment_service_records_update_timestamp
  BEFORE UPDATE ON public.farm_equipment_service_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- View for equipment with item counts and status
CREATE OR REPLACE VIEW public.farm_equipment_summary AS
SELECT 
  fe.id,
  fe.name,
  fe.description,
  fe.location,
  fe.category,
  fe.is_active,
  COUNT(fei.id) as total_items,
  COUNT(fei.id) FILTER (WHERE fei.is_active = true) as active_items,
  COUNT(fei.id) FILTER (WHERE fei.next_service_date < CURRENT_DATE) as overdue_items,
  COUNT(fei.id) FILTER (WHERE fei.next_service_date BETWEEN CURRENT_DATE AND CURRENT_DATE + fei.reminder_days_before) as upcoming_items,
  MIN(fei.next_service_date) as next_service_due,
  fe.created_at,
  fe.updated_at
FROM public.farm_equipment fe
LEFT JOIN public.farm_equipment_items fei ON fei.farm_equipment_id = fe.id
WHERE fe.is_active = true
GROUP BY fe.id, fe.name, fe.description, fe.location, fe.category, fe.is_active, fe.created_at, fe.updated_at
ORDER BY fe.name;

-- View for items with their equipment info and service status
CREATE OR REPLACE VIEW public.farm_equipment_items_detail AS
SELECT 
  fei.id,
  fei.farm_equipment_id,
  fe.name as equipment_name,
  fe.location as equipment_location,
  fe.category as equipment_category,
  fei.item_name,
  fei.description,
  fei.service_interval_value,
  fei.service_interval_type,
  fei.reminder_days_before,
  fei.last_service_date,
  fei.next_service_date,
  fei.is_active,
  fei.notes,
  -- Calculate days until next service
  CASE 
    WHEN fei.next_service_date IS NULL THEN NULL
    ELSE fei.next_service_date - CURRENT_DATE
  END as days_until_service,
  -- Service status
  CASE 
    WHEN fei.next_service_date IS NULL THEN 'not_scheduled'
    WHEN fei.next_service_date < CURRENT_DATE THEN 'overdue'
    WHEN fei.next_service_date BETWEEN CURRENT_DATE AND CURRENT_DATE + fei.reminder_days_before THEN 'upcoming'
    ELSE 'ok'
  END as service_status,
  -- Count of service records
  (SELECT COUNT(*) FROM public.farm_equipment_service_records WHERE farm_equipment_item_id = fei.id) as service_count,
  fei.created_at,
  fei.updated_at
FROM public.farm_equipment_items fei
JOIN public.farm_equipment fe ON fe.id = fei.farm_equipment_id
WHERE fei.is_active = true
ORDER BY fei.next_service_date NULLS LAST, fe.name, fei.item_name;

-- RLS Policies
ALTER TABLE public.farm_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_service_parts ENABLE ROW LEVEL SECURITY;

-- Farm equipment policies
CREATE POLICY "Users can view farm equipment" ON public.farm_equipment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert farm equipment" ON public.farm_equipment
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update farm equipment" ON public.farm_equipment
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can delete farm equipment" ON public.farm_equipment
  FOR DELETE TO authenticated USING (true);

-- Farm equipment items policies
CREATE POLICY "Users can view farm equipment items" ON public.farm_equipment_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert farm equipment items" ON public.farm_equipment_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update farm equipment items" ON public.farm_equipment_items
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can delete farm equipment items" ON public.farm_equipment_items
  FOR DELETE TO authenticated USING (true);

-- Service records policies
CREATE POLICY "Users can view service records" ON public.farm_equipment_service_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert service records" ON public.farm_equipment_service_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update service records" ON public.farm_equipment_service_records
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can delete service records" ON public.farm_equipment_service_records
  FOR DELETE TO authenticated USING (true);

-- Service parts policies
CREATE POLICY "Users can view service parts" ON public.farm_equipment_service_parts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert service parts" ON public.farm_equipment_service_parts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update service parts" ON public.farm_equipment_service_parts
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can delete service parts" ON public.farm_equipment_service_parts
  FOR DELETE TO authenticated USING (true);

-- Grant permissions
GRANT ALL ON public.farm_equipment TO authenticated;
GRANT ALL ON public.farm_equipment_items TO authenticated;
GRANT ALL ON public.farm_equipment_service_records TO authenticated;
GRANT ALL ON public.farm_equipment_service_parts TO authenticated;
GRANT SELECT ON public.farm_equipment_summary TO authenticated;
GRANT SELECT ON public.farm_equipment_items_detail TO authenticated;

GRANT ALL ON public.farm_equipment TO service_role;
GRANT ALL ON public.farm_equipment_items TO service_role;
GRANT ALL ON public.farm_equipment_service_records TO service_role;
GRANT ALL ON public.farm_equipment_service_parts TO service_role;
GRANT SELECT ON public.farm_equipment_summary TO service_role;
GRANT SELECT ON public.farm_equipment_items_detail TO service_role;
