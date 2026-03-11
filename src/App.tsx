import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { ReceiveStock } from './components/ReceiveStock';
import { Products } from './components/Products';
import { AnimalsCompact as Animals } from './components/AnimalsCompact';
import { VisitsModern as Visits } from './components/VisitsModern';
import { Synchronizations } from './components/Synchronizations';
import { Seklinimas } from './components/Seklinimas';
import { Pienas } from './components/Pienas';
import { Hoofs } from './components/Hoofs';
import { Suppliers } from './components/Suppliers';
import { Biocides } from './components/Biocides';
import { OwnerMeds } from './components/OwnerMeds';
import { MedicalWaste } from './components/MedicalWaste';
import { Reports } from './components/Reports';
import { UserManagement } from './components/UserManagement';
import { AdminDashboard } from './components/AdminDashboard';
import { Vaccinations } from './components/Vaccinations';
import { BulkTreatment } from './components/BulkTreatment';
import { TreatmentHistory } from './components/TreatmentHistory';
import { TreatmentCostTab } from './components/TreatmentCostTab';
import { AuthForm } from './components/AuthForm';
import { ModuleSelector } from './components/ModuleSelector';
import { InvoiceViewer } from './components/InvoiceViewer';
import { TechnikaSelector } from './components/TechnikaSelector';
import { WorkerSchedulesSelector } from './components/WorkerSchedulesSelector';
import { WorkerPortal } from './components/worker/WorkerPortal';
import { NotificationToast, setNotificationCallback, NotificationType } from './components/NotificationToast';
import { useAuth } from './contexts/AuthContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { Euro, Droplets } from 'lucide-react';

type Module = 'veterinarija' | 'islaidos' | 'admin' | 'pienas' | 'technika' | 'worker-schedules' | null;

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedModule, setSelectedModule] = useState<Module>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const { user, loading, isWorker } = useAuth();

  // Initialize from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const module = params.get('module') as Module;
    const view = params.get('view');
    
    if (module) {
      setSelectedModule(module);
    }
    if (view) {
      setCurrentView(view);
    }
  }, []);

  // Update URL when navigation changes
  useEffect(() => {
    if (!user) return;
    
    const params = new URLSearchParams();
    if (selectedModule) {
      params.set('module', selectedModule);
    }
    if (currentView !== 'dashboard' || selectedModule) {
      params.set('view', currentView);
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    window.history.pushState({}, '', newUrl);
  }, [currentView, selectedModule, user]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const module = params.get('module') as Module;
      const view = params.get('view');
      
      if (!module && !view) {
        setSelectedModule(null);
        setCurrentView('dashboard');
      } else {
        if (module) setSelectedModule(module);
        if (view) setCurrentView(view);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    setNotificationCallback((message: string, type: NotificationType) => {
      setNotification({
        id: Date.now().toString(),
        message,
        type,
      });
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentView, selectedModule]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Kraunama...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  // Route workers directly to WorkerPortal
  if (isWorker) {
    return (
      <RealtimeProvider>
        <WorkerPortal />
        {notification && (
          <NotificationToast
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </RealtimeProvider>
    );
  }

  if (!selectedModule) {
    return <ModuleSelector onSelectModule={setSelectedModule} />;
  }

  if (selectedModule === 'islaidos') {
    return (
      <RealtimeProvider>
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50">
          <div className="max-w-7xl mx-auto p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Euro className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Išlaidų Valdymas</h1>
                  <p className="text-gray-600">Finansų apskaita ir kontrolė</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedModule(null)}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border border-gray-300 shadow-sm"
              >
                Grįžti
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <InvoiceViewer />
            </div>
          </div>
        </div>
      </RealtimeProvider>
    );
  }

  if (selectedModule === 'pienas') {
    return (
      <RealtimeProvider>
        <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-cyan-50">
          <div className="max-w-7xl mx-auto p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Droplets className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Pieno Apskaita</h1>
                  <p className="text-gray-600">Gamyba ir kokybės valdymas</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedModule(null)}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border border-gray-300 shadow-sm"
              >
                Grįžti
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <Pienas />
            </div>
          </div>
        </div>
      </RealtimeProvider>
    );
  }

  if (selectedModule === 'technika') {
    return (
      <RealtimeProvider>
        <TechnikaSelector onBackToModules={() => setSelectedModule(null)} />
        {notification && (
          <NotificationToast
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </RealtimeProvider>
    );
  }

  if (selectedModule === 'worker-schedules') {
    return (
      <RealtimeProvider>
        <WorkerSchedulesSelector onBack={() => setSelectedModule(null)} />
        {notification && (
          <NotificationToast
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </RealtimeProvider>
    );
  }

  if (selectedModule === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-red-50">
        <div className="max-w-7xl mx-auto p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Administratoriaus pultas</h1>
              <p className="text-gray-600">Sistemos valdymas ir stebėjimas</p>
            </div>
            <button
              onClick={() => setSelectedModule(null)}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl"
            >
              Grįžti į modulius
            </button>
          </div>
          <AdminDashboard />
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <Inventory />;
      case 'receive':
        return <ReceiveStock />;
      case 'treatment-history':
        return <TreatmentHistory />;
      case 'treatment-costs':
        return <TreatmentCostTab />;
      case 'vaccinations':
        return <Vaccinations />;
      case 'bulk-treatment':
        return <BulkTreatment />;
      case 'products':
        return <Products />;
      case 'animals':
        return <Animals />;
      case 'visits':
        return <Visits />;
      case 'hoofs':
        return <Hoofs />;
      case 'synchronizations':
        return <Synchronizations />;
      case 'insemination':
        return <Seklinimas />;
      case 'pienas':
        return <Pienas />;
      case 'suppliers':
        return <Suppliers />;
      case 'biocides':
        return <Biocides />;
      case 'owner-meds':
        return <OwnerMeds />;
      case 'waste':
        return <MedicalWaste />;
      case 'reports':
        return <Reports />;
      case 'users':
        return <UserManagement />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <RealtimeProvider>
      <Layout
        currentView={currentView}
        onNavigate={setCurrentView}
        onBackToModules={() => setSelectedModule(null)}
      >
        {renderView()}
      </Layout>
      <NotificationToast
        notification={notification}
        onDismiss={() => setNotification(null)}
      />
    </RealtimeProvider>
  );
}

export default App;
