import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Briefcase, LogOut, Clock, User, Tractor, Warehouse } from 'lucide-react';
import { WorkerScheduleView } from './WorkerScheduleView';
import { WorkerTechnikaModule } from './WorkerTechnikaModule';
import { supabase } from '../../lib/supabase';

type WorkerView = 'schedule' | 'technika';

export function WorkerPortal() {
  const { user, signOut, isFarmWorker, isWarehouseWorker } = useAuth();
  const [currentView, setCurrentView] = useState<WorkerView>('schedule');
  const [activeTimeEntry, setActiveTimeEntry] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const workLocation = isFarmWorker ? 'farm' : 'warehouse';
  const locationLabel = isFarmWorker ? 'Ferma' : 'Technikos kiemas';
  const LocationIcon = isFarmWorker ? Tractor : Warehouse;
  const themeColor = isFarmWorker ? 'green' : 'slate';

  useEffect(() => {
    loadActiveTimeEntry();
  }, [user]);

  const loadActiveTimeEntry = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('worker_time_entries')
        .select('*')
        .eq('worker_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveTimeEntry(data);
    } catch (error) {
      console.error('Error loading active time entry:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const getElapsedTime = () => {
    if (!activeTimeEntry) return null;
    
    const start = new Date(activeTimeEntry.actual_start_time);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Kraunama...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className={`${isFarmWorker ? 'bg-green-600' : 'bg-slate-600'} text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${isFarmWorker ? 'bg-green-700' : 'bg-slate-700'} rounded-lg flex items-center justify-center`}>
                <LocationIcon className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{user?.full_name}</h1>
                <p className="text-sm opacity-90">{locationLabel}</p>
              </div>
            </div>

            {/* Clock Status */}
            {activeTimeEntry && (
              <div className={`${isFarmWorker ? 'bg-green-700' : 'bg-slate-700'} px-4 py-2 rounded-lg flex items-center gap-3`}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs opacity-75">Dirbate</p>
                  <p className="font-semibold">{getElapsedTime()}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleSignOut}
              className={`flex items-center gap-2 ${isFarmWorker ? 'bg-green-700 hover:bg-green-800' : 'bg-slate-700 hover:bg-slate-800'} px-4 py-2 rounded-lg transition-colors`}
            >
              <LogOut className="w-5 h-5" />
              Atsijungti
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
            <button
              onClick={() => setCurrentView('schedule')}
              className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors ${
                currentView === 'schedule'
                  ? `${isFarmWorker ? 'border-green-600 text-green-600' : 'border-slate-600 text-slate-600'}`
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Calendar className="w-5 h-5" />
              Mano grafikas
            </button>
            <button
              onClick={() => setCurrentView('technika')}
              className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors ${
                currentView === 'technika'
                  ? `${isFarmWorker ? 'border-green-600 text-green-600' : 'border-slate-600 text-slate-600'}`
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Briefcase className="w-5 h-5" />
              Darbo vieta
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'schedule' && (
          <WorkerScheduleView
            workLocation={workLocation}
            activeTimeEntry={activeTimeEntry}
            onTimeEntryChange={loadActiveTimeEntry}
          />
        )}
        {currentView === 'technika' && (
          <WorkerTechnikaModule
            workLocation={workLocation}
            activeTimeEntry={activeTimeEntry}
          />
        )}
      </div>
    </div>
  );
}
