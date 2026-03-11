import { useState } from 'react';
import { MastitisMilk } from './MastitisMilk';
import { TreatmentCostAnalysis } from './TreatmentCostAnalysis';
import { ProductUsageAnalysis } from './ProductUsageAnalysis';
import { ProfitabilityDashboard } from './ProfitabilityDashboard';
import { AnimalMilkLossAnalysis } from './AnimalMilkLossAnalysis';
import { TreatmentMilkLossAnalysis } from './TreatmentMilkLossAnalysis';
import { Droplet, Euro, Package, TrendingUp, Milk, AlertTriangle } from 'lucide-react';

export function TreatmentCostTab() {
  const [activeTab, setActiveTab] = useState<'costs' | 'usage' | 'mastitis' | 'profitability' | 'milk_loss' | 'treatment_milk_loss'>('costs');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <button
            onClick={() => setActiveTab('costs')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'costs'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Euro className="w-5 h-5" />
            <span>Gydymų Savikainos</span>
          </button>
          <button
            onClick={() => setActiveTab('profitability')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'profitability'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span>Pelningumas & ROI</span>
          </button>
          <button
            onClick={() => setActiveTab('milk_loss')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'milk_loss'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Milk className="w-5 h-5" />
            <span>Sinchronizacijos</span>
          </button>
          <button
            onClick={() => setActiveTab('treatment_milk_loss')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'treatment_milk_loss'
                ? 'bg-orange-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            <span>Karencija</span>
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'usage'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Package className="w-5 h-5" />
            <span>Vaistų Panaudojimas</span>
          </button>
          <button
            onClick={() => setActiveTab('mastitis')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'mastitis'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Droplet className="w-5 h-5" />
            <span>Mastitinis Pienas</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'costs' && <TreatmentCostAnalysis />}
        {activeTab === 'profitability' && <ProfitabilityDashboard />}
        {activeTab === 'milk_loss' && <AnimalMilkLossAnalysis />}
        {activeTab === 'treatment_milk_loss' && <TreatmentMilkLossAnalysis />}
        {activeTab === 'usage' && <ProductUsageAnalysis />}
        {activeTab === 'mastitis' && <MastitisMilk />}
      </div>
    </div>
  );
}
