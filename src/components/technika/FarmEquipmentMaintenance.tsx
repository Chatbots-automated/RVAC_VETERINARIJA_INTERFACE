import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Plus, Edit2, Trash2, AlertTriangle, CheckCircle, 
  Clock, Calendar, ChevronDown, ChevronRight, Settings 
} from 'lucide-react';
import { MaintenanceCalendar } from './MaintenanceCalendar';

interface FarmEquipment {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FarmEquipmentSummary extends FarmEquipment {
  total_items: number;
  active_items: number;
  overdue_items: number;
  upcoming_items: number;
  next_service_due: string | null;
}

interface FarmEquipmentItem {
  id: string;
  farm_equipment_id: string;
  equipment_name: string;
  equipment_location: string | null;
  equipment_category: string | null;
  item_name: string;
  description: string | null;
  service_interval_value: number;
  service_interval_type: string;
  reminder_days_before: number;
  last_service_date: string | null;
  next_service_date: string | null;
  days_until_service: number | null;
  service_status: 'not_scheduled' | 'ok' | 'upcoming' | 'overdue';
  service_count: number;
  is_active: boolean;
  notes: string | null;
}

interface WarehouseProduct {
  product_id: string;
  product_name: string;
  product_code: string | null;
  unit_type: string;
  total_qty: number;
}

interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  qty_left: number;
  purchase_price: number | null;
  expiry_date: string | null;
}

interface ServicePart {
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_number: string;
  quantity_used: string;
  unit_price: number;
  unit_type: string;
}


const CATEGORIES = [
  'Melžimas',
  'Šėrimas',
  'Valymas',
  'Vėdinimas',
  'Vandentiekis',
  'Elektra',
  'Kita',
];

const INTERVAL_TYPES = [
  { value: 'days', label: 'Dienų' },
  { value: 'weeks', label: 'Savaičių' },
  { value: 'months', label: 'Mėnesių' },
  { value: 'years', label: 'Metų' },
];

export function FarmEquipmentMaintenance() {
  const { user, logAction } = useAuth();
  const [equipment, setEquipment] = useState<FarmEquipmentSummary[]>([]);
  const [items, setItems] = useState<FarmEquipmentItem[]>([]);
  const [priorityItems, setPriorityItems] = useState<FarmEquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEquipment, setExpandedEquipment] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(true);
  const [allItems, setAllItems] = useState<FarmEquipmentItem[]>([]);
  
  // Modals
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  
  // Edit states
  const [editingEquipment, setEditingEquipment] = useState<FarmEquipment | null>(null);
  const [editingItem, setEditingItem] = useState<FarmEquipmentItem | null>(null);
  const [servicingItem, setServicingItem] = useState<FarmEquipmentItem | null>(null);
  
  // Forms
  const [equipmentForm, setEquipmentForm] = useState({
    name: '',
    description: '',
    location: '',
    category: '',
  });
  
  const [itemForm, setItemForm] = useState({
    farm_equipment_id: '',
    item_name: '',
    description: '',
    service_interval_value: '3',
    service_interval_type: 'months',
    reminder_days_before: '14',
    last_service_date: '',
    notes: '',
  });
  
  const [serviceForm, setServiceForm] = useState({
    service_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Products and batches for service parts
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [serviceParts, setServiceParts] = useState<ServicePart[]>([]);
  const [showAddPartForm, setShowAddPartForm] = useState(false);
  const [partForm, setPartForm] = useState({
    product_id: '',
    batch_id: '',
    quantity_used: '1',
  });

  useEffect(() => {
    loadEquipment();
    loadPriorityItems();
    loadAllItems();
  }, []);

  useEffect(() => {
    if (expandedEquipment) {
      loadItems(expandedEquipment);
    }
  }, [expandedEquipment]);

  const loadEquipment = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('farm_equipment_summary')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error loading equipment:', error);
    } else if (data) {
      setEquipment(data);
    }
    setLoading(false);
  };

  const loadItems = async (equipmentId: string) => {
    const { data, error } = await supabase
      .from('farm_equipment_items_detail')
      .select('*')
      .eq('farm_equipment_id', equipmentId)
      .order('next_service_date');

    if (error) {
      console.error('Error loading items:', error);
    } else if (data) {
      setItems(data);
    }
  };

  const loadPriorityItems = async () => {
    const { data, error } = await supabase
      .from('farm_equipment_items_detail')
      .select('*')
      .in('service_status', ['overdue', 'upcoming'])
      .order('next_service_date');

    if (error) {
      console.error('Error loading priority items:', error);
    } else if (data) {
      setPriorityItems(data);
    }
  };

  const loadAllItems = async () => {
    const { data, error } = await supabase
      .from('farm_equipment_items_detail')
      .select('*')
      .order('next_service_date');

    if (error) {
      console.error('Error loading all items:', error);
    } else if (data) {
      setAllItems(data);
    }
  };

  const handleToggleExpand = (equipmentId: string) => {
    if (expandedEquipment === equipmentId) {
      setExpandedEquipment(null);
      setItems([]);
    } else {
      setExpandedEquipment(equipmentId);
    }
  };

  // Equipment CRUD
  const handleOpenEquipmentModal = (equipment?: FarmEquipment) => {
    if (equipment) {
      setEditingEquipment(equipment);
      setEquipmentForm({
        name: equipment.name,
        description: equipment.description || '',
        location: equipment.location || '',
        category: equipment.category || '',
      });
    } else {
      setEditingEquipment(null);
      setEquipmentForm({
        name: '',
        description: '',
        location: '',
        category: '',
      });
    }
    setShowEquipmentModal(true);
  };

  const handleSaveEquipment = async () => {
    if (!equipmentForm.name.trim()) {
      alert('Prašome įvesti pavadinimą');
      return;
    }

    try {
      if (editingEquipment) {
        const { error } = await supabase
          .from('farm_equipment')
          .update({
            name: equipmentForm.name,
            description: equipmentForm.description || null,
            location: equipmentForm.location || null,
            category: equipmentForm.category || null,
          })
          .eq('id', editingEquipment.id);

        if (error) throw error;
        await logAction('update', 'farm_equipment', editingEquipment.id, null, { name: equipmentForm.name });
        alert('Įranga atnaujinta');
      } else {
        const { error } = await supabase
          .from('farm_equipment')
          .insert({
            name: equipmentForm.name,
            description: equipmentForm.description || null,
            location: equipmentForm.location || null,
            category: equipmentForm.category || null,
            created_by: user?.id,
          });

        if (error) throw error;
        await logAction('create', 'farm_equipment', undefined, null, { name: equipmentForm.name });
        alert('Įranga sukurta');
      }

      setShowEquipmentModal(false);
      loadEquipment();
    } catch (error: any) {
      console.error('Error saving equipment:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleDeleteEquipment = async (eq: FarmEquipmentSummary) => {
    if (eq.total_items > 0) {
      alert('Negalima ištrinti įrangos, kuri turi komponentų. Pirmiausia ištrinkite komponentus.');
      return;
    }

    if (!confirm(`Ar tikrai norite ištrinti "${eq.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('farm_equipment')
        .delete()
        .eq('id', eq.id);

      if (error) throw error;
      await logAction('delete', 'farm_equipment', eq.id, null, { name: eq.name });
      alert('Įranga ištrinta');
      loadEquipment();
    } catch (error: any) {
      console.error('Error deleting equipment:', error);
      alert('Klaida: ' + error.message);
    }
  };

  // Item CRUD
  const handleOpenItemModal = (equipmentId: string, item?: FarmEquipmentItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        farm_equipment_id: item.farm_equipment_id,
        item_name: item.item_name,
        description: item.description || '',
        service_interval_value: item.service_interval_value.toString(),
        service_interval_type: item.service_interval_type,
        reminder_days_before: item.reminder_days_before.toString(),
        last_service_date: item.last_service_date || '',
        notes: item.notes || '',
      });
    } else {
      setEditingItem(null);
      setItemForm({
        farm_equipment_id: equipmentId,
        item_name: '',
        description: '',
        service_interval_value: '3',
        service_interval_type: 'months',
        reminder_days_before: '14',
        last_service_date: '',
        notes: '',
      });
    }
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemForm.item_name.trim()) {
      alert('Prašome įvesti pavadinimą');
      return;
    }

    const intervalValue = parseInt(itemForm.service_interval_value);
    const reminderDays = parseInt(itemForm.reminder_days_before);

    if (isNaN(intervalValue) || intervalValue <= 0) {
      alert('Prašome įvesti teisingą intervalą');
      return;
    }

    if (isNaN(reminderDays) || reminderDays < 0) {
      alert('Prašome įvesti teisingą priminimo dienų skaičių');
      return;
    }

    try {
      const itemData = {
        farm_equipment_id: itemForm.farm_equipment_id,
        item_name: itemForm.item_name,
        description: itemForm.description || null,
        service_interval_value: intervalValue,
        service_interval_type: itemForm.service_interval_type,
        reminder_days_before: reminderDays,
        last_service_date: itemForm.last_service_date || null,
        notes: itemForm.notes || null,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('farm_equipment_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
        await logAction('update', 'farm_equipment_items', editingItem.id, null, { item_name: itemForm.item_name });
        alert('Komponentas atnaujintas');
      } else {
        const { error } = await supabase
          .from('farm_equipment_items')
          .insert({ ...itemData, created_by: user?.id });

        if (error) throw error;
        await logAction('create', 'farm_equipment_items', undefined, null, { item_name: itemForm.item_name });
        alert('Komponentas sukurtas');
      }

      setShowItemModal(false);
      loadEquipment();
      if (expandedEquipment) {
        loadItems(expandedEquipment);
      }
    } catch (error: any) {
      console.error('Error saving item:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleDeleteItem = async (item: FarmEquipmentItem) => {
    if (!confirm(`Ar tikrai norite ištrinti "${item.item_name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('farm_equipment_items')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      await logAction('delete', 'farm_equipment_items', item.id, null, { item_name: item.item_name });
      alert('Komponentas ištrintas');
      loadEquipment();
      if (expandedEquipment) {
        loadItems(expandedEquipment);
      }
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert('Klaida: ' + error.message);
    }
  };

  // Service recording
  const handleOpenServiceModal = async (item: FarmEquipmentItem) => {
    try {
      setServicingItem(item);
      setServiceForm({
        service_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setServiceParts([]);
      setShowAddPartForm(false);
      await loadProducts();
      setShowServiceModal(true);
    } catch (error: any) {
      console.error('Error opening service modal:', error);
      alert('Klaida atidarant aptarnavimo langą: ' + error.message);
    }
  };

  const loadProducts = async () => {
    // First get farm products
    const { data: farmProducts } = await supabase
      .from('equipment_products')
      .select('id')
      .eq('default_location_type', 'farm');
    
    const farmProductIds = farmProducts?.map(p => p.id) || [];
    
    if (farmProductIds.length === 0) {
      setProducts([]);
      return;
    }

    const { data } = await supabase
      .from('equipment_warehouse_stock')
      .select('product_id, product_name, product_code, unit_type, total_qty')
      .in('product_id', farmProductIds)
      .gt('total_qty', 0)
      .order('product_name');

    if (data) setProducts(data);
  };

  const loadBatches = async (productId: string) => {
    const { data } = await supabase
      .from('equipment_batches')
      .select('id, product_id, batch_number, qty_left, purchase_price, expiry_date')
      .eq('product_id', productId)
      .gt('qty_left', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (data) setBatches(data as ProductBatch[]);
  };

  const handleAddPart = () => {
    if (!partForm.product_id || !partForm.batch_id) {
      alert('Prašome pasirinkti produktą ir partiją');
      return;
    }

    const quantity = parseFloat(partForm.quantity_used);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Prašome įvesti teisingą kiekį');
      return;
    }

    const product = products.find(p => p.product_id === partForm.product_id);
    const batch = batches.find(b => b.id === partForm.batch_id);

    if (!product || !batch) {
      alert('Produktas arba partija nerasta');
      return;
    }

    if (quantity > batch.qty_left) {
      alert(`Nepakankamas kiekis. Partijoje liko: ${batch.qty_left}`);
      return;
    }

    const newPart: ServicePart = {
      product_id: product.product_id,
      product_name: product.product_name,
      batch_id: batch.id,
      batch_number: batch.batch_number,
      quantity_used: partForm.quantity_used,
      unit_price: batch.purchase_price || 0,
      unit_type: product.unit_type,
    };

    setServiceParts([...serviceParts, newPart]);
    setPartForm({
      product_id: '',
      batch_id: '',
      quantity_used: '1',
    });
    setBatches([]);
    setShowAddPartForm(false);
  };

  const handleRemovePart = (index: number) => {
    setServiceParts(serviceParts.filter((_, i) => i !== index));
  };

  const handleSaveService = async () => {
    if (!servicingItem) return;

    try {
      // 1. Create service record
      const { data: serviceRecord, error: serviceError } = await supabase
        .from('farm_equipment_service_records')
        .insert({
          farm_equipment_item_id: servicingItem.id,
          service_date: serviceForm.service_date,
          performed_by: user?.id,
          notes: serviceForm.notes || null,
        })
        .select()
        .single();

      if (serviceError) throw serviceError;

      // 2. Add service parts (if any)
      if (serviceParts.length > 0) {
        const partsToInsert = serviceParts.map(part => ({
          service_record_id: serviceRecord.id,
          batch_id: part.batch_id,
          product_id: part.product_id,
          quantity_used: parseFloat(part.quantity_used),
          unit_price: part.unit_price,
          created_by: user?.id,
        }));

        const { error: partsError } = await supabase
          .from('farm_equipment_service_parts')
          .insert(partsToInsert);

        if (partsError) throw partsError;
      }
      
      await logAction('create', 'farm_equipment_service_records', serviceRecord.id, null, { 
        item: servicingItem.item_name,
        date: serviceForm.service_date,
        parts_count: serviceParts.length
      });
      
      alert('Aptarnavimas užregistruotas' + (serviceParts.length > 0 ? ` su ${serviceParts.length} panaudotais produktais` : ''));
      setShowServiceModal(false);
      setServiceParts([]);
      loadEquipment();
      loadPriorityItems();
      loadAllItems();
      if (expandedEquipment) {
        loadItems(expandedEquipment);
      }
    } catch (error: any) {
      console.error('Error saving service record:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const getStatusBadge = (status: string, item?: FarmEquipmentItem) => {
    const isClickable = status === 'overdue' || status === 'upcoming';
    const baseClasses = "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium";
    const clickableClasses = isClickable ? "cursor-pointer hover:shadow-lg transition-all" : "";
    
    const handleClick = () => {
      if (isClickable && item) {
        handleOpenServiceModal(item);
      }
    };

    switch (status) {
      case 'overdue':
        return (
          <span 
            onClick={handleClick}
            className={`${baseClasses} ${clickableClasses} bg-red-100 text-red-700`}
            title="Klikite norėdami registruoti aptarnavimą"
          >
            <AlertTriangle className="w-3 h-3" />
            Vėluoja
          </span>
        );
      case 'upcoming':
        return (
          <span 
            onClick={handleClick}
            className={`${baseClasses} ${clickableClasses} bg-yellow-100 text-yellow-700`}
            title="Klikite norėdami registruoti aptarnavimą"
          >
            <Clock className="w-3 h-3" />
            Artėja
          </span>
        );
      case 'ok':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-700`}>
            <CheckCircle className="w-3 h-3" />
            Gerai
          </span>
        );
      case 'not_scheduled':
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-700`}>
            <Calendar className="w-3 h-3" />
            Nesuplanuota
          </span>
        );
      default:
        return null;
    }
  };

  const formatInterval = (value: number, type: string) => {
    const typeLabels: Record<string, string> = {
      days: value === 1 ? 'diena' : 'dienų',
      weeks: value === 1 ? 'savaitė' : 'savaičių',
      months: value === 1 ? 'mėnuo' : 'mėnesių',
      years: value === 1 ? 'metai' : 'metų',
    };
    return `${value} ${typeLabels[type] || type}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  // Prepare calendar events
  const calendarEvents = allItems
    .filter(item => item.next_service_date)
    .map(item => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(item.next_service_date!);
      dueDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let status: 'overdue' | 'today' | 'upcoming' | 'ok';
      if (daysDiff < 0) {
        status = 'overdue';
      } else if (daysDiff === 0) {
        status = 'today';
      } else if (daysDiff <= item.reminder_days_before) {
        status = 'upcoming';
      } else {
        status = 'ok';
      }

      return {
        id: item.id,
        title: item.equipment_name,
        date: item.next_service_date!,
        status,
        type: item.item_name,
        details: `${item.equipment_name} - ${item.item_name}${item.equipment_location ? ` (${item.equipment_location})` : ''}`,
        onClick: () => handleOpenServiceModal(item),
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fermos įrangos aptarnavimai</h2>
          <p className="text-gray-600 mt-1">
            Tvarkykite fermos įrangos ir sistemų aptarnavimą
          </p>
        </div>
        <button
          onClick={() => handleOpenEquipmentModal()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nauja įranga
        </button>
      </div>

      {/* Priority Items Section */}
      {priorityItems.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-yellow-50 rounded-xl border-2 border-red-200 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                Dėmesio reikalaujantys komponentai
              </h3>
              <p className="text-sm text-gray-600">
                {priorityItems.filter(i => i.service_status === 'overdue').length} vėluoja, {priorityItems.filter(i => i.service_status === 'upcoming').length} artėja
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {priorityItems.map((item) => (
              <div
                key={item.id}
                className={`bg-white rounded-lg p-4 border-2 ${
                  item.service_status === 'overdue' 
                    ? 'border-red-300 shadow-red-100' 
                    : 'border-yellow-300 shadow-yellow-100'
                } shadow-md hover:shadow-lg transition-all`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="font-bold text-gray-900">{item.equipment_name}</h5>
                      {getStatusBadge(item.service_status, item)}
                    </div>
                    <p className="text-sm text-gray-700 font-medium">{item.item_name}</p>
                    {item.equipment_location && (
                      <p className="text-xs text-gray-500 mt-1">📍 {item.equipment_location}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Paskutinis aptarnavimas</p>
                    <p className="font-semibold text-gray-900">{item.last_service_date || 'Nėra'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Kitas aptarnavimas</p>
                    <p className={`font-semibold ${
                      item.service_status === 'overdue' ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {item.next_service_date || 'Nėra'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenServiceModal(item)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 ${
                      item.service_status === 'overdue'
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-yellow-500 hover:bg-yellow-600'
                    } text-white rounded-lg transition-colors font-medium text-sm`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Registruoti aptarnavimą
                  </button>
                </div>

                {item.days_until_service !== null && (
                  <p className="text-xs text-center mt-2 font-medium text-gray-600">
                    {item.days_until_service < 0 
                      ? `Vėluoja ${Math.abs(item.days_until_service)} d.`
                      : `Liko ${item.days_until_service} d.`
                    }
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {equipment.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Settings className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Nėra įrangos
          </h3>
          <p className="text-gray-600 mb-4">
            Sukurkite pirmąją fermos įrangos ir pridėkite jos komponentus aptarnavimui
          </p>
          <button
            onClick={() => handleOpenEquipmentModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
          >
            <Plus className="w-4 h-4" />
            Sukurti įrangą
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {equipment.map((eq) => (
            <div key={eq.id} className="bg-white rounded-xl border border-gray-200">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <button
                        onClick={() => handleToggleExpand(eq.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {expandedEquipment === eq.id ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                      <h3 className="text-xl font-bold text-gray-900">{eq.name}</h3>
                      {eq.category && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          {eq.category}
                        </span>
                      )}
                    </div>
                    {eq.description && (
                      <p className="text-gray-600 text-sm ml-8">{eq.description}</p>
                    )}
                    {eq.location && (
                      <p className="text-gray-500 text-sm ml-8">📍 {eq.location}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenEquipmentModal(eq)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteEquipment(eq)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 ml-8">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Komponentų</p>
                    <p className="text-2xl font-bold text-gray-900">{eq.active_items}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Vėluoja</p>
                    <p className="text-2xl font-bold text-red-600">{eq.overdue_items}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Artėja</p>
                    <p className="text-2xl font-bold text-yellow-600">{eq.upcoming_items}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Artimiausias</p>
                    <p className="text-sm font-bold text-green-600">
                      {eq.next_service_due || 'Nėra'}
                    </p>
                  </div>
                </div>

                {expandedEquipment === eq.id && (
                  <div className="mt-6 ml-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">Komponentai</h4>
                      <button
                        onClick={() => handleOpenItemModal(eq.id)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Pridėti komponentą
                      </button>
                    </div>

                    {items.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-8">
                        Nėra komponentų. Pridėkite pirmąjį komponentą aptarnavimui.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h5 className="font-semibold text-gray-900">{item.item_name}</h5>
                                  {getStatusBadge(item.service_status, item)}
                                </div>
                                {item.description && (
                                  <p className="text-sm text-gray-600">{item.description}</p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleOpenServiceModal(item)}
                                  className="px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors text-sm font-medium"
                                >
                                  Aptarnavimas
                                </button>
                                <button
                                  onClick={() => handleOpenItemModal(eq.id, item)}
                                  className="p-2 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item)}
                                  className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-gray-500 text-xs mb-1">Intervalas</p>
                                <p className="font-medium text-gray-900">
                                  {formatInterval(item.service_interval_value, item.service_interval_type)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 text-xs mb-1">Paskutinis aptarnavimas</p>
                                <p className="font-medium text-gray-900">
                                  {item.last_service_date || 'Nėra'}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 text-xs mb-1">Kitas aptarnavimas</p>
                                <p className="font-medium text-gray-900">
                                  {item.next_service_date || 'Nėra'}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 text-xs mb-1">Dienų iki</p>
                                <p className="font-medium text-gray-900">
                                  {item.days_until_service !== null ? `${item.days_until_service} d.` : 'N/A'}
                                </p>
                              </div>
                            </div>

                            {item.notes && (
                              <p className="text-xs text-gray-600 mt-2 italic">💡 {item.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Equipment Modal */}
      {showEquipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              {editingEquipment ? 'Redaguoti įrangą' : 'Nauja įranga'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pavadinimas *
                </label>
                <input
                  type="text"
                  value={equipmentForm.name}
                  onChange={(e) => setEquipmentForm({ ...equipmentForm, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Pvz.: Karuselė, Melžimo sistema..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aprašymas
                </label>
                <textarea
                  value={equipmentForm.description}
                  onChange={(e) => setEquipmentForm({ ...equipmentForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Įrangos aprašymas..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kategorija
                  </label>
                  <select
                    value={equipmentForm.category}
                    onChange={(e) => setEquipmentForm({ ...equipmentForm, category: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Pasirinkite...</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vieta
                  </label>
                  <input
                    type="text"
                    value={equipmentForm.location}
                    onChange={(e) => setEquipmentForm({ ...equipmentForm, location: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Pvz.: Tvartas 1, Melžykla..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
              <button
                onClick={() => setShowEquipmentModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveEquipment}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
              >
                {editingEquipment ? 'Išsaugoti' : 'Sukurti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              {editingItem ? 'Redaguoti komponentą' : 'Naujas komponentas'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Komponento pavadinimas *
                </label>
                <input
                  type="text"
                  value={itemForm.item_name}
                  onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Pvz.: Filtrai, Paklotas, Šepečiai..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aprašymas
                </label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Komponento aprašymas..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Aptarnavimo intervalas *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={itemForm.service_interval_value}
                      onChange={(e) => setItemForm({ ...itemForm, service_interval_value: e.target.value })}
                      className="w-24 border rounded-lg px-3 py-2"
                    />
                    <select
                      value={itemForm.service_interval_type}
                      onChange={(e) => setItemForm({ ...itemForm, service_interval_type: e.target.value })}
                      className="flex-1 border rounded-lg px-3 py-2"
                    >
                      {INTERVAL_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priminimas prieš (dienomis)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={itemForm.reminder_days_before}
                    onChange={(e) => setItemForm({ ...itemForm, reminder_days_before: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paskutinis aptarnavimas
                </label>
                <input
                  type="date"
                  value={itemForm.last_service_date}
                  onChange={(e) => setItemForm({ ...itemForm, last_service_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pastabos
                </label>
                <textarea
                  value={itemForm.notes}
                  onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Papildomos pastabos..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
              <button
                onClick={() => setShowItemModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveItem}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
              >
                {editingItem ? 'Išsaugoti' : 'Sukurti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Modal */}
      {showServiceModal && servicingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 my-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Registruoti aptarnavimą
            </h3>
            
            <div className="bg-blue-50 rounded-lg p-3 mb-6">
              <p className="text-sm text-gray-600">Komponentas:</p>
              <p className="font-semibold text-gray-900">{servicingItem.item_name}</p>
              <p className="text-xs text-gray-500 mt-1">{servicingItem.equipment_name}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aptarnavimo data *
                </label>
                <input
                  type="date"
                  value={serviceForm.service_date}
                  onChange={(e) => setServiceForm({ ...serviceForm, service_date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              {/* Service Parts Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">Panaudoti produktai</h4>
                  {!showAddPartForm && (
                    <button
                      onClick={() => setShowAddPartForm(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Pridėti produktą
                    </button>
                  )}
                </div>

                {/* Add Part Form */}
                {showAddPartForm && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Produktas</label>
                      <select
                        value={partForm.product_id}
                        onChange={(e) => {
                          setPartForm({ ...partForm, product_id: e.target.value, batch_id: '' });
                          if (e.target.value) loadBatches(e.target.value);
                        }}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Pasirinkite produktą...</option>
                        {products.map((product) => (
                          <option key={product.product_id} value={product.product_id}>
                            {product.product_name} ({product.total_qty} {product.unit_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {partForm.product_id && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Partija</label>
                        <select
                          value={partForm.batch_id}
                          onChange={(e) => setPartForm({ ...partForm, batch_id: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">Pasirinkite partiją...</option>
                          {batches.map((batch) => (
                            <option key={batch.id} value={batch.id}>
                              {batch.batch_number} - Liko: {batch.qty_left}
                              {batch.expiry_date && ` (Galioja iki: ${batch.expiry_date})`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kiekis</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={partForm.quantity_used}
                        onChange={(e) => setPartForm({ ...partForm, quantity_used: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleAddPart}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        Pridėti
                      </button>
                      <button
                        onClick={() => {
                          setShowAddPartForm(false);
                          setPartForm({ product_id: '', batch_id: '', quantity_used: '1' });
                          setBatches([]);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        Atšaukti
                      </button>
                    </div>
                  </div>
                )}

                {/* Parts List */}
                {serviceParts.length > 0 && (
                  <div className="space-y-2">
                    {serviceParts.map((part, index) => (
                      <div key={index} className="flex items-center justify-between bg-white border rounded-lg p-3">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">{part.product_name}</p>
                          <p className="text-xs text-gray-500">
                            Partija: {part.batch_number} | {part.quantity_used} {part.unit_type}
                            {part.unit_price > 0 && ` | ${(parseFloat(part.quantity_used) * part.unit_price).toFixed(2)} EUR`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemovePart(index)}
                          className="ml-3 p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="text-right pt-2 border-t">
                      <p className="text-sm font-semibold text-gray-900">
                        Bendra kaina: {serviceParts.reduce((sum, part) => sum + (parseFloat(part.quantity_used) * part.unit_price), 0).toFixed(2)} EUR
                      </p>
                    </div>
                  </div>
                )}

                {serviceParts.length === 0 && !showAddPartForm && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Produktai nenaudoti
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pastabos
                </label>
                <textarea
                  value={serviceForm.notes}
                  onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Atlikti darbai ir kita informacija..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
              <button
                onClick={() => setShowServiceModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveService}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Registruoti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
