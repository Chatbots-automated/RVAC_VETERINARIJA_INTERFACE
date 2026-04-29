-- Check what columns the view has
SELECT string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY ordinal_position) as all_columns
FROM information_schema.columns
WHERE table_name = 'vw_treated_animals_detailed';
