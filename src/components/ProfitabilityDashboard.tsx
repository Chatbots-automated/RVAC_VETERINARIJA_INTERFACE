import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchGeaGroupData } from '../lib/helpers';
import { formatCurrencyLT, formatNumberLT } from '../lib/formatters';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  AlertTriangle,
  CheckCircle,
  Droplet,
  Activity,
  BarChart3,
  Calculator,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ProfitabilityData {
  animal_id: string;
  tag_no: string | null;
  collar_no: string | null;
  days_tracked: number;
  total_milk_liters: number;
  avg_daily_milk: number;
  milk_revenue: number;
  withdrawal_revenue_loss: number;
  adjusted_milk_revenue: number;
  treatment_count: number;
  vaccination_count: number;
  visit_count: number;
  medication_costs: number;
  visit_costs: number;
  total_costs: number;
  net_profit: number;
  roi_percentage: number | null;
  cost_to_revenue_ratio: number | null;
  lactation_days: number | null;
  current_group: number | null;
  current_status: string | null;
  is_producing: boolean | null;
  days_in_withdrawal: number;
}

interface TreatmentROIAnalysis {
  animal_id: string;
  tag_no: string | null;
  collar_no: string | null;
  avg_daily_milk: number;
  net_profit: number;
  current_total_costs: number;
  treatment_count_last_90_days: number;
  total_treatment_cost: number;
  avg_treatment_cost: number;
  last_treatment_date: string | null;
  successful_treatments: number;
  ongoing_treatments: number;
  success_rate_percentage: number | null;
  days_to_payback_avg_treatment: number | null;
  recommendation: 'profitable' | 'monitor' | 'at_risk' | 'chronic_case' | 'cull_recommended';
  current_status: string | null;
  is_producing: boolean | null;
}

interface HerdSummary {
  total_animals: number;
  profitable_count: number;
  unprofitable_count: number;
  severe_loss_count: number;
  total_herd_milk: number;
  total_milk_revenue: number;
  total_treatment_costs: number;
  total_herd_profit: number;
  avg_profit_per_animal: number;
  avg_daily_milk_per_animal: number;
  total_withdrawal_days: number;
  total_withdrawal_loss: number;
  overall_cost_to_revenue_ratio: number;
}

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  description: string | null;
}

type TabType = 'pelningumas' | 'sprendimai' | 'banda' | 'konfiguracija';

export function ProfitabilityDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('pelningumas');
  const [profitabilityData, setProfitabilityData] = useState<ProfitabilityData[]>([]);
  const [roiAnalysis, setRoiAnalysis] = useState<TreatmentROIAnalysis[]>([]);
  const [herdSummary, setHerdSummary] = useState<HerdSummary | null>(null);
  const [geaGroupData, setGeaGroupData] = useState<any[]>([]);
  const [geaStatusCounts, setGeaStatusCounts] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'net_profit' | 'milk_revenue' | 'total_costs' | 'tag_no'>('net_profit');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Treatment decision calculator state
  const [selectedAnimal, setSelectedAnimal] = useState<string>('');
  const [estimatedTreatmentCost, setEstimatedTreatmentCost] = useState<number>(0);
  const [decisionResult, setDecisionResult] = useState<any>(null);
  const [decisionSearchTerm, setDecisionSearchTerm] = useState('');

  // Animal detail modal state
  const [selectedAnimalDetail, setSelectedAnimalDetail] = useState<ProfitabilityData | null>(null);

  // Recommendation cards expansion state
  const [expandedRecommendations, setExpandedRecommendations] = useState<Set<string>>(new Set());

  // System settings
  const [milkPrice, setMilkPrice] = useState<number>(0.50);
  const [editingMilkPrice, setEditingMilkPrice] = useState(false);
  const [tempMilkPrice, setTempMilkPrice] = useState<string>('0.50');

  const loadData = async (forceStartDate?: string | null, forceEndDate?: string | null) => {
    try {
      setLoading(true);

      // Use forced dates if provided, otherwise use current state
      const useStartDate = forceStartDate !== undefined ? forceStartDate : startDate;
      const useEndDate = forceEndDate !== undefined ? forceEndDate : endDate;

      console.log('=== LOAD DATA ===');
      console.log('State - startDate:', startDate, 'endDate:', endDate);
      console.log('Forced - forceStartDate:', forceStartDate, 'forceEndDate:', forceEndDate);
      console.log('Using - useStartDate:', useStartDate, 'useEndDate:', useEndDate);

      // Determine date range for filtering
      const hasDateFilter = useStartDate || useEndDate;
      const filterStartDate = useStartDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const filterEndDate = useEndDate || new Date().toISOString().split('T')[0];

      console.log('hasDateFilter:', hasDateFilter, 'range:', filterStartDate, 'to', filterEndDate);

      if (hasDateFilter) {
        console.log('>>> QUERYING WITH DATE FILTER');
        await loadDataWithDateFilter(filterStartDate, filterEndDate);
      } else {
        console.log('>>> QUERYING DATABASE VIEWS (90 days)');
        await loadDataFromViews();
      }
    } catch (error) {
      console.error('Error loading profitability data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadSettings();
  }, []);

  const loadDataFromViews = async () => {
    // Load profitability data - fetch ALL rows (Supabase default limit is 1000, need to paginate)
    let allProfData: ProfitabilityData[] = [];
    let profPage = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: profData, error: profError } = await supabase
        .from('vw_animal_profitability')
        .select('*')
        .range(profPage * pageSize, (profPage + 1) * pageSize - 1);

      if (profError) throw profError;
      if (profData && profData.length > 0) {
        allProfData = [...allProfData, ...profData];
        profPage++;
        hasMore = profData.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    setProfitabilityData(allProfData);

    // Load ROI analysis data - fetch ALL rows
    let allRoiData: TreatmentROIAnalysis[] = [];
    let roiPage = 0;
    hasMore = true;

    while (hasMore) {
      const { data: roiData, error: roiError } = await supabase
        .from('vw_treatment_roi_analysis')
        .select('*')
        .range(roiPage * pageSize, (roiPage + 1) * pageSize - 1);

      if (roiError) throw roiError;
      if (roiData && roiData.length > 0) {
        allRoiData = [...allRoiData, ...roiData];
        roiPage++;
        hasMore = roiData.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setRoiAnalysis(allRoiData);

    // Load herd summary
    const { data: summaryData, error: summaryError } = await supabase
      .from('vw_herd_profitability_summary')
      .select('*')
      .single();

    if (summaryError) throw summaryError;
    setHerdSummary(summaryData);

    // Load GEA group data from raw tables (avoids slow gea_daily_cows_joined view)
    const { data: animals } = await supabase
      .from('animals')
      .select('id, tag_no')
      .eq('active', true);

    const geaGroupMap = await fetchGeaGroupData();
    const animalTagMap = new Map(animals?.map(a => [a.tag_no, a.id]) || []);

    const latestAnimalData: any[] = [];
    animalTagMap.forEach((animalId, tagNo) => {
      const gea = geaGroupMap.get(tagNo);
      if (gea) {
        latestAnimalData.push({
          animal_id: animalId,
          grupe: gea.group_number,
          statusas: gea.cow_state,
          snapshot_date: gea.import_created_at
        });
      }
    });
    setGeaGroupData(latestAnimalData);

    // Count animals by status
    const statusCounts: {[key: string]: number} = {};
    latestAnimalData.forEach(row => {
      const status = row.statusas || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    setGeaStatusCounts(statusCounts);
  };

  const calculateHerdSummary = (data: ProfitabilityData[]): HerdSummary => {
    const total_animals = data.length;
    const profitable_count = data.filter(a => a.net_profit > 0).length;
    const unprofitable_count = data.filter(a => a.net_profit <= 0).length;
    const severe_loss_count = data.filter(a => a.net_profit < -50).length;
    const total_herd_milk = data.reduce((sum, a) => sum + a.total_milk_liters, 0);
    const total_milk_revenue = data.reduce((sum, a) => sum + a.milk_revenue, 0);
    const total_treatment_costs = data.reduce((sum, a) => sum + a.total_costs, 0);
    const total_herd_profit = data.reduce((sum, a) => sum + a.net_profit, 0);
    const avg_profit_per_animal = total_animals > 0 ? total_herd_profit / total_animals : 0;
    const avg_daily_milk_per_animal = total_animals > 0 ? data.reduce((sum, a) => sum + a.avg_daily_milk, 0) / total_animals : 0;
    const total_withdrawal_days = data.reduce((sum, a) => sum + a.days_in_withdrawal, 0);
    const total_withdrawal_loss = data.reduce((sum, a) => sum + a.withdrawal_revenue_loss, 0);
    const overall_cost_to_revenue_ratio = total_milk_revenue > 0 ? (total_treatment_costs / total_milk_revenue * 100) : 0;

    return {
      total_animals,
      profitable_count,
      unprofitable_count,
      severe_loss_count,
      total_herd_milk,
      total_milk_revenue,
      total_treatment_costs,
      total_herd_profit,
      avg_profit_per_animal,
      avg_daily_milk_per_animal,
      total_withdrawal_days,
      total_withdrawal_loss,
      overall_cost_to_revenue_ratio
    };
  };

  const loadDataWithDateFilter = async (startDateStr: string, endDateStr: string) => {
    // Query raw data with custom date range from new GEA system
    const { data: geaData, error: geaError } = await supabase
      .from('gea_daily_cows_joined')
      .select(`
        ear_number,
        cow_number,
        import_created_at,
        milkings,
        lactation_days,
        group_number,
        cow_state,
        produce_milk
      `)
      .gte('import_created_at', startDateStr)
      .lte('import_created_at', endDateStr);

    if (geaError) {
      console.error('Error loading GEA data:', geaError);
    }

    // Map ear_number to animal_id
    const { data: animals } = await supabase
      .from('animals')
      .select('id, tag_no')
      .eq('active', true);

    const animalTagMap = new Map(animals?.map(a => [a.tag_no, a.id]) || []);
    
    let allGeaData: any[] = [];
    if (geaData) {
      allGeaData = geaData.map(gea => ({
        animal_id: animalTagMap.get(gea.ear_number),
        snapshot_date: gea.import_created_at,
        m1_qty: gea.milkings?.[0]?.weight || null,
        m2_qty: gea.milkings?.[1]?.weight || null,
        m3_qty: gea.milkings?.[2]?.weight || null,
        m4_qty: gea.milkings?.[3]?.weight || null,
        m5_qty: gea.milkings?.[4]?.weight || null,
        lact_days: gea.lactation_days,
        grupe: gea.group_number,
        statusas: gea.cow_state,
        in_milk: gea.produce_milk,
        collar_no: gea.cow_number
      })).filter(item => item.animal_id); // Only include items with valid animal_id
    }

    // Query treatments with date filter
    const { data: treatmentsData, error: treatmentsError } = await supabase
      .from('treatments')
      .select('animal_id, reg_date, withdrawal_until_milk, usage_items(qty, batch:batches(purchase_price, received_qty))')
      .gte('reg_date', startDateStr)
      .lte('reg_date', endDateStr);

    if (treatmentsError) throw treatmentsError;

    // Query vaccinations with date filter
    const { data: vaccinationsData, error: vaccinationsError } = await supabase
      .from('vaccinations')
      .select('animal_id, vaccination_date')
      .gte('vaccination_date', startDateStr)
      .lte('vaccination_date', endDateStr);

    if (vaccinationsError) throw vaccinationsError;

    // Query visits with date filter
    const { data: visitsData, error: visitsError } = await supabase
      .from('animal_visits')
      .select('animal_id, visit_datetime')
      .gte('visit_datetime', startDateStr)
      .lte('visit_datetime', endDateStr);

    if (visitsError) throw visitsError;

    // Get animals
    const { data: animalsData, error: animalsError } = await supabase
      .from('animals')
      .select('id, tag_no');

    if (animalsError) throw animalsError;

    // Calculate profitability for each animal
    const animalMap = new Map<string, ProfitabilityData>();

    // Process GEA data
    const animalGea = new Map<string, any[]>();
    allGeaData.forEach(row => {
      if (!animalGea.has(row.animal_id)) {
        animalGea.set(row.animal_id, []);
      }
      animalGea.get(row.animal_id)!.push(row);
    });

    // Build profitability data
    animalsData?.forEach(animal => {
      const geaRecords = animalGea.get(animal.id) || [];
      const totalMilk = geaRecords.reduce((sum, r) => sum +
        (r.m1_qty || 0) + (r.m2_qty || 0) + (r.m3_qty || 0) + (r.m4_qty || 0) + (r.m5_qty || 0), 0);
      const daysTracked = geaRecords.length;
      const avgDailyMilk = daysTracked > 0 ? totalMilk / daysTracked : 0;

      // Calculate treatment costs
      const animalTreatments = (treatmentsData || []).filter(t => t.animal_id === animal.id);
      let medicationCosts = 0;
      animalTreatments.forEach((t: any) => {
        const items = t.usage_items || [];
        items.forEach((item: any) => {
          if (item.batch && item.batch.received_qty > 0) {
            medicationCosts += item.qty * item.batch.purchase_price / item.batch.received_qty;
          }
        });
      });

      const vaccinations = (vaccinationsData || []).filter(v => v.animal_id === animal.id);
      const visits = (visitsData || []).filter(v => v.animal_id === animal.id);
      const visitCosts = visits.length * 10;
      const totalCosts = medicationCosts + visitCosts;

      // Calculate withdrawal days
      const withdrawalDays = animalTreatments.filter(t => t.withdrawal_until_milk).length;
      const withdrawalLoss = withdrawalDays * 15; // Default daily loss

      const milkRevenue = totalMilk * milkPrice;
      const adjustedRevenue = milkRevenue - withdrawalLoss;
      const netProfit = adjustedRevenue - totalCosts;
      const roi = totalCosts > 0 ? (netProfit / totalCosts) * 100 : null;
      const costToRevenueRatio = adjustedRevenue > 0 ? (totalCosts / adjustedRevenue) * 100 : null;

      const latestGea = geaRecords.length > 0 ? geaRecords[geaRecords.length - 1] : null;

      animalMap.set(animal.id, {
        animal_id: animal.id,
        tag_no: animal.tag_no,
        collar_no: latestGea?.collar_no || null,
        days_tracked: daysTracked,
        total_milk_liters: totalMilk,
        avg_daily_milk: avgDailyMilk,
        milk_revenue: milkRevenue,
        withdrawal_revenue_loss: withdrawalLoss,
        adjusted_milk_revenue: adjustedRevenue,
        treatment_count: animalTreatments.length,
        vaccination_count: vaccinations.length,
        visit_count: visits.length,
        medication_costs: medicationCosts,
        visit_costs: visitCosts,
        total_costs: totalCosts,
        net_profit: netProfit,
        roi_percentage: roi,
        cost_to_revenue_ratio: costToRevenueRatio,
        lactation_days: latestGea?.lact_days || null,
        current_group: latestGea?.grupe || null,
        current_status: latestGea?.statusas || null,
        is_producing: latestGea?.in_milk || null,
        days_in_withdrawal: withdrawalDays
      });
    });

    const profData = Array.from(animalMap.values());
    setProfitabilityData(profData);

    // Calculate herd summary from filtered data
    const summary = calculateHerdSummary(profData);
    setHerdSummary(summary);

    // Load ROI and GEA data (use default views for now)
    let allRoiData: TreatmentROIAnalysis[] = [];
    let roiPage = 0;
    hasMore = true;

    while (hasMore) {
      const { data: roiData, error: roiError } = await supabase
        .from('vw_treatment_roi_analysis')
        .select('*')
        .range(roiPage * pageSize, (roiPage + 1) * pageSize - 1);

      if (roiError) throw roiError;
      if (roiData && roiData.length > 0) {
        allRoiData = [...allRoiData, ...roiData];
        roiPage++;
        hasMore = roiData.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setRoiAnalysis(allRoiData);

    // Load GEA group data from new GEA system
    const { data: geaGroupData, error: geaGroupError } = await supabase
      .from('gea_daily_cows_joined')
      .select('ear_number, group_number, cow_state, import_created_at')
      .order('import_created_at', { ascending: false });

    if (geaGroupError) {
      console.error('Error loading GEA group data:', geaGroupError);
    }

    // Map ear_number to animal_id
    const { data: animalsForGroupMap } = await supabase
      .from('animals')
      .select('id, tag_no')
      .eq('active', true);

    const animalTagMapForGroups = new Map(animalsForGroupMap?.map(a => [a.tag_no, a.id]) || []);
    
    let allGeaGroupData: any[] = [];
    if (geaGroupData) {
      const latestPerAnimal = new Map();
      for (const gea of geaGroupData) {
        const animalId = animalTagMapForGroups.get(gea.ear_number);
        if (animalId && !latestPerAnimal.has(animalId)) {
          latestPerAnimal.set(animalId, {
            animal_id: animalId,
            grupe: gea.group_number,
            statusas: gea.cow_state,
            snapshot_date: gea.import_created_at
          });
        }
      }
      allGeaGroupData = Array.from(latestPerAnimal.values());
    }

    const animalGroupMap = new Map();
    allGeaGroupData.forEach(row => {
      if (!animalGroupMap.has(row.animal_id) ||
          new Date(row.snapshot_date) > new Date(animalGroupMap.get(row.animal_id).snapshot_date)) {
        animalGroupMap.set(row.animal_id, row);
      }
    });
    const latestAnimalData = Array.from(animalGroupMap.values());
    setGeaGroupData(latestAnimalData);

    // Count animals by status
    const statusCounts: {[key: string]: number} = {};
    latestAnimalData.forEach(row => {
      const status = row.statusas || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    setGeaStatusCounts(statusCounts);
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('setting_key', 'milk_price_per_liter')
        .single();

      if (error) throw error;
      if (data) {
        const price = parseFloat(data.setting_value);
        setMilkPrice(price);
        setTempMilkPrice(price.toFixed(2));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const updateMilkPrice = async () => {
    try {
      const newPrice = parseFloat(tempMilkPrice);
      if (isNaN(newPrice) || newPrice <= 0) {
        alert('Įveskite teisingą kainą');
        return;
      }

      const { error } = await supabase
        .from('system_settings')
        .update({ setting_value: newPrice.toString() })
        .eq('setting_key', 'milk_price_per_liter');

      if (error) throw error;

      setMilkPrice(newPrice);
      setEditingMilkPrice(false);

      // Reload data to reflect new prices
      await loadData();
    } catch (error) {
      console.error('Error updating milk price:', error);
      alert('Klaida atnaujinant kainą');
    }
  };

  const calculateTreatmentDecision = () => {
    if (!selectedAnimal || !estimatedTreatmentCost) return;

    const animal = roiAnalysis.find(a => a.animal_id === selectedAnimal);
    if (!animal) return;

    const dailyRevenue = animal.avg_daily_milk * milkPrice;
    const daysToPayback = dailyRevenue > 0 ? Math.ceil(estimatedTreatmentCost / dailyRevenue) : null;

    let decision: 'treat' | 'monitor' | 'cull';
    let reasoning: string;
    let confidence: 'high' | 'medium' | 'low';

    if (animal.net_profit < -100) {
      decision = 'cull';
      reasoning = 'Gyvulys yra labai nuostolingas (< -100 EUR per 90 dienų). Gydymo investicija greičiausiai neatsipirks.';
      confidence = 'high';
    } else if (daysToPayback && daysToPayback > 90) {
      decision = 'cull';
      reasoning = `Gydymo kaštai atsipirktų per ${daysToPayback} dienas, kas yra per ilgas laikotarpis.`;
      confidence = 'high';
    } else if (daysToPayback && daysToPayback > 30) {
      decision = 'monitor';
      reasoning = `Gydymo kaštai atsipirktų per ~${daysToPayback} dienas. Stebėkite situaciją.`;
      confidence = 'medium';
    } else if (animal.success_rate_percentage && animal.success_rate_percentage < 50) {
      decision = 'monitor';
      reasoning = `Gydymo sėkmės rodiklis yra žemas (${animal.success_rate_percentage}%). Apsvarstykite alternatyvas.`;
      confidence = 'medium';
    } else {
      decision = 'treat';
      reasoning = daysToPayback
        ? `Gydymo kaštai atsipirktų per ~${daysToPayback} dienas. Gera investicija.`
        : 'Gyvulys yra produktyvus ir verta jį gydyti.';
      confidence = 'high';
    }

    setDecisionResult({
      decision,
      reasoning,
      confidence,
      daysToPayback,
      dailyRevenue,
      currentProfit: animal.net_profit,
      successRate: animal.success_rate_percentage,
      avgDailyMilk: animal.avg_daily_milk
    });
  };

  const getSortedAndFilteredData = () => {
    let filtered = profitabilityData.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      return (
        (item.tag_no?.toLowerCase().includes(searchLower) || false) ||
        (item.collar_no?.toString().includes(searchLower) || false)
      );
    });

    filtered.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'net_profit':
          aVal = a.net_profit;
          bVal = b.net_profit;
          break;
        case 'milk_revenue':
          aVal = a.milk_revenue;
          bVal = b.milk_revenue;
          break;
        case 'total_costs':
          aVal = a.total_costs;
          bVal = b.total_costs;
          break;
        case 'tag_no':
          aVal = a.tag_no || '';
          bVal = b.tag_no || '';
          break;
        default:
          aVal = a.net_profit;
          bVal = b.net_profit;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  };

  const getProfitabilityColor = (profit: number) => {
    if (profit > 50) return 'text-emerald-700 bg-emerald-50';
    if (profit > 0) return 'text-green-700 bg-green-50';
    if (profit > -10) return 'text-yellow-700 bg-yellow-50';
    if (profit > -50) return 'text-orange-700 bg-orange-50';
    return 'text-red-700 bg-red-50';
  };

  const getProfitabilityIcon = (profit: number) => {
    if (profit > 0) return <TrendingUp className="w-4 h-4" />;
    if (profit < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'profitable':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Pelningas</span>;
      case 'monitor':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Stebėti</span>;
      case 'at_risk':
        return <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">Rizikoje</span>;
      case 'chronic_case':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Lėtinis</span>;
      case 'cull_recommended':
        return <span className="px-2 py-1 bg-red-200 text-red-900 text-xs rounded-full font-semibold">Šalinti</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">—</span>;
    }
  };

  const toggleRecommendation = (recommendation: string) => {
    setExpandedRecommendations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recommendation)) {
        newSet.delete(recommendation);
      } else {
        newSet.add(recommendation);
      }
      return newSet;
    });
  };

  const getAnimalsForRecommendation = (recommendation: string) => {
    return roiAnalysis
      .filter(a => a.recommendation === recommendation)
      .sort((a, b) => a.net_profit - b.net_profit);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg shadow-lg p-6 text-white">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <TrendingUp className="w-8 h-8" />
          Pelningumas & Finansinė Analizė
        </h1>
        <p className="mt-2 text-emerald-50">
          Išsami finansinė analizė ir gydymo sprendimų palaikymas
        </p>
      </div>

      {/* Summary Cards */}
      {herdSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Bendras Pelnas</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrencyLT(herdSummary.total_herd_profit)}
                </p>
              </div>
              <Euro className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Vidutiniškai: {formatCurrencyLT(herdSummary.avg_profit_per_animal)} / gyvulys
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pieno Pajamos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrencyLT(herdSummary.total_milk_revenue)}
                </p>
              </div>
              <Droplet className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatNumberLT(herdSummary.total_herd_milk)} L pieno
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Gydymo Kaštai</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrencyLT(herdSummary.total_treatment_costs)}
                </p>
              </div>
              <Activity className="w-8 h-8 text-orange-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {herdSummary.overall_cost_to_revenue_ratio.toFixed(1)}% pajamų
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pelningi Gyvuliai</p>
                <p className="text-2xl font-bold text-gray-900">
                  {herdSummary.profitable_count} / {herdSummary.total_animals}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {((herdSummary.profitable_count / herdSummary.total_animals) * 100).toFixed(1)}% bandos
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('pelningumas')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pelningumas'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Euro className="w-4 h-4" />
                Pelningumas
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sprendimai')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sprendimai'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Gydymo Sprendimai
              </div>
            </button>
            <button
              onClick={() => setActiveTab('banda')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'banda'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Bandos Analizė
              </div>
            </button>
            <button
              onClick={() => setActiveTab('konfiguracija')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'konfiguracija'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Konfigūracija
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Pelningumas Tab */}
          {activeTab === 'pelningumas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Ieškoti pagal auskarą arba kaklajuostės nr..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Nuo:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Iki:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    loadData('', '');
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50"
                >
                  Išvalyti
                </button>
                <button
                  onClick={() => {
                    console.log('Atnaujinti clicked - dates:', startDate, endDate);
                    loadData(startDate, endDate);
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Atnaujinti
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gyvulys
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pieno Pajamos
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gydymo Kaštai
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Grynasis Pelnas
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ROI
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statusas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getSortedAndFilteredData().map((animal) => (
                      <tr
                        key={animal.animal_id}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          console.log('Row clicked:', animal.tag_no);
                          setSelectedAnimalDetail(animal);
                        }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{animal.tag_no || '—'}</div>
                              <div className="text-xs text-gray-500">Kakl: {animal.collar_no || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-semibold text-blue-700">
                            {formatCurrencyLT(animal.adjusted_milk_revenue)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatNumberLT(animal.total_milk_liters)} L
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-semibold text-orange-700">
                            {formatCurrencyLT(animal.total_costs)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {animal.treatment_count} gyd.
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className={`flex items-center justify-end gap-1 ${getProfitabilityColor(animal.net_profit)}`}>
                            {getProfitabilityIcon(animal.net_profit)}
                            <span className="text-sm font-bold">
                              {formatCurrencyLT(animal.net_profit)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className="text-sm font-medium text-gray-700">
                            {animal.roi_percentage ? `${animal.roi_percentage}%` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex flex-col items-center gap-1">
                            {animal.current_status === 'APSĖK' && (
                              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-semibold">
                                APSĖK
                              </span>
                            )}
                            {animal.current_group === 5 && (
                              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                                Gr. 5
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Gydymo Sprendimai Tab */}
          {activeTab === 'sprendimai' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Ar Verta Gydyti Šį Gyvulį?</h3>
                <p className="text-sm text-blue-700">
                  Pasirinkite gyvulį, įveskite numatomas gydymo išlaidas ir gaukite rekomendaciją ar verta investuoti į gydymą.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Step 1: Search and Select Animal */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      1. Pasirinkite Gyvulį
                    </label>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Ieškoti pagal auskarą..."
                        value={decisionSearchTerm}
                        onChange={(e) => setDecisionSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      {roiAnalysis
                        .filter(animal => {
                          const searchLower = decisionSearchTerm.toLowerCase();
                          return (
                            (animal.tag_no?.toLowerCase().includes(searchLower) || false) ||
                            (animal.collar_no?.toString().includes(searchLower) || false)
                          );
                        })
                        .slice(0, 8)
                        .map((animal) => (
                          <button
                            key={animal.animal_id}
                            onClick={() => setSelectedAnimal(animal.animal_id)}
                            className={`w-full px-4 py-2 text-left border-b border-gray-200 hover:bg-blue-50 transition-colors ${
                              selectedAnimal === animal.animal_id ? 'bg-blue-100 font-semibold' : ''
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-900">
                              {animal.tag_no || 'Nežinomas'}
                            </div>
                            <div className="text-xs text-gray-500">
                              Kakl: {animal.collar_no || '—'}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Step 2: Selected Animal Info */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      2. Gyvulio Informacija
                    </label>
                    {selectedAnimal ? (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        {(() => {
                          const animal = roiAnalysis.find(a => a.animal_id === selectedAnimal);
                          if (!animal) return null;
                          return (
                            <>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Auskaras:</span>
                                  <span className="font-medium">{animal.tag_no || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Pieno per dieną:</span>
                                  <span className="font-bold text-blue-700">{formatNumberLT(animal.avg_daily_milk)} L</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Dienos pajamos:</span>
                                  <span className="font-bold text-green-700">
                                    {formatCurrencyLT(animal.avg_daily_milk * milkPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-gray-300">
                                  <span className="text-gray-600">Pelnas (90d):</span>
                                  <span className={`font-bold ${animal.net_profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {formatCurrencyLT(animal.net_profit)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Gydymų sk.:</span>
                                  <span className="font-medium">{animal.treatment_count_last_90_days}</span>
                                </div>
                                {animal.success_rate_percentage !== null && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Sėkmės rodiklis:</span>
                                    <span className="font-medium">{animal.success_rate_percentage}%</span>
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 h-full flex items-center justify-center">
                        <p className="text-sm text-gray-500">Pasirinkite gyvulį iš sąrašo</p>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Treatment Cost */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      3. Gydymo Kaina
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={estimatedTreatmentCost || ''}
                      onChange={(e) => setEstimatedTreatmentCost(Number(e.target.value))}
                      placeholder="Įveskite kainą (EUR)"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                    />
                    <button
                      onClick={calculateTreatmentDecision}
                      disabled={!selectedAnimal || !estimatedTreatmentCost}
                      className="w-full mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
                    >
                      <Calculator className="w-5 h-5" />
                      Skaičiuoti Rekomendaciją
                    </button>
                  </div>
                </div>
              </div>

              {decisionResult && (
                <div className={`rounded-lg p-6 ${
                  decisionResult.decision === 'treat' ? 'bg-green-50 border-2 border-green-300' :
                  decisionResult.decision === 'monitor' ? 'bg-yellow-50 border-2 border-yellow-300' :
                  'bg-red-50 border-2 border-red-300'
                }`}>
                  <div className="flex items-start gap-4">
                    {decisionResult.decision === 'treat' ? (
                      <CheckCircle className="w-12 h-12 text-green-600 flex-shrink-0" />
                    ) : decisionResult.decision === 'monitor' ? (
                      <AlertTriangle className="w-12 h-12 text-yellow-600 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-12 h-12 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <h3 className={`text-2xl font-bold mb-3 ${
                        decisionResult.decision === 'treat' ? 'text-green-900' :
                        decisionResult.decision === 'monitor' ? 'text-yellow-900' :
                        'text-red-900'
                      }`}>
                        {decisionResult.decision === 'treat' ? 'GYDYTI ✓' :
                         decisionResult.decision === 'monitor' ? 'STEBĖTI ⚠' :
                         'ŠALINTI IŠ BANDOS ✗'}
                      </h3>
                      <p className="text-gray-800 mb-4 text-base font-medium">{decisionResult.reasoning}</p>

                      {/* Calculation Details */}
                      <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
                        <h4 className="font-semibold text-gray-900 mb-3">Skaičiavimo Detalės:</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">Vidutinis pieno kiekis per dieną:</span>
                            <span className="font-bold text-blue-700">{formatNumberLT(decisionResult.avgDailyMilk)} L</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">Pieno kaina už litrą:</span>
                            <span className="font-bold text-blue-700">{formatCurrencyLT(milkPrice)}</span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <span className="text-gray-700">Dienos pajamos iš pieno:</span>
                            <span className="font-bold text-green-700">{formatCurrencyLT(decisionResult.dailyRevenue)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">Numatoma gydymo kaina:</span>
                            <span className="font-bold text-orange-700">{formatCurrencyLT(estimatedTreatmentCost)}</span>
                          </div>
                          {decisionResult.daysToPayback && (
                            <>
                              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                <span className="text-gray-700">Kaip apskaičiuota:</span>
                                <span className="text-xs text-gray-600">
                                  {formatCurrencyLT(estimatedTreatmentCost)} ÷ {formatCurrencyLT(decisionResult.dailyRevenue)} = {decisionResult.daysToPayback} dienų
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Key Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {decisionResult.daysToPayback && (
                          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                            <p className="text-xs text-gray-600 mb-1">Atsipirkimo Laikas</p>
                            <p className="text-xl font-bold text-gray-900">{decisionResult.daysToPayback} d.</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {decisionResult.daysToPayback <= 30 ? 'Greitas' : decisionResult.daysToPayback <= 60 ? 'Vidutinis' : 'Lėtas'}
                            </p>
                          </div>
                        )}
                        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                          <p className="text-xs text-gray-600 mb-1">Dabartinis Pelnas</p>
                          <p className={`text-xl font-bold ${decisionResult.currentProfit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrencyLT(decisionResult.currentProfit)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Per 90 dienų</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                          <p className="text-xs text-gray-600 mb-1">Dienos Pajamos</p>
                          <p className="text-xl font-bold text-green-700">{formatCurrencyLT(decisionResult.dailyRevenue)}</p>
                          <p className="text-xs text-gray-500 mt-1">Iš pieno</p>
                        </div>
                        {decisionResult.successRate !== null && (
                          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                            <p className="text-xs text-gray-600 mb-1">Sėkmės Rodiklis</p>
                            <p className="text-xl font-bold text-gray-900">{decisionResult.successRate}%</p>
                            <p className="text-xs text-gray-500 mt-1">Ankstesnių gydymų</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bandos Analizė Tab */}
          {activeTab === 'banda' && (
            <div className="space-y-6">
              {/* Top/Bottom Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top 100 Performers */}
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200 bg-green-50">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <ArrowUpRight className="w-5 h-5 text-green-600" />
                      Pelningiausi Gyvuliai (Top 100)
                    </h3>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-1">
                      {profitabilityData
                        .filter(a => a.net_profit > 0)
                        .sort((a, b) => b.net_profit - a.net_profit)
                        .slice(0, 100)
                        .map((animal, index) => (
                          <div
                            key={animal.animal_id}
                            className="flex items-center justify-between p-2 hover:bg-green-50 rounded cursor-pointer transition-colors"
                            onClick={() => setSelectedAnimalDetail(animal)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-green-700 w-8">#{index + 1}</span>
                              <div>
                                <span className="text-sm font-medium text-gray-900">{animal.tag_no}</span>
                                <span className="text-xs text-gray-500 ml-2">Kakl: {animal.collar_no || '—'}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-green-700">
                                {formatCurrencyLT(animal.net_profit)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatNumberLT(animal.avg_daily_milk)} L/d
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Bottom 20 Performers */}
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200 bg-red-50">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <ArrowDownRight className="w-5 h-5 text-red-600" />
                      Nuostolingiausi (Top 20)
                    </h3>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-1">
                      {profitabilityData
                        .filter(a => a.net_profit < 0)
                        .sort((a, b) => a.net_profit - b.net_profit)
                        .slice(0, 20)
                        .map((animal, index) => (
                          <div
                            key={animal.animal_id}
                            className="flex items-center justify-between p-2 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            onClick={() => setSelectedAnimalDetail(animal)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-red-700">#{index + 1}</span>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{animal.tag_no}</div>
                                <div className="text-xs text-gray-500">{formatNumberLT(animal.avg_daily_milk)} L/d</div>
                              </div>
                            </div>
                            <span className="text-sm font-bold text-red-700">
                              {formatCurrencyLT(animal.net_profit)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group Comparison */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  Palyginimas Pagal Grupes (GEA Duomenys)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {(() => {
                    // Create profitability lookup by animal_id
                    const profitabilityMap = new Map();
                    profitabilityData.forEach(animal => {
                      profitabilityMap.set(animal.animal_id, animal);
                    });

                    // Group by GEA group data (more complete)
                    const groups = {};
                    geaGroupData.forEach(geaAnimal => {
                      const group = geaAnimal.grupe ?? 'Nežinoma';
                      if (!groups[group]) {
                        groups[group] = {
                          count: 0,
                          totalProfit: 0,
                          totalMilk: 0,
                          totalCosts: 0,
                          countWithData: 0
                        };
                      }
                      groups[group].count++;

                      // If this animal has profitability data, add it
                      const profData = profitabilityMap.get(geaAnimal.animal_id);
                      if (profData) {
                        groups[group].countWithData++;
                        groups[group].totalProfit += profData.net_profit;
                        groups[group].totalMilk += profData.total_milk_liters;
                        groups[group].totalCosts += profData.total_costs;
                      }
                    });

                    return Object.entries(groups)
                      .sort(([a], [b]) => {
                        // Sort numerically for numbers, alphabetically for text
                        const numA = parseFloat(a);
                        const numB = parseFloat(b);
                        if (!isNaN(numA) && !isNaN(numB)) {
                          return numA - numB;
                        }
                        return a.toString().localeCompare(b.toString());
                      })
                      .map(([group, data]) => (
                        <div key={group} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h4 className="font-semibold text-gray-900 mb-3 text-center text-lg">Grupė {group}</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Gyvulių:</span>
                              <span className="font-bold">{data.count}</span>
                            </div>
                            {data.countWithData > 0 && (
                              <>
                                <div className="flex justify-between text-xs text-gray-500">
                                  <span>Su duomenimis:</span>
                                  <span>{data.countWithData}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-gray-300">
                                  <span className="text-gray-600">Pelnas:</span>
                                  <span className={`font-bold ${data.totalProfit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {formatCurrencyLT(data.totalProfit)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Vid. pelnas:</span>
                                  <span className="font-medium text-sm">
                                    {formatCurrencyLT(data.totalProfit / data.countWithData)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Pienas:</span>
                                  <span className="font-medium text-blue-700">
                                    {formatNumberLT(data.totalMilk)} L
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Kaštai:</span>
                                  <span className="font-medium text-orange-700">
                                    {formatCurrencyLT(data.totalCosts)}
                                  </span>
                                </div>
                              </>
                            )}
                            {data.countWithData === 0 && (
                              <p className="text-xs text-gray-500 italic text-center pt-2">
                                Nėra pelingumo duomenų
                              </p>
                            )}
                          </div>
                        </div>
                      ));
                  })()}
                </div>
              </div>

              {/* Recommendations Summary */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Rekomendacijų Santrauka</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                  {['profitable', 'monitor', 'at_risk', 'chronic_case', 'cull_recommended'].map(rec => {
                    const count = roiAnalysis.filter(a => a.recommendation === rec).length;
                    const isExpandable = ['at_risk', 'chronic_case', 'cull_recommended'].includes(rec);
                    const isExpanded = expandedRecommendations.has(rec);
                    const animals = isExpandable ? getAnimalsForRecommendation(rec) : [];

                    return (
                      <div key={rec} className="text-center bg-gray-50 rounded-lg overflow-hidden">
                        <div
                          className={`p-4 ${isExpandable ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
                          onClick={() => isExpandable && toggleRecommendation(rec)}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {getRecommendationBadge(rec)}
                            {isExpandable && (
                              isExpanded ?
                                <ChevronUp className="w-4 h-4 text-gray-600" /> :
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                            )}
                          </div>
                          <p className="text-2xl font-bold text-gray-900 mt-2">{count}</p>
                          <p className="text-xs text-gray-600">gyvulių</p>
                        </div>

                        {isExpandable && isExpanded && (
                          <div className="border-t border-gray-200 bg-white max-h-80 overflow-y-auto">
                            {animals.length > 0 ? (
                              <div className="divide-y divide-gray-100">
                                {animals.map((animal) => {
                                  const profData = profitabilityData.find(p => p.animal_id === animal.animal_id);
                                  return (
                                    <div
                                      key={animal.animal_id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (profData) {
                                          setSelectedAnimalDetail(profData);
                                        }
                                      }}
                                      className="px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors text-left"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900">
                                            {animal.tag_no || 'Nežinomas'}
                                          </div>
                                          <div className="text-xs text-gray-500">
                                            Kakl: {animal.collar_no || '—'}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className={`text-sm font-bold ${animal.net_profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            {formatCurrencyLT(animal.net_profit)}
                                          </div>
                                          <div className="text-xs text-gray-500">
                                            {formatNumberLT(animal.avg_daily_milk)} L/d
                                          </div>
                                        </div>
                                      </div>
                                      {animal.current_status && (
                                        <div className="mt-1">
                                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                            {animal.current_status}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="px-4 py-6 text-sm text-gray-500">
                                Nėra gyvulių šioje kategorijoje
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Veršeliai - Calves */}
                  <div className="text-center bg-amber-50 rounded-lg overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Veršeliai
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-2">{geaStatusCounts['VERŠ.'] || 0}</p>
                      <p className="text-xs text-gray-600">gyvulių</p>
                    </div>
                  </div>

                  {/* Apsiveršiavusios - Pregnant cows */}
                  <div className="text-center bg-pink-50 rounded-lg overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                          Apsėk
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-2">{geaStatusCounts['APSĖK'] || 0}</p>
                      <p className="text-xs text-gray-600">gyvulių</p>
                    </div>
                  </div>

                  {/* Buliai - Bulls */}
                  <div className="text-center bg-slate-50 rounded-lg overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          Buliai
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-2">{geaStatusCounts['BUL.'] || 0}</p>
                      <p className="text-xs text-gray-600">gyvulių</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Konfigūracija Tab */}
          {activeTab === 'konfiguracija' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Sistemos Nustatymai</h3>
                <p className="text-sm text-blue-700">
                  Čia galite keisti pagrindines sistemos konfigūracijas, kurios naudojamos pelningumui skaičiuoti.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Pieno Kaina</h3>

                <div className="max-w-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dabartinė Pieno Kaina (EUR už 1 L)
                  </label>

                  {!editingMilkPrice ? (
                    <div className="flex items-center gap-4">
                      <div className="flex-1 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="text-2xl font-bold text-gray-900">
                          {formatCurrencyLT(milkPrice)}
                        </span>
                        <span className="text-sm text-gray-600 ml-2">/ litras</span>
                      </div>
                      <button
                        onClick={() => setEditingMilkPrice(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Keisti
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <input
                        type="number"
                        step="0.01"
                        value={tempMilkPrice}
                        onChange={(e) => setTempMilkPrice(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0.50"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={updateMilkPrice}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Išsaugoti
                        </button>
                        <button
                          onClick={() => {
                            setEditingMilkPrice(false);
                            setTempMilkPrice(milkPrice.toFixed(2));
                          }}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                        >
                          Atšaukti
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="mt-4 text-sm text-gray-600">
                    Ši kaina naudojama skaičiuojant pieno pajamas ir gydymo sprendimus.
                    Po pakeitimo visi skaičiavimai bus automatiškai atnaujinti.
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-yellow-900 mb-1">Svarbu</h4>
                    <p className="text-sm text-yellow-800">
                      Keisdami pieno kainą, visi pelingumo skaičiavimai bus perskaičiuoti su nauja kaina.
                      Tai gali pakeisti gydymo sprendimų rekomendacijas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Animal Detail Modal */}
      {selectedAnimalDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedAnimalDetail(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Gyvulio Detalės: {selectedAnimalDetail.tag_no || 'Nežinomas'}
                </h2>
                <button
                  onClick={() => setSelectedAnimalDetail(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Pagrindinė Informacija</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Auskaras:</span>
                      <span className="font-medium">{selectedAnimalDetail.tag_no || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Kaklajuostė:</span>
                      <span className="font-medium">{selectedAnimalDetail.collar_no || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Grupė:</span>
                      <span className="font-medium">{selectedAnimalDetail.current_group || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Statusas:</span>
                      <span className="font-medium">{selectedAnimalDetail.current_status || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Laktacijos dienos:</span>
                      <span className="font-medium">{selectedAnimalDetail.lactation_days || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Milk Production */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Droplet className="w-5 h-5" />
                    Pieno Gamyba (GEA Duomenys)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Stebėta dienų:</span>
                      <span className="font-bold text-blue-900">{selectedAnimalDetail.days_tracked} d.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Vidutiniškai per dieną:</span>
                      <span className="font-bold text-blue-900">{formatNumberLT(selectedAnimalDetail.avg_daily_milk)} L</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-200 pt-2">
                      <span className="text-blue-700">Viso per {selectedAnimalDetail.days_tracked} d.:</span>
                      <span className="font-bold text-blue-900">{formatNumberLT(selectedAnimalDetail.total_milk_liters)} L</span>
                    </div>
                    <div className="flex justify-between text-xs text-blue-600">
                      <span>Projekcija 90 d.:</span>
                      <span className="font-medium">
                        ~{formatNumberLT(selectedAnimalDetail.avg_daily_milk * 90)} L
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200">
                      <span className="text-blue-700">Gamina:</span>
                      <span className="font-medium text-blue-900">{selectedAnimalDetail.is_producing ? 'Taip' : 'Ne'}</span>
                    </div>
                  </div>
                </div>

                {/* Revenue */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <Euro className="w-5 h-5" />
                    Pajamos ({selectedAnimalDetail.days_tracked} d.)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-700">Pieno pajamos:</span>
                      <span className="font-bold text-green-900">{formatCurrencyLT(selectedAnimalDetail.milk_revenue)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-green-600">
                      <span>Per dieną vidutiniškai:</span>
                      <span className="font-medium">
                        {formatCurrencyLT(selectedAnimalDetail.milk_revenue / selectedAnimalDetail.days_tracked)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-green-200 pt-2">
                      <span className="text-green-700">Karatinos nuostoliai:</span>
                      <span className="font-medium text-red-700">-{formatCurrencyLT(selectedAnimalDetail.withdrawal_revenue_loss)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Karatinos dienų:</span>
                      <span className="font-medium text-green-900">{selectedAnimalDetail.days_in_withdrawal} d.</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-green-200">
                      <span className="text-green-700 font-semibold">Koreguotos pajamos:</span>
                      <span className="font-bold text-green-900">{formatCurrencyLT(selectedAnimalDetail.adjusted_milk_revenue)}</span>
                    </div>
                  </div>
                </div>

                {/* Costs */}
                <div className="bg-orange-50 rounded-lg p-4">
                  <h3 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Gydymo Kaštai
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-orange-700">Gydymų skaičius:</span>
                      <span className="font-medium text-orange-900">{selectedAnimalDetail.treatment_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-700">Vakcinacijų:</span>
                      <span className="font-medium text-orange-900">{selectedAnimalDetail.vaccination_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-700">Apsilankymų:</span>
                      <span className="font-medium text-orange-900">{selectedAnimalDetail.visit_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-700">Medikamentų:</span>
                      <span className="font-medium text-orange-900">{formatCurrencyLT(selectedAnimalDetail.medication_costs)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-orange-200">
                      <span className="text-orange-700 font-semibold">Viso:</span>
                      <span className="font-bold text-orange-900">{formatCurrencyLT(selectedAnimalDetail.total_costs)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profitability Summary */}
              <div className={`mt-6 rounded-lg p-6 ${getProfitabilityColor(selectedAnimalDetail.net_profit)}`}>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  {getProfitabilityIcon(selectedAnimalDetail.net_profit)}
                  Pelningumas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm opacity-80">Grynasis Pelnas (90 d.)</p>
                    <p className="text-3xl font-bold">{formatCurrencyLT(selectedAnimalDetail.net_profit)}</p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">ROI</p>
                    <p className="text-3xl font-bold">
                      {selectedAnimalDetail.roi_percentage ? `${selectedAnimalDetail.roi_percentage}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">Kaštų / Pajamų Santykis</p>
                    <p className="text-3xl font-bold">
                      {selectedAnimalDetail.cost_to_revenue_ratio ? `${selectedAnimalDetail.cost_to_revenue_ratio}%` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
