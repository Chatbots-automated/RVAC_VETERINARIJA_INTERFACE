import { useState } from 'react';
import { Package, Tractor } from 'lucide-react';
import { ProductsManagement } from '../technika/ProductsManagement';
import { FarmEquipmentMaintenance } from '../technika/FarmEquipmentMaintenance';
import { useAuth } from '../../contexts/AuthContext';

interface WorkerTechnikaModuleProps {
  workLocation: 'farm' | 'warehouse';
  activeTimeEntry: any | null;
}

type WorkerTab = 'products' | 'farm-maintenance';

const farmMenuItems = [
  { id: 'products' as WorkerTab, label: 'Produktai', icon: Package },
  { id: 'farm-maintenance' as WorkerTab, label: 'Fermos įrangos aptarnavimai', icon: Tractor },
];

export function WorkerTechnikaModule({ workLocation, activeTimeEntry }: WorkerTechnikaModuleProps) {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<WorkerTab>('products');

  const isFarm = workLocation === 'farm';
  const menuItems = isFarm ? farmMenuItems : [];

  const renderContent = () => {
    if (!isFarm) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-600">Technikos kiemo darbuotojų funkcionalumas dar kuriamas.</p>
        </div>
      );
    }

    switch (currentTab) {
      case 'products':
        return <ProductsManagement locationFilter={workLocation} workerMode={true} />;
      case 'farm-maintenance':
        return <FarmEquipmentMaintenance />;
      default:
        return <ProductsManagement locationFilter={workLocation} workerMode={true} />;
    }
  };

  const themeColor = isFarm ? 'green' : 'slate';
  const bgColor = isFarm ? 'bg-green-600' : 'bg-slate-600';
  const borderColor = isFarm ? 'border-green-600' : 'border-slate-600';
  const textColor = isFarm ? 'text-green-600' : 'text-slate-600';

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className={`${isFarm ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} border rounded-lg p-4`}>
        <p className={`text-sm ${isFarm ? 'text-green-900' : 'text-slate-900'}`}>
          <strong>Darbo vieta:</strong> {isFarm ? 'Fermos įranga' : 'Technikos kiemas'} - 
          Čia galite peržiūrėti produktus ir dirbti su įrangos aptarnavimais.
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {isFarm && (
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors whitespace-nowrap ${
                      currentTab === item.id
                        ? `${borderColor} ${textColor}`
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
