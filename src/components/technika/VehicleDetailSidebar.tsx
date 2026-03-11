import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, Calendar, Wrench, FileText, Plus, CheckCircle, AlertCircle, Clock,
  Truck, Gauge, Package, Upload, Download, ExternalLink, Search, Filter,
  Edit, Trash2, Save, AlertTriangle, Activity, DollarSign, Settings
} from 'lucide-react';
import { formatDateTimeLT, formatDateLT } from '../../lib/formatters';
import { SearchableSelect } from '../SearchableSelect';
import { WorkOrderDetailSidebar } from './WorkOrderDetailSidebar';

interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  make: string;
  model: string;
  year: number;
  status: string;
  current_mileage: number;
  current_engine_hours: number;
  insurance_expiry_date: string | null;
  technical_inspection_due_date: string | null;
  assigned_to: string | null;
  last_service_date: string | null;
  last_service_mileage: number | null;
  last_service_hours: number | null;
  notes: string | null;
  assignee?: {
    full_name: string;
  };
}

interface ServiceVisit {
  id: string;
  vehicle_id: string;
  visit_datetime: string;
  visit_type: string;
  procedures: string[];
  odometer_reading: number | null;
  engine_hours: number | null;
  status: string;
  notes: string | null;
  mechanic_name: string | null;
  next_visit_required: boolean;
  next_visit_date: string | null;
  cost_estimate: number | null;
  actual_cost: number | null;
  labor_hours: number | null;
  created_at: string;
  completed_at: string | null;
}

interface WorkOrder {
  id: string;
  vehicle_id: string;
  work_order_number: string;
  order_type: string;
  priority: string;
  description: string;
  scheduled_date: string | null;
  completed_date: string | null;
  status: string;
  estimated_cost: number | null;
  actual_cost: number | null;
  labor_hours: number | null;
  assigned_mechanic: string | null;
  service_visit_id: string | null;
  notes: string | null;
}

interface VehicleDocument {
  id: string;
  vehicle_id: string;
  document_type: string;
  document_name: string;
  file_url: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

interface VisitPart {
  id: string;
  visit_id: string;
  product_id: string;
  batch_id: string | null;
  quantity_used: number;
  cost_per_unit: number | null;
  notes: string | null;
  product?: {
    name: string;
    product_code: string | null;
  };
}

interface Product {
  id: string;
  name: string;
  product_code: string | null;
  unit_type: string;
}

interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  qty_left: number;
}

type TabType = 'overview' | 'visits' | 'workorders' | 'parts' | 'documents';

interface VehicleDetailSidebarProps {
  vehicle: Vehicle;
  onClose: () => void;
  onUpdate?: () => void;
}

export function VehicleDetailSidebar({ vehicle, onClose, onUpdate }: VehicleDetailSidebarProps) {
  const { user, logAction } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [visits, setVisits] = useState<ServiceVisit[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [visitParts, setVisitParts] = useState<VisitPart[]>([]);
  const [workOrderParts, setWorkOrderParts] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showVisitDetailModal, setShowVisitDetailModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<ServiceVisit | null>(null);
  const [visitMode, setVisitMode] = useState<'edit' | 'work'>('edit');
  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<string | null>(null);
  const [workOrderMode, setWorkOrderMode] = useState<'edit' | 'work'>('edit');

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [vehicle.id]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [visitsRes, workOrdersRes, documentsRes, productsRes] = await Promise.all([
        supabase
          .from('vehicle_service_visits')
          .select('*')
          .eq('vehicle_id', vehicle.id)
          .order('visit_datetime', { ascending: false }),
        supabase
          .from('maintenance_work_orders')
          .select('*')
          .eq('vehicle_id', vehicle.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('vehicle_documents')
          .select('*')
          .eq('vehicle_id', vehicle.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('equipment_products')
          .select('id, name, product_code, unit_type')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (visitsRes.data) setVisits(visitsRes.data);
      if (workOrdersRes.data) setWorkOrders(workOrdersRes.data);
      if (documentsRes.data) setDocuments(documentsRes.data);
      if (productsRes.data) setProducts(productsRes.data);

      await Promise.all([
        loadAllVisitParts(visitsRes.data || []),
        loadAllWorkOrderParts(workOrdersRes.data || [])
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllVisitParts = async (visitsList: ServiceVisit[]) => {
    if (visitsList.length === 0) return;

    const { data, error } = await supabase
      .from('vehicle_visit_parts')
      .select(`
        *,
        product:equipment_products(name, product_code)
      `)
      .in('visit_id', visitsList.map(v => v.id));

    if (error) {
      console.error('Error loading visit parts:', error);
    } else {
      setVisitParts(data as any);
    }
  };

  const loadAllWorkOrderParts = async (workOrdersList: WorkOrder[]) => {
    if (workOrdersList.length === 0) return;

    const { data, error } = await supabase
      .from('work_order_parts')
      .select(`
        *,
        product:equipment_products(name, product_code)
      `)
      .in('work_order_id', workOrdersList.map(wo => wo.id));

    if (error) {
      console.error('Error loading work order parts:', error);
    } else {
      setWorkOrderParts(data as any);
    }
  };

  const loadBatchesForProduct = async (productId: string) => {
    const { data } = await supabase
      .from('equipment_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('qty_left', 0)
      .order('created_at', { ascending: false });

    if (data) setBatches(data);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Baigtas':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Vykdomas':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Atsauktas':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Baigtas':
        return <CheckCircle className="w-4 h-4" />;
      case 'Vykdomas':
        return <Clock className="w-4 h-4" />;
      case 'Atsauktas':
        return <X className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      insurance: 'Draudimas',
      technical_inspection: 'Techninė apžiūra',
      service_record: 'Aptarnavimo įrašas',
      manual: 'Instrukcija',
      other: 'Kita',
    };
    return types[type] || type;
  };

  const categorizeVisits = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const pastIncomplete = visits.filter(v => {
      const visitDate = new Date(v.visit_datetime);
      return visitDate < today && v.status !== 'Baigtas' && v.status !== 'Atsauktas';
    });

    const todayVisits = visits.filter(v => {
      const visitDate = new Date(v.visit_datetime);
      const visitDay = new Date(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate());
      return visitDay.getTime() === today.getTime();
    });

    const futureVisits = visits.filter(v => {
      const visitDate = new Date(v.visit_datetime);
      const visitDay = new Date(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate());
      return visitDay > today;
    });

    const pastCompleted = visits.filter(v => {
      const visitDate = new Date(v.visit_datetime);
      const visitDay = new Date(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate());
      return visitDay < today && (v.status === 'Baigtas' || v.status === 'Atsauktas');
    });

    return { pastIncomplete, todayVisits, futureVisits, pastCompleted };
  };

  const { pastIncomplete, todayVisits, futureVisits, pastCompleted } = categorizeVisits();

  const completedVisits = visits.filter(v => v.status === 'Baigtas');
  const totalServiceCost = completedVisits.reduce((sum, v) => sum + (v.actual_cost || 0), 0);
  const totalWorkOrderCost = workOrders.filter(wo => wo.status === 'completed').reduce((sum, wo) => sum + (wo.actual_cost || 0), 0);

  const partsUsedByVisit = visitParts.reduce((acc, part) => {
    const visit = visits.find(v => v.id === part.visit_id);
    if (visit && visit.status === 'Baigtas') {
      return acc + (part.quantity_used * (part.cost_per_unit || 0));
    }
    return acc;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full md:w-3/4 lg:w-2/3 xl:w-1/2 h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 xl:p-6 flex items-start justify-between border-b border-blue-800 shadow-lg">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <Truck className="w-6 h-6 xl:w-8 xl:h-8 flex-shrink-0" />
              <h2 className="text-xl xl:text-2xl font-bold truncate">{vehicle.registration_number}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                vehicle.status === 'active' ? 'bg-green-500' :
                vehicle.status === 'maintenance' ? 'bg-yellow-500' :
                'bg-red-500'
              }`}>
                {vehicle.status === 'active' ? 'Aktyvus' :
                 vehicle.status === 'maintenance' ? 'Remontuojamas' :
                 vehicle.status === 'out_of_service' ? 'Neveikia' : vehicle.status}
              </span>
            </div>
            <p className="text-blue-100 text-sm xl:text-base">
              {vehicle.make} {vehicle.model} ({vehicle.year})
            </p>
            {vehicle.assignee && (
              <p className="text-blue-200 text-xs xl:text-sm mt-1">
                Priskirta: {vehicle.assignee.full_name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 hover:bg-blue-800 rounded-lg transition-colors ml-2 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
          <button
            onClick={() => handleTabChange('overview')}
            className={`px-3 xl:px-6 py-2 xl:py-3 text-sm font-medium transition-colors whitespace-nowrap min-h-[40px] xl:min-h-[44px] touch-manipulation ${
              activeTab === 'overview'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Apžvalga
          </button>
          <button
            onClick={() => handleTabChange('visits')}
            className={`px-3 xl:px-6 py-2 xl:py-3 text-sm font-medium transition-colors whitespace-nowrap min-h-[40px] xl:min-h-[44px] touch-manipulation ${
              activeTab === 'visits'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Aptarnavimai
            {pastIncomplete.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {pastIncomplete.length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('workorders')}
            className={`px-3 xl:px-6 py-2 xl:py-3 text-sm font-medium transition-colors whitespace-nowrap min-h-[40px] xl:min-h-[44px] touch-manipulation ${
              activeTab === 'workorders'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Remonto darbai
          </button>
          <button
            onClick={() => handleTabChange('history')}
            className={`px-3 xl:px-6 py-2 xl:py-3 text-sm font-medium transition-colors whitespace-nowrap min-h-[40px] xl:min-h-[44px] touch-manipulation ${
              activeTab === 'history'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Transporto istorija
          </button>
          <button
            onClick={() => handleTabChange('documents')}
            className={`px-3 xl:px-6 py-2 xl:py-3 text-sm font-medium transition-colors whitespace-nowrap min-h-[40px] xl:min-h-[44px] touch-manipulation ${
              activeTab === 'documents'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Dokumentai
            {documents.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date()).length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {documents.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date()).length}
              </span>
            )}
          </button>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto p-3 xl:p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              vehicle={vehicle}
              visits={visits}
              workOrders={workOrders}
              documents={documents}
              totalServiceCost={totalServiceCost}
              totalWorkOrderCost={totalWorkOrderCost}
              partsUsedCost={partsUsedByVisit}
            />
          )}

          {activeTab === 'visits' && (
            <VisitsTab
              vehicle={vehicle}
              visits={visits}
              pastIncomplete={pastIncomplete}
              todayVisits={todayVisits}
              futureVisits={futureVisits}
              pastCompleted={pastCompleted}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              onCreateVisit={() => setShowVisitModal(true)}
              onSelectVisit={(visit, mode) => {
                setSelectedVisit(visit);
                setVisitMode(mode);
                setShowVisitDetailModal(true);
              }}
              onUpdate={loadData}
            />
          )}

          {activeTab === 'workorders' && (
            <WorkOrdersTab
              vehicle={vehicle}
              workOrders={workOrders}
              visits={visits}
              onCreateWorkOrder={() => setShowWorkOrderModal(true)}
              onUpdate={loadData}
              onWorkOrderClick={(workOrderId, mode) => {
                setSelectedWorkOrder(workOrderId);
                setWorkOrderMode(mode);
              }}
            />
          )}

          {activeTab === 'history' && (
            <VehicleHistoryTab
              vehicle={vehicle}
              visitParts={visitParts}
              visits={visits}
              workOrders={workOrders}
              workOrderParts={workOrderParts}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab
              vehicle={vehicle}
              documents={documents}
              onUploadDocument={() => setShowDocumentModal(true)}
              onUpdate={loadData}
            />
          )}
        </div>
      </div>

      {showVisitModal && (
        <CreateVisitModal
          vehicle={vehicle}
          onClose={() => setShowVisitModal(false)}
          onSuccess={() => {
            setShowVisitModal(false);
            loadData();
          }}
        />
      )}

      {showVisitDetailModal && selectedVisit && (
        <VisitDetailModal
          visit={selectedVisit}
          vehicle={vehicle}
          products={products}
          batches={batches}
          mode={visitMode}
          onClose={() => {
            setShowVisitDetailModal(false);
            setSelectedVisit(null);
          }}
          onSuccess={() => {
            setShowVisitDetailModal(false);
            setSelectedVisit(null);
            loadData();
          }}
          onLoadBatches={loadBatchesForProduct}
        />
      )}

      {showWorkOrderModal && (
        <CreateWorkOrderModal
          vehicle={vehicle}
          onClose={() => setShowWorkOrderModal(false)}
          onSuccess={() => {
            setShowWorkOrderModal(false);
            loadData();
          }}
        />
      )}

      {selectedWorkOrder && (
        <WorkOrderDetailSidebar
          workOrderId={selectedWorkOrder}
          isOpen={true}
          mode={workOrderMode}
          onClose={() => setSelectedWorkOrder(null)}
          onWorkOrderUpdate={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({
  vehicle,
  visits,
  workOrders,
  documents,
  totalServiceCost,
  totalWorkOrderCost,
  partsUsedCost,
}: {
  vehicle: Vehicle;
  visits: ServiceVisit[];
  workOrders: WorkOrder[];
  documents: VehicleDocument[];
  totalServiceCost: number;
  totalWorkOrderCost: number;
  partsUsedCost: number;
}) {
  const insuranceExpired = vehicle.insurance_expiry_date && new Date(vehicle.insurance_expiry_date) < new Date();
  const inspectionExpired = vehicle.technical_inspection_due_date && new Date(vehicle.technical_inspection_due_date) < new Date();
  const nextService = visits.find(v => new Date(v.visit_datetime) > new Date() && v.status === 'Planuojamas');

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            Transporto priemonės informacija
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-xs text-gray-500 block mb-1">Registracijos numeris</span>
            <span className="font-bold text-gray-900 text-lg">{vehicle.registration_number}</span>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-xs text-gray-500 block mb-1">Tipas</span>
            <span className="font-bold text-gray-900 text-lg">
              {vehicle.vehicle_type === 'tractor' ? 'Traktorius' :
               vehicle.vehicle_type === 'truck' ? 'Sunkvežimis' :
               vehicle.vehicle_type === 'car' ? 'Automobilis' :
               vehicle.vehicle_type === 'trailer' ? 'Priekaba' : vehicle.vehicle_type}
            </span>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-xs text-gray-500 block mb-1">Gamintojas</span>
            <span className="font-bold text-gray-900 text-lg">{vehicle.make}</span>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-xs text-gray-500 block mb-1">Modelis</span>
            <span className="font-bold text-gray-900 text-lg">{vehicle.model}</span>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-xs text-gray-500 block mb-1">Metai</span>
            <span className="font-bold text-gray-900 text-lg">{vehicle.year}</span>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-xs text-gray-500 block mb-1">Statusas</span>
            <span className="font-bold text-gray-900 text-lg">
              {vehicle.status === 'active' ? 'Aktyvus' :
               vehicle.status === 'maintenance' ? 'Remontuojamas' :
               vehicle.status === 'out_of_service' ? 'Neveikia' : vehicle.status}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2 mb-4">
          <Gauge className="w-5 h-5 text-purple-600" />
          Dabartiniai rodmenys
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <span className="text-xs text-gray-500 block mb-1">Rida (km)</span>
            <span className="font-bold text-purple-600 text-2xl">{vehicle.current_mileage?.toLocaleString() || '0'}</span>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <span className="text-xs text-gray-500 block mb-1">Variklio valandos</span>
            <span className="font-bold text-purple-600 text-2xl">{vehicle.current_engine_hours?.toLocaleString() || '0'}</span>
          </div>
        </div>
      </div>

      <div className={`rounded-xl p-5 border-2 ${insuranceExpired ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          {insuranceExpired ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <CheckCircle className="w-5 h-5 text-green-600" />}
          <h4 className="font-semibold text-gray-900">Draudimas</h4>
        </div>
        {vehicle.insurance_expiry_date ? (
          <p className={`text-sm ${insuranceExpired ? 'text-red-700' : 'text-green-700'}`}>
            {insuranceExpired ? 'Baigėsi: ' : 'Galioja iki: '}
            <strong>{formatDateLT(vehicle.insurance_expiry_date)}</strong>
          </p>
        ) : (
          <p className="text-sm text-gray-500">Nėra duomenų</p>
        )}
      </div>

      <div className={`rounded-xl p-5 border-2 ${inspectionExpired ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          {inspectionExpired ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <CheckCircle className="w-5 h-5 text-green-600" />}
          <h4 className="font-semibold text-gray-900">Techninė apžiūra</h4>
        </div>
        {vehicle.technical_inspection_due_date ? (
          <p className={`text-sm ${inspectionExpired ? 'text-red-700' : 'text-green-700'}`}>
            {inspectionExpired ? 'Baigėsi: ' : 'Galioja iki: '}
            <strong>{formatDateLT(vehicle.technical_inspection_due_date)}</strong>
          </p>
        ) : (
          <p className="text-sm text-gray-500">Nėra duomenų</p>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-gray-900">Kitas suplanuotas aptarnavimas</h4>
        </div>
        {nextService ? (
          <p className="text-sm text-gray-700">
            {formatDateTimeLT(nextService.visit_datetime)}
            {nextService.mechanic_name && ` - ${nextService.mechanic_name}`}
          </p>
        ) : (
          <p className="text-sm text-gray-500">Nėra suplanuota</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-gray-900">Atlikta aptarnavimų</h4>
          </div>
          <p className="text-2xl font-bold text-green-600">{visits.filter(v => v.status === 'Baigtas').length}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-5 h-5 text-orange-600" />
            <h4 className="font-semibold text-gray-900">Remonto darbai</h4>
          </div>
          <p className="text-2xl font-bold text-orange-600">{workOrders.filter(wo => wo.status === 'completed').length}</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5">
        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-blue-600" />
          Išlaidų suvestinė
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-blue-100">
            <span className="text-sm text-gray-600">Aptarnavimų išlaidos</span>
            <span className="font-bold text-gray-900">{totalServiceCost.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-blue-100">
            <span className="text-sm text-gray-600">Remonto darbų išlaidos</span>
            <span className="font-bold text-gray-900">{totalWorkOrderCost.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-blue-100">
            <span className="text-sm text-gray-600">Panaudotos dalys</span>
            <span className="font-bold text-gray-900">{partsUsedCost.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg border-2 border-blue-300">
            <span className="text-sm font-semibold text-gray-900">Iš viso</span>
            <span className="font-bold text-blue-700 text-lg">{(totalServiceCost + totalWorkOrderCost + partsUsedCost).toFixed(2)} €</span>
          </div>
        </div>
      </div>

      {vehicle.notes && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Pastabos</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{vehicle.notes}</p>
        </div>
      )}
    </div>
  );
}

function VisitsTab({
  vehicle,
  visits,
  pastIncomplete,
  todayVisits,
  futureVisits,
  pastCompleted,
  getStatusColor,
  getStatusIcon,
  onCreateVisit,
  onSelectVisit,
  onUpdate,
}: {
  vehicle: Vehicle;
  visits: ServiceVisit[];
  pastIncomplete: ServiceVisit[];
  todayVisits: ServiceVisit[];
  futureVisits: ServiceVisit[];
  pastCompleted: ServiceVisit[];
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => JSX.Element;
  onCreateVisit: () => void;
  onSelectVisit: (visit: ServiceVisit, mode: 'edit' | 'work') => void;
  onUpdate: () => void;
}) {
  return (
    <div className="space-y-6">
      <button
        onClick={onCreateVisit}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Naujas aptarnavimas
      </button>

      {pastIncomplete.length > 0 && (
        <div>
          <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Praleisti aptarnavimai (Reikia atlikti)
          </h3>
          <div className="space-y-3">
            {pastIncomplete.map(visit => (
              <ServiceVisitCard
                key={visit.id}
                visit={visit}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                onEdit={() => onSelectVisit(visit, 'edit')}
                onWork={() => onSelectVisit(visit, 'work')}
              />
            ))}
          </div>
        </div>
      )}

      {todayVisits.length > 0 && (
        <div>
          <h3 className="font-bold text-orange-700 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-600" />
            Šiandien ({todayVisits.length})
          </h3>
          <div className="space-y-3">
            {todayVisits.map(visit => (
              <ServiceVisitCard
                key={visit.id}
                visit={visit}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                onEdit={() => onSelectVisit(visit, 'edit')}
                onWork={() => onSelectVisit(visit, 'work')}
              />
            ))}
          </div>
        </div>
      )}

      {futureVisits.length > 0 && (
        <div>
          <h3 className="font-bold text-blue-700 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Būsimi aptarnavimai ({futureVisits.length})
          </h3>
          <div className="space-y-3">
            {futureVisits.map(visit => (
              <ServiceVisitCard
                key={visit.id}
                visit={visit}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                onEdit={() => onSelectVisit(visit, 'edit')}
                onWork={() => onSelectVisit(visit, 'work')}
              />
            ))}
          </div>
        </div>
      )}

      {pastCompleted.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Ankstesni aptarnavimai
          </h3>
          <div className="space-y-3">
            {pastCompleted.slice(0, 10).map(visit => (
              <ServiceVisitCard
                key={visit.id}
                visit={visit}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                onEdit={() => onSelectVisit(visit, 'edit')}
                onWork={() => onSelectVisit(visit, 'work')}
              />
            ))}
          </div>
        </div>
      )}

      {visits.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Nėra aptarnavimų</p>
        </div>
      )}
    </div>
  );
}

function ServiceVisitCard({
  visit,
  getStatusColor,
  getStatusIcon,
  onEdit,
  onWork,
}: {
  visit: ServiceVisit;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => JSX.Element;
  onEdit: () => void;
  onWork: () => void;
}) {
  return (
    <div
      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all bg-white"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-md text-xs font-semibold border flex items-center gap-1 ${getStatusColor(visit.status)}`}>
            {getStatusIcon(visit.status)}
            {visit.status}
          </span>
          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
            visit.visit_type === 'planinis' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
          }`}>
            {visit.visit_type === 'planinis' ? 'Planinis' : 'Neplaninis'}
          </span>
        </div>
        <span className="text-xs text-gray-500">{formatDateTimeLT(visit.visit_datetime)}</span>
      </div>

      {visit.mechanic_name && (
        <p className="text-sm text-gray-600 mb-2">Mechanikas: {visit.mechanic_name}</p>
      )}

      {visit.procedures && visit.procedures.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-500 mb-1">Procedūros:</p>
          <div className="flex flex-wrap gap-1">
            {visit.procedures.map((proc, idx) => (
              <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                {proc}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
        {visit.odometer_reading && (
          <span>Rida: {visit.odometer_reading.toLocaleString()} km</span>
        )}
        {visit.engine_hours && (
          <span>Valandos: {visit.engine_hours.toLocaleString()} h</span>
        )}
        {visit.actual_cost && (
          <span className="font-semibold text-green-600">{visit.actual_cost.toFixed(2)} €</span>
        )}
      </div>

      {visit.notes && (
        <p className="text-xs text-gray-600 mt-2 line-clamp-2">{visit.notes}</p>
      )}

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Edit className="w-4 h-4" />
          Redaguoti
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWork();
          }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <Wrench className="w-4 h-4" />
          Tvarkyti
        </button>
      </div>
    </div>
  );
}

function WorkOrdersTab({
  vehicle,
  workOrders,
  visits,
  onCreateWorkOrder,
  onUpdate,
  onWorkOrderClick,
}: {
  vehicle: Vehicle;
  workOrders: WorkOrder[];
  visits: ServiceVisit[];
  onCreateWorkOrder: () => void;
  onUpdate: () => void;
  onWorkOrderClick: (workOrderId: string, mode: 'edit' | 'work') => void;
}) {
  return (
    <div className="space-y-6">
      <button
        onClick={onCreateWorkOrder}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Naujas remonto darbas
      </button>

      {workOrders.length > 0 ? (
        <div className="space-y-3">
          {workOrders.map(wo => (
            <div
              key={wo.id}
              onClick={() => onWorkOrderClick(wo.id, wo.status === 'in_progress' ? 'work' : 'edit')}
              className="border border-gray-200 rounded-lg p-4 bg-white cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{wo.work_order_number}</span>
                  <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                    wo.status === 'completed' ? 'bg-green-100 text-green-800' :
                    wo.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                    wo.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {wo.status === 'completed' ? 'Baigtas' :
                     wo.status === 'in_progress' ? 'Vykdomas' :
                     wo.status === 'cancelled' ? 'Atšauktas' :
                     'Suplanuotas'}
                  </span>
                  <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                    wo.priority === 'high' ? 'bg-red-100 text-red-800' :
                    wo.priority === 'medium' ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {wo.priority === 'high' ? 'Skubu' :
                     wo.priority === 'medium' ? 'Vidutinis' :
                     'Žemas'}
                  </span>
                </div>
              </div>

              <p className="text-sm text-gray-900 font-semibold mb-2">{wo.description}</p>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                {wo.scheduled_date && (
                  <div>Suplanuota: {formatDateLT(wo.scheduled_date)}</div>
                )}
                {wo.completed_date && (
                  <div>Atlikta: {formatDateLT(wo.completed_date)}</div>
                )}
                {wo.assigned_mechanic && (
                  <div>Mechanikas: {wo.assigned_mechanic}</div>
                )}
                {wo.labor_hours && (
                  <div>Darbo valandos: {wo.labor_hours}</div>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs mt-2">
                {wo.estimated_cost && (
                  <span className="text-gray-600">Planuota: {wo.estimated_cost.toFixed(2)} €</span>
                )}
                {wo.actual_cost && (
                  <span className="font-semibold text-green-600">Faktinė: {wo.actual_cost.toFixed(2)} €</span>
                )}
              </div>

              {wo.notes && (
                <p className="text-xs text-gray-600 mt-2">{wo.notes}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Nėra remonto darbų</p>
        </div>
      )}
    </div>
  );
}

function VehicleHistoryTab({
  vehicle,
  visitParts,
  visits,
  workOrders,
  workOrderParts,
}: {
  vehicle: Vehicle;
  visitParts: VisitPart[];
  visits: ServiceVisit[];
  workOrders: any[];
  workOrderParts: any[];
}) {
  const [filter, setFilter] = useState<'all' | 'visits' | 'workorders' | 'parts'>('all');

  // Calculate totals
  const totalVisitPartsCost = visitParts.reduce((sum, part) => sum + (part.quantity_used * (part.cost_per_unit || 0)), 0);
  const totalWorkOrderPartsCost = workOrderParts.reduce((sum, part) => sum + (part.total_price || 0), 0);
  const totalPartsCost = totalVisitPartsCost + totalWorkOrderPartsCost;
  const totalServiceCost = visits.reduce((sum, visit) => sum + (visit.actual_cost || 0), 0);
  const totalWorkOrderCost = workOrders.filter(wo => wo.status === 'Užbaigta').reduce((sum, wo) => sum + (wo.total_cost || 0), 0);
  const totalCost = totalPartsCost + totalServiceCost + totalWorkOrderCost;

  // Combine all activities and sort by date
  const allActivities = [
    ...visits.map(v => ({
      type: 'visit' as const,
      date: new Date(v.visit_datetime),
      data: v,
    })),
    ...workOrders.map(wo => ({
      type: 'workorder' as const,
      date: new Date(wo.scheduled_date || wo.created_at),
      data: wo,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const filteredActivities = allActivities.filter(activity => {
    if (filter === 'all') return true;
    if (filter === 'visits') return activity.type === 'visit';
    if (filter === 'workorders') return activity.type === 'workorder';
    if (filter === 'parts') {
      if (activity.type === 'visit') return visitParts.some(p => p.visit_id === activity.data.id);
      if (activity.type === 'workorder') return workOrderParts.some(p => p.work_order_id === activity.data.id);
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Aptarnavimai</p>
          <p className="text-2xl font-bold text-blue-600">{visits.length}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Remonto darbai</p>
          <p className="text-2xl font-bold text-purple-600">{workOrders.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Panaudotos dalys</p>
          <p className="text-2xl font-bold text-green-600">{visitParts.length + workOrderParts.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">Bendra kaina</p>
          <p className="text-2xl font-bold text-orange-600">{totalCost.toFixed(2)} €</p>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Visi ({allActivities.length})
        </button>
        <button
          onClick={() => setFilter('visits')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'visits' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Aptarnavimai ({visits.length})
        </button>
        <button
          onClick={() => setFilter('workorders')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'workorders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Remonto darbai ({workOrders.length})
        </button>
        <button
          onClick={() => setFilter('parts')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'parts' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Su dalimis ({visitParts.length + workOrderParts.length})
        </button>
      </div>

      {/* Activity Timeline */}
      {filteredActivities.length > 0 ? (
        <div className="space-y-4">
          {filteredActivities.map((activity, idx) => (
            <div key={`${activity.type}-${activity.data.id}`} className="border border-gray-200 rounded-lg p-4 bg-white">
              {activity.type === 'visit' ? (
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">Aptarnavimas</h4>
                        <p className="text-sm text-gray-600">{formatDateTimeLT(activity.data.visit_datetime)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        activity.data.status === 'Baigtas' ? 'bg-green-100 text-green-700' :
                        activity.data.status === 'Vykdomas' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {activity.data.status}
                      </span>
                      {activity.data.actual_cost && (
                        <p className="text-lg font-bold text-green-600 mt-1">{activity.data.actual_cost.toFixed(2)} €</p>
                      )}
                    </div>
                  </div>

                  {activity.data.procedures && activity.data.procedures.length > 0 && (
                    <div className="mb-2">
                      <p className="text-sm text-gray-600">Procedūros: {activity.data.procedures.join(', ')}</p>
                    </div>
                  )}

                  {activity.data.mechanic_name && (
                    <p className="text-sm text-gray-600 mb-2">Mechanikas: {activity.data.mechanic_name}</p>
                  )}

                  {/* Parts used in this visit */}
                  {visitParts.filter(p => p.visit_id === activity.data.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-700 mb-2">Panaudotos dalys:</p>
                      <div className="space-y-2">
                        {visitParts.filter(p => p.visit_id === activity.data.id).map(part => (
                          <div key={part.id} className="bg-gray-50 rounded p-2 text-sm">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-900">{part.product?.name || 'Nežinomas produktas'}</p>
                                <p className="text-xs text-gray-500">
                                  Kiekis: {part.quantity_used} {part.cost_per_unit && `× ${part.cost_per_unit.toFixed(2)} €`}
                                </p>
                              </div>
                              <span className="font-semibold text-green-600">
                                {(part.quantity_used * (part.cost_per_unit || 0)).toFixed(2)} €
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activity.data.notes && (
                    <p className="text-sm text-gray-600 mt-2 italic">{activity.data.notes}</p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                        <Package className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{activity.data.work_order_number}</h4>
                        <p className="text-sm text-gray-600">
                          {activity.data.scheduled_date ? formatDateTimeLT(activity.data.scheduled_date) : 'Nesuplanuota'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        activity.data.status === 'Užbaigta' ? 'bg-green-100 text-green-700' :
                        activity.data.status === 'Vykdoma' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {activity.data.status}
                      </span>
                      {activity.data.total_cost && (
                        <p className="text-lg font-bold text-green-600 mt-1">{activity.data.total_cost.toFixed(2)} €</p>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 mb-2">{activity.data.description}</p>

                  {activity.data.assigned_to && (
                    <p className="text-sm text-gray-600 mb-2">Atsakingas: {activity.data.assigned_to}</p>
                  )}

                  {/* Parts used in this work order */}
                  {workOrderParts.filter(p => p.work_order_id === activity.data.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-700 mb-2">Panaudotos dalys:</p>
                      <div className="space-y-2">
                        {workOrderParts.filter(p => p.work_order_id === activity.data.id).map(part => (
                          <div key={part.id} className="bg-gray-50 rounded p-2 text-sm">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-900">{part.product?.name || 'Nežinomas produktas'}</p>
                                <p className="text-xs text-gray-500">
                                  Kiekis: {part.quantity} × {part.unit_price.toFixed(2)} €
                                </p>
                              </div>
                              <span className="font-semibold text-green-600">
                                {part.total_price.toFixed(2)} €
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Nėra transporto istorijos</p>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  vehicle,
  documents,
  onUploadDocument,
  onUpdate,
}: {
  vehicle: Vehicle;
  documents: VehicleDocument[];
  onUploadDocument: () => void;
  onUpdate: () => void;
}) {
  const getDocumentTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      insurance: 'Draudimas',
      technical_inspection: 'Techninė apžiūra',
      service_record: 'Aptarnavimo įrašas',
      manual: 'Instrukcija',
      other: 'Kita',
    };
    return types[type] || type;
  };

  const expiredDocs = documents.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date());
  const activeDocs = documents.filter(d => !d.expiry_date || new Date(d.expiry_date) >= new Date());

  return (
    <div className="space-y-6">
      <button
        onClick={onUploadDocument}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Upload className="w-5 h-5" />
        Įkelti dokumentą
      </button>

      {expiredDocs.length > 0 && (
        <div>
          <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Pasibaigę dokumentai
          </h3>
          <div className="space-y-3">
            {expiredDocs.map(doc => (
              <DocumentCard key={doc.id} document={doc} getDocumentTypeLabel={getDocumentTypeLabel} />
            ))}
          </div>
        </div>
      )}

      {activeDocs.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Aktyvūs dokumentai
          </h3>
          <div className="space-y-3">
            {activeDocs.map(doc => (
              <DocumentCard key={doc.id} document={doc} getDocumentTypeLabel={getDocumentTypeLabel} />
            ))}
          </div>
        </div>
      )}

      {documents.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Nėra dokumentų</p>
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  document,
  getDocumentTypeLabel,
}: {
  document: VehicleDocument;
  getDocumentTypeLabel: (type: string) => string;
}) {
  const isExpired = document.expiry_date && new Date(document.expiry_date) < new Date();

  return (
    <div className={`border rounded-lg p-4 ${isExpired ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-bold text-gray-900">{document.document_name}</p>
          <p className="text-xs text-gray-500">{getDocumentTypeLabel(document.document_type)}</p>
        </div>
        {document.file_url && (
          <a
            href={document.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <Download className="w-4 h-4 text-blue-600" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        {document.issue_date && (
          <div>Išduota: {formatDateLT(document.issue_date)}</div>
        )}
        {document.expiry_date && (
          <div className={isExpired ? 'text-red-700 font-semibold' : ''}>
            {isExpired ? 'Baigėsi: ' : 'Galioja iki: '}
            {formatDateLT(document.expiry_date)}
          </div>
        )}
      </div>

      {document.notes && (
        <p className="text-xs text-gray-600 mt-2">{document.notes}</p>
      )}
    </div>
  );
}

function CreateVisitModal({
  vehicle,
  onClose,
  onSuccess,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user, logAction } = useAuth();
  const [form, setForm] = useState({
    visit_datetime: new Date().toISOString().slice(0, 16),
    visit_type: 'planinis',
    procedures: [] as string[],
    odometer_reading: vehicle.current_mileage?.toString() || '',
    engine_hours: vehicle.current_engine_hours?.toString() || '',
    mechanic_name: '',
    notes: '',
    cost_estimate: '',
  });
  const [saving, setSaving] = useState(false);

  const commonProcedures = [
    'Tepimas',
    'Alyvos keitimas',
    'Filtrų keitimas',
    'Stabdžių patikra',
    'Padangų patikra',
    'Akumuliatoriaus patikra',
    'Aušinimo sistemos patikra',
    'Transmisijos patikra',
  ];

  const handleToggleProcedure = (procedure: string) => {
    setForm(prev => ({
      ...prev,
      procedures: prev.procedures.includes(procedure)
        ? prev.procedures.filter(p => p !== procedure)
        : [...prev.procedures, procedure],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('vehicle_service_visits')
        .insert({
          vehicle_id: vehicle.id,
          visit_datetime: form.visit_datetime,
          visit_type: form.visit_type,
          procedures: form.procedures,
          odometer_reading: form.odometer_reading ? parseFloat(form.odometer_reading) : null,
          engine_hours: form.engine_hours ? parseFloat(form.engine_hours) : null,
          mechanic_name: form.mechanic_name || null,
          notes: form.notes || null,
          cost_estimate: form.cost_estimate ? parseFloat(form.cost_estimate) : null,
          status: 'Planuojamas',
          created_by: user?.id,
        });

      if (error) throw error;

      await logAction('create_service_visit', 'vehicle_service_visits', vehicle.id);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating visit:', error);
      alert(`Klaida: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Naujas aptarnavimas</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data ir laikas *
            </label>
            <input
              type="datetime-local"
              value={form.visit_datetime}
              onChange={e => setForm(prev => ({ ...prev, visit_datetime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipas *
            </label>
            <select
              value={form.visit_type}
              onChange={e => setForm(prev => ({ ...prev, visit_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="planinis">Planinis aptarnavimas</option>
              <option value="neplaninis">Neplaninis aptarnavimas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Procedūros
            </label>
            <div className="grid grid-cols-2 gap-2">
              {commonProcedures.map(proc => (
                <label key={proc} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.procedures.includes(proc)}
                    onChange={() => handleToggleProcedure(proc)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{proc}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rida (km)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.odometer_reading}
                onChange={e => setForm(prev => ({ ...prev, odometer_reading: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variklio valandos
              </label>
              <input
                type="number"
                step="0.01"
                value={form.engine_hours}
                onChange={e => setForm(prev => ({ ...prev, engine_hours: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mechanikas
            </label>
            <input
              type="text"
              value={form.mechanic_name}
              onChange={e => setForm(prev => ({ ...prev, mechanic_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Planuojama kaina (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.cost_estimate}
              onChange={e => setForm(prev => ({ ...prev, cost_estimate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pastabos
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Atšaukti
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saugoma...' : 'Sukurti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VisitDetailModal({
  visit,
  vehicle,
  products,
  batches,
  mode,
  onClose,
  onSuccess,
  onLoadBatches,
}: {
  visit: ServiceVisit;
  vehicle: Vehicle;
  products: Product[];
  batches: Batch[];
  mode: 'edit' | 'work';
  onClose: () => void;
  onSuccess: () => void;
  onLoadBatches: (productId: string) => void;
}) {
  const { user, logAction } = useAuth();
  const [status, setStatus] = useState(visit.status);
  const [notes, setNotes] = useState(visit.notes || '');
  const [actualCost, setActualCost] = useState(visit.actual_cost?.toString() || '');
  const [laborHours, setLaborHours] = useState(visit.labor_hours?.toString() || '');
  const [saving, setSaving] = useState(false);

  // Parts management
  const [visitParts, setVisitParts] = useState<VisitPart[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [newPart, setNewPart] = useState({
    product_id: '',
    batch_id: '',
    quantity_used: '',
    cost_per_unit: '',
    notes: ''
  });

  useEffect(() => {
    if (mode === 'work') {
      loadVisitParts();
    }
  }, [visit.id, mode]);

  const loadVisitParts = async () => {
    setLoadingParts(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_visit_parts')
        .select(`
          *,
          product:equipment_products(name, product_code)
        `)
        .eq('visit_id', visit.id);

      if (error) throw error;
      setVisitParts(data || []);
    } catch (error: any) {
      console.error('Error loading visit parts:', error);
    } finally {
      setLoadingParts(false);
    }
  };

  const handleAddPart = async () => {
    if (!newPart.product_id || !newPart.batch_id || !newPart.quantity_used) {
      alert('Užpildykite visus privalomus laukelius');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('vehicle_visit_parts')
        .insert({
          visit_id: visit.id,
          product_id: newPart.product_id,
          batch_id: newPart.batch_id,
          quantity_used: parseFloat(newPart.quantity_used),
          cost_per_unit: newPart.cost_per_unit ? parseFloat(newPart.cost_per_unit) : null,
          notes: newPart.notes || null,
        })
        .select(`
          *,
          product:products(name, registration_code)
        `)
        .single();

      if (error) throw error;

      setVisitParts(prev => [...prev, data]);
      setNewPart({
        product_id: '',
        batch_id: '',
        quantity_used: '',
        cost_per_unit: '',
        notes: ''
      });
    } catch (error: any) {
      console.error('Error adding part:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleRemovePart = async (partId: string) => {
    if (!confirm('Ar tikrai norite pašalinti šią dalį?')) return;

    try {
      const { error } = await supabase
        .from('vehicle_visit_parts')
        .delete()
        .eq('id', partId);

      if (error) throw error;
      setVisitParts(prev => prev.filter(p => p.id !== partId));
    } catch (error: any) {
      console.error('Error removing part:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleFinish = async () => {
    if (visitParts.length === 0) {
      if (!confirm('Nepridėjote jokių dalių. Ar tikrai norite užbaigti aptarnavimą?')) {
        return;
      }
    }

    setSaving(true);
    try {
      // Update visit status to completed
      const updates: any = {
        status: 'Baigtas',
        notes: notes || null,
        actual_cost: actualCost ? parseFloat(actualCost) : null,
        labor_hours: laborHours ? parseFloat(laborHours) : null,
        completed_at: new Date().toISOString(),
        completed_by: user?.id,
      };

      const { error: visitError } = await supabase
        .from('vehicle_service_visits')
        .update(updates)
        .eq('id', visit.id);

      if (visitError) throw visitError;

      await logAction('complete_service_visit', 'vehicle_service_visits', visit.id);
      alert('Aptarnavimas sėkmingai užbaigtas!');
      onSuccess();
    } catch (error: any) {
      console.error('Error finishing visit:', error);
      alert(`Klaida: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {
        status,
        notes: notes || null,
        actual_cost: actualCost ? parseFloat(actualCost) : null,
        labor_hours: laborHours ? parseFloat(laborHours) : null,
      };

      if (status === 'Baigtas' && !visit.completed_at) {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user?.id;
      }

      const { error } = await supabase
        .from('vehicle_service_visits')
        .update(updates)
        .eq('id', visit.id);

      if (error) throw error;

      await logAction('update_service_visit', 'vehicle_service_visits', visit.id);
      onSuccess();
    } catch (error: any) {
      console.error('Error updating visit:', error);
      alert(`Klaida: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Aptarnavimo detalės</h2>
            <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full mt-1 ${
              mode === 'work' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
            }`}>
              {mode === 'work' ? 'Tvarkyti režimas' : 'Redaguoti režimas'}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Data:</span>
                <p className="font-semibold">{formatDateTimeLT(visit.visit_datetime)}</p>
              </div>
              <div>
                <span className="text-gray-500">Tipas:</span>
                <p className="font-semibold">{visit.visit_type === 'planinis' ? 'Planinis' : 'Neplaninis'}</p>
              </div>
              {visit.mechanic_name && (
                <div>
                  <span className="text-gray-500">Mechanikas:</span>
                  <p className="font-semibold">{visit.mechanic_name}</p>
                </div>
              )}
              {visit.odometer_reading && (
                <div>
                  <span className="text-gray-500">Rida:</span>
                  <p className="font-semibold">{visit.odometer_reading.toLocaleString()} km</p>
                </div>
              )}
              {visit.engine_hours && (
                <div>
                  <span className="text-gray-500">Valandos:</span>
                  <p className="font-semibold">{visit.engine_hours.toLocaleString()} h</p>
                </div>
              )}
            </div>

            {visit.procedures && visit.procedures.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <span className="text-gray-500 text-sm">Procedūros:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {visit.procedures.map((proc, idx) => (
                    <span key={idx} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                      {proc}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {mode !== 'work' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Statusas
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Planuojamas">Planuojamas</option>
                <option value="Vykdomas">Vykdomas</option>
                <option value="Baigtas">Baigtas</option>
                <option value="Atsauktas">Atsauktas</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Faktinė kaina (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={actualCost}
                onChange={e => setActualCost(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Darbo valandos
              </label>
              <input
                type="number"
                step="0.01"
                value={laborHours}
                onChange={e => setLaborHours(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pastabos
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {mode === 'work' && (
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Panaudotos dalys / medžiagos
              </h3>

              {loadingParts ? (
                <p className="text-gray-500 text-center py-4">Kraunama...</p>
              ) : (
                <>
                  {visitParts.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {visitParts.map(part => (
                        <div key={part.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {part.product?.name || 'Nežinomas produktas'}
                            </p>
                            <p className="text-sm text-gray-600">
                              Kiekis: {part.quantity_used}
                              {part.cost_per_unit && ` | Kaina: ${part.cost_per_unit}€`}
                            </p>
                            {part.notes && (
                              <p className="text-xs text-gray-500 mt-1">{part.notes}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemovePart(part.id)}
                            className="ml-3 p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-blue-900">Pridėti dalį</h4>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Produktas *
                      </label>
                      <SearchableSelect
                        options={products.map(p => ({ value: p.id, label: `${p.name} ${p.product_code ? `(${p.product_code})` : ''}` }))}
                        value={newPart.product_id}
                        onChange={(value) => {
                          setNewPart(prev => ({ ...prev, product_id: value, batch_id: '' }));
                          onLoadBatches(value);
                        }}
                        placeholder="Pasirinkite produktą"
                      />
                    </div>

                    {newPart.product_id && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Partija *
                        </label>
                        <select
                          value={newPart.batch_id}
                          onChange={(e) => {
                            const selectedBatch = batches.find(b => b.id === e.target.value);
                            setNewPart(prev => ({
                              ...prev,
                              batch_id: e.target.value,
                              cost_per_unit: selectedBatch?.cost_per_unit?.toString() || ''
                            }));
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Pasirinkite partiją</option>
                          {batches.map(batch => (
                            <option key={batch.id} value={batch.id}>
                              {batch.batch_number} - Likutis: {batch.qty_left}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Kiekis *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={newPart.quantity_used}
                          onChange={(e) => setNewPart(prev => ({ ...prev, quantity_used: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Kaina vnt. (€)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={newPart.cost_per_unit}
                          onChange={(e) => setNewPart(prev => ({ ...prev, cost_per_unit: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pastabos
                      </label>
                      <input
                        type="text"
                        value={newPart.notes}
                        onChange={(e) => setNewPart(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <button
                      onClick={handleAddPart}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Pridėti dalį
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Atšaukti
            </button>
            {mode === 'work' ? (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Užbaigiama...' : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Užbaigti aptarnavimą
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Saugoma...' : (
                  <>
                    <Save className="w-4 h-4" />
                    Išsaugoti
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateWorkOrderModal({
  vehicle,
  onClose,
  onSuccess,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user, logAction } = useAuth();
  const [form, setForm] = useState({
    order_type: 'corrective',
    priority: 'medium',
    description: '',
    scheduled_date: '',
    estimated_cost: '',
    labor_hours: '',
    assigned_mechanic: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: lastOrder } = await supabase
        .from('maintenance_work_orders')
        .select('work_order_number')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNumber = 1;
      if (lastOrder?.work_order_number) {
        const match = lastOrder.work_order_number.match(/WO-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const workOrderNumber = `WO-${nextNumber.toString().padStart(6, '0')}`;

      const { error } = await supabase
        .from('maintenance_work_orders')
        .insert({
          vehicle_id: vehicle.id,
          work_order_number: workOrderNumber,
          order_type: form.order_type,
          priority: form.priority,
          description: form.description,
          scheduled_date: form.scheduled_date || null,
          estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
          labor_hours: form.labor_hours ? parseFloat(form.labor_hours) : null,
          assigned_mechanic: form.assigned_mechanic || null,
          notes: form.notes || null,
          status: 'pending',
        });

      if (error) throw error;

      await logAction('create_work_order', 'maintenance_work_orders', vehicle.id);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating work order:', error);
      alert(`Klaida: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Naujas remonto darbas</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aprašymas *
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              required
              placeholder="Trumpas darbo aprašymas"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipas *
              </label>
              <select
                value={form.order_type}
                onChange={e => setForm(prev => ({ ...prev, order_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="preventive">Profilaktinis</option>
                <option value="corrective">Taisomasis</option>
                <option value="emergency">Skubus</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioritetas *
              </label>
              <select
                value={form.priority}
                onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Žemas</option>
                <option value="medium">Vidutinis</option>
                <option value="high">Aukštas</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Planuojama data
            </label>
            <input
              type="datetime-local"
              value={form.scheduled_date}
              onChange={e => setForm(prev => ({ ...prev, scheduled_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mechanikas
            </label>
            <input
              type="text"
              value={form.assigned_mechanic}
              onChange={e => setForm(prev => ({ ...prev, assigned_mechanic: e.target.value }))}
              placeholder="Atsakingas mechanikas"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Planuojama kaina (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.estimated_cost}
                onChange={e => setForm(prev => ({ ...prev, estimated_cost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Darbo valandos
              </label>
              <input
                type="number"
                step="0.1"
                value={form.labor_hours}
                onChange={e => setForm(prev => ({ ...prev, labor_hours: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pastabos
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Atšaukti
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saugoma...' : 'Sukurti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
