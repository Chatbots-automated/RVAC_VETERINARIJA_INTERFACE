import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Wrench, Calendar, User, AlertCircle, FileText } from 'lucide-react';
import { WorkOrderDetailSidebar } from './WorkOrderDetailSidebar';
import { MaintenanceCalendar } from './MaintenanceCalendar';
import { TaskCompletionModal } from '../worker/TaskCompletionModal';

interface WorkOrder {
  id: string;
  work_order_number: string;
  vehicle_id: string | null;
  tool_id: string | null;
  order_type: string;
  priority: string;
  description: string;
  scheduled_date: string | null;
  started_date: string | null;
  completed_date: string | null;
  status: string;
  assigned_to: string | null;
  odometer_reading: number | null;
  engine_hours: number | null;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number | null;
  notes: string | null;
  vehicle: {
    registration_number: string;
    make: string;
    model: string;
  } | null;
  tool: {
    name: string;
  } | null;
  assignee: {
    full_name: string;
  } | null;
}

interface WorkOrdersProps {
  workerMode?: boolean;
  workerId?: string;
  activeTimeEntry?: any | null;
}

export function WorkOrders({ workerMode = false, workerId, activeTimeEntry }: WorkOrdersProps = {}) {
  const { user } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'edit' | 'work'>('edit');
  const [showCalendar, setShowCalendar] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTaskOrder, setSelectedTaskOrder] = useState<WorkOrder | null>(null);

  useEffect(() => {
    loadData();
  }, [workerId]);

  const loadData = async () => {
    let query = supabase
      .from('maintenance_work_orders')
      .select(`
        *,
        vehicle:vehicles(registration_number, make, model),
        tool:tools(name),
        assignee:users!maintenance_work_orders_assigned_to_fkey(full_name)
      `);

    // In worker mode, only show work orders assigned to the worker
    if (workerMode && workerId) {
      query = query.eq('assigned_to', workerId);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error loading work orders:', error);
      return;
    }

    if (data) setWorkOrders(data as any);
  };

  const handleOpenSidebar = (workOrder: WorkOrder, mode: 'edit' | 'work') => {
    setSelectedWorkOrderId(workOrder.id);
    setSidebarMode(mode);
    setShowSidebar(true);
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    const matchesSearch =
      wo.work_order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.vehicle?.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.tool?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.assignee?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'all' || wo.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || wo.priority === filterPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'in_progress':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'cancelled':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'high':
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
      case 'medium':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'low':
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const statusLabels: Record<string, string> = {
    pending: 'Laukiama',
    in_progress: 'Vykdoma',
    completed: 'Užbaigta',
    cancelled: 'Atšaukta',
  };

  const priorityLabels: Record<string, string> = {
    urgent: 'Skubu',
    high: 'Aukštas',
    medium: 'Vidutinis',
    low: 'Žemas',
  };

  const orderTypeLabels: Record<string, string> = {
    preventive: 'Prevencinė priežiūra',
    corrective: 'Gedimo taisymas',
    inspection: 'Patikra',
    emergency: 'Neatidėliotina',
  };

  // Group work orders by status
  const groupedOrders = {
    pending: filteredWorkOrders.filter(wo => wo.status === 'pending'),
    in_progress: filteredWorkOrders.filter(wo => wo.status === 'in_progress'),
    completed: filteredWorkOrders.filter(wo => wo.status === 'completed'),
    cancelled: filteredWorkOrders.filter(wo => wo.status === 'cancelled'),
  };

  // Prepare calendar events from work orders
  const calendarEvents = workOrders
    .filter(wo => wo.scheduled_date && wo.status !== 'completed' && wo.status !== 'cancelled')
    .map(wo => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const scheduledDate = new Date(wo.scheduled_date!);
      scheduledDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let status: 'overdue' | 'today' | 'upcoming' | 'ok';
      if (wo.status === 'in_progress') {
        status = 'today';
      } else if (daysDiff < 0) {
        status = 'overdue';
      } else if (daysDiff === 0) {
        status = 'today';
      } else if (daysDiff <= 7) {
        status = 'upcoming';
      } else {
        status = 'ok';
      }

      const title = wo.vehicle?.registration_number || wo.tool?.name || 'Darbas';
      const priorityLabel = priorityLabels[wo.priority] || wo.priority;

      return {
        id: wo.id,
        title,
        date: wo.scheduled_date!,
        status,
        type: `${wo.work_order_number} - ${priorityLabel}`,
        details: `${wo.description} (${orderTypeLabels[wo.order_type]})`,
        onClick: () => handleOpenSidebar(wo, 'work'),
      };
    });

  return (
    <div className="space-y-6">
      {/* Calendar */}
      {showCalendar && (
        <MaintenanceCalendar
          events={calendarEvents}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          title="Viso"
          value={workOrders.length}
          color="bg-slate-50 text-slate-700"
        />
        <StatCard
          title="Laukiama"
          value={groupedOrders.pending.length}
          color="bg-yellow-50 text-yellow-700"
        />
        <StatCard
          title="Vykdoma"
          value={groupedOrders.in_progress.length}
          color="bg-blue-50 text-blue-700"
        />
        <StatCard
          title="Užbaigta"
          value={groupedOrders.completed.length}
          color="bg-green-50 text-green-700"
        />
        <StatCard
          title="Bendra kaina"
          value={`€${workOrders.reduce((sum, w) => sum + (w.total_cost || 0), 0).toFixed(0)}`}
          color="bg-emerald-50 text-emerald-700"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Ieškoti pagal numerį, aprašymą, transportą..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 bg-white"
          >
            <option value="all">Visi statusai</option>
            <option value="pending">Laukiama</option>
            <option value="in_progress">Vykdoma</option>
            <option value="completed">Užbaigta</option>
            <option value="cancelled">Atšaukta</option>
          </select>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 bg-white"
          >
            <option value="all">Visi prioritetai</option>
            <option value="urgent">Skubu</option>
            <option value="high">Aukštas</option>
            <option value="medium">Vidutinis</option>
            <option value="low">Žemas</option>
          </select>
        </div>
      </div>

      {/* Work Orders List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Remonto darbai</h3>
          <p className="text-sm text-gray-600 mt-1">
            Rodoma {filteredWorkOrders.length} iš {workOrders.length} įrašų
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredWorkOrders.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Remonto darbų nerasta</p>
              <p className="text-gray-400 text-sm mt-1">Pabandykite pakeisti paieškos filtrus</p>
            </div>
          ) : (
            filteredWorkOrders.map(wo => (
              <div
                key={wo.id}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-1 rounded-md">
                        {wo.work_order_number}
                      </span>
                      <span className={`text-xs font-medium px-3 py-1 rounded-full border ${getStatusColor(wo.status)}`}>
                        {statusLabels[wo.status]}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {getPriorityIcon(wo.priority)}
                        <span className="text-xs font-medium text-gray-600">
                          {priorityLabels[wo.priority]}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {orderTypeLabels[wo.order_type]}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-gray-800 font-medium">
                      {wo.description}
                    </p>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      {wo.vehicle && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Wrench className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">Transportas:</span>
                          <span>{wo.vehicle.registration_number}</span>
                        </div>
                      )}
                      {wo.tool && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Wrench className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">Įrankis:</span>
                          <span>{wo.tool.name}</span>
                        </div>
                      )}
                      {wo.assignee && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">Atsakingas:</span>
                          <span>{wo.assignee.full_name}</span>
                        </div>
                      )}
                      {wo.scheduled_date && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">Planuojama:</span>
                          <span>{new Date(wo.scheduled_date).toLocaleDateString('lt-LT')}</span>
                        </div>
                      )}
                      {wo.total_cost !== null && wo.total_cost > 0 && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <span className="font-medium">Kaina:</span>
                          <span className="font-semibold text-gray-800">€{wo.total_cost.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {workerMode ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskOrder(wo);
                          setShowTaskModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Pranešti apie darbą
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSidebar(wo, 'work');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                        Tvarkyti
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedWorkOrderId && (
        <WorkOrderDetailSidebar
          workOrderId={selectedWorkOrderId}
          isOpen={showSidebar}
          mode={sidebarMode}
          onClose={() => {
            setShowSidebar(false);
            setSelectedWorkOrderId(null);
          }}
          onWorkOrderUpdate={loadData}
        />
      )}

      {showTaskModal && selectedTaskOrder && (
        <TaskCompletionModal
          taskType="work_order"
          taskId={selectedTaskOrder.id}
          taskName={selectedTaskOrder.work_order_number}
          taskDescription={selectedTaskOrder.description}
          activeTimeEntry={activeTimeEntry}
          onClose={() => {
            setShowTaskModal(false);
            setSelectedTaskOrder(null);
          }}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  return (
    <div className={`${color} rounded-lg border p-4`}>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
