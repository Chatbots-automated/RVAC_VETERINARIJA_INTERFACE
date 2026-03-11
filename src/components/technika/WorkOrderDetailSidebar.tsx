import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, Save, Plus, Trash2, Package, AlertCircle, CheckCircle, Calendar,
  User, FileText, DollarSign, Clock, Wrench
} from 'lucide-react';
import { formatDateTimeLT } from '../../lib/formatters';
import { SearchableSelect } from '../SearchableSelect';

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

interface WorkOrderPart {
  id: string;
  work_order_id: string;
  product_id: string;
  batch_id: string | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  notes: string | null;
  product_name: string;
  product_code: string | null;
  unit_type: string | null;
}

interface Product {
  product_id: string;
  product_name: string;
  product_code: string | null;
  unit_type: string;
  total_qty: number;
}

interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  quantity_left: number;
  expiry_date: string | null;
  purchase_price: number | null;
}

interface WorkOrderDetailSidebarProps {
  workOrderId: string;
  isOpen: boolean;
  mode: 'edit' | 'work';
  onClose: () => void;
  onWorkOrderUpdate: () => void;
}

export function WorkOrderDetailSidebar({
  workOrderId,
  isOpen,
  mode,
  onClose,
  onWorkOrderUpdate
}: WorkOrderDetailSidebarProps) {
  const { user, logAction } = useAuth();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);

  const [editForm, setEditForm] = useState({
    status: '',
    assigned_to: '',
    odometer_reading: '',
    engine_hours: '',
    labor_hours: '',
    labor_cost: '',
    parts_cost: '',
    notes: '',
    started_date: '',
    completed_date: '',
  });

  const [newPart, setNewPart] = useState({
    product_id: '',
    batch_id: '',
    quantity_used: '',
    notes: '',
  });

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && workOrderId) {
      loadWorkOrderDetails();
      loadProducts();
      loadUsers();
    }
  }, [isOpen, workOrderId]);

  useEffect(() => {
    if (newPart.product_id) {
      loadBatches(newPart.product_id);
    }
  }, [newPart.product_id]);

  useEffect(() => {
    if (mode === 'work') {
      setIsEditing(true);
    }
  }, [mode]);

  const loadWorkOrderDetails = async () => {
    const [workOrderRes, partsRes] = await Promise.all([
      supabase
        .from('maintenance_work_orders')
        .select(`
          *,
          vehicle:vehicles(registration_number, make, model),
          tool:tools(name),
          assignee:users!maintenance_work_orders_assigned_to_fkey(full_name)
        `)
        .eq('id', workOrderId)
        .single(),
      supabase
        .from('work_order_parts')
        .select(`
          *,
          product:equipment_products(name, product_code, unit_type)
        `)
        .eq('work_order_id', workOrderId)
    ]);

    if (workOrderRes.data) {
      const wo = workOrderRes.data as any;
      setWorkOrder(wo);
      setEditForm({
        status: wo.status,
        assigned_to: wo.assigned_to || '',
        odometer_reading: wo.odometer_reading?.toString() || '',
        engine_hours: wo.engine_hours?.toString() || '',
        labor_hours: wo.labor_hours?.toString() || '',
        labor_cost: wo.labor_cost?.toString() || '',
        parts_cost: wo.parts_cost?.toString() || '',
        notes: wo.notes || '',
        started_date: wo.started_date || '',
        completed_date: wo.completed_date || '',
      });
    }

    if (partsRes.data) {
      const formattedParts = partsRes.data.map((p: any) => ({
        id: p.id,
        work_order_id: p.work_order_id,
        product_id: p.product_id,
        batch_id: p.batch_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_price: p.total_price,
        notes: p.notes,
        product_name: p.product?.name || 'Unknown',
        product_code: p.product?.product_code || null,
        unit_type: p.product?.unit_type || null,
      }));
      setParts(formattedParts);
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('equipment_warehouse_stock')
      .select('product_id, product_name, product_code, unit_type, total_qty')
      .gt('total_qty', 0)
      .order('product_name');

    if (data) setProducts(data);
  };

  const loadBatches = async (productId: string) => {
    const { data, error } = await supabase
      .from('equipment_batches')
      .select('id, product_id, batch_number, quantity_left, expiry_date, purchase_price')
      .eq('product_id', productId)
      .gt('quantity_left', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading batches:', error);
    } else {
      setBatches(data);
    }
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .order('full_name');

    if (data) setUsers(data);
  };

  const handleFinish = async () => {
    if (!workOrder) return;

    if (parts.length === 0) {
      if (!confirm('Nepridėjote jokių dalių. Ar tikrai norite užbaigti remonto darbą?')) {
        return;
      }
    }

    setIsSaving(true);
    try {
      const updates: any = {
        status: 'completed',
        assigned_to: editForm.assigned_to || null,
        odometer_reading: editForm.odometer_reading ? parseFloat(editForm.odometer_reading) : null,
        engine_hours: editForm.engine_hours ? parseFloat(editForm.engine_hours) : null,
        labor_hours: editForm.labor_hours ? parseFloat(editForm.labor_hours) : null,
        labor_cost: editForm.labor_cost ? parseFloat(editForm.labor_cost) : null,
        // parts_cost and total_cost are auto-calculated by triggers
        notes: editForm.notes || null,
        started_date: editForm.started_date || new Date().toISOString().split('T')[0],
        completed_date: new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase
        .from('maintenance_work_orders')
        .update(updates)
        .eq('id', workOrderId);

      if (error) throw error;

      await logAction('complete', 'maintenance_work_orders', workOrderId, 'Užbaigtas remonto darbas');

      alert('Remonto darbas sėkmingai užbaigtas!');
      onWorkOrderUpdate();
      onClose();
    } catch (error) {
      console.error('Error completing work order:', error);
      alert('Klaida užbaigiant remonto darbą');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!workOrder) return;

    setIsSaving(true);
    try {
      const updates: any = {
        status: editForm.status,
        assigned_to: editForm.assigned_to || null,
        odometer_reading: editForm.odometer_reading ? parseFloat(editForm.odometer_reading) : null,
        engine_hours: editForm.engine_hours ? parseFloat(editForm.engine_hours) : null,
        labor_hours: editForm.labor_hours ? parseFloat(editForm.labor_hours) : null,
        labor_cost: editForm.labor_cost ? parseFloat(editForm.labor_cost) : null,
        // parts_cost is auto-calculated by trigger, don't manually set it
        notes: editForm.notes || null,
        started_date: editForm.started_date || null,
        completed_date: editForm.completed_date || null,
      };

      // total_cost is also auto-calculated by trigger

      const { error } = await supabase
        .from('maintenance_work_orders')
        .update(updates)
        .eq('id', workOrderId);

      if (error) throw error;

      await logAction('update', 'maintenance_work_orders', workOrderId, 'Atnaujintas remonto darbas');

      setIsEditing(false);
      loadWorkOrderDetails();
      onWorkOrderUpdate();
    } catch (error) {
      console.error('Error updating work order:', error);
      alert('Klaida atnaujinant remonto darbą');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPart = async () => {
    if (!newPart.product_id || !newPart.quantity_used) {
      alert('Prašome užpildyti visus laukus');
      return;
    }

    try {
      const product = products.find(p => p.product_id === newPart.product_id);
      const batch = batches.find(b => b.id === newPart.batch_id);
      const quantity = parseFloat(newPart.quantity_used);
      const unitPrice = batch?.purchase_price || 0;
      const totalPrice = quantity * unitPrice;

      const { error } = await supabase
        .from('work_order_parts')
        .insert({
          work_order_id: workOrderId,
          product_id: newPart.product_id,
          batch_id: newPart.batch_id || null,
          quantity: quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: newPart.notes || null,
        });

      if (error) throw error;

      await logAction('create', 'work_order_parts', workOrderId, `Pridėta dalis: ${product?.product_name}`);

      setShowAddPart(false);
      setNewPart({
        product_id: '',
        batch_id: '',
        quantity_used: '',
        notes: '',
      });
      setSelectedProducts([]);
      setBulkQuantities({});
      loadWorkOrderDetails();
      onWorkOrderUpdate();
    } catch (error: any) {
      console.error('Error adding part:', error);
      alert(error.message || 'Klaida pridedant dalį');
    }
  };

  const handleBulkAddParts = async () => {
    if (selectedProducts.length === 0) {
      alert('Prašome pasirinkti bent vieną produktą');
      return;
    }

    const missingQuantities = selectedProducts.filter(pid => !bulkQuantities[pid] || parseFloat(bulkQuantities[pid]) <= 0);
    if (missingQuantities.length > 0) {
      alert('Prašome įvesti kiekius visiems pasirinkt produktams');
      return;
    }

    try {
      // Get batches for all selected products
      const { data: allBatches, error: batchError } = await supabase
        .from('equipment_batches')
        .select('id, product_id, purchase_price, qty_left')
        .in('product_id', selectedProducts)
        .gt('qty_left', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (batchError) throw batchError;

      const partsToInsert = selectedProducts.map(productId => {
        const quantity = parseFloat(bulkQuantities[productId]);
        // Find first available batch for this product
        const batch = allBatches?.find(b => b.product_id === productId && b.qty_left >= quantity);
        const unitPrice = batch?.purchase_price || 0;
        const totalPrice = quantity * unitPrice;

        console.log(`Product ${productId}: batch=${batch?.id}, price=${unitPrice}, total=${totalPrice}`);

        return {
          work_order_id: workOrderId,
          product_id: productId,
          batch_id: batch?.id || null,
          quantity: quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: null,
        };
      });

      const { error } = await supabase
        .from('work_order_parts')
        .insert(partsToInsert);

      if (error) throw error;

      await logAction('create', 'work_order_parts', workOrderId, `Pridėtos dalys: ${selectedProducts.length} vnt.`);

      setShowAddPart(false);
      setSelectedProducts([]);
      setBulkQuantities({});
      setNewPart({
        product_id: '',
        batch_id: '',
        quantity_used: '',
        notes: '',
      });
      loadWorkOrderDetails();
      onWorkOrderUpdate();
    } catch (error: any) {
      console.error('Error adding parts:', error);
      alert(error.message || 'Klaida pridedant dalis');
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        const newSelected = prev.filter(id => id !== productId);
        const newQuantities = { ...bulkQuantities };
        delete newQuantities[productId];
        setBulkQuantities(newQuantities);
        return newSelected;
      } else {
        return [...prev, productId];
      }
    });
  };

  const handleDeletePart = async (partId: string) => {
    if (!confirm('Ar tikrai norite ištrinti šią dalį?')) return;

    try {
      const { error } = await supabase
        .from('work_order_parts')
        .delete()
        .eq('id', partId);

      if (error) throw error;

      await logAction('delete', 'work_order_parts', partId, 'Ištrinta dalis');
      loadWorkOrderDetails();
      onWorkOrderUpdate();
    } catch (error) {
      console.error('Error deleting part:', error);
      alert('Klaida trinant dalį');
    }
  };

  if (!isOpen || !workOrder) return null;

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Laukiama',
    in_progress: 'Vykdoma',
    completed: 'Baigta',
    cancelled: 'Atšaukta',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  const priorityLabels: Record<string, string> = {
    low: 'Žemas',
    medium: 'Vidutinis',
    high: 'Aukštas',
    critical: 'Kritinis',
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-600 text-white p-6 shadow-lg z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6" />
            <div>
              <h2 className="text-2xl font-bold">{workOrder.work_order_number}</h2>
              <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full mt-1 ${
                mode === 'work' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
              }`}>
                {mode === 'work' ? 'Tvarkyti režimas' : 'Redaguoti režimas'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {workOrder.vehicle && (
            <div>
              <p className="text-slate-200">Transportas</p>
              <p className="font-semibold">
                {workOrder.vehicle.registration_number} - {workOrder.vehicle.make} {workOrder.vehicle.model}
              </p>
            </div>
          )}
          <div>
            <p className="text-slate-200">Prioritetas</p>
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${priorityColors[workOrder.priority] || 'bg-gray-100 text-gray-700'}`}>
              {priorityLabels[workOrder.priority] || workOrder.priority}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2">Aprašymas</h3>
          <p className="text-gray-700">{workOrder.description}</p>
        </div>

        {!isEditing ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statusas</label>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColors[workOrder.status] || 'bg-gray-100 text-gray-700'}`}>
                  {statusLabels[workOrder.status] || workOrder.status}
                </span>
              </div>
              {workOrder.assignee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Atsakingas</label>
                  <p className="text-gray-900">{workOrder.assignee.full_name}</p>
                </div>
              )}
              {workOrder.scheduled_date && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Planuojama data</label>
                  <p className="text-gray-900">{new Date(workOrder.scheduled_date).toLocaleDateString('lt-LT')}</p>
                </div>
              )}
              {workOrder.started_date && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pradėta</label>
                  <p className="text-gray-900">{new Date(workOrder.started_date).toLocaleDateString('lt-LT')}</p>
                </div>
              )}
              {workOrder.completed_date && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Baigta</label>
                  <p className="text-gray-900">{new Date(workOrder.completed_date).toLocaleDateString('lt-LT')}</p>
                </div>
              )}
              {workOrder.odometer_reading && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rida (km)</label>
                  <p className="text-gray-900">{workOrder.odometer_reading.toLocaleString()}</p>
                </div>
              )}
              {workOrder.engine_hours && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motovalandos</label>
                  <p className="text-gray-900">{workOrder.engine_hours}</p>
                </div>
              )}
              {workOrder.labor_hours && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Darbo valandos</label>
                  <p className="text-gray-900">{workOrder.labor_hours}</p>
                </div>
              )}
              {workOrder.labor_cost && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Darbo kaina (EUR)</label>
                  <p className="text-gray-900">{workOrder.labor_cost.toFixed(2)}</p>
                </div>
              )}
              {workOrder.parts_cost && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dalių kaina (EUR)</label>
                  <p className="text-gray-900">{workOrder.parts_cost.toFixed(2)}</p>
                </div>
              )}
              {workOrder.total_cost && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bendra kaina (EUR)</label>
                  <p className="text-gray-900 font-semibold">{workOrder.total_cost.toFixed(2)}</p>
                </div>
              )}
            </div>

            {workOrder.notes && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
                <p className="text-gray-700 bg-gray-50 rounded p-3">{workOrder.notes}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`grid grid-cols-1 ${mode !== 'work' ? 'md:grid-cols-2' : ''} gap-4`}>
              {mode !== 'work' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statusas *</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="pending">Laukiama</option>
                    <option value="in_progress">Vykdoma</option>
                    <option value="completed">Baigta</option>
                    <option value="cancelled">Atšaukta</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Atsakingas</label>
                <select
                  value={editForm.assigned_to}
                  onChange={e => setEditForm({ ...editForm, assigned_to: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Nepasirinkta</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>

              {mode !== 'work' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pradėta</label>
                    <input
                      type="date"
                      value={editForm.started_date}
                      onChange={e => setEditForm({ ...editForm, started_date: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Baigta</label>
                    <input
                      type="date"
                      value={editForm.completed_date}
                      onChange={e => setEditForm({ ...editForm, completed_date: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rida (km)</label>
                <input
                  type="number"
                  value={editForm.odometer_reading}
                  onChange={e => setEditForm({ ...editForm, odometer_reading: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motovalandos</label>
                <input
                  type="number"
                  value={editForm.engine_hours}
                  onChange={e => setEditForm({ ...editForm, engine_hours: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbo valandos</label>
                <input
                  type="number"
                  step="0.1"
                  value={editForm.labor_hours}
                  onChange={e => setEditForm({ ...editForm, labor_hours: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbo kaina (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.labor_cost}
                  onChange={e => setEditForm({ ...editForm, labor_cost: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dalių kaina (EUR)
                  <span className="ml-2 text-xs text-gray-500 font-normal">(Apskaičiuojama automatiškai)</span>
                </label>
                <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-700">
                  {editForm.parts_cost || '0.00'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
              <textarea
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full border rounded px-3 py-2 min-h-24"
                placeholder="Papildomos pastabos..."
              />
            </div>

            <div className="flex gap-2">
              {mode === 'work' ? (
                <button
                  onClick={handleFinish}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-5 h-5" />
                  {isSaving ? 'Užbaigiama...' : 'Užbaigti remonto darbą'}
                </button>
              ) : (
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saugoma...' : 'Išsaugoti'}
                </button>
              )}
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (workOrder) {
                    setEditForm({
                      status: workOrder.status,
                      assigned_to: workOrder.assigned_to || '',
                      odometer_reading: workOrder.odometer_reading?.toString() || '',
                      engine_hours: workOrder.engine_hours?.toString() || '',
                      labor_hours: workOrder.labor_hours?.toString() || '',
                      labor_cost: workOrder.labor_cost?.toString() || '',
                      parts_cost: workOrder.parts_cost?.toString() || '',
                      notes: workOrder.notes || '',
                      started_date: workOrder.started_date || '',
                      completed_date: workOrder.completed_date || '',
                    });
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
                Atšaukti
              </button>
            </div>
          </>
        )}

        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Panaudotos dalys</h3>
            <button
              onClick={() => setShowAddPart(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Pridėti dalį
            </button>
          </div>

          {parts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Dalių nėra</p>
          ) : (
            <div className="space-y-3">
              {parts.map(part => (
                <div key={part.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{part.product_name}</p>
                      {part.product_code && <p className="text-sm text-gray-600">Kodas: {part.product_code}</p>}
                      <p className="text-sm text-gray-700 mt-1">
                        Kiekis: {part.quantity} {part.unit_type}
                      </p>
                      {part.total_price !== null && part.total_price > 0 && (
                        <p className="text-sm text-gray-700">
                          Kaina: {part.total_price.toFixed(2)} EUR
                        </p>
                      )}
                      {part.notes && <p className="text-sm text-gray-600 mt-1">{part.notes}</p>}
                    </div>
                    <button
                      onClick={() => handleDeletePart(part.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAddPart && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Pridėti dalis</h3>
                  <button
                    onClick={() => {
                      setShowAddPart(false);
                      setNewPart({ product_id: '', batch_id: '', quantity_used: '', notes: '' });
                      setSelectedProducts([]);
                      setBulkQuantities({});
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">Pasirinkite produktus ir įveskite jų kiekius</p>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
                    {products.map(product => (
                      <div
                        key={product.product_id}
                        className={`border rounded-lg p-3 transition-colors ${
                          selectedProducts.includes(product.product_id)
                            ? 'border-slate-500 bg-slate-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(product.product_id)}
                            onChange={() => toggleProductSelection(product.product_id)}
                            className="mt-1 w-4 h-4 text-slate-600 rounded focus:ring-slate-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{product.product_name}</p>
                                <p className="text-sm text-gray-600">
                                  {product.product_code && `Kodas: ${product.product_code} • `}
                                  Likutis: {product.total_qty} {product.unit_type}
                                </p>
                              </div>
                            </div>

                            {selectedProducts.includes(product.product_id) && (
                              <div className="mt-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={bulkQuantities[product.product_id] || ''}
                                  onChange={e => setBulkQuantities({ ...bulkQuantities, [product.product_id]: e.target.value })}
                                  className="w-full border rounded px-3 py-2 text-sm"
                                  placeholder={`Kiekis (${product.unit_type})`}
                                  autoFocus
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedProducts.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-700">
                        Pasirinkta produktų: <span className="text-slate-600 font-bold">{selectedProducts.length}</span>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={handleBulkAddParts}
                      disabled={selectedProducts.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      Pridėti ({selectedProducts.length})
                    </button>
                    <button
                      onClick={() => {
                        setShowAddPart(false);
                        setNewPart({ product_id: '', batch_id: '', quantity_used: '', notes: '' });
                        setSelectedProducts([]);
                        setBulkQuantities({});
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Atšaukti
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
