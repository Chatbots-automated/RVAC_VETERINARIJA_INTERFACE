-- Upload test GEA data for a pregnant (APSĖK) cow
-- First, let's find a cow to use (run this first to get a tag_no)

-- Find an available animal tag_no
SELECT id, tag_no, name 
FROM animals 
WHERE tag_no IS NOT NULL 
  AND tag_no != 'LT000008564340'
LIMIT 5;

-- Then use one of those tag_no values below (replace LT000008564341 with actual tag_no)
-- This example shows an APSĖK (pregnant) cow with special highlighting

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
      "cow_number": "LT000008564341",
      "ear_number": "8564341",
      "cow_state": "APSĖK",
      "group_number": "2",
      "pregnant_since": "2025-12-10",
      "lactation_days": 95,
      "inseminated_at": "2025-12-10",
      "pregnant_days": 56,
      "next_pregnancy_date": "2026-09-20",
      "days_until_waiting_pregnancy": 227
    }
  ],
  "ataskaita2": [
    {
      "cow_number": "LT000008564341",
      "genetic_worth": "VG-86",
      "blood_line": "Holstein",
      "avg_milk_prod_weight": "31.2",
      "produce_milk": "Taip",
      "last_milking_date": "2026-02-04",
      "last_milking_time": "06:20",
      "last_milking_weight": "15.8",
      "milking_date_1": "2026-02-04",
      "milking_time_1": "06:20",
      "milking_weight_1": "15.8",
      "milking_date_2": "2026-02-03",
      "milking_time_2": "18:15",
      "milking_weight_2": "15.4",
      "milking_date_3": "2026-02-03",
      "milking_time_3": "06:25",
      "milking_weight_3": "16.1",
      "milking_date_4": "2026-02-02",
      "milking_time_4": "18:10",
      "milking_weight_4": "15.6",
      "milking_date_5": "2026-02-02",
      "milking_time_5": "06:15",
      "milking_weight_5": "15.9"
    }
  ],
  "ataskaita3": [
    {
      "cow_number": "LT000008564341",
      "teat_missing_right_back": "Ne",
      "teat_missing_back_left": "Ne",
      "teat_missing_front_left": "Ne",
      "teat_missing_front_right": "Ne",
      "insemination_count": 2,
      "bull_1": "BULL-2025-A",
      "bull_2": "BULL-2024-B",
      "bull_3": null,
      "lactation_number": 3
    }
  ]
}'::jsonb) AS upload_result;

-- The upload_result will show the import_id and counts

-- Verify the upload in joined view
SELECT 
  cow_number,
  cow_state,
  pregnant_since,
  pregnant_days,
  lactation_days,
  avg_milk_prod_weight,
  insemination_count,
  bull_1,
  bull_2
FROM gea_daily_cows_joined
WHERE cow_number = 'LT000008564341';
