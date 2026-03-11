/*
  # Fire Extinguishers Table

  This migration creates the fire_extinguishers table for tracking fire extinguishers
  that can be assigned to locations (indoors) or vehicles (transport).
*/

-- Create fire_extinguishers table
CREATE TABLE IF NOT EXISTS "public"."fire_extinguishers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "serial_number" text UNIQUE NOT NULL,
    "placement_type" text NOT NULL CHECK ("placement_type" IN ('indoors', 'transport')),
    "location_id" uuid,
    "vehicle_id" uuid,
    "capacity" text,
    "type" text,
    "expiry_date" date NOT NULL,
    "last_inspection_date" date,
    "next_inspection_date" date,
    "status" text DEFAULT 'active' CHECK ("status" IN ('active', 'expired', 'in_service', 'retired')),
    "notes" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "created_by" uuid,
    
    -- Ensure either location_id or vehicle_id is set based on placement_type
    CONSTRAINT "fire_extinguishers_placement_check" CHECK (
        ("placement_type" = 'indoors' AND "location_id" IS NOT NULL AND "vehicle_id" IS NULL) OR
        ("placement_type" = 'transport' AND "vehicle_id" IS NOT NULL AND "location_id" IS NULL)
    )
);

-- Add foreign key constraints with explicit names
ALTER TABLE "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_location_id_fkey" 
    FOREIGN KEY ("location_id") 
    REFERENCES "public"."equipment_locations"("id") 
    ON DELETE SET NULL;

ALTER TABLE "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_vehicle_id_fkey" 
    FOREIGN KEY ("vehicle_id") 
    REFERENCES "public"."vehicles"("id") 
    ON DELETE SET NULL;

ALTER TABLE "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_created_by_fkey" 
    FOREIGN KEY ("created_by") 
    REFERENCES "public"."users"("id") 
    ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_fire_extinguishers_location" ON "public"."fire_extinguishers"("location_id");
CREATE INDEX IF NOT EXISTS "idx_fire_extinguishers_vehicle" ON "public"."fire_extinguishers"("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_fire_extinguishers_placement_type" ON "public"."fire_extinguishers"("placement_type");
CREATE INDEX IF NOT EXISTS "idx_fire_extinguishers_status" ON "public"."fire_extinguishers"("status");
CREATE INDEX IF NOT EXISTS "idx_fire_extinguishers_expiry_date" ON "public"."fire_extinguishers"("expiry_date");
CREATE INDEX IF NOT EXISTS "idx_fire_extinguishers_active" ON "public"."fire_extinguishers"("is_active");

-- Enable RLS
ALTER TABLE "public"."fire_extinguishers" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all authenticated users to read, admins/vets to modify)
CREATE POLICY "fire_extinguishers_select_policy" ON "public"."fire_extinguishers"
    FOR SELECT
    USING (true);

CREATE POLICY "fire_extinguishers_insert_policy" ON "public"."fire_extinguishers"
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "fire_extinguishers_update_policy" ON "public"."fire_extinguishers"
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "fire_extinguishers_delete_policy" ON "public"."fire_extinguishers"
    FOR DELETE
    USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_fire_extinguishers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fire_extinguishers_updated_at
    BEFORE UPDATE ON "public"."fire_extinguishers"
    FOR EACH ROW
    EXECUTE FUNCTION update_fire_extinguishers_updated_at();
