import { ArrowLeft, Tractor, Warehouse } from 'lucide-react';
import { ManualEntryView } from './technika/ManualEntryView';

interface WorkerSchedulesModuleProps {
  location: 'farm' | 'warehouse';
  mode?: 'manual' | 'calendar';
  onBack: () => void;
}

export function WorkerSchedulesModule({ location, mode = 'manual', onBack }: WorkerSchedulesModuleProps) {
  const isFarm = location === 'farm';
  const Icon = isFarm ? Tractor : Warehouse;
  const title = isFarm ? 'Fermos darbuotojai' : 'Technikos kiemo darbuotojai';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className={isFarm ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-600 text-white shadow-lg'}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <button
              onClick={onBack}
              className={isFarm ? 'flex items-center gap-2 text-green-100 hover:text-white transition-colors' : 'flex items-center gap-2 text-slate-100 hover:text-white transition-colors'}
            >
              <ArrowLeft className="w-5 h-5" />
              Grįžti
            </button>
            <div className="flex items-center gap-3">
              <Icon className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-sm text-white opacity-90">Surašyti iš lapų</p>
              </div>
            </div>
            <div className="w-24"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {mode === 'manual' && <ManualEntryView workLocation={location} />}
      </div>
    </div>
  );
}
