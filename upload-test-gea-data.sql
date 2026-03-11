-- Upload test GEA data for animal LT000008564340
-- Run this in Supabase SQL Editor

SELECT gea_daily_upload('{
  "meta": {
    "counts": {
      "ataskaita1": 1,
      "ataskaita2": 1,
      "ataskaita3": 1
    },
    "markers": {
      "i1": 1,
      "i2": 2,
      "i3": 3
    }
  },
  "ataskaita1": [
    {
      "cow_number": "LT000008564340",
      "ear_number": "8564340",
      "cow_state": "MELŽ",
      "group_number": "1",
      "pregnant_since": null,
      "lactation_days": 145,
      "inseminated_at": null,
      "pregnant_days": null,
      "next_pregnancy_date": null,
      "days_until_waiting_pregnancy": null
    }
  ],
  "ataskaita2": [
    {
      "cow_number": "LT000008564340",
      "genetic_worth": "VG-84",
      "blood_line": "Holstein",
      "avg_milk_prod_weight": "26.8",
      "produce_milk": "Taip",
      "last_milking_date": "2026-02-04",
      "last_milking_time": "06:15",
      "last_milking_weight": "13.5",
      "milking_date_1": "2026-02-04",
      "milking_time_1": "06:15",
      "milking_weight_1": "13.5",
      "milking_date_2": "2026-02-03",
      "milking_time_2": "18:10",
      "milking_weight_2": "13.3",
      "milking_date_3": "2026-02-03",
      "milking_time_3": "06:20",
      "milking_weight_3": "13.8",
      "milking_date_4": "2026-02-02",
      "milking_time_4": "18:05",
      "milking_weight_4": "13.1",
      "milking_date_5": "2026-02-02",
      "milking_time_5": "06:10",
      "milking_weight_5": "13.6",
      "milking_date_6": "2026-02-01",
      "milking_time_6": "18:15",
      "milking_weight_6": "13.4",
      "milking_date_7": "2026-02-01",
      "milking_time_7": "06:25",
      "milking_weight_7": "13.7"
    }
  ],
  "ataskaita3": [
    {
      "cow_number": "LT000008564340",
      "teat_missing_right_back": "Ne",
      "teat_missing_back_left": "Ne",
      "teat_missing_front_left": "Ne",
      "teat_missing_front_right": "Ne",
      "insemination_count": 0,
      "bull_1": null,
      "bull_2": null,
      "bull_3": null,
      "lactation_number": 2
    }
  ]
}'::jsonb) AS upload_result;

-- The upload_result will show:
-- {
--   "import_id": "uuid-here",
--   "counts": {
--     "ataskaita1": 1,
--     "ataskaita2": 1,
--     "ataskaita3": 1
--   }
-- }

-- Now verify the data was inserted
SELECT 
  id,
  created_at,
  count_ataskaita1,
  count_ataskaita2,
  count_ataskaita3
FROM gea_daily_imports
ORDER BY created_at DESC
LIMIT 1;

-- Check the joined view (this is what the frontend queries)
SELECT 
  cow_number,
  cow_state,
  lactation_days,
  avg_milk_prod_weight,
  produce_milk,
  insemination_count,
  lactation_number
FROM gea_daily_cows_joined
WHERE cow_number = 'LT000008564340';
