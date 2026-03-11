import { useState } from 'react';
import {
  Wrench,
  Package,
  FileText,
  Truck,
  ClipboardList,
  Calendar,
  BarChart3,
  HardHat,
  Menu,
  X,
  ArrowLeft,
  Settings,
  Users,
  Box,
  Flame,
  Star,
  Target,
  Shield,
  FolderKanban
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TechnikaDashboard } from './technika/TechnikaDashboard';
import { EquipmentInvoices } from './technika/EquipmentInvoices';
import { ToolsManagement } from './technika/ToolsManagement';
import { PPEManagement } from './technika/PPEManagement';
import { VehiclesManagement } from './technika/VehiclesManagement';
import { TechnicalInspectionInsurance } from './technika/TechnicalInspectionInsurance';
import { WorkOrders } from './technika/WorkOrders';
import { MaintenanceSchedules } from './technika/MaintenanceSchedules';
import { FarmEquipmentMaintenance } from './technika/FarmEquipmentMaintenance';
import { EquipmentInventory } from './technika/EquipmentInventory';
import { TechnikaReports } from './technika/TechnikaReports';
import { WorkerSchedules } from './technika/WorkerSchedules';
import { ProductsManagement } from './technika/ProductsManagement';
import Kaupiniai from './Kaupiniai';
import { FireExtinguishersManagement } from './technika/FireExtinguishersManagement';
import { ProductQuality } from './technika/ProductQuality';
import { CostCentersManagement } from './technika/CostCentersManagement';
import { ReminderNotification } from './technika/ReminderNotification';
import { ReminderCalendarView } from './technika/ReminderCalendarView';

interface TechnikaProps {
  onBackToModules: () => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Pagrindinis', icon: BarChart3 },
  { id: 'invoices', label: 'Sąskaitos', icon: FileText },
  { id: 'products', label: 'Produktai', icon: Box },
  { id: 'cost-centers', label: 'Kaštų centrai', icon: Target },
  { id: 'kaupiniai', label: 'Kaupiniai', icon: FolderKanban },
  { id: 'tools', label: 'Įrankiai', icon: Wrench },
  { id: 'ppe', label: 'Drabužiai/PPE', icon: HardHat },
  { id: 'vehicles', label: 'Transportas', icon: Truck },
  { id: 'technical-inspection', label: 'Techninės ir draudimai', icon: Shield },
  { id: 'fire-extinguishers', label: 'Gesintuvai', icon: Flame },
  { id: 'quality', label: 'Kokybės įvertinimas', icon: Star },
  { id: 'schedules', label: 'Planiniai technikos aptarnavimai', icon: Calendar },
  { id: 'farm-equipment', label: 'Fermos įrangos aptarnavimai', icon: Settings },
  { id: 'work-orders', label: 'Remonto darbai', icon: ClipboardList },
  { id: 'worker-schedules', label: 'Darbuotojų grafikai', icon: Users },
  { id: 'inventory', label: 'Sandėlis', icon: Package },
  { id: 'reports', label: 'Ataskaitos', icon: BarChart3 },
];

export function Technika({ onBackToModules }: TechnikaProps) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showReminderCalendar, setShowReminderCalendar] = useState(false);
  const { user, signOut } = useAuth();

  const currentMenuItem = menuItems.find(item => item.id === currentView);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <TechnikaDashboard />;
      case 'invoices':
        return <EquipmentInvoices />;
      case 'products':
        return <ProductsManagement />;
      case 'cost-centers':
        return <CostCentersManagement />;
      case 'tools':
        return <ToolsManagement />;
      case 'ppe':
        return <PPEManagement />;
      case 'vehicles':
        return <VehiclesManagement />;
      case 'technical-inspection':
        return <TechnicalInspectionInsurance />;
      case 'fire-extinguishers':
        return <FireExtinguishersManagement />;
      case 'quality':
        return <ProductQuality />;
      case 'work-orders':
        return <WorkOrders />;
      case 'schedules':
        return <MaintenanceSchedules />;
      case 'farm-equipment':
        return <FarmEquipmentMaintenance />;
      case 'kaupiniai':
        return <Kaupiniai />;
      case 'worker-schedules':
        return <WorkerSchedules />;
      case 'inventory':
        return <EquipmentInventory />;
      case 'reports':
        return <TechnikaReports />;
      default:
        return <TechnikaDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden transition-opacity ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-64 bg-gradient-to-b from-slate-800 via-slate-700 to-gray-800 shadow-2xl z-30 transition-all duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-600/50">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 hover:bg-slate-600/50 rounded"
              >
                <X className="w-5 h-5 text-slate-200" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex items-center justify-center shadow-lg">
                <Settings className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white leading-tight">Technika</h1>
                <p className="text-xs text-slate-300">Įranga ir transportas</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-slate-600 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-600/50">
            <button
              onClick={onBackToModules}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium text-sm">Grįžti į modulius</span>
            </button>
            {user && (
              <div className="mt-2 px-4 py-2 bg-slate-700/30 rounded-lg">
                <p className="text-xs text-slate-400">Prisijungęs:</p>
                <p className="text-sm text-white font-medium truncate">{user.email}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                {currentMenuItem && (
                  <>
                    <currentMenuItem.icon className="w-6 h-6 text-slate-600" />
                    <h2 className="text-xl font-bold text-gray-800">{currentMenuItem.label}</h2>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="p-6">{renderContent()}</div>
      </div>

      {/* Reminder Notification (floating) */}
      <ReminderNotification onViewAll={() => setShowReminderCalendar(true)} />

      {/* Reminder Calendar View (modal) */}
      {showReminderCalendar && (
        <ReminderCalendarView onClose={() => setShowReminderCalendar(false)} />
      )}
    </div>
  );
}
