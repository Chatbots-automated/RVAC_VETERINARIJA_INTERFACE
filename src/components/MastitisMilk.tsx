import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatDateLT, formatNumberLT } from '../lib/formatters';
import { Droplet, AlertCircle, Calendar, TrendingUp, RefreshCw, AlertTriangle, Users } from 'lucide-react';

interface DailyMilkSummary {
  snapshot_date: string;
  total_milk: number;
  unique_animals: number;
  missing_days_before: number;
}

interface AnimalMilkSummary {
  animal_id: string;
  tag_no: string;
  total_milk: number;
  days_count: number;
  avg_per_day: number;
  latest_milk_avg: number;
  current_group: number | null;
  first_date_in_group5: string;
  last_date_in_group5: string;
}

export function MastitisMilk() {
  const [dailyData, setDailyData] = useState<DailyMilkSummary[]>([]);
  const [animalData, setAnimalData] = useState<AnimalMilkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMilk, setTotalMilk] = useState(0);
  const [totalAnimals, setTotalAnimals] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [missingDaysWarning, setMissingDaysWarning] = useState(false);
  const groupNumber = 5;

  useEffect(() => {
    loadMastitisMilkData();
  }, []);

  const loadMastitisMilkData = async (filterStartDate?: string, filterEndDate?: string) => {
    try {
      setLoading(true);

      const useStartDate = filterStartDate !== undefined ? filterStartDate : startDate;
      const useEndDate = filterEndDate !== undefined ? filterEndDate : endDate;

      // Query new GEA system
      let query = supabase
        .from('gea_daily_cows_joined')
        .select('*')
        .eq('group_number', groupNumber.toString())
        .order('import_created_at', { ascending: true });

      if (useStartDate) {
        query = query.gte('import_created_at', useStartDate);
      }
      if (useEndDate) {
        query = query.lte('import_created_at', useEndDate);
      }

      const { data: rawGeaRecords, error } = await query;

      if (error) throw error;

      // Map ear_number to animal_id
      const { data: animals } = await supabase
        .from('animals')
        .select('id, tag_no')
        .eq('active', true);

      const animalTagMap = new Map(animals?.map(a => [a.tag_no, a.id]) || []);

      // Transform new GEA structure to match old format
      const geaRecords = rawGeaRecords?.map(gea => {
        const date = gea.import_created_at?.split('T')[0]; // Extract date part
        return {
          animal_id: animalTagMap.get(gea.ear_number),
          snapshot_date: date,
          m1_date: gea.milkings?.[0]?.date || null,
          m1_qty: gea.milkings?.[0]?.weight || null,
          m2_date: gea.milkings?.[1]?.date || null,
          m2_qty: gea.milkings?.[1]?.weight || null,
          m3_date: gea.milkings?.[2]?.date || null,
          m3_qty: gea.milkings?.[2]?.weight || null,
          m4_date: gea.milkings?.[3]?.date || null,
          m4_qty: gea.milkings?.[3]?.weight || null,
          m5_date: gea.milkings?.[4]?.date || null,
          m5_qty: gea.milkings?.[4]?.weight || null,
          milk_avg: gea.avg_milk_prod_weight,
          grupe: gea.group_number
        };
      }).filter(record => record.animal_id); // Only include records with valid animal_id

      if (!geaRecords || geaRecords.length === 0) {
        setDailyData([]);
        setAnimalData([]);
        setTotalMilk(0);
        setTotalAnimals(0);
        setMissingDaysWarning(false);
        setLoading(false);
        return;
      }

      const dailySummary = new Map<string, { milk: number; animals: Set<string> }>();

      for (const record of geaRecords) {
        const date = record.snapshot_date;
        if (!dailySummary.has(date)) {
          dailySummary.set(date, { milk: 0, animals: new Set() });
        }

        const summary = dailySummary.get(date)!;
        summary.animals.add(record.animal_id);

        let dailyMilk = 0;
        if (record.m1_date === date) dailyMilk += (record.m1_qty || 0);
        if (record.m2_date === date) dailyMilk += (record.m2_qty || 0);
        if (record.m3_date === date) dailyMilk += (record.m3_qty || 0);
        if (record.m4_date === date) dailyMilk += (record.m4_qty || 0);
        if (record.m5_date === date) dailyMilk += (record.m5_qty || 0);

        summary.milk += dailyMilk;
      }

      const sortedDates = Array.from(dailySummary.keys()).sort();
      let hasMissingDays = false;

      const dailyDataArray: DailyMilkSummary[] = sortedDates.map((date, index) => {
        const summary = dailySummary.get(date)!;
        let missingDaysBefore = 0;

        if (index > 0) {
          const prevDate = new Date(sortedDates[index - 1]);
          const currentDate = new Date(date);
          const daysDiff = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
          missingDaysBefore = Math.max(0, daysDiff - 1);
          if (missingDaysBefore > 0) {
            hasMissingDays = true;
          }
        }

        return {
          snapshot_date: date,
          total_milk: summary.milk,
          unique_animals: summary.animals.size,
          missing_days_before: missingDaysBefore,
        };
      });

      const totalMilkCalc = dailyDataArray.reduce((sum, day) => sum + day.total_milk, 0);
      const uniqueAnimals = new Set<string>();
      geaRecords.forEach(r => uniqueAnimals.add(r.animal_id));

      // Calculate per-animal summaries
      const animalMilkMap = new Map<string, { total: number; dates: string[] }>();

      for (const record of geaRecords) {
        if (!animalMilkMap.has(record.animal_id)) {
          animalMilkMap.set(record.animal_id, { total: 0, dates: [] });
        }

        const animalSummary = animalMilkMap.get(record.animal_id)!;
        if (!animalSummary.dates.includes(record.snapshot_date)) {
          animalSummary.dates.push(record.snapshot_date);
        }

        const date = record.snapshot_date;
        let dailyMilk = 0;
        if (record.m1_date === date) dailyMilk += (record.m1_qty || 0);
        if (record.m2_date === date) dailyMilk += (record.m2_qty || 0);
        if (record.m3_date === date) dailyMilk += (record.m3_qty || 0);
        if (record.m4_date === date) dailyMilk += (record.m4_qty || 0);
        if (record.m5_date === date) dailyMilk += (record.m5_qty || 0);

        animalSummary.total += dailyMilk;
      }

      // Fetch animal details and latest milk_avg
      const animalIds = Array.from(uniqueAnimals);
      const { data: animalsList } = await supabase
        .from('animals')
        .select('id, tag_no')
        .in('id', animalIds);

      // Create reverse map (animal_id -> tag_no)
      const animalIdToTagMap = new Map(animalsList?.map(a => [a.id, a.tag_no]) || []);

      // Get latest milk_avg and current group for each animal from new GEA system
      const { data: latestMilkAvgs } = await supabase
        .from('gea_daily_cows_joined')
        .select('ear_number, avg_milk_prod_weight, import_created_at, group_number')
        .in('ear_number', Array.from(animalIdToTagMap.values()))
        .order('import_created_at', { ascending: false });

      const latestMilkAvgMap = new Map<string, number>();
      const currentGroupMap = new Map<string, number | null>();

      latestMilkAvgs?.forEach(record => {
        const animalId = animalTagMap.get(record.ear_number);
        if (animalId && !latestMilkAvgMap.has(animalId)) {
          latestMilkAvgMap.set(animalId, record.avg_milk_prod_weight || 0);
          currentGroupMap.set(animalId, record.group_number ? parseInt(record.group_number) : null);
        }
      });

      const animalDataArray: AnimalMilkSummary[] = (animals || [])
        .map(animal => {
          const summary = animalMilkMap.get(animal.id);
          if (!summary) return null;

          const sortedDates = summary.dates.sort();
          const daysCount = summary.dates.length;
          const avgPerDay = daysCount > 0 ? summary.total / daysCount : 0;
          const latestMilkAvg = latestMilkAvgMap.get(animal.id) || 0;
          const currentGroup = currentGroupMap.get(animal.id) ?? null;

          return {
            animal_id: animal.id,
            tag_no: animal.tag_no,
            total_milk: summary.total,
            days_count: daysCount,
            avg_per_day: avgPerDay,
            latest_milk_avg: latestMilkAvg,
            current_group: currentGroup,
            first_date_in_group5: sortedDates[0],
            last_date_in_group5: sortedDates[sortedDates.length - 1],
          };
        })
        .filter((a): a is AnimalMilkSummary => a !== null)
        .sort((a, b) => b.total_milk - a.total_milk);

      setDailyData(dailyDataArray);
      setAnimalData(animalDataArray);
      setTotalMilk(totalMilkCalc);
      setTotalAnimals(uniqueAnimals.size);
      setMissingDaysWarning(hasMissingDays);
    } catch (error) {
      console.error('Error loading mastitis milk data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Kraunama...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <Droplet className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Mastitinis Pienas</h2>
              <p className="text-sm text-gray-600">Grupė 5 - Pieno gamyba per laikotarpį</p>
            </div>
          </div>
          <button
            onClick={() => loadMastitisMilkData()}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            title="Atnaujinti"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Viso Pieno</span>
            </div>
            <div className="text-3xl font-bold text-purple-600">{formatNumberLT(totalMilk)} L</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Viso Gyvūnų</span>
            </div>
            <div className="text-3xl font-bold text-orange-600">{totalAnimals}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Dienų</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">{dailyData.length}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Vid. per dieną</span>
            </div>
            <div className="text-3xl font-bold text-green-600">
              {dailyData.length > 0 ? formatNumberLT(totalMilk / dailyData.length) : '0'} L
            </div>
          </div>
        </div>

        {missingDaysWarning && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Įspėjimas:</strong> Aptikti trūkstami GEA duomenys. Kai kurios dienos neturi įrašų tarp datų.
            </div>
          </div>
        )}
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Nuo:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Iki:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                loadMastitisMilkData('', '');
              }}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              Išvalyti
            </button>
            <button
              onClick={() => loadMastitisMilkData(startDate, endDate)}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Atnaujinti
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Filtruoti pagal datas, kada gyvuliai buvo grupėje 5. Palikite tuščią visiems įrašams.
        </p>
      </div>

      {dailyData.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
          <Droplet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Nerasta duomenų grupei 5</p>
          <p className="text-sm text-gray-400 mt-1">Pasirinkite datų intervalą arba patikrinkite GEA duomenis</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Pieno kiekis (L)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Gyvūnų skaičius
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Statusas
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dailyData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-purple-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{formatDateLT(row.snapshot_date)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-lg font-bold text-purple-600">
                        {formatNumberLT(row.total_milk)} L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {row.unique_animals}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {row.missing_days_before > 0 ? (
                        <span className="px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Trūksta {row.missing_days_before}d
                        </span>
                      ) : (
                        <span className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-purple-50 border-t-2 border-purple-200">
                <tr>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 uppercase">
                    Viso:
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-xl font-bold text-purple-700">
                      {formatNumberLT(totalMilk)} L
                    </div>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Animal List */}
      {animalData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-50 to-purple-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-600" />
              <h3 className="text-lg font-bold text-gray-900">Gyvūnai Grupėje 5</h3>
              <span className="ml-auto text-sm text-gray-600">
                Viso: {animalData.length} {animalData.length === 1 ? 'gyvulys' : 'gyvuliai'}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Gyvulio Nr.
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Dabartinė grupė
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Laikotarpis grupėje 5
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Viso pieno (L)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Dienų
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Vid. per dieną (L)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Dabartinis vidurkis (L)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {animalData.map((animal) => (
                  <tr key={animal.animal_id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{animal.tag_no}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {animal.current_group !== null ? (
                        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                          animal.current_group === 5
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          Grupė {animal.current_group}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs text-gray-600">
                        {formatDateLT(animal.first_date_in_group5)} - {formatDateLT(animal.last_date_in_group5)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-lg font-bold text-purple-600">
                        {formatNumberLT(animal.total_milk)} L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {animal.days_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatNumberLT(animal.avg_per_day)} L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-green-700">
                        {formatNumberLT(animal.latest_milk_avg)} L
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-sm font-bold text-gray-900 uppercase">
                    Viso:
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-xl font-bold text-purple-700">
                      {formatNumberLT(totalMilk)} L
                    </div>
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
