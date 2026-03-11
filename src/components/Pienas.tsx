import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Beaker, ChevronDown, ChevronUp, Calendar, Weight, Sunrise, Moon } from 'lucide-react';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';

interface MilkWeight {
  id: string;
  date: string;
  session_type: 'rytinis' | 'naktinis';
  weight: number;
  session_id: string | null;
  measurement_timestamp: string;
  timezone: string | null;
  hose_status: string | null;
  stable_status: boolean | null;
  event_type: string | null;
  created_at: string;
  updated_at: string;
  composition_test?: {
    fat_percentage?: number;
    protein_percentage?: number;
    lactose_percentage?: number;
    urea_mg_100ml?: number;
    ph_level?: number;
  };
  quality_test?: {
    somatic_cell_count?: number;
    total_bacteria_count?: number;
  };
}

interface DailyMilkWeights {
  date: string;
  rytinis: MilkWeight | null;
  naktinis: MilkWeight | null;
  total: number;
  rytinisEvents: MilkWeight[];
  naktinisEvents: MilkWeight[];
}

interface MilkProducer {
  id: string;
  gamintojo_id: string;
  gamintojas_code: string;
  label: string;
  imone: string;
  rajonas: string;
  punktas: string;
  updated_at: string;
}

interface MilkCompositionTest {
  id: string;
  producer_id: string;
  paemimo_data: string;
  tyrimo_data: string;
  riebalu_kiekis?: number;
  baltymu_kiekis?: number;
  laktozes_kiekis?: number;
  ureja_mg_100ml?: number;
  ph?: number;
  pastaba?: string;
  konteineris: string;
  prot_nr: string;
}

interface MilkQualityTest {
  id: string;
  producer_id: string;
  paemimo_data: string;
  tyrimo_data: string;
  somatiniu_lasteliu_skaicius?: number;
  bendras_bakteriju_skaicius?: number;
  neatit_pst?: string;
  konteineris: string;
  prot_nr: string;
}

interface ProducerWithTests {
  producer: MilkProducer;
  compositionTests: MilkCompositionTest[];
  qualityTests: MilkQualityTest[];
}

interface UnifiedTest {
  paemimo_data: string;
  tyrimo_data: string;
  konteineris: string;
  prot_nr: string;
  composition?: MilkCompositionTest;
  quality?: MilkQualityTest;
}

export function Pienas() {
  const [labTestData, setLabTestData] = useState<ProducerWithTests[]>([]);
  const [milkWeights, setMilkWeights] = useState<DailyMilkWeights[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightsLoading, setWeightsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const loadMilkWeights = async () => {
    console.log('[Pienas] loadMilkWeights called');
    setWeightsLoading(true);

    // Load milk weights
    const { data: weights, error } = await supabase
      .from('milk_weights')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false });

    console.log('[Pienas] Milk weights response:', { count: weights?.length || 0, error, weights });

    if (error) {
      console.error('[Pienas] Error loading milk weights:', error);
      setWeightsLoading(false);
      return;
    }

    if (!weights) {
      setMilkWeights([]);
      setWeightsLoading(false);
      return;
    }

    // Load test data separately
    const { data: testData } = await supabase
      .from('milk_data_combined')
      .select('date, session_type, composition_test_id, fat_percentage, protein_percentage, lactose_percentage, urea_mg_100ml, ph_level, quality_test_id, somatic_cell_count, total_bacteria_count')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .not('composition_test_id', 'is', null);

    console.log('[Pienas] Test data loaded:', { count: testData?.length || 0 });

    // Create a map of date+session -> test data
    const testMap = new Map<string, { composition_test?: any; quality_test?: any }>();
    testData?.forEach(row => {
      const key = `${row.date}_${row.session_type}`;
      if (!testMap.has(key)) {
        testMap.set(key, {
          composition_test: row.composition_test_id ? {
            fat_percentage: row.fat_percentage,
            protein_percentage: row.protein_percentage,
            lactose_percentage: row.lactose_percentage,
            urea_mg_100ml: row.urea_mg_100ml,
            ph_level: row.ph_level,
          } : undefined,
          quality_test: row.quality_test_id ? {
            somatic_cell_count: row.somatic_cell_count,
            total_bacteria_count: row.total_bacteria_count,
          } : undefined,
        });
      }
    });

    console.log('[Pienas] Test map created with', testMap.size, 'entries');

    // Enrich weights with test data
    const enrichedWeights: MilkWeight[] = weights.map(w => {
      const key = `${w.date}_${w.session_type}`;
      const tests = testMap.get(key);
      return {
        ...w,
        composition_test: tests?.composition_test,
        quality_test: tests?.quality_test,
      };
    });

    console.log('[Pienas] Enriched weights:', enrichedWeights.filter(w => w.composition_test).length, 'have composition test data');

    const dailyWeightsMap = new Map<string, DailyMilkWeights>();

    // Group weights by date and session_type, keeping all events
    const sessionGroups = new Map<string, MilkWeight[]>();
    enrichedWeights.forEach((weight) => {
      const key = `${weight.date}_${weight.session_type}`;
      if (!sessionGroups.has(key)) {
        sessionGroups.set(key, []);
      }
      sessionGroups.get(key)!.push(weight);
    });

    // For each session, find the event with maximum weight and store all events
    sessionGroups.forEach((events, key) => {
      // Sort events by timestamp
      events.sort((a, b) =>
        new Date(a.measurement_timestamp).getTime() - new Date(b.measurement_timestamp).getTime()
      );

      const maxWeightEvent = events.reduce((max, event) =>
        event.weight > max.weight ? event : max
      );

      const dateKey = maxWeightEvent.date;
      if (!dailyWeightsMap.has(dateKey)) {
        dailyWeightsMap.set(dateKey, {
          date: dateKey,
          rytinis: null,
          naktinis: null,
          rytinisEvents: [],
          naktinisEvents: [],
          total: 0,
        });
      }

      const daily = dailyWeightsMap.get(dateKey)!;
      if (maxWeightEvent.session_type === 'rytinis') {
        daily.rytinis = maxWeightEvent;
        daily.rytinisEvents = events;
      } else {
        daily.naktinis = maxWeightEvent;
        daily.naktinisEvents = events;
      }
    });

    dailyWeightsMap.forEach((daily) => {
      daily.total = (daily.rytinis?.weight || 0) + (daily.naktinis?.weight || 0);
    });

    const dailyWeightsArray = Array.from(dailyWeightsMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    console.log('[Pienas] Processed daily weights:', dailyWeightsArray);
    console.log('[Pienas] Test data check:', dailyWeightsArray.map(d => ({
      date: d.date,
      rytinisTest: !!d.rytinis?.composition_test,
      naktinisTest: !!d.naktinis?.composition_test,
      rytinisTestData: d.rytinis?.composition_test,
      naktinisTestData: d.naktinis?.composition_test,
    })));
    setMilkWeights(dailyWeightsArray);
    setWeightsLoading(false);
  };

  const loadLabTests = async () => {
    console.log('[Pienas] loadLabTests called');
    const { data: producers, error: producersError } = await supabase
      .from('milk_producers')
      .select('*')
      .order('updated_at', { ascending: false });

    console.log('[Pienas] Producers response:', {
      producersCount: producers?.length || 0,
      error: producersError,
      producers
    });

    if (producersError || !producers) {
      console.error('[Pienas] Error loading producers:', producersError);
      return;
    }

    const producersWithTests: ProducerWithTests[] = await Promise.all(
      producers.map(async (producer) => {
        console.log(`[Pienas] Loading tests for producer ${producer.gamintojo_id}`);

        const { data: compositionTests, error: compError } = await supabase
          .from('milk_composition_tests')
          .select('*')
          .eq('producer_id', producer.id)
          .order('tyrimo_data', { ascending: false })
          .limit(10);

        console.log(`[Pienas] Composition tests for ${producer.gamintojo_id}:`, {
          count: compositionTests?.length || 0,
          error: compError,
          tests: compositionTests
        });

        const { data: qualityTests, error: qualError } = await supabase
          .from('milk_quality_tests')
          .select('*')
          .eq('producer_id', producer.id)
          .order('tyrimo_data', { ascending: false })
          .limit(10);

        console.log(`[Pienas] Quality tests for ${producer.gamintojo_id}:`, {
          count: qualityTests?.length || 0,
          error: qualError,
          tests: qualityTests
        });

        return {
          producer,
          compositionTests: compositionTests || [],
          qualityTests: qualityTests || []
        };
      })
    );

    console.log('[Pienas] Final data:', {
      producersWithTests,
      totalProducers: producersWithTests.length
    });
    setLabTestData(producersWithTests);
  };

  useRealtimeSubscription('milk_producers', loadLabTests);
  useRealtimeSubscription('milk_composition_tests', loadLabTests);
  useRealtimeSubscription('milk_quality_tests', loadLabTests);
  useRealtimeSubscription('milk_weights', loadMilkWeights);

  useEffect(() => {
    console.log('[Pienas] useEffect mounting - starting initial load');
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([loadLabTests(), loadMilkWeights()]);
      } finally {
        console.log('[Pienas] Initial load complete');
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    loadMilkWeights();
  }, [dateFrom, dateTo]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getSCCStatus = (scc?: number) => {
    if (!scc) return { label: 'N/A', color: 'text-gray-400' };
    // Values are already in thousands (141 = 141k cells/ml)
    if (scc < 200) return { label: 'Puiki', color: 'text-green-600' };
    if (scc < 400) return { label: 'Gera', color: 'text-blue-600' };
    if (scc < 600) return { label: 'Vidutinė', color: 'text-yellow-600' };
    return { label: 'Blogai', color: 'text-red-600' };
  };

  const mergeTestsByDate = (
    compositionTests: MilkCompositionTest[],
    qualityTests: MilkQualityTest[]
  ): UnifiedTest[] => {
    const testsMap = new Map<string, UnifiedTest>();

    compositionTests.forEach((test) => {
      const key = `${test.paemimo_data}_${test.konteineris}`;
      testsMap.set(key, {
        paemimo_data: test.paemimo_data,
        tyrimo_data: test.tyrimo_data,
        konteineris: test.konteineris,
        prot_nr: test.prot_nr,
        composition: test,
      });
    });

    qualityTests.forEach((test) => {
      const key = `${test.paemimo_data}_${test.konteineris}`;
      const existing = testsMap.get(key);
      if (existing) {
        existing.quality = test;
      } else {
        testsMap.set(key, {
          paemimo_data: test.paemimo_data,
          tyrimo_data: test.tyrimo_data,
          konteineris: test.konteineris,
          prot_nr: test.prot_nr,
          quality: test,
        });
      }
    });

    return Array.from(testsMap.values()).sort(
      (a, b) => new Date(b.paemimo_data).getTime() - new Date(a.paemimo_data).getTime()
    );
  };

  console.log('[Pienas] Render state:', {
    loading,
    labTestDataLength: labTestData.length,
    labTestData
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Kraunama...</div>
      </div>
    );
  }

  const formatWeight = (kg: number) => {
    return kg.toFixed(1) + ' kg';
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Beaker className="w-8 h-8 text-blue-600" />
          Pienas
        </h1>
        <p className="text-gray-600">
          Dieniniai pieno svoriai ir laboratorijos tyrimai
        </p>
      </div>

      <div className="mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Weight className="w-6 h-6 text-green-600" />
              Dieniniai pieno svoriai
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Nuo:</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Iki:</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {weightsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Kraunama...</div>
            </div>
          ) : milkWeights.length === 0 ? (
            <div className="text-center py-12">
              <Weight className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Nėra svorio duomenų</h3>
              <p className="text-gray-500">
                Pasirinktu laikotarpiu pieno svorio duomenų nėra. Webhook dar negavo duomenų.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="w-8"></th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Data</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      <div className="flex items-center justify-center gap-2">
                        <Sunrise className="w-4 h-4 text-orange-500" />
                        Rytinis
                      </div>
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      <div className="flex items-center justify-center gap-2">
                        <Moon className="w-4 h-4 text-blue-500" />
                        Naktinis
                      </div>
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Viso per dieną</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Įvykių</th>
                  </tr>
                </thead>
                <tbody>
                  {milkWeights.map((daily) => {
                    const isExpanded = expandedRows.has(daily.date);
                    const totalEvents = daily.rytinisEvents.length + daily.naktinisEvents.length;

                    return (
                      <React.Fragment key={daily.date}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleRow(daily.date)}
                        >
                          <td className="py-3 px-2 text-center">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm font-semibold text-gray-900">
                            {new Date(daily.date).toLocaleDateString('lt-LT', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {daily.rytinis ? (
                              <div>
                                <div className="text-lg font-bold text-orange-600">
                                  {formatWeight(daily.rytinis.weight)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(daily.rytinis.measurement_timestamp).toLocaleTimeString('lt-LT', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                                {daily.rytinisEvents.length > 1 && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    {daily.rytinisEvents.length} įvykiai
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {daily.naktinis ? (
                              <div>
                                <div className="text-lg font-bold text-blue-600">
                                  {formatWeight(daily.naktinis.weight)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(daily.naktinis.measurement_timestamp).toLocaleTimeString('lt-LT', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                                {daily.naktinisEvents.length > 1 && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    {daily.naktinisEvents.length} įvykiai
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="text-xl font-bold text-green-600">
                              {formatWeight(daily.total)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              {totalEvents}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-gray-50 p-4 border-b border-gray-100">
                              <div className="grid grid-cols-2 gap-4">
                                {daily.rytinisEvents.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-2">
                                      <Sunrise className="w-4 h-4" />
                                      Rytinis melžimas ({daily.rytinisEvents.length} įvykiai)
                                    </h4>
                                    <div className="space-y-2">
                                      {daily.rytinisEvents.map((event, idx) => (
                                        <div
                                          key={event.id}
                                          className={`p-3 rounded-lg border ${
                                            event.id === daily.rytinis?.id
                                              ? 'bg-orange-50 border-orange-300'
                                              : 'bg-white border-gray-200'
                                          }`}
                                        >
                                          <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-semibold text-gray-600">
                                                #{idx + 1}
                                              </span>
                                              <span className={`text-xs px-2 py-0.5 rounded ${
                                                event.event_type === 'RECOVERY' ? 'bg-green-100 text-green-800' :
                                                event.event_type === 'ALERT' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                              }`}>
                                                {event.event_type || 'N/A'}
                                              </span>
                                              {event.id === daily.rytinis?.id && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-orange-200 text-orange-900 font-semibold">
                                                  MAX
                                                </span>
                                              )}
                                            </div>
                                            <span className="text-xs text-gray-500">
                                              {new Date(event.measurement_timestamp).toLocaleTimeString('lt-LT')}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                              <span className="text-gray-600">Svoris:</span>
                                              <span className="ml-1 font-semibold text-orange-700">
                                                {formatWeight(event.weight)}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600">Žarna:</span>
                                              <span className="ml-1 font-medium">
                                                {event.hose_status || 'N/A'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600">Stabilus:</span>
                                              <span className="ml-1 font-medium">
                                                {event.stable_status ? 'Taip' : 'Ne'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600">Sesija:</span>
                                              <span className="ml-1 font-mono text-xs">
                                                {event.session_id?.slice(-6) || 'N/A'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {daily.naktinisEvents.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                                      <Moon className="w-4 h-4" />
                                      Naktinis melžimas ({daily.naktinisEvents.length} įvykiai)
                                    </h4>
                                    <div className="space-y-2">
                                      {daily.naktinisEvents.map((event, idx) => (
                                        <div
                                          key={event.id}
                                          className={`p-3 rounded-lg border ${
                                            event.id === daily.naktinis?.id
                                              ? 'bg-blue-50 border-blue-300'
                                              : 'bg-white border-gray-200'
                                          }`}
                                        >
                                          <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-semibold text-gray-600">
                                                #{idx + 1}
                                              </span>
                                              <span className={`text-xs px-2 py-0.5 rounded ${
                                                event.event_type === 'RECOVERY' ? 'bg-green-100 text-green-800' :
                                                event.event_type === 'ALERT' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                              }`}>
                                                {event.event_type || 'N/A'}
                                              </span>
                                              {event.id === daily.naktinis?.id && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-blue-200 text-blue-900 font-semibold">
                                                  MAX
                                                </span>
                                              )}
                                            </div>
                                            <span className="text-xs text-gray-500">
                                              {new Date(event.measurement_timestamp).toLocaleTimeString('lt-LT')}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                              <span className="text-gray-600">Svoris:</span>
                                              <span className="ml-1 font-semibold text-blue-700">
                                                {formatWeight(event.weight)}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600">Žarna:</span>
                                              <span className="ml-1 font-medium">
                                                {event.hose_status || 'N/A'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600">Stabilus:</span>
                                              <span className="ml-1 font-medium">
                                                {event.stable_status ? 'Taip' : 'Ne'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600">Sesija:</span>
                                              <span className="ml-1 font-mono text-xs">
                                                {event.session_id?.slice(-6) || 'N/A'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Lab Test Data */}
                              {(daily.rytinis?.composition_test || daily.rytinis?.quality_test || daily.naktinis?.composition_test || daily.naktinis?.quality_test) && (
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Beaker className="w-4 h-4 text-purple-600" />
                                    Laboratorijos tyrimai
                                  </h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    {/* Rytinis tests */}
                                    {(daily.rytinis?.composition_test || daily.rytinis?.quality_test) && (
                                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                                        <h5 className="text-xs font-semibold text-orange-700 mb-2 flex items-center gap-1">
                                          <Sunrise className="w-3 h-3" />
                                          Rytinis
                                        </h5>
                                        {daily.rytinis?.composition_test && (
                                          <div className="space-y-1 mb-2">
                                            <div className="text-xs text-gray-700 font-medium">Sudėtis:</div>
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                              {daily.rytinis.composition_test.fat_percentage !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Riebalai:</span>
                                                  <span className="ml-1 font-semibold text-orange-700">
                                                    {daily.rytinis.composition_test.fat_percentage.toFixed(2)}%
                                                  </span>
                                                </div>
                                              )}
                                              {daily.rytinis.composition_test.protein_percentage !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Baltymai:</span>
                                                  <span className="ml-1 font-semibold text-orange-700">
                                                    {daily.rytinis.composition_test.protein_percentage.toFixed(2)}%
                                                  </span>
                                                </div>
                                              )}
                                              {daily.rytinis.composition_test.lactose_percentage !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Laktozė:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.rytinis.composition_test.lactose_percentage.toFixed(2)}%
                                                  </span>
                                                </div>
                                              )}
                                              {daily.rytinis.composition_test.ph_level !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">pH:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.rytinis.composition_test.ph_level.toFixed(2)}
                                                  </span>
                                                </div>
                                              )}
                                              {daily.rytinis.composition_test.urea_mg_100ml !== undefined && (
                                                <div className="col-span-2">
                                                  <span className="text-gray-600">Šlapalo kiekis:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.rytinis.composition_test.urea_mg_100ml} mg/100ml
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {daily.rytinis?.quality_test && (
                                          <div className="space-y-1">
                                            <div className="text-xs text-gray-700 font-medium">Kokybė:</div>
                                            <div className="grid grid-cols-1 gap-1 text-xs">
                                              {daily.rytinis.quality_test.somatic_cell_count !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Somatinės ląstelės:</span>
                                                  <span className="ml-1 font-semibold text-orange-700">
                                                    {daily.rytinis.quality_test.somatic_cell_count} tūkst./ml
                                                  </span>
                                                </div>
                                              )}
                                              {daily.rytinis.quality_test.total_bacteria_count !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Bakterijos:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.rytinis.quality_test.total_bacteria_count} tūkst./ml
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Naktinis tests */}
                                    {(daily.naktinis?.composition_test || daily.naktinis?.quality_test) && (
                                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                        <h5 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                                          <Moon className="w-3 h-3" />
                                          Naktinis
                                        </h5>
                                        {daily.naktinis?.composition_test && (
                                          <div className="space-y-1 mb-2">
                                            <div className="text-xs text-gray-700 font-medium">Sudėtis:</div>
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                              {daily.naktinis.composition_test.fat_percentage !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Riebalai:</span>
                                                  <span className="ml-1 font-semibold text-blue-700">
                                                    {daily.naktinis.composition_test.fat_percentage.toFixed(2)}%
                                                  </span>
                                                </div>
                                              )}
                                              {daily.naktinis.composition_test.protein_percentage !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Baltymai:</span>
                                                  <span className="ml-1 font-semibold text-blue-700">
                                                    {daily.naktinis.composition_test.protein_percentage.toFixed(2)}%
                                                  </span>
                                                </div>
                                              )}
                                              {daily.naktinis.composition_test.lactose_percentage !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Laktozė:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.naktinis.composition_test.lactose_percentage.toFixed(2)}%
                                                  </span>
                                                </div>
                                              )}
                                              {daily.naktinis.composition_test.ph_level !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">pH:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.naktinis.composition_test.ph_level.toFixed(2)}
                                                  </span>
                                                </div>
                                              )}
                                              {daily.naktinis.composition_test.urea_mg_100ml !== undefined && (
                                                <div className="col-span-2">
                                                  <span className="text-gray-600">Šlapalo kiekis:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.naktinis.composition_test.urea_mg_100ml} mg/100ml
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {daily.naktinis?.quality_test && (
                                          <div className="space-y-1">
                                            <div className="text-xs text-gray-700 font-medium">Kokybė:</div>
                                            <div className="grid grid-cols-1 gap-1 text-xs">
                                              {daily.naktinis.quality_test.somatic_cell_count !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Somatinės ląstelės:</span>
                                                  <span className="ml-1 font-semibold text-blue-700">
                                                    {daily.naktinis.quality_test.somatic_cell_count} tūkst./ml
                                                  </span>
                                                </div>
                                              )}
                                              {daily.naktinis.quality_test.total_bacteria_count !== undefined && (
                                                <div>
                                                  <span className="text-gray-600">Bakterijos:</span>
                                                  <span className="ml-1 font-semibold">
                                                    {daily.naktinis.quality_test.total_bacteria_count} tūkst./ml
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {milkWeights.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Periodo statistika</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Bendras svoris</div>
                      <div className="text-lg font-bold text-gray-900">
                        {formatWeight(milkWeights.reduce((sum, d) => sum + d.total, 0))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Vidutinis per dieną</div>
                      <div className="text-lg font-bold text-gray-900">
                        {formatWeight(
                          milkWeights.reduce((sum, d) => sum + d.total, 0) / milkWeights.length
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Vidutinis rytinis</div>
                      <div className="text-lg font-bold text-orange-600">
                        {formatWeight(
                          milkWeights
                            .filter((d) => d.rytinis)
                            .reduce((sum, d) => sum + (d.rytinis?.weight || 0), 0) /
                            milkWeights.filter((d) => d.rytinis).length
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Vidutinis naktinis</div>
                      <div className="text-lg font-bold text-indigo-600">
                        {formatWeight(
                          milkWeights
                            .filter((d) => d.naktinis)
                            .reduce((sum, d) => sum + (d.naktinis?.weight || 0), 0) /
                            milkWeights.filter((d) => d.naktinis).length
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Beaker className="w-6 h-6 text-blue-600" />
          Pieno laboratorijos tyrimai
        </h2>
        <p className="text-gray-600">
          Bandos lygmens pieno kokybės ir sudėties tyrimai (importuoti iš n8n)
        </p>
      </div>

      {labTestData.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Beaker className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Nėra tyrimų duomenų</h3>
          <p className="text-gray-500">
            Pieno tyrimų duomenys dar nebuvo importuoti. Paleiskite n8n darbo eigą.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {labTestData.map((item) => {
            const isExpanded = expandedRows.has(item.producer.id);
            const latestComposition = item.compositionTests[0];
            const latestQuality = item.qualityTests[0];
            const sccStatus = getSCCStatus(latestQuality?.somatiniu_lasteliu_skaicius);

            return (
              <div
                key={item.producer.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              >
                <div
                  className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleRow(item.producer.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{item.producer.imone}</h3>
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full">
                          {item.producer.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-gray-600">
                        <span>Kodas: {item.producer.gamintojas_code}</span>
                        <span>Rajonas: {item.producer.rajonas}</span>
                        <span>Punktas: {item.producer.punktas}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 mr-8">
                      {latestComposition && (
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">Sudėtis</div>
                          <div className="text-sm font-semibold text-gray-900">
                            R: {latestComposition.riebalu_kiekis?.toFixed(2) || '-'}% |
                            B: {latestComposition.baltymu_kiekis?.toFixed(2) || '-'}%
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(latestComposition.paemimo_data).toLocaleDateString('lt-LT')}
                          </div>
                        </div>
                      )}

                      {latestQuality && (
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">Kokybė</div>
                          <div className={`text-sm font-semibold ${sccStatus.color}`}>
                            SCC: {latestQuality.somatiniu_lasteliu_skaicius
                              ? latestQuality.somatiniu_lasteliu_skaicius.toFixed(0) + 'k'
                              : '-'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(latestQuality.paemimo_data).toLocaleDateString('lt-LT')}
                          </div>
                        </div>
                      )}
                    </div>

                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 p-6">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Tyrimų istorija
                    </h4>
                    {item.compositionTests.length === 0 && item.qualityTests.length === 0 ? (
                      <p className="text-gray-500 text-sm">Nėra duomenų</p>
                    ) : (
                      <div className="space-y-3">
                        {mergeTestsByDate(item.compositionTests, item.qualityTests).map((test, index) => {
                          const status = getSCCStatus(test.quality?.somatiniu_lasteliu_skaicius);
                          return (
                            <div
                              key={`${test.paemimo_data}_${test.konteineris}_${index}`}
                              className="bg-white rounded-lg p-5 border border-gray-200"
                            >
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <div className="text-base font-bold text-gray-900">
                                    Paėmimas: {new Date(test.paemimo_data).toLocaleDateString('lt-LT')}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Tyrimas: {new Date(test.tyrimo_data).toLocaleDateString('lt-LT')}
                                  </div>
                                </div>
                                <div className="text-sm text-gray-500">
                                  {test.konteineris} / {test.prot_nr}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {test.composition && (
                                  <div>
                                    <h5 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                                      Sudėties tyrimai
                                    </h5>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <span className="text-gray-600">Riebalai:</span>
                                        <span className="ml-2 font-semibold text-gray-900">
                                          {test.composition.riebalu_kiekis?.toFixed(2) || '-'}%
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600">Baltymai:</span>
                                        <span className="ml-2 font-semibold text-gray-900">
                                          {test.composition.baltymu_kiekis?.toFixed(2) || '-'}%
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600">Laktozė:</span>
                                        <span className="ml-2 font-semibold text-gray-900">
                                          {test.composition.laktozes_kiekis?.toFixed(2) || '-'}%
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600">Urėja:</span>
                                        <span className="ml-2 font-semibold text-gray-900">
                                          {test.composition.ureja_mg_100ml || '-'} mg/100ml
                                        </span>
                                      </div>
                                      {test.composition.ph && (
                                        <div>
                                          <span className="text-gray-600">pH:</span>
                                          <span className="ml-2 font-semibold text-gray-900">
                                            {test.composition.ph.toFixed(2)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    {test.composition.pastaba && (
                                      <div className="mt-3 pt-3 border-t border-gray-200">
                                        <span className="text-xs text-gray-600">Pastaba: </span>
                                        <span className="text-xs text-gray-900">{test.composition.pastaba}</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {test.quality && (
                                  <div>
                                    <h5 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                                      Kokybės tyrimai
                                    </h5>
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">Somatinių ląstelių skaičius:</span>
                                        <div className="text-right">
                                          <span className={`text-lg font-bold ${status.color}`}>
                                            {test.quality.somatiniu_lasteliu_skaicius
                                              ? test.quality.somatiniu_lasteliu_skaicius.toFixed(0) + 'k'
                                              : '-'}
                                          </span>
                                          <div className={`text-xs ${status.color}`}>{status.label}</div>
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">Bendras bakterijų skaičius:</span>
                                        <span className="text-sm font-semibold text-gray-900">
                                          {test.quality.bendras_bakteriju_skaicius
                                            ? test.quality.bendras_bakteriju_skaicius.toFixed(0) + 'k'
                                            : '-'}
                                        </span>
                                      </div>
                                      {test.quality.neatit_pst && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm text-gray-600">Neatitikimas PST:</span>
                                          <span className="text-sm font-semibold text-red-600">
                                            {test.quality.neatit_pst}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
