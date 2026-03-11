import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { HardHat, Plus, Search, User, Package } from 'lucide-react';

interface PPEItem {
  product_id: string;
  product_name: string;
  product_code: string;
  unit_type: string;
  category_name: string;
  total_qty: number;
  total_value: number;
  batch_count: number;
}

interface PPEIssuance {
  issuance_id: string;
  issuance_number: string;
  issued_to: string;
  issued_to_name: string;
  issue_date: string;
  expected_return_date: string;
  status: string;
  product_name: string;
  unit_type: string;
  quantity_issued: number;
  quantity_returned: number;
  quantity_outstanding: number;
  value_outstanding: number;
}

interface Employee {
  id: string;
  full_name: string;
}

interface PPEManagementProps {
  locationFilter?: 'farm' | 'warehouse';
}

export function PPEManagement({ locationFilter }: PPEManagementProps = {}) {
  const { user, logAction } = useAuth();
  const [items, setItems] = useState<PPEItem[]>([]);
  const [issuances, setIssuances] = useState<PPEIssuance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);
  const [currentView, setCurrentView] = useState<'farm' | 'warehouse'>(locationFilter || 'farm');
  const [issueForm, setIssueForm] = useState({
    product_id: '',
    batch_id: '',
    employee_id: '',
    quantity_issued: '1',
    issue_date: new Date().toISOString().split('T')[0],
    expected_return_date: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [currentView, locationFilter]);

  const loadData = async () => {
    // Determine which location to filter by
    const viewToUse = locationFilter || currentView;

    // Load batches with product location filtering
    const batchesQuery = supabase
      .from('equipment_batches')
      .select(`
        id,
        product_id,
        batch_number,
        qty_left,
        purchase_price,
        location_id,
        equipment_products!inner(
          id,
          name,
          product_code,
          unit_type,
          default_location_type,
          equipment_categories!inner(
            name
          )
        )
      `)
      .gt('qty_left', 0)
      .ilike('equipment_products.equipment_categories.name', '%drabužiai%')
      .eq('equipment_products.default_location_type', viewToUse);

    const { data: batchesData, error: batchesError } = await batchesQuery;

    if (batchesError) {
      console.error('Error loading batches:', batchesError);
      return;
    }

    // Aggregate by product
    const productMap = new Map<string, PPEItem>();
    
    batchesData?.forEach((batch: any) => {
      const product = batch.equipment_products;
      const productId = product.id;
      
      if (productMap.has(productId)) {
        const existing = productMap.get(productId)!;
        existing.total_qty += batch.qty_left;
        existing.total_value += batch.qty_left * batch.purchase_price;
        existing.batch_count += 1;
      } else {
        productMap.set(productId, {
          product_id: productId,
          product_name: product.name,
          product_code: product.product_code || '',
          unit_type: product.unit_type,
          category_name: product.equipment_categories?.name || 'Drabužiai',
          total_qty: batch.qty_left,
          total_value: batch.qty_left * batch.purchase_price,
          batch_count: 1,
        });
      }
    });

    const aggregatedItems = Array.from(productMap.values());
    setItems(aggregatedItems);

    // Get product IDs that match our location filter
    const validProductIds = new Set(aggregatedItems.map(item => item.product_id));

    // Load issuances and employees
    const [issuancesRes, employeesRes] = await Promise.all([
      supabase
        .from('equipment_items_on_loan')
        .select('*')
        .order('issue_date', { ascending: false })
        .limit(200), // Load more to ensure we get enough after filtering
      supabase
        .from('users')
        .select('id, full_name')
        .order('full_name'),
    ]);

    // Filter issuances by product location
    if (issuancesRes.data) {
      // We need to get product_id from the issuance
      // The view doesn't include product_id, so we need to load it
      const issuancesWithProducts = await Promise.all(
        issuancesRes.data.map(async (issuance: any) => {
          const { data: issuanceItems } = await supabase
            .from('equipment_issuance_items')
            .select('product_id')
            .eq('issuance_id', issuance.issuance_id)
            .limit(1)
            .single();
          
          return {
            ...issuance,
            product_id: issuanceItems?.product_id,
          };
        })
      );

      // Filter to only show issuances for products in this location
      const filteredIssuances = issuancesWithProducts
        .filter(issuance => validProductIds.has(issuance.product_id))
        .slice(0, 50); // Limit to 50 after filtering
      
      setIssuances(filteredIssuances as any);
    }
    if (employeesRes.data) setEmployees(employeesRes.data);
  };

  const filteredItems = items.filter(item =>
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const loadBatchesForProduct = async (productId: string) => {
    // Simply load all batches for this product
    // Since we're already filtering products by default_location_type,
    // all batches for this product should be valid
    const { data, error } = await supabase
      .from('equipment_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('qty_left', 0)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading batches:', error);
      return;
    }

    console.log('Loaded batches for product:', productId, data);
    if (data) setBatches(data);
  };

  const handleIssuePPE = async () => {
    if (!issueForm.product_id || !issueForm.batch_id || !issueForm.employee_id) {
      alert('Prašome užpildyti visus laukus');
      return;
    }

    const quantity = parseFloat(issueForm.quantity_issued);
    if (quantity <= 0) {
      alert('Kiekis turi būti didesnis už 0');
      return;
    }

    const selectedBatch = batches.find(b => b.id === issueForm.batch_id);
    if (!selectedBatch) {
      alert('Partija nerasta');
      return;
    }

    if (quantity > selectedBatch.qty_left) {
      alert(`Nepakankamas kiekis. Partijoje liko: ${selectedBatch.qty_left}`);
      return;
    }

    try {
      const issuanceNumber = `ISS-${Date.now().toString().slice(-6)}`;

      const { data: issuance, error: issuanceError } = await supabase
        .from('equipment_issuances')
        .insert({
          issuance_number: issuanceNumber,
          issued_to: issueForm.employee_id,
          issued_by: user?.id || null,
          issue_date: issueForm.issue_date,
          expected_return_date: issueForm.expected_return_date || null,
          status: 'issued',
          notes: issueForm.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (issuanceError) throw issuanceError;

      const { error: itemError } = await supabase
        .from('equipment_issuance_items')
        .insert({
          issuance_id: issuance.id,
          batch_id: issueForm.batch_id,
          product_id: issueForm.product_id,
          quantity: quantity,
          unit_price: selectedBatch.purchase_price,
        });

      if (itemError) throw itemError;

      await logAction('issue_ppe', 'equipment_issuances', issuance.id, null, {
        employee_id: issueForm.employee_id,
        product_id: issueForm.product_id,
        quantity: quantity,
      });

      setShowIssueModal(false);
      setIssueForm({
        product_id: '',
        batch_id: '',
        employee_id: '',
        quantity_issued: '1',
        issue_date: new Date().toISOString().split('T')[0],
        expected_return_date: '',
        notes: '',
      });
      setBatches([]);
      loadData();
      alert('Drabužiai sėkmingai išduoti');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida išduodant drabužius: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Tabs - only show if no locationFilter is provided */}
      {!locationFilter && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => !locationFilter && setCurrentView('farm')}
              className={`flex-1 px-4 py-2.5 rounded-md font-medium transition-colors ${
                currentView === 'farm'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Ferma
            </button>
            <button
              onClick={() => !locationFilter && setCurrentView('warehouse')}
              className={`flex-1 px-4 py-2.5 rounded-md font-medium transition-colors ${
                currentView === 'warehouse'
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Sandėlis
            </button>
          </div>
        </div>
      )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              {(locationFilter || currentView) === 'farm' ? 'Fermos' : 'Sandėlio'} PPE atsargos
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {(locationFilter || currentView) === 'farm' 
                ? 'Drabužiai ir apsaugos priemonės fermoje' 
                : 'Drabužiai ir apsaugos priemonės sandėlyje'
              }
            </p>
          </div>
          <button
            onClick={() => setShowIssueModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Išduoti PPE
          </button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Ieškoti PPE..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => (
            <div
              key={item.product_id}
              className="border rounded-lg p-4 border-gray-200 bg-white hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HardHat className="w-5 h-5 text-slate-600" />
                  <span className="font-medium text-gray-800">{item.category_name}</span>
                </div>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {item.batch_count} partijos
                </span>
              </div>

              <h4 className="font-medium text-gray-800 mb-2">{item.product_name}</h4>
              {item.product_code && (
                <p className="text-xs text-gray-500 mb-2">Kodas: {item.product_code}</p>
              )}

              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <p className="font-semibold text-lg text-green-600">Sandėlyje: {item.total_qty} {item.unit_type}</p>
                <p className="text-gray-500">Vertė: €{item.total_value?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Šiuo metu išduoti daiktai</h3>
        <div className="space-y-2">
          {issuances.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Nėra išduotų daiktų</p>
          ) : (
            issuances.map(issuance => (
              <div key={issuance.issuance_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-4">
                  <User className="w-8 h-8 text-slate-600" />
                  <div>
                    <p className="font-medium text-gray-800">{issuance.issued_to_name}</p>
                    <p className="text-sm text-gray-600">
                      {issuance.product_name} · {issuance.quantity_outstanding} {issuance.unit_type}
                    </p>
                    <p className="text-xs text-gray-500">#{issuance.issuance_number}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">
                    Išduota: {new Date(issuance.issue_date).toLocaleDateString('lt-LT')}
                  </p>
                  {issuance.expected_return_date && (
                    <p className="text-sm text-amber-600">
                      Grąžinti iki: {new Date(issuance.expected_return_date).toLocaleDateString('lt-LT')}
                    </p>
                  )}
                  <p className="text-sm font-medium text-blue-600">
                    Vertė: €{issuance.value_outstanding?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Produktų tipų" value={items.length.toString()} color="blue" />
        <StatCard
          title="Viso vienetų"
          value={items.reduce((sum, item) => sum + item.total_qty, 0).toFixed(1)}
          color="green"
        />
        <StatCard
          title="Atsargų vertė"
          value={`€${items.reduce((sum, item) => sum + (item.total_value || 0), 0).toFixed(2)}`}
          color="emerald"
        />
        <StatCard title="Išduota" value={issuances.length.toString()} color="amber" />
      </div>

      {showIssueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Išduoti drabužius</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produktas *</label>
                <select
                  value={issueForm.product_id}
                  onChange={(e) => {
                    setIssueForm({ ...issueForm, product_id: e.target.value, batch_id: '' });
                    if (e.target.value) {
                      loadBatchesForProduct(e.target.value);
                    } else {
                      setBatches([]);
                    }
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite produktą</option>
                  {items.map(item => (
                    <option key={item.product_id} value={item.product_id}>
                      {item.product_name} ({item.total_qty} {item.unit_type} sandėlyje)
                    </option>
                  ))}
                </select>
              </div>

              {issueForm.product_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Partija *</label>
                  <select
                    value={issueForm.batch_id}
                    onChange={(e) => setIssueForm({ ...issueForm, batch_id: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Pasirinkite partiją</option>
                    {batches.map(batch => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_number} - Likutis: {batch.qty_left} - Kaina: €{batch.purchase_price}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas *</label>
                <select
                  value={issueForm.employee_id}
                  onChange={(e) => setIssueForm({ ...issueForm, employee_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite darbuotoją</option>
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kiekis *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={issueForm.quantity_issued}
                    onChange={(e) => setIssueForm({ ...issueForm, quantity_issued: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Išdavimo data *</label>
                  <input
                    type="date"
                    value={issueForm.issue_date}
                    onChange={(e) => setIssueForm({ ...issueForm, issue_date: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grąžinimo data (jei taikoma)</label>
                <input
                  type="date"
                  value={issueForm.expected_return_date}
                  onChange={(e) => setIssueForm({ ...issueForm, expected_return_date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
                <textarea
                  value={issueForm.notes}
                  onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowIssueModal(false);
                  setIssueForm({
                    product_id: '',
                    batch_id: '',
                    employee_id: '',
                    quantity_issued: '1',
                    issue_date: new Date().toISOString().split('T')[0],
                    expected_return_date: '',
                    notes: '',
                  });
                  setBatches([]);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleIssuePPE}
                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
              >
                Išduoti PPE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
