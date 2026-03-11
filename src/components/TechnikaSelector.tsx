import { ArrowLeft, Tractor, Warehouse } from 'lucide-react';
import { FarmEquipmentModule } from './FarmEquipmentModule';
import { EquipmentYardModule } from './EquipmentYardModule';
import { useState, useEffect } from 'react';

interface TechnikaSelectorProps {
  onBackToModules: () => void;
}

export function TechnikaSelector({ onBackToModules }: TechnikaSelectorProps) {
  const [selectedModule, setSelectedModule] = useState<'farm' | 'yard' | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const submodule = params.get('submodule');
    return (submodule as 'farm' | 'yard') || null;
  });

  // Update URL when submodule changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedModule) {
      params.set('submodule', selectedModule);
    } else {
      params.delete('submodule');
    }
    const newUrl = `?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }, [selectedModule]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const submodule = params.get('submodule');
      setSelectedModule((submodule as 'farm' | 'yard') || null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (selectedModule === 'farm') {
    return <FarmEquipmentModule onBack={() => setSelectedModule(null)} />;
  }

  if (selectedModule === 'yard') {
    return <EquipmentYardModule onBack={() => setSelectedModule(null)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <button
          onClick={onBackToModules}
          className="mb-6 flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-white rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Grįžti į modulius</span>
        </button>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-3">Technika</h1>
          <p className="text-lg text-gray-600">Pasirinkite modulį</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Farm Equipment Module */}
          <button
            onClick={() => setSelectedModule('farm')}
            className="group relative bg-white border-2 border-green-200 hover:border-green-400 rounded-xl p-8 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="relative z-10">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-green-50 rounded-lg">
                  <Tractor className="w-12 h-12 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Fermos įranga</h2>
              <p className="text-gray-600 mb-6">
                Fermos įrangos valdymas ir aptarnavimai
              </p>
              <div className="space-y-2 text-left text-gray-600 text-sm">
                <p>• Fermos įrangos aptarnavimai</p>
                <p>• Fermos produktai ir atsargos</p>
                <p>• Fermos sąskaitos</p>
                <p>• Fermos drabužiai</p>
              </div>
            </div>
          </button>

          {/* Equipment Yard Module */}
          <button
            onClick={() => setSelectedModule('yard')}
            className="group relative bg-white border-2 border-slate-200 hover:border-slate-400 rounded-xl p-8 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="relative z-10">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <Warehouse className="w-12 h-12 text-slate-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Technikos kiemas</h2>
              <p className="text-gray-600 mb-6">
                Technikos ir įrangos valdymas
              </p>
              <div className="space-y-2 text-left text-gray-600 text-sm">
                <p>• Įrankiai ir transportas</p>
                <p>• Drabužiai ir PPE</p>
                <p>• Remonto darbai</p>
                <p>• Techninės apžiūros</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-12 text-center text-gray-600 text-sm">
          <p>Pasirinkite modulį pagal jūsų poreikius</p>
        </div>
      </div>
    </div>
  );
}
