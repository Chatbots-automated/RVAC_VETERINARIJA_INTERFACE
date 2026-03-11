import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Wrench, Truck, ClipboardList, HardHat, AlertTriangle, Calendar } from 'lucide-react';

interface TechnikaDashboardProps {
  locationFilter?: 'farm' | 'warehouse';
}

export function TechnikaDashboard({ locationFilter }: TechnikaDashboardProps = {}) {
  const [stats, setStats] = useState({
    tools: 0,
    toolsAvailable: 0,
    vehicles: 0,
    vehiclesActive: 0,
    workOrdersPending: 0,
    ppeItems: 0,
    ppeLowStock: 0,
    upcomingMaintenance: 0,
  });

  useEffect(() => {
    loadStats();
  }, [locationFilter]);

  const loadStats = async () => {
    // Get products filtered by location
    const productsQuery = supabase
      .from('equipment_products')
      .select('id, name, default_location_type');
    
    if (locationFilter) {
      productsQuery.eq('default_location_type', locationFilter);
    }
    
    const productsRes = await productsQuery;
    const productIds = productsRes.data?.map(p => p.id) || [];

    // Get stock for these products
    const stockQuery = supabase
      .from('equipment_warehouse_stock')
      .select('product_id, quantity_on_hand');
    
    if (productIds.length > 0) {
      stockQuery.in('product_id', productIds);
    }
    
    const stockRes = await stockQuery;
    const totalStock = stockRes.data?.reduce((sum, s) => sum + (s.quantity_on_hand || 0), 0) || 0;

    // Get items on loan for these products
    const loansQuery = supabase
      .from('equipment_issuance_items')
      .select('id, equipment_products(default_location_type)')
      .eq('returned', false);
    
    const loansRes = await loansQuery;
    const filteredLoans = locationFilter 
      ? loansRes.data?.filter((item: any) => item.equipment_products?.default_location_type === locationFilter) || []
      : loansRes.data || [];

    const [vehiclesRes, workOrdersRes] = await Promise.all([
      supabase.from('vehicles').select('id, status', { count: 'exact' }).eq('is_active', true),
      supabase.from('maintenance_work_orders').select('id', { count: 'exact' }).eq('status', 'pending'),
    ]);

    const vehiclesActive = vehiclesRes.data?.filter(v => v.status === 'active').length || 0;

    setStats({
      tools: productsRes.data?.length || 0,
      toolsAvailable: totalStock,
      vehicles: vehiclesRes.count || 0,
      vehiclesActive,
      workOrdersPending: workOrdersRes.count || 0,
      ppeItems: filteredLoans.length,
      ppeLowStock: 0,
      upcomingMaintenance: 0,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Produktai"
          value={stats.tools.toString()}
          subtitle={`${stats.toolsAvailable} vnt. sandėlyje`}
          icon={Wrench}
          color="blue"
        />
        <StatCard
          title="Transportas"
          value={stats.vehicles.toString()}
          subtitle={`${stats.vehiclesActive} aktyvūs`}
          icon={Truck}
          color="green"
        />
        <StatCard
          title="Aptarnavimai"
          value={stats.workOrdersPending.toString()}
          subtitle="Laukiantys užsakymai"
          icon={ClipboardList}
          color="amber"
        />
        <StatCard
          title="Išduoti daiktai"
          value={stats.ppeItems.toString()}
          subtitle={`${stats.ppeLowStock} grąžinti`}
          icon={HardHat}
          color="purple"
        />
      </div>

      {stats.ppeLowStock > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Dėmesio reikalaujantys elementai</p>
              <p className="text-sm text-amber-700">
                {stats.ppeLowStock} PPE prekių su mažomis atsargomis · {stats.workOrdersPending} laukiantys aptarnavimai
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RecentActivity />
        <UpcomingTasks />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color }: any) {
  const colors: any = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${colors[color]} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function RecentActivity() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Paskutinė veikla</h3>
      <div className="space-y-3 text-sm text-gray-600">
        <p>Įrankių išdavimo ir grąžinimo istorija bus rodoma čia</p>
      </div>
    </div>
  );
}

function UpcomingTasks() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Artimiausi darbai</h3>
      <div className="space-y-3 text-sm text-gray-600">
        <p>Artimiausi planiniai aptarnavimai bus rodomi čia</p>
      </div>
    </div>
  );
}
