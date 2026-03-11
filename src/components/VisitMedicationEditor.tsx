import { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, Package, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { NumberInput } from './NumberInput';

interface Product {
  id: string;
  name: string;
  primary_pack_unit: string;
}

interface Batch {
  id: string;
  batch_no: string;
  available_qty: number;
  expiry_date: string;
}

interface VisitMedication {
  id: string;
  product_id: string;
  batch_id: string | null;
  qty: string;
  unit: string;
  teat: string | null;
  purpose: string;
  is_scheduled: boolean;
}

interface VisitMedicationEditorProps {
  visitId: string;
  plannedMedications: any[];
  onUpdate: (medications: VisitMedication[]) => void;
  readOnly?: boolean;
}

export function VisitMedicationEditor({
  visitId,
  plannedMedications,
  onUpdate,
  readOnly = false
}: VisitMedicationEditorProps) {
  const [medications, setMedications] = useState<VisitMedication[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Map<string, Batch[]>>(new Map());
  const [warnings, setWarnings] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadProducts();
    initializeMedications();
  }, [plannedMedications]);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .in('category', ['Vet Medicines', 'Vaccines', 'Supplements'])
      .order('name');

    if (!error && data) {
      setProducts(data);
    }
  };

  const loadBatchesForProduct = async (productId: string) => {
    if (batches.has(productId)) return;

    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('product_id', productId)
      .gt('qty_left', 0)
      .order('expiry_date', { ascending: true });

    if (data) {
      const newBatches = new Map(batches);
      newBatches.set(productId, data);
      setBatches(newBatches);
    }
  };

  const initializeMedications = async () => {
    const initialized: VisitMedication[] = await Promise.all(
      plannedMedications.map(async (pm, index) => {
        let batchId = pm.batch_id;

        if (pm.product_id) {
          await loadBatchesForProduct(pm.product_id);

          if (!batchId) {
            const { data: batchData } = await supabase
              .from('batches')
              .select('id')
              .eq('product_id', pm.product_id)
              .gt('qty_left', 0)
              .order('expiry_date', { ascending: true })
              .limit(1);

            batchId = batchData?.[0]?.id || null;
          }
        }

        return {
          id: pm.id || `med-${index}`,
          product_id: pm.product_id || '',
          batch_id: batchId,
          qty: pm.qty?.toString() || '',
          unit: pm.unit || 'ml',
          teat: pm.teat || null,
          purpose: pm.purpose || 'Gydymas',
          is_scheduled: true
        };
      })
    );
    setMedications(initialized);
  };

  const addMedication = () => {
    const newMed: VisitMedication = {
      id: crypto.randomUUID(),
      product_id: '',
      batch_id: null,
      qty: '',
      unit: 'ml',
      teat: null,
      purpose: 'Gydymas',
      is_scheduled: false
    };
    const updated = [...medications, newMed];
    setMedications(updated);
    onUpdate(updated);
  };

  const updateMedication = async (id: string, field: keyof VisitMedication, value: any) => {
    let updatedMeds = medications.map(m => {
      if (m.id === id) {
        return { ...m, [field]: value };
      }
      return m;
    });

    if (field === 'product_id' && value) {
      await loadBatchesForProduct(value);

      const { data: batchData } = await supabase
        .from('batches')
        .select('id')
        .eq('product_id', value)
        .gt('qty_left', 0)
        .order('expiry_date', { ascending: true })
        .limit(1);

      updatedMeds = updatedMeds.map(m => {
        if (m.id === id) {
          return { ...m, batch_id: batchData?.[0]?.id || null };
        }
        return m;
      });
    }

    const med = updatedMeds.find(m => m.id === id);
    if (med) {
      if (field === 'batch_id' && value) {
        validateQuantity(id, med.product_id, value, med.qty);
      }

      if (field === 'qty' && value && med.batch_id) {
        validateQuantity(id, med.product_id, med.batch_id, value);
      }
    }

    setMedications(updatedMeds);
    onUpdate(updatedMeds);
  };

  const removeMedication = (id: string) => {
    const updated = medications.filter(m => m.id !== id);
    setMedications(updated);
    onUpdate(updated);

    const newWarnings = new Map(warnings);
    newWarnings.delete(id);
    setWarnings(newWarnings);
  };

  const validateQuantity = (medId: string, productId: string, batchId: string, qty: string) => {
    const requestedQty = parseFloat(qty);
    if (isNaN(requestedQty)) return;

    const productBatches = batches.get(productId) || [];
    const totalAvailable = productBatches.reduce((sum, b) => sum + ((b as any).qty_left || 0), 0);

    const newWarnings = new Map(warnings);

    if (requestedQty > totalAvailable) {
      newWarnings.set(medId, `Nepakanka atsargų! Turima iš viso: ${totalAvailable.toFixed(2)}`);
    } else if (productBatches.length > 0) {
      const selectedBatch = productBatches.find(b => b.id === batchId);
      const batchQty = (selectedBatch as any)?.qty_left || 0;

      if (requestedQty > batchQty) {
        const batchesNeeded = productBatches.filter(b => (b as any).qty_left > 0).length;
        newWarnings.set(medId, `Bus naudojamos ${Math.min(batchesNeeded, Math.ceil(requestedQty / batchQty))} serijos (turima: ${totalAvailable.toFixed(2)})`);
      } else if (requestedQty > batchQty * 0.8) {
        newWarnings.set(medId, `Mažos atsargos. Liko serijoje: ${batchQty.toFixed(2)}`);
      } else {
        newWarnings.delete(medId);
      }
    }

    setWarnings(newWarnings);
  };

  const hasAllQuantities = () => {
    return medications.every(m => m.qty && parseFloat(m.qty) > 0);
  };

  const hasErrors = () => {
    return medications.some(m => {
      const warning = warnings.get(m.id);
      return warning && warning.includes('Nepakanka atsargų!');
    });
  };

  const getMedicationStatus = () => {
    const scheduled = medications.filter(m => m.is_scheduled).length;
    const added = medications.filter(m => !m.is_scheduled).length;
    const withQty = medications.filter(m => m.qty && parseFloat(m.qty) > 0).length;
    return { scheduled, added, total: medications.length, withQty };
  };

  const status = getMedicationStatus();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">Vaistų naudojimas</h4>
          <div className="flex items-center gap-4 mt-1 text-sm">
            <span className="text-gray-600">
              Suplanuota: <span className="font-medium text-blue-600">{status.scheduled}</span>
            </span>
            {status.added > 0 && (
              <span className="text-gray-600">
                Pridėta: <span className="font-medium text-green-600">{status.added}</span>
              </span>
            )}
            <span className="text-gray-600">
              Su kiekiu: <span className="font-medium text-purple-600">{status.withQty}/{status.total}</span>
            </span>
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={addMedication}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-green-50 text-green-700 border border-green-300 rounded-lg hover:bg-green-100"
          >
            <Plus className="w-4 h-4" />
            Pridėti vaistą
          </button>
        )}
      </div>

      {!hasAllQuantities() && !readOnly && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Reikalingas kiekio įvedimas</p>
            <p>Įveskite tikslų panaudotą kiekį kiekvienam vaistui prieš užbaigdami vizitą.</p>
          </div>
        </div>
      )}

      {hasErrors() && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-semibold">Nepakanka atsargų!</p>
            <p>Kai kuriems vaistams nepakanka atsargų. Patikrinkite kiekius.</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {medications.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nėra suplanuotų vaistų</p>
            {!readOnly && (
              <button
                onClick={addMedication}
                className="mt-3 text-green-600 hover:text-green-700 text-sm"
              >
                Pridėti vaistą
              </button>
            )}
          </div>
        ) : (
          medications.map((med) => {
            const product = products.find(p => p.id === med.product_id);
            const productBatches = med.product_id ? batches.get(med.product_id) || [] : [];
            const warning = warnings.get(med.id);
            const hasQty = med.qty && parseFloat(med.qty) > 0;

            return (
              <div
                key={med.id}
                className={`p-4 rounded-lg border-2 ${
                  med.is_scheduled
                    ? hasQty
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-blue-50 border-blue-200'
                    : hasQty
                    ? 'bg-green-50 border-green-300'
                    : 'bg-green-50 border-green-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          med.is_scheduled
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {med.is_scheduled ? 'Suplanuotas' : 'Pridėtas'}
                      </span>
                      {hasQty && (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Produktas
                        </label>
                        {readOnly || med.is_scheduled ? (
                          <div className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm">
                            {product?.name || 'Nežinomas'}
                          </div>
                        ) : (
                          <select
                            value={med.product_id}
                            onChange={(e) => updateMedication(med.id, 'product_id', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            disabled={readOnly}
                          >
                            <option value="">Pasirinkite...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Serija
                        </label>
                        <select
                          value={med.batch_id || ''}
                          onChange={(e) => updateMedication(med.id, 'batch_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          disabled={readOnly || !med.product_id}
                        >
                          <option value="">Pasirinkite...</option>
                          {productBatches.map(b => (
                            <option key={b.id} value={b.id}>
                              {(b as any).lot || (b as any).serial_number || b.id.slice(0, 8)} · Exp: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString('lt') : 'N/A'} · Likutis: {((b as any).qty_left || 0).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Kiekis *
                        </label>
                        <NumberInput
                          value={med.qty}
                          onChange={(value) => updateMedication(med.id, 'qty', value)}
                          placeholder="0.00"
                          disabled={readOnly}
                          className="w-full"
                        />
                        {warning && (
                          <p className={`text-xs mt-1 ${
                            warning.includes('Nepakanka atsargų!') ? 'text-red-600' :
                            warning.includes('Bus naudojamos') ? 'text-blue-600 font-medium' :
                            'text-amber-600'
                          }`}>
                            {warning}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Vienetas
                        </label>
                        <select
                          value={med.unit}
                          onChange={(e) => updateMedication(med.id, 'unit', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          disabled={readOnly}
                        >
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="pcs">vnt</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Spenis
                        </label>
                        <select
                          value={med.teat || ''}
                          onChange={(e) => updateMedication(med.id, 'teat', e.target.value || null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          disabled={readOnly}
                        >
                          <option value="">Nėra</option>
                          <option value="d1">D1 (Dešinė priekis)</option>
                          <option value="d2">D2 (Dešinė galas)</option>
                          <option value="k1">K1 (Kairė priekis)</option>
                          <option value="k2">K2 (Kairė galas)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Paskirtis
                        </label>
                        <input
                          type="text"
                          value={med.purpose}
                          onChange={(e) => updateMedication(med.id, 'purpose', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                  </div>

                  {!readOnly && !med.is_scheduled && (
                    <button
                      onClick={() => removeMedication(med.id)}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
