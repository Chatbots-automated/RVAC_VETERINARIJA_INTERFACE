import { Stethoscope, Euro, ArrowRight, Package, Shield, Users, Droplets, Beaker, Activity, Settings, Wrench, Truck, Calendar, LogOut, Layers, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';

interface ModuleSelectorProps {
  onSelectModule: (module: 'veterinarija' | 'islaidos' | 'admin' | 'pienas' | 'technika' | 'worker-schedules') => void;
}

type ModuleGroup = 'core' | 'infrastructure' | null;

export function ModuleSelector({ onSelectModule }: ModuleSelectorProps) {
  const { isAdmin, signOut, user } = useAuth();
  const [selectedGroup, setSelectedGroup] = useState<ModuleGroup>(null);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Pagrindinė Sistema - Core System (Veterinarija, Išlaidos, Pienas, Admin)
  if (selectedGroup === 'core') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMCAzMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6TTE2IDE0YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMCAzMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>

        <div className="w-full max-w-6xl relative">
          <button
            onClick={() => setSelectedGroup(null)}
            className="mb-8 flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowRight className="w-5 h-5 rotate-180" />
            Grįžti
          </button>

          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 border border-white/20">
              <Layers className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Pagrindinė Sistema
            </h1>
            <p className="text-emerald-200">
              Pasirinkite modulį
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mx-auto max-w-4xl">
            <button
              onClick={() => onSelectModule('veterinarija')}
              className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 lg:p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Stethoscope className="w-14 h-14 text-blue-600" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                  Veterinarija
                </h2>
                <p className="text-sm lg:text-base text-blue-100">
                  VetStock Sistema
                </p>
              </div>

              <div className="p-6 lg:p-8">
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                      <Package className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Atsargų valdymas</p>
                      <p className="text-sm text-gray-600">Vaistų ir medžiagų apskaita</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                      <Stethoscope className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Gydymo įrašai</p>
                      <p className="text-sm text-gray-600">Gyvūnų gydymo dokumentavimas</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Ataskaitos</p>
                      <p className="text-sm text-gray-600">Teisės aktų reikalavimai</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-blue-600 font-semibold group-hover:gap-4 transition-all">
                  <span>Atidaryti sistemą</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>

            <button
              onClick={() => onSelectModule('islaidos')}
              className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2 relative"
            >
              <div className="bg-gradient-to-br from-amber-600 to-amber-700 p-6 lg:p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Euro className="w-14 h-14 text-amber-600" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                  Išlaidos
                </h2>
                <p className="text-sm lg:text-base text-amber-100">
                  Finansų Valdymas
                </p>
              </div>

              <div className="p-6 lg:p-8">
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center mt-0.5">
                      <Euro className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Išlaidų apskaita</p>
                      <p className="text-sm text-gray-600">Visų išlaidų registravimas</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Kategorijos</p>
                      <p className="text-sm text-gray-600">Išlaidų grupavimas</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Analizė</p>
                      <p className="text-sm text-gray-600">Finansinės ataskaitos</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-amber-600 font-semibold group-hover:gap-4 transition-all">
                  <span>Atidaryti sistemą</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>

            <button
              onClick={() => onSelectModule('pienas')}
              className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className="bg-gradient-to-br from-cyan-600 to-blue-700 p-6 lg:p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Droplets className="w-14 h-14 text-cyan-600" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                  Pienas
                </h2>
                <p className="text-sm lg:text-base text-cyan-100">
                  Pieno Apskaita
                </p>
              </div>

              <div className="p-6 lg:p-8">
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-cyan-100 rounded-full flex items-center justify-center mt-0.5">
                      <Activity className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Gamybos įrašai</p>
                      <p className="text-sm text-gray-600">Realaus laiko melžimo duomenys</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-cyan-100 rounded-full flex items-center justify-center mt-0.5">
                      <Beaker className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Pieno tyrimai</p>
                      <p className="text-sm text-gray-600">Kokybės analizė ir SCC</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-cyan-100 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Analitika</p>
                      <p className="text-sm text-gray-600">Gamybos ir kokybės ataskaitos</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-cyan-600 font-semibold group-hover:gap-4 transition-all">
                  <span>Atidaryti sistemą</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>

            {isAdmin && (
              <button
                onClick={() => onSelectModule('admin')}
                className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
              >
                <div className="bg-gradient-to-br from-red-600 to-pink-700 p-6 lg:p-8 text-center">
                  <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Shield className="w-14 h-14 text-red-600" />
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                    Admin
                  </h2>
                  <p className="text-sm lg:text-base text-red-100">
                    Vartotojų Valdymas
                  </p>
                </div>

                <div className="p-6 lg:p-8">
                  <div className="space-y-4 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
                        <Users className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Vartotojų sąrašas</p>
                        <p className="text-sm text-gray-600">Visų sistemos vartotojų peržiūra</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
                        <Shield className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Rolių valdymas</p>
                        <p className="text-sm text-gray-600">Keisti vartotojų teises</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Pridėti vartotojus</p>
                        <p className="text-sm text-gray-600">Sukurti naujas paskyras</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-red-600 font-semibold group-hover:gap-4 transition-all">
                    <span>Atidaryti sistemą</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Ūkio Infrastruktūra - Farm Infrastructure (Technika, Darbuotojai)
  if (selectedGroup === 'infrastructure') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMCAzMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6TTE2IDE0YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMCAzMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>

        <div className="w-full max-w-6xl relative">
          <button
            onClick={() => setSelectedGroup(null)}
            className="mb-8 flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowRight className="w-5 h-5 rotate-180" />
            Grįžti
          </button>

          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 border border-white/20">
              <Settings className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Ūkio Infrastruktūra
            </h1>
            <p className="text-emerald-200">
              Pasirinkite modulį
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mx-auto max-w-4xl">
            <button
              onClick={() => onSelectModule('technika')}
              className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className="bg-gradient-to-br from-slate-600 to-gray-700 p-6 lg:p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Settings className="w-14 h-14 text-slate-600" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                  Technika
                </h2>
                <p className="text-sm lg:text-base text-slate-100">
                  Įrangos Valdymas
                </p>
              </div>

              <div className="p-6 lg:p-8">
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center mt-0.5">
                      <Wrench className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Įrankiai ir PPE</p>
                      <p className="text-sm text-gray-600">Įrankių ir apsaugos priemonių apskaita</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center mt-0.5">
                      <Truck className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Transportas</p>
                      <p className="text-sm text-gray-600">Transporto priemonių ir technikos valdymas</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Aptarnavimai</p>
                      <p className="text-sm text-gray-600">Planiniai ir neplaniniai remontai</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-slate-600 font-semibold group-hover:gap-4 transition-all">
                  <span>Atidaryti sistemą</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>

            <button
              onClick={() => onSelectModule('worker-schedules')}
              className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 lg:p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Calendar className="w-14 h-14 text-indigo-600" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                  Darbuotojai
                </h2>
                <p className="text-sm lg:text-base text-indigo-100">
                  Grafikai
                </p>
              </div>

              <div className="p-6 lg:p-8">
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5">
                      <Users className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Darbo grafikai</p>
                      <p className="text-sm text-gray-600">Fermos ir technikos kiemo darbuotojai</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Pamainų planavimas</p>
                      <p className="text-sm text-gray-600">Vizualus grafikų valdymas</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Darbo ataskaitos</p>
                      <p className="text-sm text-gray-600">Darbuotojų veiklos fiksavimas</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-indigo-600 font-semibold group-hover:gap-4 transition-all">
                  <span>Atidaryti sistemą</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main group selection screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMCAzMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6TTE2IDE0YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMCAzMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>

      <div className="w-full max-w-6xl relative">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <img
              src="https://rekvizitai.vz.lt/logos/berciunai-16440-447.jpg"
              alt="ŽŪB Berčiunai"
              className="w-24 h-24 rounded-2xl bg-white p-2 shadow-2xl object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            ŽŪB Berčiunai
          </h1>
          <p className="text-xl text-emerald-100">
            Valdymo Sistema
          </p>
          <p className="text-emerald-200 mt-2">
            Pasirinkite modulį, kurį norite naudoti
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10 mx-auto max-w-4xl">
          {/* Pagrindinė Sistema - Core System */}
          <button
            onClick={() => setSelectedGroup('core')}
            className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
          >
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 lg:p-10 text-center">
              <div className="w-28 h-28 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-16 h-16 text-emerald-600" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">
                Pagrindinė Sistema
              </h2>
              <p className="text-base lg:text-lg text-emerald-100">
                Fermos Valdymas
              </p>
            </div>

            <div className="p-6 lg:p-8">
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                    <Stethoscope className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Veterinarija</p>
                    <p className="text-sm text-gray-600">Gyvūnų sveikata ir gydymas</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center mt-0.5">
                    <Euro className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Išlaidos</p>
                    <p className="text-sm text-gray-600">Finansų valdymas ir apskaita</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-cyan-100 rounded-full flex items-center justify-center mt-0.5">
                    <Droplets className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Pienas</p>
                    <p className="text-sm text-gray-600">Gamybos ir kokybės apskaita</p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-7 h-7 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
                      <Shield className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">Admin</p>
                      <p className="text-sm text-gray-600">Vartotojų valdymas</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-emerald-600 font-semibold group-hover:gap-4 transition-all">
                <span>Atidaryti sistemą</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          {/* Ūkio Infrastruktūra - Farm Infrastructure */}
          <button
            onClick={() => setSelectedGroup('infrastructure')}
            className="group bg-white rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2"
          >
            <div className="bg-gradient-to-br from-slate-600 to-gray-700 p-8 lg:p-10 text-center">
              <div className="w-28 h-28 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                <Settings className="w-16 h-16 text-slate-600" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">
                Ūkio Infrastruktūra
              </h2>
              <p className="text-base lg:text-lg text-slate-100">
                Resursų Valdymas
              </p>
            </div>

            <div className="p-6 lg:p-8">
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center mt-0.5">
                    <Wrench className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Technika</p>
                    <p className="text-sm text-gray-600">Įrangos ir transporto valdymas</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Darbuotojai</p>
                    <p className="text-sm text-gray-600">Darbo grafikai ir ataskaitos</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                    <Activity className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Ataskaitos</p>
                    <p className="text-sm text-gray-600">Kaštų centrai ir analizė</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                    <Truck className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Fermos įranga</p>
                    <p className="text-sm text-gray-600">Aptarnavimai ir remontai</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-slate-600 font-semibold group-hover:gap-4 transition-all">
                <span>Atidaryti sistemą</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>

        <div className="mt-12 space-y-4">
          {/* Logout Button */}
          <div className="flex justify-center">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors backdrop-blur-sm border border-white/20"
            >
              <LogOut className="w-5 h-5" />
              <span>Atsijungti</span>
              {user && <span className="text-white/70">({user.email})</span>}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-white/60">
              © 2025 ŽŪB Berčiūnai · Versija 1.0.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
