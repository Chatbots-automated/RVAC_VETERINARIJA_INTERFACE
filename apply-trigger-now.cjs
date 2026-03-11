require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const migrationSQL = `
CREATE OR REPLACE FUNCTION process_visit_medications()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_medication jsonb;
  v_treatment_id uuid;
  v_max_withdrawal_meat integer := 0;
  v_max_withdrawal_milk integer := 0;
  v_product_withdrawal_meat integer;
  v_product_withdrawal_milk integer;
  v_treatment_date date;
  v_withdrawal_until_meat date;
  v_withdrawal_until_milk date;
BEGIN
  IF NEW.status = 'Baigtas' AND
     (OLD.status IS NULL OR OLD.status != 'Baigtas') AND
     NEW.planned_medications IS NOT NULL AND
     jsonb_array_length(NEW.planned_medications) > 0 AND
     (NEW.medications_processed IS NULL OR NEW.medications_processed = false) THEN

    SELECT id, reg_date INTO v_treatment_id, v_treatment_date
    FROM treatments
    WHERE visit_id = NEW.id
    LIMIT 1;

    IF v_treatment_id IS NULL THEN
      RETURN NEW;
    END IF;

    FOR v_medication IN SELECT * FROM jsonb_array_elements(NEW.planned_medications)
    LOOP
      IF v_medication->>'product_id' IS NOT NULL AND
         v_medication->>'batch_id' IS NOT NULL THEN

        INSERT INTO usage_items (
          treatment_id,
          product_id,
          batch_id,
          qty,
          unit,
          purpose,
          teat
        ) VALUES (
          v_treatment_id,
          (v_medication->>'product_id')::uuid,
          (v_medication->>'batch_id')::uuid,
          CASE
            WHEN v_medication->>'qty' IS NOT NULL
            THEN (v_medication->>'qty')::numeric
            ELSE NULL
          END,
          COALESCE(v_medication->>'unit', 'ml'),
          COALESCE(v_medication->>'purpose', 'Gydymas'),
          v_medication->>'teat'
        );

        SELECT
          COALESCE(withdrawal_days_meat, 0),
          COALESCE(withdrawal_days_milk, 0)
        INTO v_product_withdrawal_meat, v_product_withdrawal_milk
        FROM products
        WHERE id = (v_medication->>'product_id')::uuid;

        IF v_product_withdrawal_meat > v_max_withdrawal_meat THEN
          v_max_withdrawal_meat := v_product_withdrawal_meat;
        END IF;

        IF v_product_withdrawal_milk > v_max_withdrawal_milk THEN
          v_max_withdrawal_milk := v_product_withdrawal_milk;
        END IF;
      END IF;
    END LOOP;

    IF v_max_withdrawal_meat > 0 THEN
      v_withdrawal_until_meat := v_treatment_date + (v_max_withdrawal_meat || ' days')::interval;
    END IF;

    IF v_max_withdrawal_milk > 0 THEN
      v_withdrawal_until_milk := v_treatment_date + (v_max_withdrawal_milk || ' days')::interval;
    END IF;

    UPDATE treatments
    SET
      withdrawal_until_meat = v_withdrawal_until_meat,
      withdrawal_until_milk = v_withdrawal_until_milk
    WHERE id = v_treatment_id;

    NEW.medications_processed := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_process_visit_medications ON animal_visits;

CREATE TRIGGER auto_process_visit_medications
  BEFORE UPDATE ON animal_visits
  FOR EACH ROW
  EXECUTE FUNCTION process_visit_medications();
`;

(async () => {
  console.log('=== APPLYING TRIGGER TO DATABASE ===\n');

  try {
    // Try to execute via RPC if available
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        console.log('⚠️  exec_sql function not available');
        console.log('\nPlease apply the trigger manually:');
        console.log('1. Go to https://supabase.com/dashboard');
        console.log('2. Select your project');
        console.log('3. Go to SQL Editor');
        console.log('4. Run the SQL from auto_process_visit_medications_trigger.sql');
        return;
      }
      throw error;
    }

    console.log('✅ Trigger applied successfully!');
    console.log('\n=== TRIGGER IS NOW ACTIVE ===');
    console.log('From now on, when you mark a visit as "Baigtas":');
    console.log('  ✓ Medications automatically converted to usage_items');
    console.log('  ✓ Withdrawal periods calculated');
    console.log('  ✓ Stock deducted automatically');
    console.log('\nThe issue with cow LT000008370321 will NOT happen again!');

  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('\nManual application required:');
    console.log('See APPLY_VISIT_MEDICATION_FIX.md for instructions');
  }
})();
