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
import { EquipmentInventory } from './technika/EquipmentInventory';
import { TechnikaReports } from './technika/TechnikaReports';
import { ProductsManagement } from './technika/ProductsManagement';
import Kaupiniai from './Kaupiniai';
import { FireExtinguishersManagement } from './technika/FireExtinguishersManagement';
import { ProductQuality } from './technika/ProductQuality';
import { CostCentersManagement } from './technika/CostCentersManagement';

interface EquipmentYardModuleProps {
  onBack: () => void;
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
  { id: 'work-orders', label: 'Remonto darbai', icon: ClipboardList },
  { id: 'inventory', label: 'Sandėlis', icon: Package },
  { id: 'reports', label: 'Ataskaitos', icon: BarChart3 },
];

export function EquipmentYardModule({ onBack }: EquipmentYardModuleProps) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
        return <TechnikaDashboard locationFilter="warehouse" />;
      case 'invoices':
        return <EquipmentInvoices locationFilter="warehouse" />;
      case 'products':
        return <ProductsManagement locationFilter="warehouse" />;
      case 'cost-centers':
        return <CostCentersManagement />;
      case 'tools':
        return <ToolsManagement />;
      case 'ppe':
        return <PPEManagement locationFilter="warehouse" />;
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
      case 'kaupiniai':
        return <Kaupiniai />;
      case 'inventory':
        return <EquipmentInventory locationFilter="warehouse" />;
      case 'reports':
        return <TechnikaReports locationFilter="warehouse" />;
      default:
        return <TechnikaDashboard locationFilter="warehouse" />;
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
            <h2 className="text-xl font-bold text-white mb-1">Technikos kiemas</h2>
            <p className="text-sm text-slate-200">Technikos ir įrangos valdymas</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {menuItems.map(item => {
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
                        : 'text-slate-100 hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-600/50">
            <button
              onClick={onBack}
              className="w-full flex items-center gap-2 px-4 py-2 text-slate-100 hover:bg-slate-700/50 rounded-lg transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Grįžti į modulius</span>
            </button>
            <div className="text-xs text-slate-300 text-center">
              {user?.email}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  {currentMenuItem?.label || 'Technikos kiemas'}
                </h1>
                <p className="text-sm text-gray-500">Technikos kiemo modulis</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
