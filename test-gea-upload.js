// Test script to upload sample GEA data
// Run: node test-gea-upload.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

// Sample payload matching your GEA structure
const samplePayload = {
  meta: {
    counts: {
      ataskaita1: 2,
      ataskaita2: 2,
      ataskaita3: 2
    },
    markers: {
      i1: 1,
      i2: 2,
      i3: 3
    }
  },
  ataskaita1: [
    {
      cow_number: 'LT825',
      ear_number: '825',
      cow_state: 'APSĖK',
      group_number: '1',
      pregnant_since: '2026-01-15',
      lactation_days: 120,
      inseminated_at: '2026-01-15',
      pregnant_days: 20,
      next_pregnancy_date: '2026-10-25',
      days_until_waiting_pregnancy: 263
    },
    {
      cow_number: 'LT826',
      ear_number: '826',
      cow_state: 'MELŽ',
      group_number: '2',
      pregnant_since: null,
      lactation_days: 85,
      inseminated_at: null,
      pregnant_days: null,
      next_pregnancy_date: null,
      days_until_waiting_pregnancy: null
    }
  ],
  ataskaita2: [
    {
      cow_number: 'LT825',
      genetic_worth: 'VG-85',
      blood_line: 'Holstein',
      avg_milk_prod_weight: '28.5',
      produce_milk: 'Taip',
      last_milking_date: '2026-02-04',
      last_milking_time: '06:30',
      last_milking_weight: '14.2',
      milking_date_1: '2026-02-04',
      milking_time_1: '06:30',
      milking_weight_1: '14.2',
      milking_date_2: '2026-02-03',
      milking_time_2: '18:15',
      milking_weight_2: '13.8',
      milking_date_3: '2026-02-03',
      milking_time_3: '06:20',
      milking_weight_3: '14.5',
      milking_date_4: '2026-02-02',
      milking_time_4: '18:10',
      milking_weight_4: '13.9',
      milking_date_5: '2026-02-02',
      milking_time_5: '06:25',
      milking_weight_5: '14.1'
    },
    {
      cow_number: 'LT826',
      genetic_worth: 'VG-82',
      blood_line: 'Holstein',
      avg_milk_prod_weight: '32.1',
      produce_milk: 'Taip',
      last_milking_date: '2026-02-04',
      last_milking_time: '06:35',
      last_milking_weight: '16.5',
      milking_date_1: '2026-02-04',
      milking_time_1: '06:35',
      milking_weight_1: '16.5',
      milking_date_2: '2026-02-03',
      milking_time_2: '18:20',
      milking_weight_2: '15.6'
    }
  ],
  ataskaita3: [
    {
      cow_number: 'LT825',
      teat_missing_right_back: 'Ne',
      teat_missing_back_left: 'Ne',
      teat_missing_front_left: 'Ne',
      teat_missing_front_right: 'Ne',
      insemination_count: 2,
      bull_1: 'BULL-2024-A',
      bull_2: 'BULL-2023-B',
      bull_3: null,
      lactation_number: 3
    },
    {
      cow_number: 'LT826',
      teat_missing_right_back: 'Ne',
      teat_missing_back_left: 'Taip',
      teat_missing_front_left: 'Ne',
      teat_missing_front_right: 'Ne',
      insemination_count: 1,
      bull_1: 'BULL-2024-C',
      bull_2: null,
      bull_3: null,
      lactation_number: 2
    }
  ]
};

async function testUpload() {
  console.log('🚀 Testing GEA upload...');
  
  try {
    const { data, error } = await supabase.rpc('gea_daily_upload', { payload: samplePayload });
    
    if (error) {
      console.error('❌ Upload failed:', error);
      return;
    }
    
    console.log('✅ Upload successful!');
    console.log('Import ID:', data.import_id);
    console.log('Counts:', data.counts);
    
    // Verify data
    console.log('\n📊 Verifying data...');
    const { data: joinedData, error: joinError } = await supabase
      .from('gea_daily_cows_joined')
      .select('*')
      .eq('import_id', data.import_id);
    
    if (joinError) {
      console.error('❌ Query failed:', joinError);
      return;
    }
    
    console.log('✅ Found', joinedData.length, 'cows in joined view');
    console.log('Cows:', joinedData.map(c => c.cow_number).join(', '));
    
    console.log('\n🎉 Success! Now open the animal detail sidebar for LT825 or LT826 to see the new 3-tab interface!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testUpload();
