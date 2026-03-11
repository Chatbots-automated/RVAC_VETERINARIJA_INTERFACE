import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Flame, Plus, Search, AlertTriangle, Calendar, Edit, Trash2, X, Save, MapPin, Truck } from 'lucide-react';

interface FireExtinguisher {
  id: string;
  serial_number: string;
  placement_type: 'indoors' | 'transport';
  location_id: string | null;
  vehicle_id: string | null;
  capacity: string | null;
  type: string | null;
  expiry_date: string;
  last_inspection_date: string | null;
  next_inspection_date: string | null;
  status: string;
  notes: string | null;
  location?: {
    name: string;
  } | null;
  vehicle?: {
    registration_number: string;
  } | null;
}

interface FireExtinguisherForm {
  serial_number: string;
  placement_type: 'indoors' | 'transport';
  location_id: string;
  vehicle_id: string;
  capacity: string;
  type: string;
  expiry_date: string;
  last_inspection_date: string;
  next_inspection_date: string;
  status: string;
  notes: string;
}

interface Location {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  registration_number: string;
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colorClasses: any = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export function FireExtinguishersManagement() {
  const { user, logAction } = useAuth();
  const [extinguishers, setExtinguishers] = useState<FireExtinguisher[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlacement, setFilterPlacement] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingExtinguisher, setEditingExtinguisher] = useState<FireExtinguisher | null>(null);
  const [form, setForm] = useState<FireExtinguisherForm>({
    serial_number: '',
    placement_type: 'indoors',
    location_id: '',
    vehicle_id: '',
    capacity: '',
    type: '',
    expiry_date: '',
    last_inspection_date: '',
    next_inspection_date: '',
    status: 'active',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [extinguishersRes, locationsRes, vehiclesRes] = await Promise.all([
      supabase
        .from('fire_extinguishers')
        .select(`
          *,
          location:equipment_locations(name),
          vehicle:vehicles(registration_number)
        `)
        .eq('is_active', true)
        .order('serial_number'),
      supabase
        .from('equipment_locations')
        .select('id, name')
        .order('name'),
      supabase
        .from('vehicles')
        .select('id, registration_number')
        .eq('is_active', true)
        .order('registration_number'),
    ]);

    if (extinguishersRes.data) setExtinguishers(extinguishersRes.data as any);
    if (locationsRes.data) setLocations(locationsRes.data);
    if (vehiclesRes.data) setVehicles(vehiclesRes.data);
  };

  const handleOpenModal = (extinguisher?: FireExtinguisher) => {
    if (extinguisher) {
      setEditingExtinguisher(extinguisher);
      setForm({
        serial_number: extinguisher.serial_number,
        placement_type: extinguisher.placement_type,
        location_id: extinguisher.location_id || '',
        vehicle_id: extinguisher.vehicle_id || '',
        capacity: extinguisher.capacity || '',
        type: extinguisher.type || '',
        expiry_date: extinguisher.expiry_date,
        last_inspection_date: extinguisher.last_inspection_date || '',
        next_inspection_date: extinguisher.next_inspection_date || '',
        status: extinguisher.status,
        notes: extinguisher.notes || '',
      });
    } else {
      setEditingExtinguisher(null);
      setForm({
        serial_number: '',
        placement_type: 'indoors',
        location_id: '',
        vehicle_id: '',
        capacity: '',
        type: '',
        expiry_date: '',
        last_inspection_date: '',
        next_inspection_date: '',
        status: 'active',
        notes: '',
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.serial_number || !form.expiry_date) {
      alert('Prašome užpildyti privalomas laukas (Serijinis numeris, Galiojimo data)');
      return;
    }

    if (form.placement_type === 'indoors' && !form.location_id) {
      alert('Pasirinkite vietą patalpoms');
      return;
    }

    if (form.placement_type === 'transport' && !form.vehicle_id) {
      alert('Pasirinkite transporto priemonę');
      return;
    }

    try {
      const data: any = {
        serial_number: form.serial_number.toUpperCase(),
        placement_type: form.placement_type,
        location_id: form.placement_type === 'indoors' ? form.location_id : null,
        vehicle_id: form.placement_type === 'transport' ? form.vehicle_id : null,
        capacity: form.capacity || null,
        type: form.type || null,
        expiry_date: form.expiry_date,
        last_inspection_date: form.last_inspection_date || null,
        next_inspection_date: form.next_inspection_date || null,
        status: form.status,
        notes: form.notes || null,
      };

      if (editingExtinguisher) {
        const { error } = await supabase
          .from('fire_extinguishers')
          .update(data)
          .eq('id', editingExtinguisher.id);

        if (error) throw error;
        await logAction('update_fire_extinguisher', 'fire_extinguishers', editingExtinguisher.id);
        alert('Gesintuvas sėkmingai atnaujintas');
      } else {
        const { data: newData, error } = await supabase
          .from('fire_extinguishers')
          .insert({ ...data, created_by: user?.id || null })
          .select()
          .single();

        if (error) throw error;
        await logAction('create_fire_extinguisher', 'fire_extinguishers', newData.id);
        alert('Gesintuvas sėkmingai sukurtas');
      }

      setShowModal(false);
      setEditingExtinguisher(null);
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleDelete = async (extinguisher: FireExtinguisher) => {
    if (!confirm(`Ar tikrai norite ištrinti gesintuvą ${extinguisher.serial_number}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('fire_extinguishers')
        .update({ is_active: false })
        .eq('id', extinguisher.id);

      if (error) throw error;
      await logAction('delete_fire_extinguisher', 'fire_extinguishers', extinguisher.id);
      alert('Gesintuvas ištrintas');
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const filteredExtinguishers = extinguishers.filter(ext => {
    const matchesSearch =
      ext.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ext.capacity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ext.type?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPlacement = filterPlacement === 'all' || ext.placement_type === filterPlacement;
    const matchesStatus = filterStatus === 'all' || ext.status === filterStatus;

    return matchesSearch && matchesPlacement && matchesStatus;
  });

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const daysUntil = Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 30 && daysUntil >= 0;
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const statusLabels: any = {
    active: 'Aktyvus',
    expired: 'Pasibaigęs',
    in_service: 'Aptarnavime',
    retired: 'Išbrauktas',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800">Gesintuvai</h3>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Pridėti gesintuvą
          </button>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Ieškoti pagal serijinį numerį, talpą..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </div>
          <select
            value={filterPlacement}
            onChange={e => setFilterPlacement(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
          >
            <option value="all">Visi tipai</option>
            <option value="indoors">Patalpose</option>
            <option value="transport">Transporte</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
          >
            <option value="all">Visi statusai</option>
            <option value="active">Aktyvūs</option>
            <option value="expired">Pasibaigę</option>
            <option value="in_service">Aptarnavime</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExtinguishers.map(ext => {
            const expiring = isExpiringSoon(ext.expiry_date);
            const expired = isExpired(ext.expiry_date);
            const hasWarnings = expiring || expired;

            return (
              <div
                key={ext.id}
                className={`border rounded-lg p-4 ${
                  hasWarnings ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-red-600" />
                    <span className="font-bold text-gray-800">{ext.serial_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ext.placement_type === 'indoors' ? (
                      <MapPin className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Truck className="w-4 h-4 text-green-600" />
                    )}
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        ext.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : ext.status === 'expired'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {statusLabels[ext.status] || ext.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm mb-3">
                  {ext.capacity && (
                    <p className="text-gray-600">
                      <span className="font-medium">Talpa:</span> {ext.capacity}
                    </p>
                  )}
                  {ext.type && (
                    <p className="text-gray-600">
                      <span className="font-medium">Tipas:</span> {ext.type}
                    </p>
                  )}
                  {ext.placement_type === 'indoors' && ext.location && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{ext.location.name}</span>
                    </div>
                  )}
                  {ext.placement_type === 'transport' && ext.vehicle && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Truck className="w-4 h-4" />
                      <span>{ext.vehicle.registration_number}</span>
                    </div>
                  )}
                  <div className={`flex items-center gap-2 ${expired ? 'text-red-600' : expiring ? 'text-amber-600' : 'text-gray-600'}`}>
                    <Calendar className="w-4 h-4" />
                    <span>Galioja iki: {ext.expiry_date}</span>
                  </div>
                  {ext.next_inspection_date && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Kitas patikrinimas: {ext.next_inspection_date}</span>
                    </div>
                  )}
                </div>

                {hasWarnings && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded-lg mb-3">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{expired ? 'Galiojimas pasibaigęs!' : 'Galiojimas baigiasi netrukus'}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(ext)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Redaguoti
                  </button>
                  <button
                    onClick={() => handleDelete(ext)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredExtinguishers.length === 0 && (
          <div className="text-center py-12">
            <Flame className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Gesintuvų nerasta</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Viso gesintuvų" value={extinguishers.length.toString()} color="blue" />
        <StatCard
          title="Patalpose"
          value={extinguishers.filter(e => e.placement_type === 'indoors').length.toString()}
          color="green"
        />
        <StatCard
          title="Transporte"
          value={extinguishers.filter(e => e.placement_type === 'transport').length.toString()}
          color="amber"
        />
        <StatCard
          title="Reikia dėmesio"
          value={extinguishers.filter(e => isExpiringSoon(e.expiry_date) || isExpired(e.expiry_date)).length.toString()}
          color="red"
        />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                {editingExtinguisher ? 'Redaguoti gesintuvą' : 'Naujas gesintuvas'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Serijinis numeris *</label>
                <input
                  type="text"
                  value={form.serial_number}
                  onChange={e => setForm({ ...form, serial_number: e.target.value })}
                  className="w-full border rounded px-3 py-2 uppercase"
                  placeholder="GE-001"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Vieta *</label>
                <select
                  value={form.placement_type}
                  onChange={e => {
                    setForm({
                      ...form,
                      placement_type: e.target.value as 'indoors' | 'transport',
                      location_id: '',
                      vehicle_id: '',
                    });
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="indoors">Patalpose</option>
                  <option value="transport">Transporte</option>
                </select>
              </div>

              {form.placement_type === 'indoors' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vieta *</label>
                  <select
                    value={form.location_id}
                    onChange={e => setForm({ ...form, location_id: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Pasirinkite vietą</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.placement_type === 'transport' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transporto priemonė *</label>
                  <select
                    value={form.vehicle_id}
                    onChange={e => setForm({ ...form, vehicle_id: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Pasirinkite transportą</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.registration_number}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Talpa</label>
                <input
                  type="text"
                  value={form.capacity}
                  onChange={e => setForm({ ...form, capacity: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="2kg, 5kg, 10kg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipas</label>
                <input
                  type="text"
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="ABC, CO2, Foam"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Galiojimo data *</label>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paskutinis patikrinimas</label>
                <input
                  type="date"
                  value={form.last_inspection_date}
                  onChange={e => setForm({ ...form, last_inspection_date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kitas patikrinimas</label>
                <input
                  type="date"
                  value={form.next_inspection_date}
                  onChange={e => setForm({ ...form, next_inspection_date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statusas</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="active">Aktyvus</option>
                  <option value="expired">Pasibaigęs</option>
                  <option value="in_service">Aptarnavime</option>
                  <option value="retired">Išbrauktas</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
              >
                <Save className="w-4 h-4" />
                {editingExtinguisher ? 'Išsaugoti' : 'Sukurti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
