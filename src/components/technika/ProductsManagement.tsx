import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Package, Plus, Edit2, Trash2, Search, X, Filter } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  product_code: string;
  category_id: string;
  unit_type: string;
  manufacturer: string;
  model_number: string;
  description: string;
  min_stock_level: number;
  is_active: boolean;
  created_at: string;
  default_location_type?: string;
  category?: { name: string };
}

interface Category {
  id: string;
  name: string;
  description: string;
}

const UNIT_TYPES = [
  { value: 'pcs', label: 'vnt (vienetai)' },
  { value: 'kg', label: 'kg (kilogramai)' },
  { value: 'l', label: 'l (litrai)' },
  { value: 'm', label: 'm (metrai)' },
  { value: 'm2', label: 'm² (kvadratiniai metrai)' },
  { value: 'm3', label: 'm³ (kubiniai metrai)' },
  { value: 'box', label: 'dėžė' },
  { value: 'set', label: 'komplektas' },
  { value: 'roll', label: 'ritinys' },
  { value: 'pair', label: 'pora' },
];

interface ProductsManagementProps {
  locationFilter?: 'farm' | 'warehouse';
  workerMode?: boolean;
}

export function ProductsManagement({ locationFilter, workerMode = false }: ProductsManagementProps = {}) {
  const { logAction } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterActive, setFilterActive] = useState('active');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    product_code: '',
    category_id: '',
    unit_type: 'pcs',
    manufacturer: '',
    model_number: '',
    description: '',
    min_stock_level: '0',
    default_location: 'warehouse', // 'farm' or 'warehouse'
  });

  useEffect(() => {
    loadData();
  }, [locationFilter]); // Reload when locationFilter changes

  const loadData = async () => {
    // Build query with server-side filtering
    let productsQuery = supabase
      .from('equipment_products')
      .select('*')
      .order('name');

    // Apply location filter at database level if provided
    if (locationFilter) {
      productsQuery = productsQuery.eq('default_location_type', locationFilter);
    }

    const [productsRes, categoriesRes] = await Promise.all([
      productsQuery,
      supabase.from('equipment_categories').select('*').order('name'),
    ]);

    if (productsRes.data) {
      const productsWithCategories = await Promise.all(
        productsRes.data.map(async (product: any) => {
          if (product.category_id) {
            const { data: category } = await supabase
              .from('equipment_categories')
              .select('name')
              .eq('id', product.category_id)
              .maybeSingle();
            return { ...product, category };
          }
          return product;
        })
      );
      
      setProducts(productsWithCategories);
    }
    if (categoriesRes.data) setCategories(categoriesRes.data);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch =
      searchTerm === '' ||
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = filterCategory === 'all' || product.category_id === filterCategory;

    const matchesActive =
      filterActive === 'all' ||
      (filterActive === 'active' && product.is_active) ||
      (filterActive === 'inactive' && !product.is_active);

    // Location filtering is now done at database level, no need to filter here
    return matchesSearch && matchesCategory && matchesActive;
  });

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.unit_type) {
      alert('Prašome užpildyti pavadinimą ir matavimo vienetą');
      return;
    }

    try {
      const productData = {
        name: productForm.name,
        product_code: productForm.product_code || null,
        category_id: productForm.category_id || null,
        unit_type: productForm.unit_type,
        manufacturer: productForm.manufacturer || null,
        model_number: productForm.model_number || null,
        description: productForm.description || null,
        min_stock_level: parseFloat(productForm.min_stock_level) || 0,
        is_active: true,
        default_location_type: productForm.default_location,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('equipment_products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        await logAction('update_equipment_product', { product_id: editingProduct.id });
        alert('Produktas atnaujintas');
      } else {
        const { error } = await supabase.from('equipment_products').insert(productData);

        if (error) throw error;
        await logAction('add_equipment_product', { product_name: productForm.name });
        alert('Produktas pridėtas');
      }

      setShowAddModal(false);
      setEditingProduct(null);
      setProductForm({
        name: '',
        product_code: '',
        category_id: '',
        unit_type: 'pcs',
        manufacturer: '',
        model_number: '',
        description: '',
        min_stock_level: '0',
        default_location: 'warehouse',
      });
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('equipment_products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;

      await logAction('toggle_product_status', {
        product_id: product.id,
        new_status: !product.is_active ? 'active' : 'inactive',
      });
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Ar tikrai norite ištrinti produktą "${product.name}"?`)) return;

    try {
      const { error } = await supabase.from('equipment_products').delete().eq('id', product.id);

      if (error) throw error;

      await logAction('delete_equipment_product', { product_id: product.id, product_name: product.name });
      loadData();
      alert('Produktas ištrintas');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Package className="w-6 h-6 text-slate-600" />
            <h3 className="text-xl font-bold text-gray-800">Produktų valdymas</h3>
          </div>
          {!workerMode && (
            <button
              onClick={() => {
                setEditingProduct(null);
                setProductForm({
                  name: '',
                  product_code: '',
                  category_id: '',
                  unit_type: 'pcs',
                  manufacturer: '',
                  model_number: '',
                  description: '',
                  min_stock_level: '0',
                  default_location: 'warehouse',
                });
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Pridėti produktą
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Ieškoti produktų..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            />
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            <option value="all">Visos kategorijos</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            <option value="all">Visi produktai</option>
            <option value="active">Aktyvūs</option>
            <option value="inactive">Neaktyvūs</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-4 font-semibold text-gray-700">Pavadinimas</th>
                <th className="text-left p-4 font-semibold text-gray-700">Kodas</th>
                <th className="text-left p-4 font-semibold text-gray-700">Kategorija</th>
                <th className="text-left p-4 font-semibold text-gray-700">Gamintojas</th>
                <th className="text-left p-4 font-semibold text-gray-700">Vienetas</th>
                <th className="text-left p-4 font-semibold text-gray-700">Min. lygis</th>
                <th className="text-left p-4 font-semibold text-gray-700">Statusas</th>
                {!workerMode && <th className="text-right p-4 font-semibold text-gray-700">Veiksmai</th>}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4">
                    <div className="font-medium text-gray-900">{product.name}</div>
                    {product.model_number && (
                      <div className="text-sm text-gray-500">Model: {product.model_number}</div>
                    )}
                  </td>
                  <td className="p-4 text-gray-700 font-mono text-sm">
                    {product.product_code || '-'}
                  </td>
                  <td className="p-4 text-gray-700">
                    {product.category?.name || '-'}
                  </td>
                  <td className="p-4 text-gray-700">
                    {product.manufacturer || '-'}
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                      {UNIT_TYPES.find(u => u.value === product.unit_type)?.label || product.unit_type}
                    </span>
                  </td>
                  <td className="p-4 text-gray-700">
                    {product.min_stock_level}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleToggleActive(product)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        product.is_active
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {product.is_active ? 'Aktyvus' : 'Neaktyvus'}
                    </button>
                  </td>
                  {!workerMode && (
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setProductForm({
                              name: product.name,
                              product_code: product.product_code || '',
                              category_id: product.category_id || '',
                              unit_type: product.unit_type,
                              manufacturer: product.manufacturer || '',
                              model_number: product.model_number || '',
                              description: product.description || '',
                              min_stock_level: product.min_stock_level.toString(),
                              default_location: product.default_location_type || 'warehouse',
                            });
                            setShowAddModal(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Redaguoti"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Ištrinti"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Produktų nerasta</p>
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Rodoma: {filteredProducts.length} iš {products.length} produktų
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                {editingProduct ? 'Redaguoti produktą' : 'Pridėti produktą'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingProduct(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pavadinimas *
                </label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Produkto pavadinimas"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Produkto kodas
                </label>
                <input
                  type="text"
                  value={productForm.product_code}
                  onChange={(e) => setProductForm({ ...productForm, product_code: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="SKU / Kodas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategorija
                </label>
                <select
                  value={productForm.category_id}
                  onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Pasirinkite kategoriją</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Show location field only for Drabužiai or API categories */}
              {productForm.category_id && categories.find(c => c.id === productForm.category_id)?.name && 
               (categories.find(c => c.id === productForm.category_id)?.name.toLowerCase().includes('drabužiai') ||
                categories.find(c => c.id === productForm.category_id)?.name.toLowerCase().includes('api')) && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paskirtis *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="location"
                        value="farm"
                        checked={productForm.default_location === 'farm'}
                        onChange={(e) => setProductForm({ ...productForm, default_location: e.target.value })}
                        className="w-4 h-4"
                      />
                      <span className="text-gray-700">Ferma</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="location"
                        value="warehouse"
                        checked={productForm.default_location === 'warehouse'}
                        onChange={(e) => setProductForm({ ...productForm, default_location: e.target.value })}
                        className="w-4 h-4"
                      />
                      <span className="text-gray-700">Dirbtuvės / Sandėlis</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matavimo vienetas *
                </label>
                <select
                  value={productForm.unit_type}
                  onChange={(e) => setProductForm({ ...productForm, unit_type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                >
                  {UNIT_TYPES.map(unit => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gamintojas
                </label>
                <input
                  type="text"
                  value={productForm.manufacturer}
                  onChange={(e) => setProductForm({ ...productForm, manufacturer: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Gamintojo pavadinimas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modelio numeris
                </label>
                <input
                  type="text"
                  value={productForm.model_number}
                  onChange={(e) => setProductForm({ ...productForm, model_number: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Modelio / serijos numeris"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimalus atsargų lygis
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.min_stock_level}
                  onChange={(e) => setProductForm({ ...productForm, min_stock_level: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aprašymas
                </label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Papildoma informacija apie produktą..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingProduct(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveProduct}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                {editingProduct ? 'Atnaujinti' : 'Pridėti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
