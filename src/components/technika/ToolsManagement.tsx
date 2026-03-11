import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Wrench, Plus, Search, User, MapPin, CheckCircle, AlertCircle, Edit2, Save, X } from 'lucide-react';

interface Tool {
  id: string;
  tool_number: string;
  name: string | null;
  type: string;
  condition: string;
  serial_number: string;
  is_available: boolean;
  current_holder: string | null;
  product_id: string | null;
  notes: string;
  product: {
    name: string;
  } | null;
  holder: {
    full_name: string;
  } | null;
  location: {
    name: string;
  } | null;
}

interface Product {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  full_name: string;
}

export function ToolsManagement() {
  const { user, logAction } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAvailable, setFilterAvailable] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({
    holder_id: '',
    quantity: '1',
    expected_return_date: '',
    notes: '',
  });
  const [newToolForm, setNewToolForm] = useState({
    name: '',
    product_id: '',
    tool_number: '',
    serial_number: '',
    type: 'manual',
    condition: 'good',
    location_id: '',
    notes: '',
  });

  useEffect(() => {
    loadData();

    // Subscribe to realtime updates for tools
    const toolsSubscription = supabase
      .channel('tools-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tools' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      toolsSubscription.unsubscribe();
    };
  }, []);

  const loadData = async () => {
    const [toolsRes, productsRes, locationsRes, usersRes] = await Promise.all([
      supabase.from('tools').select(`
        id,
        tool_number,
        name,
        type,
        condition,
        serial_number,
        is_available,
        current_holder,
        current_location_id,
        product_id,
        notes
      `).order('tool_number'),
      supabase.from('equipment_products').select('id, name').eq('is_active', true).order('name'),
      supabase.from('equipment_locations').select('id, name').order('name'),
      supabase.from('users').select('id, full_name').order('full_name'),
    ]);

    if (toolsRes.data) {
      const toolsWithRelations = await Promise.all(
        toolsRes.data.map(async (tool: any) => {
          const relations: any = { ...tool, product: null, holder: null, location: null };

          if (tool.product_id) {
            const { data: product } = await supabase
              .from('equipment_products')
              .select('name')
              .eq('id', tool.product_id)
              .maybeSingle();
            relations.product = product;
          }

          if (tool.current_holder) {
            const { data: holder } = await supabase
              .from('users')
              .select('full_name')
              .eq('id', tool.current_holder)
              .maybeSingle();
            relations.holder = holder;
          }

          if (tool.current_location_id) {
            const { data: location } = await supabase
              .from('equipment_locations')
              .select('name')
              .eq('id', tool.current_location_id)
              .maybeSingle();
            relations.location = location;
          }

          return relations;
        })
      );
      setTools(toolsWithRelations);
    }
    if (productsRes.data) setProducts(productsRes.data);
    if (locationsRes.data) setLocations(locationsRes.data);
    if (usersRes.data) setUsers(usersRes.data);
  };

  const loadTools = loadData;

  const filteredTools = tools.filter(tool => {
    const matchesSearch =
      tool.tool_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tool.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tool.product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tool.serial_number?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || tool.type === filterType;
    const matchesAvailable =
      filterAvailable === 'all' ||
      (filterAvailable === 'available' && tool.is_available) ||
      (filterAvailable === 'checked_out' && !tool.is_available);

    return matchesSearch && matchesType && matchesAvailable;
  });

  const handleOpenCheckoutModal = (tool: Tool) => {
    setSelectedTool(tool);
    setCheckoutForm({
      holder_id: '',
      quantity: '1',
      expected_return_date: '',
      notes: '',
    });
    setShowCheckoutModal(true);
  };

  const handleCheckout = async () => {
    if (!selectedTool || !checkoutForm.holder_id) {
      alert('Prašome pasirinkti darbuotoją');
      return;
    }

    const quantity = parseFloat(checkoutForm.quantity) || 1;
    const notesWithQty = `Kiekis: ${quantity}${checkoutForm.notes ? ` | ${checkoutForm.notes}` : ''}`;

    try {
      // Debug: Log user information
      console.log('Current user:', user);
      console.log('User ID being passed:', user?.id || null);
      console.log('Checkout form holder_id:', checkoutForm.holder_id);

      // 1) Log tool movement (who received the tool)
      const movementData = {
        tool_id: selectedTool.id,
        movement_type: 'checkout',
        to_holder: checkoutForm.holder_id,
        from_location_id: selectedTool.current_location_id,
        movement_date: new Date().toISOString(),
        notes: notesWithQty,
        recorded_by: user?.id || null,
      };

      console.log('Inserting tool_movement:', movementData);

      const { error: movementError } = await supabase.from('tool_movements').insert(movementData);

      if (movementError) throw movementError;

      // 2) If tool is linked to a product, also issue quantity from Sandėlis
      if (selectedTool.product?.name && selectedTool.product_id) {
        const productId = selectedTool.product_id;

        // Find oldest batch with enough quantity
        const { data: batches, error: batchesError } = await supabase
          .from('equipment_batches')
          .select('id, qty_left, purchase_price')
          .eq('product_id', productId)
          .gt('qty_left', 0)
          .order('created_at', { ascending: true });

        if (batchesError) throw batchesError;

        const batch = batches?.find(b => parseFloat(b.qty_left as any) >= quantity);
        if (!batch) {
          alert('Nepakanka šio įrankio atsargų sandėlyje');
          throw new Error('Not enough stock in equipment_batches for this tool product');
        }

        const { data: issuanceNumber } = await supabase.rpc('generate_equipment_issuance_number');

        const { data: issuance, error: issuanceError } = await supabase
          .from('equipment_issuances')
          .insert({
            issuance_number: issuanceNumber,
            issued_to: checkoutForm.holder_id,
            issued_by: user?.id || null,
            issue_date: new Date().toISOString().split('T')[0],
            status: 'issued',
            notes: checkoutForm.notes || null,
            created_by: user?.id || null,
          })
          .select()
          .single();

        if (issuanceError) throw issuanceError;

        const { error: itemError } = await supabase
          .from('equipment_issuance_items')
          .insert({
            issuance_id: issuance.id,
            batch_id: batch.id,
            product_id: productId,
            quantity,
            unit_price: batch.purchase_price,
          });

        if (itemError) throw itemError;

        await logAction('issue_tool_from_stock', 'equipment_issuances', issuance.id, null, {
          tool_id: selectedTool.id,
          product_id: productId,
          quantity,
        });
      }

      // 3) Mark this tool as issued to the holder (but still allow further issues from the card)
      const { error: updateError } = await supabase
        .from('tools')
        .update({
          current_holder: checkoutForm.holder_id,
          is_available: false,
          current_location_id: null,
        })
        .eq('id', selectedTool.id);

      if (updateError) throw updateError;

      // Do NOT mark tool as fully unavailable, since we may still have remaining stock
      await logAction('checkout_tool', 'tools', selectedTool.id, null, {
        tool_number: selectedTool.tool_number,
        holder_id: checkoutForm.holder_id,
        quantity,
      });

      setShowCheckoutModal(false);
      setSelectedTool(null);
      await loadTools();
      alert('Įrankis sėkmingai išduotas');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida išduodant įrankį: ${error.message}`);
    }
  };

  const handleReturn = async (tool: Tool) => {
    if (!confirm(`Ar tikrai norite grąžinti įrankį "${tool.name || tool.product?.name}"?`)) {
      return;
    }

    try {
      console.log('Return - Starting return process for tool:', tool.id);

      const movementData = {
        tool_id: tool.id,
        movement_type: 'return',
        from_holder: tool.current_holder,
        movement_date: new Date().toISOString(),
        recorded_by: user?.id || null,
      };

      const { error: movementError } = await supabase.from('tool_movements').insert(movementData);

      if (movementError) {
        console.error('Movement error:', movementError);
        throw movementError;
      }

      // If tool has a product_id, find and mark the corresponding equipment_issuance as returned
      if (tool.product_id) {
        const productId = tool.product_id;

        // First find the most recent active issuance for this holder
        const { data: issuances, error: issuanceError } = await supabase
          .from('equipment_issuances')
          .select('id, status, issue_date')
          .eq('issued_to', tool.current_holder)
          .in('status', ['issued', 'partial_return'])
          .order('issue_date', { ascending: false })
          .limit(10);

        if (issuanceError) {
          console.error('Error finding issuances:', issuanceError);
        } else if (issuances && issuances.length > 0) {
          // Now find the item in these issuances that matches the product
          let foundItem = null;
          for (const issuance of issuances) {
            const { data: items } = await supabase
              .from('equipment_issuance_items')
              .select('id, issuance_id, quantity, quantity_returned')
              .eq('issuance_id', issuance.id)
              .eq('product_id', productId);

            if (items && items.length > 0) {
              foundItem = items[0];
              break;
            }
          }

          if (foundItem) {
            const item = foundItem;

            // Mark the full quantity as returned
            const { error: updateItemError } = await supabase
              .from('equipment_issuance_items')
              .update({
                quantity_returned: item.quantity,
              })
              .eq('id', item.id);

            if (updateItemError) {
              console.error('Error updating issuance item:', updateItemError);
            }

            // Check if all items in this issuance are now returned
            const { data: allItems } = await supabase
              .from('equipment_issuance_items')
              .select('quantity, quantity_returned')
              .eq('issuance_id', item.issuance_id);

            let newStatus = 'returned';
            if (allItems) {
              const hasOutstanding = allItems.some((i: any) =>
                parseFloat(i.quantity) > parseFloat(i.quantity_returned || 0)
              );
              if (hasOutstanding) {
                newStatus = 'partial_return';
              }
            }

            // Update the issuance status
            const { error: updateIssuanceError } = await supabase
              .from('equipment_issuances')
              .update({
                status: newStatus,
                actual_return_date: newStatus === 'returned' ? new Date().toISOString().split('T')[0] : null,
              })
              .eq('id', item.issuance_id);

            if (updateIssuanceError) {
              console.error('Error updating issuance:', updateIssuanceError);
            } else {
              console.log(`Marked equipment issuance ${item.issuance_id} as ${newStatus}`);
            }
          }
        }
      }

      const { data: updatedTool, error: updateError } = await supabase
        .from('tools')
        .update({
          current_holder: null,
          is_available: true,
        })
        .eq('id', tool.id)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Tool updated successfully:', updatedTool);

      await logAction('return_tool', 'tools', tool.id, null, {
        tool_id: tool.id,
        tool_number: tool.tool_number,
        from_holder: tool.current_holder
      });

      // Force immediate reload
      await loadData();

      alert('Įrankis sėkmingai grąžintas');
    } catch (error: any) {
      console.error('Return error:', error);
      alert(`Klaida grąžinant įrankį: ${error.message}`);
    }
  };

  const handleAddTool = async () => {
    if (!newToolForm.tool_number || (!newToolForm.name && !newToolForm.product_id)) {
      alert('Prašome užpildyti įrankio numerį ir pavadinimą (arba pasirinkti produktą)');
      return;
    }

    try {
      // If no existing product was selected, automatically create one so the tool appears in Produktai
      let productId = newToolForm.product_id || '';

      if (!productId) {
        const { data: createdProduct, error: productError } = await supabase
          .from('equipment_products')
          .insert({
            name: newToolForm.name,
            unit_type: 'pcs', // default; can be refined later in Produktai
            is_active: true,
          })
          .select()
          .single();

        if (productError) throw productError;
        productId = createdProduct.id;

        await logAction('add_equipment_product_from_tool', {
          product_id: createdProduct.id,
          product_name: createdProduct.name,
        });
      }

      const { error: toolError } = await supabase.from('tools').insert({
        name: newToolForm.name || null,
        product_id: productId,
        tool_number: newToolForm.tool_number,
        serial_number: newToolForm.serial_number || null,
        type: newToolForm.type,
        condition: newToolForm.condition,
        current_location_id: newToolForm.location_id || null,
        notes: newToolForm.notes || null,
        is_available: true,
      });

      if (toolError) throw toolError;

      await logAction('add_tool', { tool_number: newToolForm.tool_number, product_id: productId });
      setShowAddModal(false);
      setNewToolForm({
        name: '',
        product_id: '',
        tool_number: '',
        serial_number: '',
        type: 'manual',
        condition: 'good',
        location_id: '',
        notes: '',
      });
      loadData();
      alert('Įrankis sėkmingai pridėtas');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida pridedant įrankį: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800">Įrankių valdymas</h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Pridėti įrankį
          </button>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Ieškoti pagal numerį, pavadinimą..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
          >
            <option value="all">Visi tipai</option>
            <option value="manual">Rankiniai</option>
            <option value="electric">Elektriniai</option>
            <option value="pneumatic">Pneumatiniai</option>
            <option value="hydraulic">Hidrauliniai</option>
          </select>
          <select
            value={filterAvailable}
            onChange={e => setFilterAvailable(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
          >
            <option value="all">Visi</option>
            <option value="available">Prieinami</option>
            <option value="checked_out">Išduoti</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map(tool => (
            <div
              key={tool.id}
              className={`border rounded-lg p-4 transition-all ${
                tool.is_available ? 'border-gray-200 hover:border-slate-400' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wrench className={`w-5 h-5 ${tool.is_available ? 'text-slate-600' : 'text-amber-600'}`} />
                  <span className="font-semibold text-gray-800">{tool.tool_number}</span>
                </div>
                {tool.is_available ? (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Prieinamas</span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">Išduotas</span>
                )}
              </div>

              <h4 className="font-medium text-gray-800 mb-2">{tool.name || tool.product?.name || 'Įrankis'}</h4>

              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <p>Tipas: {tool.type === 'manual' ? 'Rankinis' : tool.type === 'electric' ? 'Elektrinis' : tool.type === 'pneumatic' ? 'Pneumatinis' : 'Hidraulinis'}</p>
                <p>Būklė: {tool.condition === 'new' ? 'Naujas' : tool.condition === 'good' ? 'Gera' : tool.condition === 'fair' ? 'Patenkinama' : 'Prasta'}</p>
                {tool.serial_number && <p>Serijos nr.: {tool.serial_number}</p>}
              </div>

              {tool.holder && (
                <div className="flex items-center gap-2 text-sm text-amber-700 mb-3">
                  <User className="w-4 h-4" />
                  <span>{tool.holder.full_name}</span>
                </div>
              )}

              {tool.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>{tool.location.name}</span>
                </div>
              )}

              {tool.is_available ? (
                <button
                  onClick={() => handleOpenCheckoutModal(tool)}
                  className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                >
                  Išduoti
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenCheckoutModal(tool)}
                    className="flex-1 px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                  >
                    Išduoti dar
                  </button>
                  <button
                    onClick={() => handleReturn(tool)}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    Grąžinti
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredTools.length === 0 && (
          <div className="text-center py-12">
            <Wrench className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Įrankių nerasta</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Šiuo metu išduoti įrankiai</h3>
        <div className="space-y-2">
          {tools.filter(t => !t.is_available).length === 0 ? (
            <p className="text-gray-500 text-center py-4">Nėra išduotų įrankių</p>
          ) : (
            tools.filter(t => !t.is_available).map(tool => (
              <div key={tool.id} className="flex items-center justify-between p-4 border border-amber-200 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Wrench className="w-8 h-8 text-amber-600" />
                  <div>
                    <p className="font-medium text-gray-800">{tool.name || tool.product?.name || 'Įrankis'}</p>
                    <p className="text-sm text-gray-600">
                      {tool.holder?.full_name || 'Nežinomas darbuotojas'}
                    </p>
                    <p className="text-xs text-gray-500">
                      #{tool.tool_number}
                      {tool.serial_number && ` · SN: ${tool.serial_number}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleReturn(tool)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Grąžinti
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Viso įrankių" value={tools.length.toString()} color="blue" />
        <StatCard title="Prieinami" value={tools.filter(t => t.is_available).length.toString()} color="green" />
        <StatCard title="Išduoti" value={tools.filter(t => !t.is_available).length.toString()} color="amber" />
        <StatCard title="Reikia taisyti" value={tools.filter(t => t.condition === 'needs_repair').length.toString()} color="red" />
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Pridėti naują įrankį</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Įrankio numeris *</label>
                <input
                  type="text"
                  value={newToolForm.tool_number}
                  onChange={(e) => setNewToolForm({ ...newToolForm, tool_number: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="T-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pavadinimas *</label>
                <input
                  type="text"
                  value={newToolForm.name}
                  onChange={(e) => setNewToolForm({ ...newToolForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Veržliaraktis 10mm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produktas (nebūtina)</label>
                <select
                  value={newToolForm.product_id}
                  onChange={(e) => setNewToolForm({ ...newToolForm, product_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite produktą</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serijos numeris</label>
                <input
                  type="text"
                  value={newToolForm.serial_number}
                  onChange={(e) => setNewToolForm({ ...newToolForm, serial_number: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipas</label>
                  <select
                    value={newToolForm.type}
                    onChange={(e) => setNewToolForm({ ...newToolForm, type: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="manual">Rankinis</option>
                    <option value="electric">Elektrinis</option>
                    <option value="pneumatic">Pneumatinis</option>
                    <option value="hydraulic">Hidraulinis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Būklė</label>
                  <select
                    value={newToolForm.condition}
                    onChange={(e) => setNewToolForm({ ...newToolForm, condition: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="new">Naujas</option>
                    <option value="good">Gera</option>
                    <option value="fair">Patenkinama</option>
                    <option value="needs_repair">Reikia taisyti</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lokacija</label>
                <select
                  value={newToolForm.location_id}
                  onChange={(e) => setNewToolForm({ ...newToolForm, location_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite lokaciją</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
                <textarea
                  value={newToolForm.notes}
                  onChange={(e) => setNewToolForm({ ...newToolForm, notes: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewToolForm({
                    name: '',
                    product_id: '',
                    tool_number: '',
                    serial_number: '',
                    type: 'manual',
                    condition: 'good',
                    location_id: '',
                    notes: '',
                  });
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleAddTool}
                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
              >
                Pridėti įrankį
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckoutModal && selectedTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Išduoti įrankį</h3>

            <div className="mb-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Įrankis</p>
              <p className="font-semibold text-gray-900">
                {selectedTool.tool_number} - {selectedTool.name || selectedTool.product?.name}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas *</label>
                <select
                  value={checkoutForm.holder_id}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, holder_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite darbuotoją</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kiekis</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={checkoutForm.quantity}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, quantity: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tikėtina grąžinimo data</label>
                <input
                  type="date"
                  value={checkoutForm.expected_return_date}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, expected_return_date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
                <textarea
                  value={checkoutForm.notes}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, notes: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  placeholder="Kodėl išduodamas, darbų aprašymas..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCheckoutModal(false);
                  setSelectedTool(null);
                  setCheckoutForm({
                    holder_id: '',
                    quantity: '1',
                    expected_return_date: '',
                    notes: '',
                  });
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleCheckout}
                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
              >
                Išduoti įrankį
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colors: any = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    amber: 'from-amber-500 to-amber-600',
    red: 'from-red-500 to-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
