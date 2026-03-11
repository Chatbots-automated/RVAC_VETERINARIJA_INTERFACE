import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Tractor, Warehouse, FileText, Calendar } from 'lucide-react';
import { WorkerSchedulesModule } from './WorkerSchedulesModule';

interface WorkerSchedulesSelectorProps {
  onBack: () => void;
}

type SubModule = 'manual' | 'calendar' | null;

export function WorkerSchedulesSelector({ onBack }: WorkerSchedulesSelectorProps) {
  const [selectedLocation, setSelectedLocation] = useState<'farm' | 'warehouse' | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const location = params.get('location');
    return (location as 'farm' | 'warehouse') || null;
  });
  const [selectedSubModule, setSelectedSubModule] = useState<SubModule>(() => {
    const params = new URLSearchParams(window.location.search);
    const submodule = params.get('submodule');
    return (submodule as SubModule) || null;
  });

  // Update URL when location or submodule changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedLocation) {
      params.set('location', selectedLocation);
    } else {
      params.delete('location');
    }
    if (selectedSubModule) {
      params.set('submodule', selectedSubModule);
    } else {
      params.delete('submodule');
    }
    const newUrl = `?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }, [selectedLocation, selectedSubModule]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const location = params.get('location');
      const submodule = params.get('submodule');
      setSelectedLocation((location as 'farm' | 'warehouse') || null);
      setSelectedSubModule((submodule as SubModule) || null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // When sub-module is selected (manual entry), show the module
  if (selectedLocation && selectedSubModule === 'manual') {
    return (
      <WorkerSchedulesModule
        location={selectedLocation}
        mode="manual"
        onBack={() => setSelectedSubModule(null)}
      />
    );
  }

  // When location is selected, show sub-module choice (Surašyti iš lapų | Sukurti grafikus)
  if (selectedLocation) {
    const isFarm = selectedLocation === 'farm';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => setSelectedLocation(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Grįžti
          </button>

          <div className="text-center mb-12">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${isFarm ? 'bg-green-100' : 'bg-slate-100'}`}>
              {isFarm ? <Tractor className="w-8 h-8 text-green-600" /> : <Warehouse className="w-8 h-8 text-slate-600" />}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isFarm ? 'Ferma' : 'Technikos kiemas'}
            </h1>
            <p className="text-gray-600">Pasirinkite veiksmą</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <button
              onClick={() => setSelectedSubModule('manual')}
              className={`group bg-white rounded-xl shadow-sm border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition-all p-8 text-left`}
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                  <FileText className="w-7 h-7 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    Surašyti iš lapų
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Įveskite darbuotojų darbo valandas iš popierinių lapų – pasirinkite darbuotoją, mėnesį ir įveskite laikus klaviatūra
                  </p>
                </div>
              </div>
            </button>

            <div
              className="group bg-gray-100 rounded-xl shadow-sm border-2 border-gray-200 p-8 text-left opacity-60 cursor-not-allowed"
              title="Netrukus"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-gray-200 rounded-lg flex items-center justify-center">
                  <Calendar className="w-7 h-7 text-gray-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-500 mb-2">
                    Sukurti grafikus
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Kalendoriaus pagrindu kurti grafikus – netrukus
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Grįžti
        </button>

        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Darbuotojų grafikai</h1>
          <p className="text-gray-600">Pasirinkite darbo vietą</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <button
            onClick={() => setSelectedLocation('farm')}
            className="group bg-white rounded-xl shadow-sm border-2 border-gray-200 hover:border-green-500 hover:shadow-md transition-all p-8 text-left"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-500 transition-colors">
                <Tractor className="w-7 h-7 text-green-600 group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">
                  Ferma
                </h3>
                <p className="text-gray-600 text-sm">
                  Fermos darbuotojų darbo grafikai ir laikai
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setSelectedLocation('warehouse')}
            className="group bg-white rounded-xl shadow-sm border-2 border-gray-200 hover:border-slate-500 hover:shadow-md transition-all p-8 text-left"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-slate-500 transition-colors">
                <Warehouse className="w-7 h-7 text-slate-600 group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-slate-600 transition-colors">
                  Technikos kiemas
                </h3>
                <p className="text-gray-600 text-sm">
                  Technikos kiemo darbuotojų darbo grafikai ir laikai
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-12 max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">Būsimos funkcijos</h4>
              <p className="text-sm text-blue-800">
                Darbuotojai galės prisijungti prie savo paskyrų, peržiūrėti savo grafikus ir pateikti
                ataskaitą apie atliktus darbus. Administratoriai galės patvirtinti pateiktas ataskaitas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
