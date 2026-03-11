import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrencyLT, formatDateLT, formatNumberLT } from '../lib/formatters';
import { fetchAllRows, fetchGeaMilkMap } from '../lib/helpers';
import { AnimalMilkLossBySynchronization } from '../lib/types';
import { Milk, Calendar, TrendingDown, RefreshCw, ChevronDown, ChevronRight, Search } from 'lucide-react';

interface AnimalMilkLossAggregated {
  animal_id: string;
  animal_number: string;
  animal_name: string | null;
  sync_count: number;
  total_loss_days: number;
  total_milk_lost_kg: number;
  total_milk_loss_value_eur: number;
  avg_daily_milk_kg: number;
}

export function AnimalMilkLossAnalysis() {
  const [milkLossData, setMilkLossData] = useState<AnimalMilkLossBySynchronization[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAnimal, setExpandedAnimal] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'total_loss' | 'milk_lost' | 'days' | 'syncs' | 'animal'>('total_loss');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadMilkLossData();
  }, []);

  const loadMilkLossData = async () => {
    try {
      setLoading(true);

      const [allSyncs, steps, protocols, animals, milkMap, settings] = await Promise.all([
        fetchAllRows<{ id: string; animal_id: string; start_date: string; status: string; protocol_id: string | null }>(
          'animal_synchronizations',
          'id, animal_id, start_date, status, protocol_id'
        ),
        fetchAllRows<{ synchronization_id: string; scheduled_date: string }>(
          'synchronization_steps',
          'synchronization_id, scheduled_date'
        ),
        fetchAllRows<{ id: string; name: string }>('synchronization_protocols', 'id, name'),
        fetchAllRows<{ id: string; tag_no: string | null }>('animals', 'id, tag_no'),
        fetchGeaMilkMap(),
        supabase.from('system_settings').select('setting_key, setting_value').eq('setting_key', 'milk_price_per_liter').maybeSingle(),
      ]);

      const syncStatuses = ['Active', 'Completed'];
      const filteredSyncs = allSyncs.filter((s) => syncStatuses.includes(s.status));

      const stepMaxDate = new Map<string, string>();
      steps.forEach((s) => {
        const cur = stepMaxDate.get(s.synchronization_id);
        if (!cur || s.scheduled_date > cur) stepMaxDate.set(s.synchronization_id, s.scheduled_date);
      });

      const protocolMap = new Map(protocols.map((p) => [p.id, p.name]));
      const animalMap = new Map(animals.map((a) => [a.id, { tag_no: a.tag_no }]));
      const milkPrice = parseFloat(String(settings.data?.setting_value || '0.45')) || 0.45;

      const rows: AnimalMilkLossBySynchronization[] = [];
      for (const s of filteredSyncs) {
        const animal = animalMap.get(s.animal_id);
        const tagNo = animal?.tag_no || '';
        const maxStep = stepMaxDate.get(s.id);
        const syncEnd = maxStep ? new Date(maxStep) : new Date(new Date(s.start_date).getTime() + 14 * 24 * 60 * 60 * 1000);
        const syncEndStr = syncEnd.toISOString().split('T')[0];
        const startDate = new Date(s.start_date);
        const endDate = new Date(syncEndStr);
        const lossDays = Math.max(0, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
        if (lossDays <= 0) continue;

        const avgMilk = milkMap.get(tagNo) ?? 0;
        const totalMilkLost = avgMilk * lossDays;
        const milkLossValue = totalMilkLost * milkPrice;

        rows.push({
          animal_id: s.animal_id,
          animal_number: tagNo,
          animal_name: null,
          sync_id: s.id,
          sync_start: s.start_date,
          sync_end: syncEndStr,
          sync_status: s.status,
          protocol_id: s.protocol_id,
          protocol_name: s.protocol_id ? protocolMap.get(s.protocol_id) ?? null : null,
          loss_days: lossDays,
          avg_daily_milk_kg: avgMilk,
          total_milk_lost_kg: totalMilkLost,
          milk_loss_value_eur: milkLossValue,
          milk_price_used: milkPrice,
        });
      }

      rows.sort((a, b) => (a.sync_start > b.sync_start ? -1 : 1));
      setMilkLossData(rows);
    } catch (error) {
      console.error('Error loading milk loss data:', error);
    } finally {
      setLoading(false);
    }
  };

  const aggregatedData = milkLossData.reduce((acc, row) => {
    const existing = acc.find(a => a.animal_id === row.animal_id);

    if (existing) {
      existing.sync_count += 1;
      existing.total_loss_days += row.loss_days;
      existing.total_milk_lost_kg += row.total_milk_lost_kg;
      existing.total_milk_loss_value_eur += row.milk_loss_value_eur;
    } else {
      acc.push({
        animal_id: row.animal_id,
        animal_number: row.animal_number,
        animal_name: row.animal_name,
        sync_count: 1,
        total_loss_days: row.loss_days,
        total_milk_lost_kg: row.total_milk_lost_kg,
        total_milk_loss_value_eur: row.milk_loss_value_eur,
        avg_daily_milk_kg: row.avg_daily_milk_kg,
      });
    }

    return acc;
  }, [] as AnimalMilkLossAggregated[]);

  const filteredData = aggregatedData.filter(row => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      row.animal_number?.toLowerCase().includes(search) ||
      row.animal_name?.toLowerCase().includes(search)
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    let compareValue = 0;
    switch (sortBy) {
      case 'total_loss':
        compareValue = a.total_milk_loss_value_eur - b.total_milk_loss_value_eur;
        break;
      case 'milk_lost':
        compareValue = a.total_milk_lost_kg - b.total_milk_lost_kg;
        break;
      case 'days':
        compareValue = a.total_loss_days - b.total_loss_days;
        break;
      case 'syncs':
        compareValue = a.sync_count - b.sync_count;
        break;
      case 'animal':
        compareValue = (a.animal_number || '').localeCompare(b.animal_number || '');
        break;
    }
    return sortOrder === 'desc' ? -compareValue : compareValue;
  });

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSynchronizationsForAnimal = (animalId: string) => {
    return milkLossData.filter(s => s.animal_id === animalId);
  };

  const totalStats = sortedData.reduce(
    (acc, row) => ({
      totalAnimals: acc.totalAnimals + 1,
      totalSynchronizations: acc.totalSynchronizations + row.sync_count,
      totalLossDays: acc.totalLossDays + row.total_loss_days,
      totalMilkLost: acc.totalMilkLost + row.total_milk_lost_kg,
      totalValue: acc.totalValue + row.total_milk_loss_value_eur,
    }),
    {
      totalAnimals: 0,
      totalSynchronizations: 0,
      totalLossDays: 0,
      totalMilkLost: 0,
      totalValue: 0,
    }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Kraunama...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Milk className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Pieno Nuostoliai Per Sinchronizacijas</h2>
              <p className="text-sm text-gray-600">Pieno gamybos nuostoliai per gyvulių sinchronizacijų laikotarpius</p>
            </div>
          </div>
          <button
            onClick={loadMilkLossData}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            title="Atnaujinti"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Ieškoti pagal gyvūno numerį arba vardą..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Milk className="w-4 h-4 text-gray-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Gyvūnų</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalStats.totalAnimals}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Sinchronizacijų</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{totalStats.totalSynchronizations}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Dienų</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">{totalStats.totalLossDays}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Milk className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Pieno (kg)</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{formatNumberLT(totalStats.totalMilkLost)}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Vertė</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{formatCurrencyLT(totalStats.totalValue)}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Vid. nuostoliai per gyvūną:</span>
              <span className="ml-2 font-bold text-blue-700">
                {formatCurrencyLT(totalStats.totalAnimals > 0 ? totalStats.totalValue / totalStats.totalAnimals : 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Vid. nuostoliai per sinchronizaciją:</span>
              <span className="ml-2 font-bold text-orange-700">
                {formatCurrencyLT(totalStats.totalSynchronizations > 0 ? totalStats.totalValue / totalStats.totalSynchronizations : 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Vid. pieno per dieną:</span>
              <span className="ml-2 font-bold text-gray-700">
                {formatNumberLT(totalStats.totalLossDays > 0 ? totalStats.totalMilkLost / totalStats.totalLossDays : 0)} kg
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-12 px-4 py-3"></th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('animal')}
                >
                  Gyvūnas {sortBy === 'animal' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('syncs')}
                >
                  Sinchronizacijų {sortBy === 'syncs' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('days')}
                >
                  Dienų {sortBy === 'days' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('milk_lost')}
                >
                  Pieno prarastas (kg) {sortBy === 'milk_lost' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('total_loss')}
                >
                  Vertė {sortBy === 'total_loss' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedData.map((row) => {
                const isExpanded = expandedAnimal === row.animal_id;
                const synchronizations = getSynchronizationsForAnimal(row.animal_id);

                return (
                  <React.Fragment key={row.animal_id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedAnimal(isExpanded ? null : row.animal_id)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{row.animal_number}</div>
                        {row.animal_name && <div className="text-xs text-gray-500">{row.animal_name}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.sync_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.total_loss_days}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        {formatNumberLT(row.total_milk_lost_kg)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600">
                        {formatCurrencyLT(row.total_milk_loss_value_eur)}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-gray-50">
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Sinchronizacijų istorija</h4>
                            {synchronizations.map((sync) => (
                              <div
                                key={sync.sync_id}
                                className="bg-white border border-gray-200 rounded-lg p-4"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500">Pradžia</div>
                                    <div className="text-sm font-medium">{formatDateLT(sync.sync_start)}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">Protokolas</div>
                                    <div className="text-sm">{sync.protocol_name || 'Nenurodytas'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">Sinchronizacijos laikotarpis</div>
                                    <div className="text-sm">
                                      {formatDateLT(sync.sync_start)} - {formatDateLT(sync.sync_end)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      Statusas: <span className="font-medium">{sync.sync_status}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">Pieno nuostoliai</div>
                                    <div className="text-sm">
                                      {sync.loss_days} d. × {formatNumberLT(sync.avg_daily_milk_kg)} kg/d
                                    </div>
                                    <div className="text-sm font-semibold text-blue-600 mt-1">
                                      = {formatNumberLT(sync.total_milk_lost_kg)} kg
                                    </div>
                                  </div>
                                  <div className="md:col-span-2">
                                    <div className="text-xs text-gray-500">Nuostolių vertė</div>
                                    <div className="text-lg font-bold text-red-600">
                                      {formatCurrencyLT(sync.milk_loss_value_eur)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      Naudota kaina: {formatCurrencyLT(sync.milk_price_used)}/kg
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Nerasta gyvūnų pagal paieškos kriterijus' : 'Nėra duomenų apie pieno nuostolius per sinchronizacijas'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
