import { useState } from 'react';
import {
  Wrench,
  Package,
  FileText,
  BarChart3,
  Settings,
  Menu,
  X,
  ArrowLeft,
  HardHat,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TechnikaDashboard } from './technika/TechnikaDashboard';
import { EquipmentInvoices } from './technika/EquipmentInvoices';
import { ProductsManagement } from './technika/ProductsManagement';
import { FarmEquipmentMaintenance } from './technika/FarmEquipmentMaintenance';
import { EquipmentInventory } from './technika/EquipmentInventory';
import { PPEManagement } from './technika/PPEManagement';
import { TechnikaReports } from './technika/TechnikaReports';

interface FarmEquipmentModuleProps {
  onBack: () => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Pagrindinis', icon: BarChart3 },
  { id: 'invoices', label: 'Sąskaitos', icon: FileText },
  { id: 'products', label: 'Produktai', icon: Package },
  { id: 'farm-equipment', label: 'Fermos įrangos aptarnavimai', icon: Settings },
  { id: 'ppe', label: 'Drabužiai/PPE', icon: HardHat },
  { id: 'inventory', label: 'Sandėlis', icon: Wrench },
  { id: 'reports', label: 'Ataskaitos', icon: BarChart3 },
];

export function FarmEquipmentModule({ onBack }: FarmEquipmentModuleProps) {
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
        return <TechnikaDashboard locationFilter="farm" />;
      case 'invoices':
        return <EquipmentInvoices locationFilter="farm" />;
      case 'products':
        return <ProductsManagement locationFilter="farm" />;
      case 'farm-equipment':
        return <FarmEquipmentMaintenance />;
      case 'ppe':
        return <PPEManagement locationFilter="farm" />;
      case 'inventory':
        return <EquipmentInventory locationFilter="farm" />;
      case 'reports':
        return <TechnikaReports locationFilter="farm" />;
      default:
        return <TechnikaDashboard locationFilter="farm" />;
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
        className={`fixed left-0 top-0 bottom-0 w-64 bg-gradient-to-b from-green-700 via-green-600 to-green-700 shadow-lg z-30 transition-all duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-green-500/30">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 hover:bg-green-600/50 rounded"
              >
                <X className="w-5 h-5 text-green-100" />
              </button>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Fermos įranga</h2>
            <p className="text-sm text-green-100">Fermos įrangos valdymas</p>
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
                        ? 'bg-green-800 text-white shadow-sm'
                        : 'text-green-50 hover:bg-green-600/50'
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
          <div className="p-4 border-t border-green-500/30">
            <button
              onClick={onBack}
              className="w-full flex items-center gap-2 px-4 py-2 text-green-50 hover:bg-green-600/50 rounded-lg transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Grįžti į modulius</span>
            </button>
            <div className="text-xs text-green-200 text-center">
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
                  {currentMenuItem?.label || 'Fermos įranga'}
                </h1>
                <p className="text-sm text-gray-500">Fermos įrangos modulis</p>
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
