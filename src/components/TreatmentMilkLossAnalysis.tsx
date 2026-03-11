import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrencyLT, formatDateLT, formatNumberLT } from '../lib/formatters';
import { fetchAllRows, fetchGeaMilkMap } from '../lib/helpers';
import { Droplet, Calendar, TrendingDown, RefreshCw, ChevronDown, ChevronRight, Search, AlertTriangle, X } from 'lucide-react';

interface TreatmentMilkLoss {
  treatment_id: string;
  animal_id: string;
  animal_tag: string;
  treatment_date: string;
  withdrawal_until_milk: string;
  withdrawal_until_meat: string;
  clinical_diagnosis: string | null;
  vet_name: string | null;
  withdrawal_days: number;
  safety_days: number;
  total_loss_days: number;
  avg_daily_milk_kg: number;
  total_milk_lost_kg: number;
  milk_price_eur_per_kg: number;
  total_value_lost_eur: number;
  medications_used: Array<{
    product_id: string;
    product_name: string;
    qty: number;
    unit: string;
    withdrawal_milk_days: number;
    withdrawal_meat_days: number;
  }>;
}

interface AnimalTreatmentAggregate {
  animal_id: string;
  animal_tag: string;
  treatment_count: number;
  total_loss_days: number;
  total_milk_lost_kg: number;
  total_value_lost_eur: number;
}

interface TreatmentMilkLossModalProps {
  animalId?: string;
  animalTag?: string;
  onClose?: () => void;
}

export function TreatmentMilkLossAnalysis({ animalId, animalTag, onClose }: TreatmentMilkLossModalProps = {}) {
  const [treatmentLossData, setTreatmentLossData] = useState<TreatmentMilkLoss[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAnimal, setExpandedAnimal] = useState<string | null>(animalId || null);
  const [sortBy, setSortBy] = useState<'total_loss' | 'milk_lost' | 'days' | 'treatments' | 'animal'>('total_loss');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vetFilter, setVetFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadTreatmentMilkLossData();
  }, [animalId]);

  const loadTreatmentMilkLossData = async () => {
    try {
      setLoading(true);

      const [treatments, animals, usageItems, products, milkMap, settings] = await Promise.all([
        fetchAllRows<{
          id: string;
          animal_id: string;
          reg_date: string;
          withdrawal_until_milk: string | null;
          withdrawal_until_meat: string | null;
          clinical_diagnosis: string | null;
          vet_name: string | null;
        }>('treatments', 'id, animal_id, reg_date, withdrawal_until_milk, withdrawal_until_meat, clinical_diagnosis, vet_name'),
        fetchAllRows<{ id: string; tag_no: string | null }>('animals', 'id, tag_no'),
        fetchAllRows<{ treatment_id: string | null; product_id: string; batch_id: string | null; qty: number; unit: string }>(
          'usage_items',
          'treatment_id, product_id, batch_id, qty, unit'
        ),
        fetchAllRows<{ id: string; name: string; category: string | null; withdrawal_days_milk: number | null; withdrawal_days_meat: number | null }>(
          'products',
          'id, name, category, withdrawal_days_milk, withdrawal_days_meat'
        ),
        fetchGeaMilkMap(),
        supabase.from('system_settings').select('setting_key, setting_value').eq('setting_key', 'milk_price_per_liter').maybeSingle(),
      ]);

      const milkPrice = parseFloat(String(settings.data?.setting_value || '0.45')) || 0.45;
      const animalMap = new Map(animals.map((a) => [a.id, a.tag_no || '']));
      const productMap = new Map(products.map((p) => [p.id, p]));

      const rows: TreatmentMilkLoss[] = [];
      for (const t of treatments) {
        if (!t.withdrawal_until_milk) continue;
        const regDate = t.reg_date;
        const endDate = t.withdrawal_until_milk;
        const withdrawalDays = Math.ceil((new Date(endDate).getTime() - new Date(regDate).getTime()) / (24 * 60 * 60 * 1000));
        const totalLossDays = withdrawalDays + 1;
        if (totalLossDays <= 0) continue;

        const tagNo = animalMap.get(t.animal_id) || '';
        const avgMilk = milkMap.get(tagNo) ?? 0;
        const totalMilkLost = avgMilk * totalLossDays;
        const totalValueLost = totalMilkLost * milkPrice;

        const meds = usageItems
          .filter((ui) => ui.treatment_id === t.id)
          .map((ui) => {
            const p = productMap.get(ui.product_id);
            if (p?.category !== 'medicines') return null;
            return {
              product_id: ui.product_id,
              product_name: p.name,
              qty: ui.qty,
              unit: ui.unit,
              withdrawal_milk_days: p.withdrawal_days_milk ?? 0,
              withdrawal_meat_days: p.withdrawal_days_meat ?? 0,
            };
          })
          .filter(Boolean) as TreatmentMilkLoss['medications_used'];

        if (animalId && t.animal_id !== animalId) continue;

        rows.push({
          treatment_id: t.id,
          animal_id: t.animal_id,
          animal_tag: tagNo,
          treatment_date: regDate,
          withdrawal_until_milk: t.withdrawal_until_milk,
          withdrawal_until_meat: t.withdrawal_until_meat,
          clinical_diagnosis: t.clinical_diagnosis,
          vet_name: t.vet_name,
          withdrawal_days: withdrawalDays,
          safety_days: 1,
          total_loss_days: totalLossDays,
          avg_daily_milk_kg: avgMilk,
          total_milk_lost_kg: totalMilkLost,
          milk_price_eur_per_kg: milkPrice,
          total_value_lost_eur: totalValueLost,
          medications_used: meds,
        });
      }

      rows.sort((a, b) => (a.treatment_date > b.treatment_date ? -1 : 1));
      setTreatmentLossData(rows);
    } catch (error) {
      console.error('Error loading treatment milk loss data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to merge overlapping withdrawal periods
  const mergeWithdrawalPeriods = (periods: Array<{ start: Date; end: Date }>): number => {
    if (periods.length === 0) return 0;

    // Sort by start date
    const sorted = periods.sort((a, b) => a.start.getTime() - b.start.getTime());

    let totalDays = 0;
    let currentStart = sorted[0].start;
    let currentEnd = sorted[0].end;

    for (let i = 1; i < sorted.length; i++) {
      const period = sorted[i];

      // If periods overlap or are adjacent (within 1 day), merge them
      const daysBetween = Math.ceil((period.start.getTime() - currentEnd.getTime()) / (1000 * 60 * 60 * 24));

      if (daysBetween <= 1) {
        // Overlapping or adjacent, extend the current period
        currentEnd = new Date(Math.max(currentEnd.getTime(), period.end.getTime()));
      } else {
        // Gap detected, save current period and start new one
        totalDays += Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        currentStart = period.start;
        currentEnd = period.end;
      }
    }

    // Add the last period
    totalDays += Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return totalDays;
  };

  const aggregatedData = treatmentLossData.reduce((acc, row) => {
    const existing = acc.find(a => a.animal_id === row.animal_id);

    if (existing) {
      existing.treatment_count += 1;
      // Collect all withdrawal periods
      existing.withdrawal_periods.push({
        start: new Date(row.treatment_date),
        end: new Date(row.withdrawal_until_milk),
      });
      // Sum average milk for weighted calculation
      existing.total_avg_milk += row.avg_daily_milk_kg;
    } else {
      acc.push({
        animal_id: row.animal_id,
        animal_tag: row.animal_tag,
        treatment_count: 1,
        withdrawal_periods: [{
          start: new Date(row.treatment_date),
          end: new Date(row.withdrawal_until_milk),
        }],
        total_avg_milk: row.avg_daily_milk_kg,
        total_loss_days: 0,
        total_milk_lost_kg: 0,
        total_value_lost_eur: 0,
      });
    }

    return acc;
  }, [] as (AnimalTreatmentAggregate & {
    withdrawal_periods: Array<{ start: Date; end: Date }>;
    total_avg_milk?: number;
  })[]).map(animal => {
    // Calculate actual days by merging overlapping periods
    const total_days = mergeWithdrawalPeriods(animal.withdrawal_periods);
    const avg_milk = animal.total_avg_milk! / animal.treatment_count;
    const milk_price = treatmentLossData[0]?.milk_price_eur_per_kg || 0.45;

    animal.total_loss_days = total_days;
    animal.total_milk_lost_kg = avg_milk * total_days;
    animal.total_value_lost_eur = animal.total_milk_lost_kg * milk_price;

    return animal as AnimalTreatmentAggregate;
  });

  // Get unique vets for filter dropdown
  const uniqueVets = Array.from(new Set(treatmentLossData.map(t => t.vet_name).filter(Boolean)));

  // Apply filters to treatment data first (before aggregation for proper date filtering)
  const filteredTreatmentData = treatmentLossData.filter(row => {
    // Search filter
    if (searchTerm && !row.animal_tag.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Date range filter
    if (dateFrom && row.treatment_date < dateFrom) return false;
    if (dateTo && row.treatment_date > dateTo) return false;

    // Vet filter
    if (vetFilter && row.vet_name !== vetFilter) return false;

    return true;
  });

  // Re-aggregate filtered data
  const filteredAggregatedData = filteredTreatmentData.reduce((acc, row) => {
    const existing = acc.find(a => a.animal_id === row.animal_id);

    if (existing) {
      existing.treatment_count += 1;
      existing.withdrawal_periods.push({
        start: new Date(row.treatment_date),
        end: new Date(row.withdrawal_until_milk),
      });
      existing.total_avg_milk += row.avg_daily_milk_kg;
    } else {
      acc.push({
        animal_id: row.animal_id,
        animal_tag: row.animal_tag,
        treatment_count: 1,
        withdrawal_periods: [{
          start: new Date(row.treatment_date),
          end: new Date(row.withdrawal_until_milk),
        }],
        total_avg_milk: row.avg_daily_milk_kg,
        total_loss_days: 0,
        total_milk_lost_kg: 0,
        total_value_lost_eur: 0,
      });
    }

    return acc;
  }, [] as (AnimalTreatmentAggregate & {
    withdrawal_periods: Array<{ start: Date; end: Date }>;
    total_avg_milk?: number;
  })[]).map(animal => {
    const total_days = mergeWithdrawalPeriods(animal.withdrawal_periods);
    const avg_milk = animal.total_avg_milk! / animal.treatment_count;
    const milk_price = filteredTreatmentData[0]?.milk_price_eur_per_kg || 0.45;

    animal.total_loss_days = total_days;
    animal.total_milk_lost_kg = avg_milk * total_days;
    animal.total_value_lost_eur = animal.total_milk_lost_kg * milk_price;

    return animal as AnimalTreatmentAggregate;
  });

  const sortedData = [...filteredAggregatedData].sort((a, b) => {
    let compareValue = 0;
    switch (sortBy) {
      case 'total_loss':
        compareValue = a.total_value_lost_eur - b.total_value_lost_eur;
        break;
      case 'milk_lost':
        compareValue = a.total_milk_lost_kg - b.total_milk_lost_kg;
        break;
      case 'days':
        compareValue = a.total_loss_days - b.total_loss_days;
        break;
      case 'treatments':
        compareValue = a.treatment_count - b.treatment_count;
        break;
      case 'animal':
        compareValue = (a.animal_tag || '').localeCompare(b.animal_tag || '');
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

  const getTreatmentsForAnimal = (animalId: string) => {
    return filteredTreatmentData.filter(t => t.animal_id === animalId);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setVetFilter('');
  };

  const hasActiveFilters = searchTerm || dateFrom || dateTo || vetFilter;

  const totalStats = sortedData.reduce(
    (acc, row) => ({
      totalAnimals: acc.totalAnimals + 1,
      totalTreatments: acc.totalTreatments + row.treatment_count,
      totalLossDays: acc.totalLossDays + row.total_loss_days,
      totalMilkLost: acc.totalMilkLost + row.total_milk_lost_kg,
      totalValue: acc.totalValue + row.total_value_lost_eur,
    }),
    {
      totalAnimals: 0,
      totalTreatments: 0,
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

  const isModal = !!animalId;

  const content = (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-6 border border-orange-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isModal ? `Pieno Nuostoliai - ${animalTag}` : 'Pieno Nuostoliai Per Gydymus'}
              </h2>
              <p className="text-sm text-gray-600">
                Pieno gamybos nuostoliai dėl vaistų karencijos laikotarpio (karencines dienos)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTreatmentMilkLossData}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              title="Atnaujinti"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
            {isModal && onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                title="Uždaryti"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            )}
          </div>
        </div>

        {!isModal && (
          <div className="mb-4 space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Ieškoti pagal gyvūno numerį..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${showFilters ? 'bg-orange-600 text-white' : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'}`}
              >
                {showFilters ? 'Paslėpti filtrus' : 'Rodyti filtrus'}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  title="Išvalyti visus filtrus"
                >
                  Išvalyti
                </button>
              )}
            </div>

            {showFilters && (
              <div className="bg-white rounded-lg p-4 border-2 border-gray-300 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data nuo
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data iki
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Veterinaras
                    </label>
                    <select
                      value={vetFilter}
                      onChange={(e) => setVetFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Visi</option>
                      {uniqueVets.map((vet) => (
                        <option key={vet} value={vet}>
                          {vet}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="text-sm text-gray-600 pt-2 border-t border-gray-200">
                    Rodoma: <span className="font-semibold">{filteredTreatmentData.length}</span> gydymų iš <span className="font-semibold">{treatmentLossData.length}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Droplet className="w-4 h-4 text-gray-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Gyvūnų</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalStats.totalAnimals}</div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Gydymų</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{totalStats.totalTreatments}</div>
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
              <Droplet className="w-4 h-4 text-blue-600" />
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

        <div className="mt-4 pt-4 border-t border-orange-200 space-y-3">
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-amber-900">
                <span className="font-semibold">Svarbu:</span> Kai gyvūnas gauna kelis gydymus iš eilės, pieno nuostoliai skaičiuojami kaip <span className="font-semibold">ištisinis laikotarpis</span> nuo pirmojo gydymo iki paskutinės karencijos pabaigos. Persidengiančios dienos neskaičiuojamos kelis kartus.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Vid. nuostoliai per gyvūną:</span>
              <span className="ml-2 font-bold text-orange-700">
                {formatCurrencyLT(totalStats.totalAnimals > 0 ? totalStats.totalValue / totalStats.totalAnimals : 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Vid. nuostoliai per gydymą:</span>
              <span className="ml-2 font-bold text-red-700">
                {formatCurrencyLT(totalStats.totalTreatments > 0 ? totalStats.totalValue / totalStats.totalTreatments : 0)}
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
                {!isModal && <th className="w-12 px-4 py-3"></th>}
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('animal')}
                >
                  Gyvūnas {sortBy === 'animal' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('treatments')}
                >
                  Gydymų {sortBy === 'treatments' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('days')}
                  title="Ištisinių dienų laikotarpis nuo pirmojo gydymo iki paskutinės karencijos"
                >
                  Dienų (ištisinis) {sortBy === 'days' && (sortOrder === 'desc' ? '↓' : '↑')}
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
                const treatments = getTreatmentsForAnimal(row.animal_id);

                return (
                  <React.Fragment key={row.animal_id}>
                    <tr className="hover:bg-gray-50">
                      {!isModal && (
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
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{row.animal_tag}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.treatment_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.total_loss_days}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        {formatNumberLT(row.total_milk_lost_kg)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600">
                        {formatCurrencyLT(row.total_value_lost_eur)}
                      </td>
                    </tr>

                    {(isExpanded || isModal) && (
                      <tr>
                        <td colSpan={isModal ? 5 : 6} className="px-4 py-4 bg-gray-50">
                          <div className="space-y-3">
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Gydymų istorija su pieno nuostoliais</h4>
                              <div className="space-y-2">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-medium text-blue-900 mb-1">Skaičiuojamas ištisinių dienų laikotarpis</div>
                                      <div className="text-blue-700 text-xs">
                                        Pieno nuostoliai skaičiuojami nuo <span className="font-semibold">pirmojo gydymo datos</span> iki <span className="font-semibold">paskutinės karencijos pabaigos</span>.
                                        Kai gydymai persikloja, dienos neskaičiuojamos kelis kartus.
                                        {treatments.length > 0 && (
                                          <span className="block mt-1">
                                            ({formatDateLT(treatments[treatments.length - 1]?.treatment_date)} → {formatDateLT(treatments[0]?.withdrawal_until_milk)} = {row.total_loss_days} d.)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                                  <div className="flex items-start gap-2">
                                    <Droplet className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-medium text-green-900 mb-1">Vidutinė pieno produkcija</div>
                                      <div className="text-green-700 text-xs">
                                        Kiekvieno gydymo pieno produkcija skaičiuojama kaip <span className="font-semibold">vidutinė reikšmė 7 dienų prieš gydymą</span>.
                                        Bendriems nuostoliams naudojamas <span className="font-semibold">visų gydymų vidurkis</span>.
                                        {treatments.length > 0 && (
                                          <span className="block mt-1">
                                            Vid. pieno: {formatNumberLT(treatments.reduce((sum, t) => sum + t.avg_daily_milk_kg, 0) / treatments.length)} kg/d.
                                            (iš {treatments.length} gydymų)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {treatments.map((treatment) => (
                              <div
                                key={treatment.treatment_id}
                                className="bg-white border border-gray-200 rounded-lg p-4"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <div className="text-xs text-gray-500">Gydymo data</div>
                                    <div className="text-sm font-medium">{formatDateLT(treatment.treatment_date)}</div>
                                    {treatment.clinical_diagnosis && (
                                      <div className="text-xs text-gray-600 mt-1">{treatment.clinical_diagnosis}</div>
                                    )}
                                    {treatment.vet_name && (
                                      <div className="text-xs text-gray-500 mt-1">Vet: {treatment.vet_name}</div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-xs text-gray-500">Karencijos laikotarpis (atskiras)</div>
                                    <div className="text-sm">
                                      {formatDateLT(treatment.treatment_date)} - {formatDateLT(treatment.withdrawal_until_milk)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      {treatment.withdrawal_days} d. + {treatment.safety_days} d. (saugumas) = <span className="font-semibold">{treatment.total_loss_days} d.</span>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs text-gray-500">Nuostoliai (jei būtų atskiras)</div>
                                    <div className="text-sm text-gray-600">
                                      {formatNumberLT(treatment.avg_daily_milk_kg)} kg/d. × {treatment.total_loss_days} d.
                                    </div>
                                    <div className="text-sm font-semibold text-gray-600 mt-1">
                                      = {formatNumberLT(treatment.total_milk_lost_kg)} kg
                                    </div>
                                    <div className="text-base font-semibold text-gray-600 mt-1">
                                      ({formatCurrencyLT(treatment.total_value_lost_eur)})
                                    </div>
                                    <div className="text-xs text-gray-500 italic mt-1">
                                      *Tikroji suma skaičiuojama pagal visų gydymų laikotarpį
                                    </div>
                                  </div>

                                  {treatment.medications_used && treatment.medications_used.length > 0 && (
                                    <div className="md:col-span-3 mt-2 pt-2 border-t border-gray-200">
                                      <div className="text-xs text-gray-500 mb-2">Panaudoti vaistai</div>
                                      <div className="space-y-1">
                                        {treatment.medications_used.map((med, idx) => (
                                          <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded">
                                            <div className="flex-1">
                                              <span className="font-medium">{med.product_name}</span>
                                              <span className="text-gray-600 ml-2">
                                                {med.qty} {med.unit}
                                              </span>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              Karencija: <span className="font-semibold text-orange-600">{med.withdrawal_milk_days} d. (pienas)</span>
                                              {' / '}
                                              <span className="font-semibold text-gray-600">{med.withdrawal_meat_days} d. (mėsa)</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
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
                  <td colSpan={isModal ? 5 : 6} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Nerasta gyvūnų pagal paieškos kriterijus' : 'Nėra duomenų apie pieno nuostolius per gydymus'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return content;
}
