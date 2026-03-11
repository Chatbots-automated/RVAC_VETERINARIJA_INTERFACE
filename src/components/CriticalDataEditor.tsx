import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Calendar, Edit2, Save, X, AlertCircle, Check } from 'lucide-react';
import { formatDateLT } from '../lib/formatters';

interface Treatment {
  id: string;
  reg_date: string;
  first_symptoms_date: string | null;
  withdrawal_until_meat: string | null;
  withdrawal_until_milk: string | null;
  animal_id: string;
  disease_id: string | null;
  clinical_diagnosis: string | null;
  vet_name: string | null;
  notes: string | null;
  created_at: string;
}

interface TreatmentWithAnimal extends Treatment {
  animal_tag: string;
  species: string;
  holder_name: string | null;
  disease_name: string | null;
  products_used: any[];
}

export function CriticalDataEditor() {
  const { user, logAction } = useAuth();
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [treatments, setTreatments] = useState<TreatmentWithAnimal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [editForm, setEditForm] = useState({
    reg_date: '',
    first_symptoms_date: '',
    withdrawal_until_meat: '',
    withdrawal_until_milk: '',
    internal_notes: '',
  });

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!user?.email) {
      setAuthError('Vartotojas nerastas');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('verify_password', {
        p_email: user.email,
        p_password: password,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        setAuthError('Neteisingas slaptažodis');
        return;
      }

      setAuthenticated(true);
      setPassword('');

      await logAction('access_critical_editor', null, null, null, {
        user_email: user.email,
        access_time: new Date().toISOString(),
      });
    } catch (error: any) {
      setAuthError('Autentifikavimo klaida');
      console.error('Auth error:', error);
    }
  };

  const loadTreatments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('treatments')
        .select(`
          *,
          animals!inner(tag_no, species, holder_name),
          diseases(name)
        `)
        .order('reg_date', { ascending: false });

      if (dateFrom) {
        query = query.gte('reg_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('reg_date', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      const treatmentsWithProducts = await Promise.all(
        (data || []).map(async (treatment: any) => {
          const { data: usageItems } = await supabase
            .from('usage_items')
            .select(`
              qty,
              unit,
              products(name, withdrawal_days)
            `)
            .eq('treatment_id', treatment.id);

          return {
            id: treatment.id,
            reg_date: treatment.reg_date,
            first_symptoms_date: treatment.first_symptoms_date,
            withdrawal_until_meat: treatment.withdrawal_until_meat,
            withdrawal_until_milk: treatment.withdrawal_until_milk,
            animal_id: treatment.animal_id,
            disease_id: treatment.disease_id,
            clinical_diagnosis: treatment.clinical_diagnosis,
            vet_name: treatment.vet_name,
            notes: treatment.notes,
            created_at: treatment.created_at,
            animal_tag: treatment.animals.tag_no,
            species: treatment.animals.species,
            holder_name: treatment.animals.holder_name,
            disease_name: treatment.diseases?.name || null,
            products_used: usageItems || [],
          };
        })
      );

      const filtered = treatmentsWithProducts.filter((t) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
          t.animal_tag?.toLowerCase().includes(search) ||
          t.holder_name?.toLowerCase().includes(search) ||
          t.disease_name?.toLowerCase().includes(search)
        );
      });

      setTreatments(filtered);
    } catch (error) {
      console.error('Error loading treatments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      loadTreatments();
    }
  }, [authenticated, dateFrom, dateTo]);

  useEffect(() => {
    if (authenticated && searchTerm !== undefined) {
      const timer = setTimeout(() => {
        loadTreatments();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchTerm]);

  const handleEdit = (treatment: TreatmentWithAnimal) => {
    setEditingId(treatment.id);
    setEditForm({
      reg_date: treatment.reg_date || '',
      first_symptoms_date: treatment.first_symptoms_date || '',
      withdrawal_until_meat: treatment.withdrawal_until_meat || '',
      withdrawal_until_milk: treatment.withdrawal_until_milk || '',
      internal_notes: '',
    });
    setSuccessMessage('');
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({
      reg_date: '',
      first_symptoms_date: '',
      withdrawal_until_meat: '',
      withdrawal_until_milk: '',
      internal_notes: '',
    });
  };

  const handleSave = async () => {
    if (!editingId) return;

    const treatment = treatments.find((t) => t.id === editingId);
    if (!treatment) return;

    const confirmMessage = `Ar tikrai norite pakeisti šio gydymo datas?\n\nGyvūnas: ${treatment.animal_tag}\nLiga: ${treatment.disease_name || 'N/A'}\n\nNaujos datos bus išsaugotos be galimybės atkurti.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setSaving(true);
    try {
      const oldData = {
        reg_date: treatment.reg_date,
        first_symptoms_date: treatment.first_symptoms_date,
        withdrawal_until_meat: treatment.withdrawal_until_meat,
        withdrawal_until_milk: treatment.withdrawal_until_milk,
      };

      const newData = {
        reg_date: editForm.reg_date || null,
        first_symptoms_date: editForm.first_symptoms_date || null,
        withdrawal_until_meat: editForm.withdrawal_until_meat || null,
        withdrawal_until_milk: editForm.withdrawal_until_milk || null,
      };

      const { error } = await supabase
        .from('treatments')
        .update(newData)
        .eq('id', editingId);

      if (error) throw error;

      await logAction(
        'critical_data_edit',
        'treatments',
        editingId,
        oldData,
        {
          ...newData,
          animal_tag: treatment.animal_tag,
          disease_name: treatment.disease_name,
          internal_notes: editForm.internal_notes || null,
          edited_by: user?.email,
        }
      );

      setSuccessMessage('Duomenys sėkmingai atnaujinti');
      setEditingId(null);
      await loadTreatments();

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      alert('Klaida išsaugant: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getDaysUntil = (date: string | null) => {
    if (!date) return null;
    const target = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getWithdrawalStatus = (meatDate: string | null, milkDate: string | null) => {
    const meatDays = getDaysUntil(meatDate);
    const milkDays = getDaysUntil(milkDate);

    const maxDays = Math.max(meatDays || -1, milkDays || -1);

    if (maxDays < 0) return { text: 'Laisvas', color: 'text-green-600 bg-green-50' };
    if (maxDays === 0) return { text: 'Baigiasi šiandien', color: 'text-orange-600 bg-orange-50' };
    if (maxDays <= 3) return { text: `Liko ${maxDays} d.`, color: 'text-orange-600 bg-orange-50' };
    return { text: `Liko ${maxDays} d.`, color: 'text-blue-600 bg-blue-50' };
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-amber-100 p-3 rounded-full">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
            ŽURNALAS
          </h2>
          <p className="text-gray-600 text-center mb-6">
            Įveskite savo slaptažodį norėdami tęsti
          </p>
          <form onSubmit={handleAuthenticate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Slaptažodis
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>
            {authError && (
              <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
                {authError}
              </div>
            )}
            <button
              type="submit"
              className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
            >
              Autentifikuoti
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 mb-1">
              Kritinių duomenų redagavimas
            </h3>
            <p className="text-sm text-amber-800">
              Ši funkcija leidžia redaguoti gydymų datas. Visi pakeitimai yra registruojami audito žurnale.
              Naudokite atsakingai ir tik būtinais atvejais.
            </p>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-green-800 font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ieškoti pagal gyvūną, savininką..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Data nuo"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Data iki"
            />
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          Rasta gydymų: <span className="font-semibold text-gray-900">{treatments.length}</span>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : treatments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Gydymų nerasta. Pakeiskite paieškos parametrus.
          </div>
        ) : (
          <div className="space-y-4">
            {treatments.map((treatment) => {
              const isEditing = editingId === treatment.id;
              const status = getWithdrawalStatus(
                isEditing ? editForm.withdrawal_until_meat || null : treatment.withdrawal_until_meat,
                isEditing ? editForm.withdrawal_until_milk || null : treatment.withdrawal_until_milk
              );

              return (
                <div
                  key={treatment.id}
                  className="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          {treatment.animal_tag}
                        </h3>
                        <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                          {treatment.species}
                        </span>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        {treatment.disease_name && (
                          <div>
                            <span className="font-medium">Liga:</span> {treatment.disease_name}
                          </div>
                        )}
                        {treatment.holder_name && (
                          <div>
                            <span className="font-medium">Savininkas:</span> {treatment.holder_name}
                          </div>
                        )}
                        {treatment.vet_name && (
                          <div>
                            <span className="font-medium">Veterinaras:</span> {treatment.vet_name}
                          </div>
                        )}
                      </div>
                    </div>
                    {!isEditing && (
                      <button
                        onClick={() => handleEdit(treatment)}
                        className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        Redaguoti
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-4 mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Registracijos data
                          </label>
                          <input
                            type="date"
                            value={editForm.reg_date}
                            onChange={(e) => setEditForm({ ...editForm, reg_date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Pirmųjų simptomų data
                          </label>
                          <input
                            type="date"
                            value={editForm.first_symptoms_date}
                            onChange={(e) => setEditForm({ ...editForm, first_symptoms_date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Karencija mėsai iki
                          </label>
                          <input
                            type="date"
                            value={editForm.withdrawal_until_meat}
                            onChange={(e) => setEditForm({ ...editForm, withdrawal_until_meat: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Karencija pienui iki
                          </label>
                          <input
                            type="date"
                            value={editForm.withdrawal_until_milk}
                            onChange={(e) => setEditForm({ ...editForm, withdrawal_until_milk: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Vidinė pastaba (neprivaloma)
                          </label>
                          <textarea
                            value={editForm.internal_notes}
                            onChange={(e) => setEditForm({ ...editForm, internal_notes: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={2}
                            placeholder="Priežastis ar pastabos..."
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={handleCancel}
                          className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Atšaukti
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          {saving ? 'Išsaugoma...' : 'Išsaugoti'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-200">
                      <div className="text-sm">
                        <span className="text-gray-600">Reg. data:</span>
                        <div className="font-medium text-gray-900">
                          {treatment.reg_date ? formatDateLT(treatment.reg_date) : 'N/A'}
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">Simptomai:</span>
                        <div className="font-medium text-gray-900">
                          {treatment.first_symptoms_date ? formatDateLT(treatment.first_symptoms_date) : 'N/A'}
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">Mėsa iki:</span>
                        <div className="font-medium text-gray-900">
                          {treatment.withdrawal_until_meat ? formatDateLT(treatment.withdrawal_until_meat) : 'N/A'}
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">Pienas iki:</span>
                        <div className="font-medium text-gray-900">
                          {treatment.withdrawal_until_milk ? formatDateLT(treatment.withdrawal_until_milk) : 'N/A'}
                        </div>
                      </div>
                    </div>
                  )}

                  {treatment.products_used.length > 0 && !isEditing && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs font-medium text-gray-700 mb-2">Panaudoti produktai:</div>
                      <div className="flex flex-wrap gap-2">
                        {treatment.products_used.map((item: any, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium"
                          >
                            {item.products?.name || 'N/A'}
                            {item.products?.withdrawal_days && ` (${item.products.withdrawal_days}d)`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
