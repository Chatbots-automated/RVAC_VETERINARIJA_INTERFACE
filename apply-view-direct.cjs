const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const viewSql = `
CREATE OR REPLACE VIEW vw_treated_animals_detailed AS
SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) as disease_name,
    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,
    p.name as product_name,
    CONCAT(ui.qty, ' ', ui.unit) as dose,
    COALESCE(
        (SELECT MAX(tc.days)
         FROM treatment_courses tc
         WHERE tc.treatment_id = t.id),
        1
    ) as treatment_days,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    'ARTŪRAS ABROMAITIS' as veterinarian,
    t.notes,
    'usage_item' as medication_source
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN usage_items ui ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id

UNION ALL

SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) as disease_name,
    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,
    p.name as product_name,
    CONCAT(tc.total_dose, ' ', tc.unit) as dose,
    tc.days as treatment_days,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    'ARTŪRAS ABROMAITIS' as veterinarian,
    t.notes,
    'treatment_course' as medication_source
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN treatment_courses tc ON tc.treatment_id = t.id
INNER JOIN products p ON tc.product_id = p.id

UNION ALL

SELECT
    t.id as treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        NULLIF(TRIM(t.animal_condition), ''),
        'Nespecifikuota liga'
    ) as disease_name,
    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,
    p.name as product_name,
    CONCAT((med->>'qty')::text, ' ', med->>'unit') as dose,
    COALESCE(
        (SELECT MAX(tc.days)
         FROM treatment_courses tc
         WHERE tc.treatment_id = t.id),
        1
    ) as treatment_days,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    'ARTŪRAS ABROMAITIS' as veterinarian,
    t.notes,
    'planned_medication' as medication_source
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN animal_visits av ON av.id = t.visit_id
CROSS JOIN jsonb_array_elements(av.planned_medications::jsonb) as med
INNER JOIN products p ON p.id = (med->>'product_id')::uuid
WHERE av.planned_medications IS NOT NULL
  AND jsonb_array_length(av.planned_medications::jsonb) > 0

ORDER BY registration_date DESC
`;

(async () => {
  try {
    console.log('Please run the following SQL in Supabase SQL Editor:');
    console.log('='.repeat(80));
    console.log(viewSql);
    console.log('='.repeat(80));

    console.log('\nOr copy from file: fix-treated-animals-view.sql');

    console.log('\nAfter applying, testing current view...');
    const { data, error } = await supabase
      .from('vw_treated_animals_detailed')
      .select('treatment_id, disease_name, treatment_days, medication_source')
      .limit(10);

    if (error) {
      console.log('\n⚠️  View not yet updated. Please apply the SQL above.');
      process.exit(1);
    }

    console.log('\nCurrent sample data:');
    data?.forEach(d => {
      console.log(`  ${d.disease_name || 'NULL'} - ${d.treatment_days}d - ${d.medication_source}`);
    });

    const emptyCount = data?.filter(d => !d.disease_name).length || 0;
    if (emptyCount > 0) {
      console.log(`\n⚠️  Found ${emptyCount} rows with empty disease. Please apply the migration.`);
    } else {
      console.log('\n✓ View is already up to date!');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
