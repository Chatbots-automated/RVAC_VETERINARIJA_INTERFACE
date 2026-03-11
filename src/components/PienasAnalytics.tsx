import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Minus, DollarSign, Droplet, Calendar, Weight, Thermometer } from 'lucide-react';

interface ProducerAnalytics {
  producer_id: string;
  gamintojo_id: string;
  gamintojas_code: string;
  label: string;
  imone: string;
  rajonas: string;
  punktas: string;

  last_production_date: string;
  last_production_kg: number;
  last_temperature: number;
  total_deliveries: number;
  total_kg_produced: number;
  avg_kg_per_delivery: number;

  current_fat_percent: number;
  current_protein_percent: number;
  current_lactose_percent: number;
  current_urea: number;
  current_ph: number;

  avg_fat_30d: number;
  avg_protein_30d: number;
  avg_lactose_30d: number;
  stddev_fat_30d: number;
  stddev_protein_30d: number;

  current_scc: number;
  current_bacteria: number;
  avg_scc_30d: number;
  avg_bacteria_30d: number;
  min_scc_30d: number;
  max_scc_30d: number;
  quality_status: string;

  estimated_last_payment_eur: number;
}

export function PienasAnalytics() {
  const [analytics, setAnalytics] = useState<ProducerAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducer, setSelectedProducer] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('milk_producer_analytics')
      .select('*')
      .order('total_kg_produced', { ascending: false });

    if (error) {
      console.error('Error loading analytics:', error);
    } else {
      setAnalytics(data || []);
    }
    setLoading(false);
  };

  const getTrendIcon = (current: number, avg: number) => {
    if (!current || !avg) return <Minus className="w-4 h-4 text-gray-400" />;
    const diff = ((current - avg) / avg) * 100;
    if (diff > 5) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (diff < -5) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getQualityColor = (status: string) => {
    switch (status) {
      case 'Puiki': return 'bg-green-100 text-green-800';
      case 'Gera': return 'bg-blue-100 text-blue-800';
      case 'Vidutinė': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-red-100 text-red-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Kraunama...</div>
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <Droplet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Nėra analitikos duomenų</h3>
        <p className="text-gray-500">
          Pridėkite gamybos duomenis, kad pamatytumėte analitinę informaciją.
        </p>
      </div>
    );
  }

  const selectedData = selectedProducer
    ? analytics.find(a => a.producer_id === selectedProducer)
    : analytics[0];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Pasirinkite gamintoją
        </label>
        <select
          value={selectedProducer || analytics[0]?.producer_id || ''}
          onChange={(e) => setSelectedProducer(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {analytics.map((a) => (
            <option key={a.producer_id} value={a.producer_id}>
              {a.imone} - {a.label} ({a.gamintojas_code})
            </option>
          ))}
        </select>
      </div>

      {selectedData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Droplet className="w-8 h-8 text-blue-600" />
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getQualityColor(selectedData.quality_status)}`}>
                  {selectedData.quality_status}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {selectedData.total_kg_produced.toLocaleString('lt-LT', { maximumFractionDigits: 0 })} kg
              </div>
              <div className="text-sm text-gray-500">Iš viso pagaminta</div>
              <div className="text-xs text-gray-400 mt-1">
                {selectedData.total_deliveries} pristatymai
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Weight className="w-8 h-8 text-green-600" />
                {selectedData.last_production_date && (
                  <Calendar className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {selectedData.last_production_kg?.toLocaleString('lt-LT', { maximumFractionDigits: 1 }) || '—'} kg
              </div>
              <div className="text-sm text-gray-500">Paskutinis pristatymas</div>
              {selectedData.last_production_date && (
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(selectedData.last_production_date).toLocaleDateString('lt-LT')}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500">SCC</div>
                {getTrendIcon(selectedData.current_scc, selectedData.avg_scc_30d)}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {selectedData.current_scc ? selectedData.current_scc.toFixed(0) + 'k' : '—'}
              </div>
              <div className="text-sm text-gray-500">Somatinių ląstelių</div>
              <div className="text-xs text-gray-400 mt-1">
                30d vid: {selectedData.avg_scc_30d ? selectedData.avg_scc_30d.toFixed(0) + 'k' : '—'}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-yellow-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {selectedData.estimated_last_payment_eur?.toFixed(2) || '—'} €
              </div>
              <div className="text-sm text-gray-500">Numatoma išmoka</div>
              <div className="text-xs text-gray-400 mt-1">
                Už paskutinį pristatymą
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Droplet className="w-5 h-5 text-blue-600" />
                Sudėtis
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Riebalai</span>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(selectedData.current_fat_percent, selectedData.avg_fat_30d)}
                      <span className="text-lg font-bold text-gray-900">
                        {selectedData.current_fat_percent?.toFixed(2) || '—'}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>30d vidurkis: {selectedData.avg_fat_30d?.toFixed(2) || '—'}%</span>
                    <span>σ: {selectedData.stddev_fat_30d?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((selectedData.current_fat_percent / 6) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Baltymai</span>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(selectedData.current_protein_percent, selectedData.avg_protein_30d)}
                      <span className="text-lg font-bold text-gray-900">
                        {selectedData.current_protein_percent?.toFixed(2) || '—'}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>30d vidurkis: {selectedData.avg_protein_30d?.toFixed(2) || '—'}%</span>
                    <span>σ: {selectedData.stddev_protein_30d?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((selectedData.current_protein_percent / 5) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Laktoza</span>
                    <span className="text-lg font-bold text-gray-900">
                      {selectedData.current_lactose_percent?.toFixed(2) || '—'}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    30d vidurkis: {selectedData.avg_lactose_30d?.toFixed(2) || '—'}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((selectedData.current_lactose_percent / 5) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-500">Urėja</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {selectedData.current_urea || '—'} mg/100ml
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">pH</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {selectedData.current_ph?.toFixed(2) || '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Kokybės rodikliai
              </h3>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Somatinių ląstelių skaičius (SCC)
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getQualityColor(selectedData.quality_status)}`}>
                      {selectedData.quality_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {getTrendIcon(selectedData.current_scc, selectedData.avg_scc_30d)}
                    <span className="text-2xl font-bold text-gray-900">
                      {selectedData.current_scc ? selectedData.current_scc.toFixed(0) + 'k' : '—'}
                    </span>
                    <span className="text-sm text-gray-500">tūkst./ml</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-gray-500">30d vid.</div>
                      <div className="font-semibold text-gray-900">
                        {selectedData.avg_scc_30d ? selectedData.avg_scc_30d.toFixed(0) + 'k' : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Min</div>
                      <div className="font-semibold text-green-600">
                        {selectedData.min_scc_30d ? selectedData.min_scc_30d.toFixed(0) + 'k' : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Max</div>
                      <div className="font-semibold text-red-600">
                        {selectedData.max_scc_30d ? selectedData.max_scc_30d.toFixed(0) + 'k' : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Bendras bakterijų skaičius
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {getTrendIcon(selectedData.current_bacteria, selectedData.avg_bacteria_30d)}
                    <span className="text-2xl font-bold text-gray-900">
                      {selectedData.current_bacteria ? selectedData.current_bacteria.toFixed(0) + 'k' : '—'}
                    </span>
                    <span className="text-sm text-gray-500">tūkst./ml</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    30d vidurkis: {selectedData.avg_bacteria_30d ? selectedData.avg_bacteria_30d.toFixed(0) + 'k' : '—'}
                  </div>
                </div>

                {selectedData.last_temperature && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Thermometer className="w-5 h-5 text-orange-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Paskutinio pristatymo temperatūra
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">
                      {selectedData.last_temperature.toFixed(1)}°C
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-yellow-600" />
              Išmokos skaičiavimas
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Bazinė kaina</div>
                <div className="text-2xl font-bold text-gray-900">0.45 €/kg</div>
                <div className="text-xs text-gray-500 mt-1">Standartinė kaina</div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Kokybės koeficientas</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">SCC &lt; 200k:</span>
                    <span className="text-green-600 font-semibold">+5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bakterijos &lt; 100k:</span>
                    <span className="text-green-600 font-semibold">+2%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">SCC 400-600k:</span>
                    <span className="text-red-600 font-semibold">-5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">SCC &gt; 600k:</span>
                    <span className="text-red-600 font-semibold">-15%</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Sudėties priedai</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Riebalai &gt; 3.5%:</span>
                    <span className="text-green-600 font-semibold">+0.01€ per 0.1%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Baltymai &gt; 3.2%:</span>
                    <span className="text-green-600 font-semibold">+0.015€ per 0.1%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t-2 border-gray-300">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">Numatoma išmoka už paskutinį pristatymą:</span>
                <span className="text-3xl font-bold text-green-600">
                  {selectedData.estimated_last_payment_eur?.toFixed(2) || '—'} €
                </span>
              </div>
              {selectedData.last_production_kg && (
                <div className="text-sm text-gray-500 text-right mt-1">
                  {selectedData.last_production_kg.toFixed(1)} kg × kaina su priedais
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
