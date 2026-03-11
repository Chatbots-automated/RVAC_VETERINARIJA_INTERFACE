import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BarChart3,
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  Package,
  Users,
  TrendingUp,
  Calendar,
  AlertTriangle,
  DollarSign,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Car
} from 'lucide-react';

interface ProductHistory {
  product_id: string;
  product_name: string;
  product_code: string;
  category_name: string;
  unit_type: string;
  current_stock: number;
  total_received: number;
  total_spent: number;
  total_issued: number;
  avg_price: number;
  batches: any[];
  issuances: any[];
  invoices: any[];
}

interface CategoryStats {
  category: string;
  total_value: number;
  total_qty: number;
  item_count: number;
  issued_value: number;
}

interface WorkerStats {
  worker_id: string;
  worker_name: string;
  items_count: number;
  total_value: number;
  outstanding_items: any[];
}

interface TechnikaReportsProps {
  locationFilter?: 'farm' | 'warehouse';
}

export function TechnikaReports({ locationFilter }: TechnikaReportsProps = {}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'workers' | 'categories' | 'timeline' | 'farm-equipment' | 'transport-services' | 'cost-centers'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return (tab as any) || 'overview';
  });
  const [loading, setLoading] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [productHistory, setProductHistory] = useState<ProductHistory[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [workerStats, setWorkerStats] = useState<WorkerStats[]>([]);
  const [overviewStats, setOverviewStats] = useState({
    totalInventoryValue: 0,
    itemsOnLoan: 0,
    loanValue: 0,
    monthlySpending: 0,
    lowStockItems: 0,
    totalProducts: 0,
  });

  const [dateFilter, setDateFilter] = useState({
    from: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categories, setCategories] = useState<any[]>([]);
  
  // Farm equipment cost data
  const [farmEquipmentOverview, setFarmEquipmentOverview] = useState<any[]>([]);
  const [farmEquipmentDetails, setFarmEquipmentDetails] = useState<any[]>([]);
  const [expandedEquipment, setExpandedEquipment] = useState<string | null>(null);
  const [farmEquipmentStats, setFarmEquipmentStats] = useState({
    totalCost: 0,
    totalServices: 0,
    totalPartsUsed: 0,
    equipmentCount: 0,
  });

  // Vehicle maintenance cost data
  const [vehicleCostSummary, setVehicleCostSummary] = useState<any[]>([]);
  const [vehicleWorkOrders, setVehicleWorkOrders] = useState<any[]>([]);
  const [vehicleServiceVisits, setVehicleServiceVisits] = useState<any[]>([]);
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [vehicleCostStats, setVehicleCostStats] = useState({
    totalCost: 0,
    totalWorkOrders: 0,
    totalServiceVisits: 0,
    totalPartsUsed: 0,
    vehicleCount: 0,
  });

  // Transport services data
  const [transportServices, setTransportServices] = useState<any[]>([]);
  const [transportStats, setTransportStats] = useState({
    totalCost: 0,
    companyCount: 0,
    invoiceCount: 0,
  });

  // Cost center data
  const [costCenterSummary, setCostCenterSummary] = useState<any[]>([]);
  const [expandedCostCenter, setExpandedCostCenter] = useState<string | null>(null);
  const [costCenterDetails, setCostCenterDetails] = useState<any[]>([]);
  const [loadingCostCenterDetails, setLoadingCostCenterDetails] = useState(false);
  const [costCenterStats, setCostCenterStats] = useState({
    totalCost: 0,
    totalCenters: 0,
    totalAssignments: 0,
  });

  // Update URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    const newUrl = `?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }, [activeTab]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab) {
        setActiveTab(tab as any);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    loadCategories();
    loadData();
  }, [dateFilter, locationFilter]);

  useEffect(() => {
    if (activeTab === 'transport-services') {
      loadTransportServices();
    }
    if (activeTab === 'cost-centers') {
      loadCostCenterData();
    }
  }, [activeTab, dateFilter, locationFilter]);

  useEffect(() => {
    if (activeTab === 'farm-equipment') {
      loadFarmEquipmentData();
    }
    if (activeTab === 'vehicle-maintenance') {
      loadVehicleMaintenanceData();
    }
  }, [activeTab, dateFilter]);

  const loadCategories = async () => {
    const { data } = await supabase
      .from('equipment_categories')
      .select('*')
      .order('name');
    if (data) setCategories(data);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadProductHistory(),
        loadCategoryStats(),
        loadWorkerStats(),
        loadOverviewStats()
      ]);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCostCenterData = async () => {
    try {
      const { data: costCenters, error } = await supabase
        .from('cost_center_summary')
        .select('*')
        .order('total_cost', { ascending: false });

      if (error) throw error;

      if (costCenters) {
        setCostCenterSummary(costCenters);
        
        const totalCost = costCenters.reduce((sum, cc) => sum + parseFloat(cc.total_cost || 0), 0);
        const totalCenters = costCenters.length;
        const totalAssignments = costCenters.reduce((sum, cc) => sum + parseInt(cc.total_assignments || 0), 0);

        setCostCenterStats({
          totalCost,
          totalCenters,
          totalAssignments,
        });
      }
    } catch (error) {
      console.error('Error loading cost center data:', error);
    }
  };

  const loadCostCenterDetails = async (costCenterId: string) => {
    setLoadingCostCenterDetails(true);
    try {
      const { data, error } = await supabase
        .from('cost_center_parts_usage')
        .select('*')
        .eq('cost_center_id', costCenterId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;

      setCostCenterDetails(data || []);
    } catch (error) {
      console.error('Error loading cost center details:', error);
      setCostCenterDetails([]);
    } finally {
      setLoadingCostCenterDetails(false);
    }
  };

  const handleToggleCostCenterDetails = async (costCenterId: string) => {
    if (expandedCostCenter === costCenterId) {
      setExpandedCostCenter(null);
      setCostCenterDetails([]);
    } else {
      setExpandedCostCenter(costCenterId);
      await loadCostCenterDetails(costCenterId);
    }
  };

  const loadTransportServices = async () => {
    setLoading(true);
    try {
      console.log('Loading transport services...', { dateFilter });
      
      // Query transport service assignments with invoice data
      const { data, error } = await supabase
        .from('equipment_invoice_item_assignments')
        .select(`
          id,
          transport_company,
          notes,
          assigned_at,
          invoice_item_id,
          equipment_invoice_items(
            id,
            description,
            quantity,
            unit_price,
            total_price,
            invoice_id,
            equipment_invoices(
              id,
              invoice_number,
              invoice_date,
              supplier_name
            )
          )
        `)
        .eq('assignment_type', 'transport_service')
        .order('assigned_at', { ascending: false });

      if (error) {
        console.error('Transport services query error:', error);
        throw error;
      }
      
      console.log('Transport services raw data:', data);
      
      // Filter by date client-side (more flexible)
      const filteredData = data?.filter((item: any) => {
        const assignedDate = new Date(item.assigned_at);
        const fromDate = new Date(dateFilter.from);
        const toDate = new Date(dateFilter.to);
        toDate.setHours(23, 59, 59, 999); // Include the entire end date
        return assignedDate >= fromDate && assignedDate <= toDate;
      }) || [];
      
      console.log('Filtered transport services data:', filteredData);

      // Group by transport company
      const companyMap = new Map<string, any>();
      let totalCost = 0;
      let invoiceCount = 0;

      filteredData.forEach((assignment: any) => {
        const company = assignment.transport_company || 'Nenurodyta';
        const item = assignment.equipment_invoice_items;
        const cost = item.total_price || 0;

        totalCost += cost;
        invoiceCount++;

        if (!companyMap.has(company)) {
          companyMap.set(company, {
            company,
            totalCost: 0,
            invoiceCount: 0,
            items: [],
          });
        }

        const companyData = companyMap.get(company);
        companyData.totalCost += cost;
        companyData.invoiceCount++;
        companyData.items.push({
          ...assignment,
          item,
        });
      });

      const services = Array.from(companyMap.values()).sort((a, b) => b.totalCost - a.totalCost);

      setTransportServices(services);
      setTransportStats({
        totalCost,
        companyCount: companyMap.size,
        invoiceCount,
      });
    } catch (error) {
      console.error('Error loading transport services:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProductHistory = async () => {
    const productsQuery = supabase
      .from('equipment_products')
      .select(`
        *,
        equipment_categories(name)
      `)
      .eq('is_active', true);
    
    if (locationFilter) {
      productsQuery.eq('default_location_type', locationFilter);
    }
    
    const { data: products } = await productsQuery.order('name');

    if (!products) return;

    const productHistories = await Promise.all(
      products.map(async (product) => {
        const { data: batches } = await supabase
          .from('equipment_batches')
          .select(`
            *,
            equipment_invoices(invoice_number, invoice_date, supplier_name)
          `)
          .eq('product_id', product.id)
          .order('created_at', { ascending: false });

        const { data: issuanceItems, error: issuanceError } = await supabase
          .from('equipment_issuance_items')
          .select(`
            *,
            equipment_issuances(
              issuance_number,
              issue_date,
              issued_to_name,
              status,
              issued_to_user:users!equipment_issuances_issued_to_fkey(full_name)
            )
          `)
          .eq('product_id', product.id)
          .order('created_at', { ascending: false });

        if (issuanceError) {
          console.error('Error loading issuances for product:', product.name, issuanceError);
        }

        const totalReceived = batches?.reduce((sum, b) => sum + parseFloat(b.received_qty || 0), 0) || 0;
        const totalSpent = batches?.reduce((sum, b) => sum + parseFloat(b.purchase_price || 0) * parseFloat(b.received_qty || 0), 0) || 0;
        const totalIssued = issuanceItems?.reduce((sum, i) => sum + parseFloat(i.quantity || 0), 0) || 0;
        const currentStock = batches?.reduce((sum, b) => sum + parseFloat(b.qty_left || 0), 0) || 0;
        const avgPrice = totalReceived > 0 ? totalSpent / totalReceived : 0;

        return {
          product_id: product.id,
          product_name: product.name,
          product_code: product.product_code || '',
          category_name: product.equipment_categories?.name || 'Nėra kategorijos',
          unit_type: product.unit_type || 'vnt',
          current_stock: currentStock,
          total_received: totalReceived,
          total_spent: totalSpent,
          total_issued: totalIssued,
          avg_price: avgPrice,
          batches: batches || [],
          issuances: issuanceItems || [],
          invoices: batches?.map(b => b.equipment_invoices).filter(Boolean) || [],
        };
      })
    );

    setProductHistory(productHistories);
  };

  const loadCategoryStats = async () => {
    const statsQuery = supabase
      .from('equipment_batches')
      .select(`
        product_id,
        qty_left,
        purchase_price,
        received_qty,
        equipment_products!inner(
          category_id,
          default_location_type,
          equipment_categories(name)
        )
      `)
      .gte('created_at', dateFilter.from)
      .lte('created_at', dateFilter.to + 'T23:59:59');
    
    if (locationFilter) {
      statsQuery.eq('equipment_products.default_location_type', locationFilter);
    }
    
    const { data: stats } = await statsQuery;

    if (!stats) return;

    const categoryMap = new Map<string, CategoryStats>();

    stats.forEach((item: any) => {
      const categoryName = item.equipment_products?.equipment_categories?.name || 'Nėra kategorijos';
      const value = parseFloat(item.qty_left || 0) * parseFloat(item.purchase_price || 0);
      const received = parseFloat(item.received_qty || 0);

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          total_value: 0,
          total_qty: 0,
          item_count: 0,
          issued_value: 0,
        });
      }

      const cat = categoryMap.get(categoryName)!;
      cat.total_value += value;
      cat.total_qty += parseFloat(item.qty_left || 0);
      cat.item_count++;
    });

    setCategoryStats(Array.from(categoryMap.values()));
  };

  const loadWorkerStats = async () => {
    const { data: issuances } = await supabase
      .from('equipment_issuances')
      .select(`
        *,
        equipment_issuance_items(
          quantity,
          quantity_returned,
          unit_price,
          product_id,
          equipment_products(name, unit_type, default_location_type)
        ),
        users(full_name)
      `)
      .in('status', ['issued', 'partial_return'])
      .gte('issue_date', dateFilter.from)
      .lte('issue_date', dateFilter.to + 'T23:59:59');

    if (!issuances) return;

    const workerMap = new Map<string, WorkerStats>();

    issuances.forEach((issuance: any) => {
      const workerId = issuance.issued_to || 'unknown';
      const workerName = issuance.users?.full_name || issuance.issued_to_name || 'Nežinomas';

      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          worker_id: workerId,
          worker_name: workerName,
          items_count: 0,
          total_value: 0,
          outstanding_items: [],
        });
      }

      const worker = workerMap.get(workerId)!;

      issuance.equipment_issuance_items?.forEach((item: any) => {
        // Filter by location if specified
        if (locationFilter && item.equipment_products?.default_location_type !== locationFilter) {
          return;
        }
        
        const outstanding = parseFloat(item.quantity || 0) - parseFloat(item.quantity_returned || 0);
        if (outstanding > 0) {
          worker.items_count++;
          worker.total_value += outstanding * parseFloat(item.unit_price || 0);
          worker.outstanding_items.push({
            product_name: item.equipment_products?.name,
            quantity: outstanding,
            unit_type: item.equipment_products?.unit_type,
            issuance_number: issuance.issuance_number,
            issue_date: issuance.issue_date,
          });
        }
      });
    });

    setWorkerStats(Array.from(workerMap.values()).filter(w => w.items_count > 0));
  };

  const loadOverviewStats = async () => {
    // Get products filtered by location
    let productIds: string[] | undefined;
    if (locationFilter) {
      const { data: products } = await supabase
        .from('equipment_products')
        .select('id')
        .eq('default_location_type', locationFilter);
      productIds = products?.map(p => p.id);
    }

    const stockQuery = supabase
      .from('equipment_warehouse_stock')
      .select('*');
    
    if (productIds) {
      stockQuery.in('product_id', productIds);
    }
    
    const { data: warehouseStock } = await stockQuery;

    const loansQuery = supabase
      .from('equipment_items_on_loan')
      .select('*');
    
    if (productIds) {
      loansQuery.in('product_id', productIds);
    }
    
    const { data: itemsOnLoan } = await loansQuery;

    const { data: monthlyInvoices } = await supabase
      .from('equipment_invoices')
      .select('total_net')
      .gte('invoice_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
      .lte('invoice_date', new Date().toISOString().split('T')[0]);

    const totalInventoryValue = warehouseStock?.reduce((sum, item) => sum + parseFloat(item.total_value || 0), 0) || 0;
    const itemsOnLoanCount = itemsOnLoan?.length || 0;
    const loanValue = itemsOnLoan?.reduce((sum, item) => sum + parseFloat(item.value_outstanding || 0), 0) || 0;
    const monthlySpending = monthlyInvoices?.reduce((sum, inv) => sum + parseFloat(inv.total_net || 0), 0) || 0;
    const lowStockItems = warehouseStock?.filter(item => parseFloat(item.total_qty || 0) < 5).length || 0;
    const totalProducts = warehouseStock?.length || 0;

    setOverviewStats({
      totalInventoryValue,
      itemsOnLoan: itemsOnLoanCount,
      loanValue,
      monthlySpending,
      lowStockItems,
      totalProducts,
    });
  };

  const loadFarmEquipmentData = async () => {
    setLoading(true);
    try {
      // Load equipment overview
      const { data: overview } = await supabase
        .from('farm_equipment_cost_overview')
        .select('*')
        .order('total_cost', { ascending: false });

      if (overview) {
        setFarmEquipmentOverview(overview);
        
        const stats = {
          totalCost: overview.reduce((sum, eq) => sum + parseFloat(eq.total_cost || 0), 0),
          totalServices: overview.reduce((sum, eq) => sum + (eq.total_services || 0), 0),
          totalPartsUsed: overview.reduce((sum, eq) => sum + (eq.total_parts_used || 0), 0),
          equipmentCount: overview.length,
        };
        setFarmEquipmentStats(stats);
      }

      // Load all service details
      const { data: details } = await supabase
        .from('farm_equipment_service_details')
        .select('*')
        .gte('service_date', dateFilter.from)
        .lte('service_date', dateFilter.to)
        .order('service_date', { ascending: false });

      if (details) {
        setFarmEquipmentDetails(details);
      }
    } catch (error) {
      console.error('Error loading farm equipment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicleMaintenanceData = async () => {
    setLoading(true);
    try {
      // Load vehicle cost summary
      const { data: summary } = await supabase
        .from('vehicle_maintenance_cost_summary')
        .select('*')
        .order('grand_total_cost', { ascending: false });

      if (summary) {
        setVehicleCostSummary(summary);
        
        const stats = {
          totalCost: summary.reduce((sum, v) => sum + parseFloat(v.grand_total_cost || 0), 0),
          totalWorkOrders: summary.reduce((sum, v) => sum + (v.completed_work_orders || 0), 0),
          totalServiceVisits: summary.reduce((sum, v) => sum + (v.completed_service_visits || 0), 0),
          totalPartsUsed: summary.reduce((sum, v) => sum + (v.total_parts_used || 0), 0),
          vehicleCount: summary.filter(v => v.total_completed_activities > 0).length,
        };
        setVehicleCostStats(stats);
      }

      // Load work order details
      const { data: workOrders } = await supabase
        .from('vehicle_work_order_details')
        .select('*')
        .gte('completed_date', dateFilter.from)
        .lte('completed_date', dateFilter.to)
        .eq('status', 'completed')
        .order('completed_date', { ascending: false });

      if (workOrders) setVehicleWorkOrders(workOrders);

      // Load service visit details
      const { data: visits } = await supabase
        .from('vehicle_service_visit_details')
        .select('*')
        .gte('visit_datetime', dateFilter.from)
        .lte('visit_datetime', dateFilter.to)
        .eq('status', 'Baigtas')
        .order('visit_datetime', { ascending: false });

      if (visits) setVehicleServiceVisits(visits);
    } catch (error) {
      console.error('Error loading vehicle maintenance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredProducts = categoryFilter === 'all'
    ? productHistory
    : productHistory.filter(p => p.category_name === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Date Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-gray-600" />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Nuo:</label>
            <input
              type="date"
              value={dateFilter.from}
              onChange={(e) => setDateFilter({ ...dateFilter, from: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Iki:</label>
            <input
              type="date"
              value={dateFilter.to}
              onChange={(e) => setDateFilter({ ...dateFilter, to: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto">
            {[
              { id: 'overview', label: 'Apžvalga', icon: BarChart3 },
              { id: 'items', label: 'Prekių istorija', icon: Package },
              { id: 'workers', label: 'Darbuotojai', icon: Users },
              { id: 'categories', label: 'Kategorijos', icon: Filter },
              { id: 'cost-centers', label: 'Kaštų centrai', icon: DollarSign },
              ...(locationFilter === 'farm' ? [{ id: 'farm-equipment', label: 'Fermos įrangos savikaina', icon: DollarSign }] : []),
              ...(!locationFilter ? [{ id: 'vehicle-maintenance', label: 'Transporto taisymų savikaina', icon: Car }] : []),
              { id: 'transport-services', label: 'Transporto paslaugos', icon: Car },
              { id: 'timeline', label: 'Laiko juosta', icon: TrendingUp },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
              <p className="mt-2 text-gray-600">Kraunami duomenys...</p>
            </div>
          )}

          {!loading && activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard
                  title="Bendras sandėlio turtas"
                  value={`€${overviewStats.totalInventoryValue.toFixed(2)}`}
                  icon={DollarSign}
                  trend={null}
                  color="blue"
                />
                <StatCard
                  title="Išduota prekių"
                  value={overviewStats.itemsOnLoan.toString()}
                  icon={ArrowUpRight}
                  subtext={`Vertė: €${overviewStats.loanValue.toFixed(2)}`}
                  color="orange"
                />
                <StatCard
                  title="Šio mėnesio išlaidos"
                  value={`€${overviewStats.monthlySpending.toFixed(2)}`}
                  icon={TrendingUp}
                  color="green"
                />
                <StatCard
                  title="Mažos atsargos"
                  value={overviewStats.lowStockItems.toString()}
                  icon={AlertTriangle}
                  subtext="Prekių su < 5 vnt."
                  color="red"
                />
                <StatCard
                  title="Produktų kataloge"
                  value={overviewStats.totalProducts.toString()}
                  icon={Package}
                  color="purple"
                />
                <StatCard
                  title="Vidutinė partijos vertė"
                  value={overviewStats.totalProducts > 0
                    ? `€${(overviewStats.totalInventoryValue / overviewStats.totalProducts).toFixed(2)}`
                    : '€0.00'}
                  icon={BarChart3}
                  color="indigo"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Top 5 Kategorijos pagal vertę</h3>
                  <div className="space-y-3">
                    {categoryStats
                      .sort((a, b) => b.total_value - a.total_value)
                      .slice(0, 5)
                      .map((cat, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">{cat.category}</span>
                          <span className="font-semibold text-gray-900">€{cat.total_value.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Top 5 Darbuotojai pagal išduotų prekių vertę</h3>
                  <div className="space-y-3">
                    {workerStats
                      .sort((a, b) => b.total_value - a.total_value)
                      .slice(0, 5)
                      .map((worker, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">{worker.worker_name}</span>
                          <span className="font-semibold text-gray-900">
                            €{worker.total_value.toFixed(2)} ({worker.items_count})
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'items' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Prekių istorija ir sekimas</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">Visos kategorijos</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => exportToCSV(
                      filteredProducts.map(p => ({
                        'Pavadinimas': p.product_name,
                        'Kodas': p.product_code,
                        'Kategorija': p.category_name,
                        'Dabartinės atsargos': p.current_stock,
                        'Gauta iš viso': p.total_received,
                        'Išleista iš viso': p.total_spent.toFixed(2),
                        'Išduota': p.total_issued,
                        'Vid. kaina': p.avg_price.toFixed(2),
                      })),
                      'prekiu_istorija'
                    )}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Eksportuoti
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {filteredProducts.map((product) => {
                  const isExpanded = expandedProduct === product.product_id;
                  return (
                    <div key={product.product_id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedProduct(isExpanded ? null : product.product_id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                          <div className="text-left">
                            <div className="font-semibold text-gray-900">{product.product_name}</div>
                            <div className="text-sm text-gray-600">
                              {product.product_code} • {product.category_name}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <div className="text-gray-600">Atsargos</div>
                            <div className="font-semibold text-gray-900">
                              {product.current_stock} {product.unit_type}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-gray-600">Gauta</div>
                            <div className="font-semibold text-gray-900">
                              {product.total_received} {product.unit_type}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-gray-600">Išleista</div>
                            <div className="font-semibold text-gray-900">€{product.total_spent.toFixed(2)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-gray-600">Išduota</div>
                            <div className="font-semibold text-gray-900">
                              {product.total_issued} {product.unit_type}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Batches/Receipts */}
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                Pajamavimo istorija ({product.batches.length})
                              </h4>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {product.batches.map((batch) => (
                                  <div key={batch.id} className="bg-white rounded-lg p-3 border border-gray-200 text-sm">
                                    <div className="flex justify-between mb-1">
                                      <span className="font-medium text-gray-900">
                                        {batch.equipment_invoices?.invoice_number || 'N/A'}
                                      </span>
                                      <span className="text-gray-600">
                                        {new Date(batch.created_at).toLocaleDateString('lt-LT')}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-gray-700">
                                      <span>
                                        Kiekis: {batch.received_qty} {product.unit_type}
                                      </span>
                                      <span>
                                        Likutis: {batch.qty_left} {product.unit_type}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-gray-700 mt-1">
                                      <span>
                                        Kaina: €{parseFloat(batch.purchase_price || 0).toFixed(2)}
                                      </span>
                                      <span className="font-medium">
                                        Suma: €{(parseFloat(batch.purchase_price || 0) * parseFloat(batch.received_qty || 0)).toFixed(2)}
                                      </span>
                                    </div>
                                    {batch.equipment_invoices?.supplier_name && (
                                      <div className="text-gray-600 mt-1">
                                        Tiekėjas: {batch.equipment_invoices.supplier_name}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Issuances/Distribution */}
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Išdavimo istorija ({product.issuances.length})
                              </h4>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {product.issuances.map((issuance) => (
                                  <div key={issuance.id} className="bg-white rounded-lg p-3 border border-gray-200 text-sm">
                                    <div className="flex justify-between mb-1">
                                      <span className="font-medium text-gray-900">
                                        {issuance.equipment_issuances?.issuance_number || 'N/A'}
                                      </span>
                                      <span className="text-gray-600">
                                        {new Date(issuance.created_at).toLocaleDateString('lt-LT')}
                                      </span>
                                    </div>
                                    <div className="text-gray-700">
                                      Kam: {issuance.equipment_issuances?.issued_to_user?.full_name || issuance.equipment_issuances?.issued_to_name || 'N/A'}
                                    </div>
                                    <div className="flex justify-between text-gray-700 mt-1">
                                      <span>
                                        Kiekis: {issuance.quantity} {product.unit_type}
                                      </span>
                                      <span>
                                        Grąžinta: {issuance.quantity_returned} {product.unit_type}
                                      </span>
                                    </div>
                                    {issuance.unit_price && (
                                      <div className="text-gray-700 mt-1">
                                        Vertė: €{(parseFloat(issuance.quantity || 0) * parseFloat(issuance.unit_price || 0)).toFixed(2)}
                                      </div>
                                    )}
                                    <div className="mt-1">
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                        issuance.equipment_issuances?.status === 'issued'
                                          ? 'bg-orange-100 text-orange-800'
                                          : issuance.equipment_issuances?.status === 'returned'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {issuance.equipment_issuances?.status === 'issued' ? 'Išduota' :
                                         issuance.equipment_issuances?.status === 'returned' ? 'Grąžinta' :
                                         issuance.equipment_issuances?.status === 'partial_return' ? 'Dalinai grąžinta' : 'Prarasta'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Summary */}
                          <div className="mt-4 pt-4 border-t border-gray-300">
                            <div className="grid grid-cols-4 gap-4 text-center">
                              <div>
                                <div className="text-sm text-gray-600">Vidutinė kaina</div>
                                <div className="text-lg font-bold text-gray-900">€{product.avg_price.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-600">Iš viso gauta</div>
                                <div className="text-lg font-bold text-green-600">
                                  +{product.total_received} {product.unit_type}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-600">Iš viso išduota</div>
                                <div className="text-lg font-bold text-orange-600">
                                  -{product.total_issued} {product.unit_type}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-600">Dabartinis likutis</div>
                                <div className="text-lg font-bold text-blue-600">
                                  {product.current_stock} {product.unit_type}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && activeTab === 'workers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Darbuotojų išduotų prekių suvestinė</h3>
                <button
                  onClick={() => exportToCSV(
                    workerStats.map(w => ({
                      'Darbuotojas': w.worker_name,
                      'Prekių skaičius': w.items_count,
                      'Bendra vertė': w.total_value.toFixed(2),
                    })),
                    'darbuotoju_suvestine'
                  )}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Eksportuoti
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {workerStats.map((worker) => (
                  <div key={worker.worker_id} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900">{worker.worker_name}</h4>
                        <p className="text-sm text-gray-600">
                          {worker.items_count} prekės • €{worker.total_value.toFixed(2)}
                        </p>
                      </div>
                      <Users className="w-8 h-8 text-gray-400" />
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {worker.outstanding_items.map((item, idx) => (
                        <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-900">{item.product_name}</span>
                            <span className="text-gray-700">
                              {item.quantity} {item.unit_type}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-600 mt-1">
                            <span>{item.issuance_number}</span>
                            <span>{new Date(item.issue_date).toLocaleDateString('lt-LT')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Kategorijų statistika</h3>
                <button
                  onClick={() => exportToCSV(
                    categoryStats.map(c => ({
                      'Kategorija': c.category,
                      'Bendra vertė': c.total_value.toFixed(2),
                      'Kiekis': c.total_qty,
                      'Prekių skaičius': c.item_count,
                    })),
                    'kategoriju_statistika'
                  )}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Eksportuoti
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryStats.map((cat, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-gray-900 mb-3">{cat.category}</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Bendra vertė</span>
                        <span className="font-medium text-gray-900">€{cat.total_value.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Kiekis</span>
                        <span className="font-medium text-gray-900">{cat.total_qty.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Skirtingų prekių</span>
                        <span className="font-medium text-gray-900">{cat.item_count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && activeTab === 'farm-equipment' && (
            <div className="space-y-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Įrangos vienetų"
                  value={farmEquipmentStats.equipmentCount.toString()}
                  icon={Car}
                  trend="neutral"
                />
                <StatCard
                  title="Iš viso aptarnavimų"
                  value={farmEquipmentStats.totalServices.toString()}
                  icon={Calendar}
                  trend="neutral"
                />
                <StatCard
                  title="Panaudotų produktų"
                  value={farmEquipmentStats.totalPartsUsed.toString()}
                  icon={Package}
                  trend="neutral"
                />
                <StatCard
                  title="Bendra savikaina"
                  value={`€${farmEquipmentStats.totalCost.toFixed(2)}`}
                  icon={DollarSign}
                  trend="neutral"
                />
              </div>

              {/* Equipment List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Įrangos aptarnavimų suvestinė</h3>
                  <button
                    onClick={() => exportToCSV(farmEquipmentOverview, 'farm_equipment_costs')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    Eksportuoti CSV
                  </button>
                </div>

                {farmEquipmentOverview.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Nėra duomenų</h3>
                    <p className="text-gray-600">
                      Dar nebuvo atlikta jokių aptarnavimų su produktų naudojimu
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {farmEquipmentOverview.map((equipment) => (
                      <div key={equipment.equipment_id} className="bg-white border rounded-lg">
                        <button
                          onClick={() => setExpandedEquipment(
                            expandedEquipment === equipment.equipment_id ? null : equipment.equipment_id
                          )}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            {expandedEquipment === equipment.equipment_id ? (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            )}
                            <div className="text-left">
                              <h4 className="font-semibold text-gray-900">{equipment.equipment_name}</h4>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                                {equipment.location && (
                                  <span>📍 {equipment.location}</span>
                                )}
                                {equipment.category && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                    {equipment.category}
                                  </span>
                                )}
                                <span>{equipment.active_items} komponentų</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <p className="text-gray-600">Aptarnavimai</p>
                              <p className="font-semibold text-gray-900">{equipment.total_services}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">Produktai</p>
                              <p className="font-semibold text-gray-900">{equipment.total_parts_used}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">Savikaina</p>
                              <p className="font-bold text-green-600">€{parseFloat(equipment.total_cost || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </button>

                        {expandedEquipment === equipment.equipment_id && (
                          <div className="border-t p-4 bg-gray-50">
                            <h5 className="font-semibold text-gray-900 mb-3">Aptarnavimų detalės</h5>
                            <div className="space-y-2">
                              {farmEquipmentDetails
                                .filter(d => d.equipment_id === equipment.equipment_id)
                                .reduce((acc: any[], detail) => {
                                  // Group by service_record_id
                                  const existing = acc.find(item => item.service_record_id === detail.service_record_id);
                                  if (existing) {
                                    if (detail.part_id) {
                                      existing.parts.push(detail);
                                    }
                                  } else {
                                    acc.push({
                                      service_record_id: detail.service_record_id,
                                      service_date: detail.service_date,
                                      item_name: detail.item_name,
                                      service_notes: detail.service_notes,
                                      performed_by_name: detail.performed_by_name,
                                      parts: detail.part_id ? [detail] : [],
                                    });
                                  }
                                  return acc;
                                }, [])
                                .map((service: any) => (
                                  <div key={service.service_record_id} className="bg-white rounded-lg p-3 border">
                                    <div className="flex items-start justify-between mb-2">
                                      <div>
                                        <p className="font-medium text-gray-900">{service.item_name}</p>
                                        <p className="text-sm text-gray-600">
                                          📅 {service.service_date}
                                          {service.performed_by_name && ` | 👤 ${service.performed_by_name}`}
                                        </p>
                                        {service.service_notes && (
                                          <p className="text-xs text-gray-500 mt-1 italic">{service.service_notes}</p>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm text-gray-600">Savikaina</p>
                                        <p className="font-bold text-green-600">
                                          €{service.parts.reduce((sum: number, p: any) => 
                                            sum + parseFloat(p.part_total_cost || 0), 0
                                          ).toFixed(2)}
                                        </p>
                                      </div>
                                    </div>

                                    {service.parts.length > 0 && (
                                      <div className="mt-2 pt-2 border-t">
                                        <p className="text-xs font-semibold text-gray-700 mb-2">Panaudoti produktai:</p>
                                        <div className="space-y-1">
                                          {service.parts.map((part: any) => (
                                            <div key={part.part_id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                                              <span className="text-gray-700">
                                                {part.product_name}
                                                {part.product_code && ` (${part.product_code})`}
                                                {part.batch_number && ` - Partija: ${part.batch_number}`}
                                              </span>
                                              <span className="font-medium text-gray-900">
                                                {part.quantity_used} {part.unit_type} × €{parseFloat(part.unit_price || 0).toFixed(2)} = €{parseFloat(part.part_total_cost || 0).toFixed(2)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {service.parts.length === 0 && (
                                      <p className="text-xs text-gray-500 italic mt-2">Produktai nenaudoti</p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'vehicle-maintenance' && (
            <div className="space-y-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard
                  title="Transporto priemonių"
                  value={vehicleCostStats.vehicleCount.toString()}
                  icon={Car}
                  trend="neutral"
                />
                <StatCard
                  title="Remonto darbų"
                  value={vehicleCostStats.totalWorkOrders.toString()}
                  icon={Package}
                  trend="neutral"
                />
                <StatCard
                  title="Aptarnavimų"
                  value={vehicleCostStats.totalServiceVisits.toString()}
                  icon={Calendar}
                  trend="neutral"
                />
                <StatCard
                  title="Panaudotų dalių"
                  value={vehicleCostStats.totalPartsUsed.toString()}
                  icon={Package}
                  trend="neutral"
                />
                <StatCard
                  title="Bendra savikaina"
                  value={`€${vehicleCostStats.totalCost.toFixed(2)}`}
                  icon={DollarSign}
                  trend="neutral"
                />
              </div>

              {/* Vehicle List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Transporto priemonių taisymų suvestinė</h3>
                  <button
                    onClick={() => exportToCSV(vehicleCostSummary, 'vehicle_maintenance_costs')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    Eksportuoti CSV
                  </button>
                </div>

                {vehicleCostSummary.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Nėra duomenų</h3>
                    <p className="text-gray-600">
                      Dar nebuvo atlikta jokių remontų ar aptarnavimų
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vehicleCostSummary.map((vehicle) => (
                      <div key={vehicle.vehicle_id} className="bg-white border rounded-lg">
                        <button
                          onClick={() => setExpandedVehicle(
                            expandedVehicle === vehicle.vehicle_id ? null : vehicle.vehicle_id
                          )}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            {expandedVehicle === vehicle.vehicle_id ? (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            )}
                            <div className="text-left">
                              <h4 className="font-semibold text-gray-900">{vehicle.registration_number}</h4>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                                <span>{vehicle.make} {vehicle.model}</span>
                                {vehicle.year && <span>{vehicle.year} m.</span>}
                                {vehicle.vin && <span className="text-xs">VIN: {vehicle.vin}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <p className="text-gray-600">Remonto darbai</p>
                              <p className="font-semibold text-gray-900">{vehicle.completed_work_orders}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">Aptarnavimai</p>
                              <p className="font-semibold text-gray-900">{vehicle.completed_service_visits}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">Dalys</p>
                              <p className="font-semibold text-gray-900">{vehicle.total_parts_used}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">Savikaina</p>
                              <p className="font-bold text-green-600">€{parseFloat(vehicle.grand_total_cost || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </button>

                        {expandedVehicle === vehicle.vehicle_id && (
                          <div className="border-t p-4 bg-gray-50">
                            <h5 className="font-semibold text-gray-900 mb-3">Remontų ir aptarnavimų detalės</h5>
                            
                            {/* Work Orders */}
                            {vehicleWorkOrders.filter(wo => wo.vehicle_id === vehicle.vehicle_id).length > 0 && (
                              <div className="mb-4">
                                <h6 className="text-sm font-semibold text-gray-700 mb-2">Remonto darbai</h6>
                                <div className="space-y-2">
                                  {vehicleWorkOrders
                                    .filter(wo => wo.vehicle_id === vehicle.vehicle_id)
                                    .map((workOrder) => (
                                      <div key={workOrder.work_order_id} className="bg-white rounded-lg p-3 border">
                                        <div className="flex items-start justify-between mb-2">
                                          <div>
                                            <p className="font-medium text-gray-900">{workOrder.work_order_number}</p>
                                            <p className="text-sm text-gray-600">
                                              📅 {workOrder.completed_date}
                                              {workOrder.assigned_to && ` | 👤 ${workOrder.assigned_to}`}
                                            </p>
                                            <p className="text-sm text-gray-700 mt-1">{workOrder.description}</p>
                                            {workOrder.notes && (
                                              <p className="text-xs text-gray-500 mt-1 italic">{workOrder.notes}</p>
                                            )}
                                          </div>
                                          <div className="text-right">
                                            <p className="text-sm text-gray-600">Savikaina</p>
                                            <p className="font-bold text-green-600">€{parseFloat(workOrder.total_cost || 0).toFixed(2)}</p>
                                            {workOrder.labor_cost > 0 && (
                                              <p className="text-xs text-gray-500">Darbas: €{parseFloat(workOrder.labor_cost).toFixed(2)}</p>
                                            )}
                                            {workOrder.parts_cost > 0 && (
                                              <p className="text-xs text-gray-500">Dalys: €{parseFloat(workOrder.parts_cost).toFixed(2)}</p>
                                            )}
                                          </div>
                                        </div>

                                        {workOrder.parts_used && workOrder.parts_used.length > 0 && (
                                          <div className="mt-2 pt-2 border-t">
                                            <p className="text-xs font-semibold text-gray-700 mb-2">Panaudoti produktai:</p>
                                            <div className="space-y-1">
                                              {workOrder.parts_used.map((part: any) => (
                                                <div key={part.part_id} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
                                                  <div>
                                                    <span className="font-medium">{part.product_name}</span>
                                                    {part.product_code && <span className="text-gray-500 ml-2">({part.product_code})</span>}
                                                    {part.batch_number && <span className="text-gray-500 ml-2">Partija: {part.batch_number}</span>}
                                                  </div>
                                                  <div className="flex items-center gap-3">
                                                    <span className="text-gray-600">{part.quantity} × €{parseFloat(part.unit_price || 0).toFixed(2)}</span>
                                                    <span className="font-semibold text-green-600">€{parseFloat(part.total_price || 0).toFixed(2)}</span>
                                                  </div>
                                                  {part.supplier_name && (
                                                    <span className="text-gray-500 text-xs">🏢 {part.supplier_name}</span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Service Visits */}
                            {vehicleServiceVisits.filter(v => v.vehicle_id === vehicle.vehicle_id).length > 0 && (
                              <div>
                                <h6 className="text-sm font-semibold text-gray-700 mb-2">Aptarnavimai</h6>
                                <div className="space-y-2">
                                  {vehicleServiceVisits
                                    .filter(v => v.vehicle_id === vehicle.vehicle_id)
                                    .map((visit) => (
                                      <div key={visit.visit_id} className="bg-white rounded-lg p-3 border">
                                        <div className="flex items-start justify-between mb-2">
                                          <div>
                                            <p className="font-medium text-gray-900">{visit.visit_type === 'planinis' ? 'Planinis aptarnavimas' : 'Neplaninis aptarnavimas'}</p>
                                            <p className="text-sm text-gray-600">
                                              📅 {new Date(visit.visit_datetime).toLocaleDateString('lt-LT')}
                                              {visit.mechanic_name && ` | 👤 ${visit.mechanic_name}`}
                                            </p>
                                            {visit.procedures && visit.procedures.length > 0 && (
                                              <p className="text-sm text-gray-700 mt-1">Procedūros: {visit.procedures.join(', ')}</p>
                                            )}
                                            {visit.notes && (
                                              <p className="text-xs text-gray-500 mt-1 italic">{visit.notes}</p>
                                            )}
                                          </div>
                                          <div className="text-right">
                                            {visit.actual_cost > 0 && (
                                              <>
                                                <p className="text-sm text-gray-600">Savikaina</p>
                                                <p className="font-bold text-green-600">€{parseFloat(visit.actual_cost).toFixed(2)}</p>
                                              </>
                                            )}
                                          </div>
                                        </div>

                                        {visit.parts_used && visit.parts_used.length > 0 && (
                                          <div className="mt-2 pt-2 border-t">
                                            <p className="text-xs font-semibold text-gray-700 mb-2">Panaudoti produktai:</p>
                                            <div className="space-y-1">
                                              {visit.parts_used.map((part: any) => (
                                                <div key={part.part_id} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
                                                  <span className="font-medium">{part.product_name}</span>
                                                  <div className="flex items-center gap-3">
                                                    <span className="text-gray-600">{part.quantity_used} × €{parseFloat(part.cost_per_unit || 0).toFixed(2)}</span>
                                                    <span className="font-semibold text-green-600">€{parseFloat(part.total_cost || 0).toFixed(2)}</span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {vehicleWorkOrders.filter(wo => wo.vehicle_id === vehicle.vehicle_id).length === 0 && 
                             vehicleServiceVisits.filter(v => v.vehicle_id === vehicle.vehicle_id).length === 0 && (
                              <p className="text-center text-gray-500 py-4">Nėra užbaigtų darbų pasirinktu laikotarpiu</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'transport-services' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Bendra transporto paslaugų kaina"
                  value={`€${transportStats.totalCost.toFixed(2)}`}
                  icon={DollarSign}
                  trend={null}
                  color="blue"
                />
                <StatCard
                  title="Kompanijų skaičius"
                  value={transportStats.companyCount.toString()}
                  icon={Car}
                  trend={null}
                  color="green"
                />
                <StatCard
                  title="Sąskaitų skaičius"
                  value={transportStats.invoiceCount.toString()}
                  icon={FileText}
                  trend={null}
                  color="purple"
                />
              </div>

              {/* Transport Services by Company */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Transporto paslaugos pagal kompaniją</h3>
                {transportServices.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Transporto paslaugų nerastas</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transportServices.map((service) => (
                      <div key={service.company} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-white">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-lg font-semibold text-gray-900">{service.company}</h4>
                              <p className="text-sm text-gray-600 mt-1">
                                {service.invoiceCount} sąskaitos
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-blue-600">
                                €{service.totalCost.toFixed(2)}
                              </p>
                              <p className="text-sm text-gray-500">
                                Vidutiniškai: €{(service.totalCost / service.invoiceCount).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Items List */}
                        <div className="p-4 bg-gray-50">
                          <div className="space-y-2">
                            {service.items.map((item: any, idx: number) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900">{item.item.description}</p>
                                    <p className="text-sm text-gray-600 mt-1">
                                      Sąskaita: {item.item.equipment_invoices.invoice_number} • 
                                      Data: {new Date(item.item.equipment_invoices.invoice_date).toLocaleDateString('lt-LT')}
                                    </p>
                                    {item.notes && (
                                      <p className="text-sm text-gray-500 mt-1 italic">{item.notes}</p>
                                    )}
                                  </div>
                                  <div className="text-right ml-4">
                                    <p className="font-semibold text-gray-900">€{item.item.total_price.toFixed(2)}</p>
                                    <p className="text-xs text-gray-500">
                                      {item.item.quantity} × €{item.item.unit_price.toFixed(2)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'cost-centers' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Bendra kaštų centrų savikaina"
                  value={`€${costCenterStats.totalCost.toFixed(2)}`}
                  icon={DollarSign}
                  trend={null}
                  color="blue"
                />
                <StatCard
                  title="Kaštų centrų skaičius"
                  value={costCenterStats.totalCenters.toString()}
                  icon={Package}
                  trend={null}
                  color="green"
                />
                <StatCard
                  title="Priskyrimo įrašų skaičius"
                  value={costCenterStats.totalAssignments.toString()}
                  icon={FileText}
                  trend={null}
                  color="purple"
                />
              </div>

              {/* Cost Centers Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-lg font-semibold text-gray-900">Kaštų centrų savikaina</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Kaštų centras
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Aprašymas
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priskyrimo įrašų sk.
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Bendra savikaina
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Veiksmai
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {costCenterSummary.map((cc) => (
                        <>
                          <tr key={cc.cost_center_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div
                                  className="w-3 h-3 rounded-full mr-3"
                                  style={{ backgroundColor: cc.color || '#6B7280' }}
                                />
                                <div className="text-sm font-medium text-gray-900">
                                  {cc.cost_center_name}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-600">
                                {cc.description || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm text-gray-900">
                                {cc.total_assignments || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-semibold text-gray-900">
                                €{parseFloat(cc.total_cost || 0).toFixed(2)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => handleToggleCostCenterDetails(cc.cost_center_id)}
                                className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                              >
                                {expandedCostCenter === cc.cost_center_id ? (
                                  <>
                                    <ChevronDown className="w-4 h-4" />
                                    Slėpti detales
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="w-4 h-4" />
                                    Rodyti detales
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                          {expandedCostCenter === cc.cost_center_id && (
                            <tr>
                              <td colSpan={5} className="px-6 py-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                                {loadingCostCenterDetails ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                  </div>
                                ) : costCenterDetails.length === 0 ? (
                                  <div className="text-center py-8 text-gray-500">
                                    <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                    <p>Nėra priskirtų produktų</p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {/* Summary Header - Compact */}
                                    <div className="bg-white rounded-lg border border-blue-200 p-3">
                                      <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-4">
                                          <div>
                                            <span className="text-gray-500">Įrašų:</span>
                                            <span className="ml-1 font-semibold text-gray-900">{costCenterDetails.length}</span>
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Pirmas:</span>
                                            <span className="ml-1 font-medium text-gray-900">
                                              {cc.first_assignment_date
                                                ? new Date(cc.first_assignment_date).toLocaleDateString('lt-LT')
                                                : '-'}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Paskutinis:</span>
                                            <span className="ml-1 font-medium text-gray-900">
                                              {cc.last_assignment_date
                                                ? new Date(cc.last_assignment_date).toLocaleDateString('lt-LT')
                                                : '-'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm font-bold text-green-700">
                                            {parseFloat(cc.total_cost || 0).toFixed(2)} EUR
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Detailed Items List - Compact Table */}
                                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                      <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                          <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produktas</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sąskaita</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tiekėjas</th>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Kiekis</th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Kaina</th>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Data</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priskyrė</th>
                                          </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                          {costCenterDetails.map((item, idx) => (
                                            <tr key={item.item_id || idx} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 text-xs text-gray-500 font-medium">
                                                {idx + 1}
                                              </td>
                                              <td className="px-3 py-2">
                                                <div>
                                                  <p className="text-sm font-medium text-gray-900">
                                                    {item.product_name || item.item_description || 'Produktas'}
                                                  </p>
                                                  <div className="flex items-center gap-1 mt-0.5">
                                                    {item.product_code && (
                                                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                                        {item.product_code}
                                                      </span>
                                                    )}
                                                    {item.category_name && (
                                                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                                        {item.category_name}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-900">
                                                {item.invoice_number || '-'}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-700">
                                                {item.supplier_name || '-'}
                                              </td>
                                              <td className="px-3 py-2 text-center text-sm text-gray-900">
                                                {item.quantity} {item.unit_type}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                <p className="text-sm font-bold text-green-700">
                                                  {parseFloat(item.total_price || 0).toFixed(2)} EUR
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                  @ {parseFloat(item.unit_price || 0).toFixed(2)}
                                                </p>
                                              </td>
                                              <td className="px-3 py-2 text-center text-xs text-gray-600">
                                                {item.invoice_date
                                                  ? new Date(item.invoice_date).toLocaleDateString('lt-LT')
                                                  : '-'}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-700">
                                                {item.assigned_by_name || '-'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'timeline' && (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Laiko juosta (coming soon)</h3>
              <p className="text-gray-600">
                Čia bus rodomi laiko grafikai ir tendencijos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: any;
  trend?: number | null;
  subtext?: string;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'indigo';
}

function StatCard({ title, value, icon: Icon, trend, subtext, color = 'blue' }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600">{title}</p>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      {subtext && <p className="text-xs text-gray-600">{subtext}</p>}
      {trend !== null && trend !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          {trend >= 0 ? (
            <ArrowUpRight className="w-4 h-4 text-green-600" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-red-600" />
          )}
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {Math.abs(trend)}%
          </span>
        </div>
      )}
    </div>
  );
}
