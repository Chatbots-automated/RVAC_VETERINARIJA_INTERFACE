import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Heart, Package } from 'lucide-react';
import { InseminationProduct, Animal } from '../lib/types';
import { formatAnimalDisplay } from '../lib/helpers';

interface InseminationModalProps {
  animal: Animal;
  syncStepId: string;
  scheduledDate: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductWithStock extends InseminationProduct {
  total_stock: number;
}

export function InseminationModal({
  animal,
  syncStepId,
  scheduledDate,
  onClose,
  onSuccess
}: InseminationModalProps) {
  const [spermProducts, setSpermProducts] = useState<ProductWithStock[]>([]);
  const [gloveProducts, setGloveProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    sperm_product_id: '',
    sperm_quantity: 1,
    glove_product_id: '',
    glove_quantity: 1,
    notes: '',
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data: productsData } = await supabase
        .from('insemination_products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (productsData) {
        const { data: inventoryData } = await supabase
          .from('insemination_inventory')
          .select('product_id, quantity');

        const stockMap = new Map<string, number>();
        inventoryData?.forEach(inv => {
          const currentStock = stockMap.get(inv.product_id) || 0;
          stockMap.set(inv.product_id, currentStock + inv.quantity);
        });

        const productsWithStock = productsData.map(product => ({
          ...product,
          total_stock: stockMap.get(product.id) || 0
        }));

        const sperm = productsWithStock.filter(p => p.product_type === 'SPERM');
        const gloves = productsWithStock.filter(p => p.product_type === 'GLOVES');

        setSpermProducts(sperm);
        setGloveProducts(gloves);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: recordData, error: recordError } = await supabase
        .from('insemination_records')
        .insert({
          sync_step_id: syncStepId,
          animal_id: animal.id,
          insemination_date: scheduledDate,
          sperm_product_id: formData.sperm_product_id,
          sperm_quantity: formData.sperm_quantity,
          glove_product_id: formData.glove_product_id,
          glove_quantity: formData.glove_quantity,
          notes: formData.notes || null,
        })
        .select()
        .single();

      if (recordError) throw recordError;

      const { error: stepError } = await supabase
        .from('synchronization_steps')
        .update({
          completed: true,
          completed_at: new Date().toISOString()
        })
        .eq('id', syncStepId);

      if (stepError) throw stepError;

      alert('Sėklinimas sėkmingai įrašytas!');
      onSuccess();
    } catch (error) {
      console.error('Error creating insemination record:', error);
      alert('Klaida kuriant sėklinimo įrašą');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSpermProduct = spermProducts.find(p => p.id === formData.sperm_product_id);
  const selectedGloveProduct = gloveProducts.find(p => p.id === formData.glove_product_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Heart className="w-7 h-7 text-rose-600" />
                Sėklinimo įrašas
              </h2>
              <p className="text-gray-600 mt-1">
                Gyvūnas: <span className="font-semibold">{formatAnimalDisplay(animal)}</span>
              </p>
              <p className="text-sm text-gray-500">
                Data: {new Date(scheduledDate).toLocaleDateString('lt-LT')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Kraunami produktai...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <h3 className="font-semibold text-rose-900 mb-3 flex items-center gap-2">
                <Heart className="w-5 h-5" />
                Sperma *
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pasirinkite spermą
                  </label>
                  <select
                    required
                    value={formData.sperm_product_id}
                    onChange={(e) => setFormData({ ...formData, sperm_product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                  >
                    <option value="">-- Pasirinkite --</option>
                    {spermProducts.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSpermProduct && (
                  <>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-rose-200">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-rose-600" />
                        <span className="text-sm font-medium text-gray-700">Likutis:</span>
                      </div>
                      <span className={`font-bold ${selectedSpermProduct.total_stock < 5 ? 'text-red-600' : 'text-green-600'}`}>
                        {selectedSpermProduct.total_stock} {selectedSpermProduct.unit}
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kiekis *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          required
                          min="0.1"
                          step="0.1"
                          max={selectedSpermProduct.total_stock}
                          value={formData.sperm_quantity}
                          onChange={(e) => setFormData({ ...formData, sperm_quantity: parseFloat(e.target.value) })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                        />
                        <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg flex items-center">
                          <span className="font-medium text-gray-700">{selectedSpermProduct.unit}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Pirštinės *
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pasirinkite pirštines
                  </label>
                  <select
                    required
                    value={formData.glove_product_id}
                    onChange={(e) => setFormData({ ...formData, glove_product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Pasirinkite --</option>
                    {gloveProducts.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedGloveProduct && (
                  <>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">Likutis:</span>
                      </div>
                      <span className={`font-bold ${selectedGloveProduct.total_stock < 10 ? 'text-red-600' : 'text-green-600'}`}>
                        {selectedGloveProduct.total_stock} {selectedGloveProduct.unit}
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kiekis *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          required
                          min="1"
                          step="1"
                          max={selectedGloveProduct.total_stock}
                          value={formData.glove_quantity}
                          onChange={(e) => setFormData({ ...formData, glove_quantity: parseInt(e.target.value) || 1 })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg flex items-center">
                          <span className="font-medium text-gray-700">{selectedGloveProduct.unit}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pastabos
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                placeholder="Papildoma informacija..."
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={submitting || !formData.sperm_product_id || !formData.glove_product_id}
                className="flex-1 bg-rose-600 text-white px-4 py-3 rounded-lg hover:bg-rose-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Įrašoma...' : 'Įrašyti sėklinimą'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50 transition-colors"
              >
                Atšaukti
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
