import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Extract project ref from URL for connection string
const projectRef = process.env.VITE_SUPABASE_URL.match(/https:\/\/(.+)\.supabase\.co/)[1];
const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const statements = [
  `CREATE OR REPLACE FUNCTION calculate_average_daily_milk(
    p_animal_id uuid,
    p_before_date date DEFAULT CURRENT_DATE
  )
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_avg_milk numeric;
  BEGIN
    SELECT COALESCE(
      AVG(
        COALESCE(m1_qty, 0) +
        COALESCE(m2_qty, 0) +
        COALESCE(m3_qty, 0) +
        COALESCE(m4_qty, 0) +
        COALESCE(m5_qty, 0)
      ),
      0
    )
    INTO v_avg_milk
    FROM gea_daily
    WHERE animal_id = p_animal_id
      AND snapshot_date < p_before_date
      AND snapshot_date >= (p_before_date - INTERVAL '7 days')
      AND (
        COALESCE(m1_qty, 0) +
        COALESCE(m2_qty, 0) +
        COALESCE(m3_qty, 0) +
        COALESCE(m4_qty, 0) +
        COALESCE(m5_qty, 0)
      ) > 0;

    RETURN COALESCE(v_avg_milk, 0);
  END;
  $$`,

  `CREATE OR REPLACE FUNCTION get_animal_avg_milk_at_date(
    p_animal_id uuid,
    p_date date
  )
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_avg_milk numeric;
  BEGIN
    SELECT COALESCE(
      AVG(
        COALESCE(m1_qty, 0) +
        COALESCE(m2_qty, 0) +
        COALESCE(m3_qty, 0) +
        COALESCE(m4_qty, 0) +
        COALESCE(m5_qty, 0)
      ),
      0
    )
    INTO v_avg_milk
    FROM gea_daily
    WHERE animal_id = p_animal_id
      AND snapshot_date < p_date
      AND snapshot_date >= (p_date - INTERVAL '7 days')
      AND (
        COALESCE(m1_qty, 0) +
        COALESCE(m2_qty, 0) +
        COALESCE(m3_qty, 0) +
        COALESCE(m4_qty, 0) +
        COALESCE(m5_qty, 0)
      ) > 0;

    IF v_avg_milk = 0 THEN
      SELECT COALESCE(
        (
          COALESCE(m1_qty, 0) +
          COALESCE(m2_qty, 0) +
          COALESCE(m3_qty, 0) +
          COALESCE(m4_qty, 0) +
          COALESCE(m5_qty, 0)
        ),
        0
      )
      INTO v_avg_milk
      FROM gea_daily
      WHERE animal_id = p_animal_id
        AND snapshot_date <= p_date
        AND (
          COALESCE(m1_qty, 0) +
          COALESCE(m2_qty, 0) +
          COALESCE(m3_qty, 0) +
          COALESCE(m4_qty, 0) +
          COALESCE(m5_qty, 0)
        ) > 0
      ORDER BY snapshot_date DESC
      LIMIT 1;
    END IF;

    RETURN COALESCE(v_avg_milk, 0);
  END;
  $$`
];

async function applyMigration() {
  console.log('Applying 7-day milk loss calculation fix...\n');

  try {
    for (let i = 0; i < statements.length; i++) {
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      const { error } = await supabase.rpc('exec', { sql: statements[i] });

      if (error) {
        throw error;
      }
    }

    console.log('\n✓ Migration applied successfully!');
    console.log('\nChanges made:');
    console.log('- calculate_average_daily_milk() now uses 7-day actual production average');
    console.log('- get_animal_avg_milk_at_date() now uses 7-day actual production average');
    console.log('- Both functions sum actual milkings (m1+m2+m3+m4+m5) instead of averaging milk_avg');
    console.log('\nResult: Milk loss calculations will now be consistent and accurate across all sections.');
  } catch (error) {
    console.error('\nMigration failed:', error.message || error);
    process.exit(1);
  }
}

applyMigration();
