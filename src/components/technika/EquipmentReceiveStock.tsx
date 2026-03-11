import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Upload, FileText, X, AlertCircle, CheckCircle, PlusCircle, Save, Edit2, Package } from 'lucide-react';

interface EquipmentProduct {
  id: string;
  name: string;
  product_code?: string;
  category_id?: string;
  unit_type?: string;
}

interface EquipmentSupplier {
  id: string;
  name: string;
  code?: string;
  vat_code?: string;
}

interface EquipmentReceiveStockProps {
  onReceived?: () => void;
}

export function EquipmentReceiveStock({ onReceived }: EquipmentReceiveStockProps = {}) {
  const { logAction } = useAuth();
  const [products, setProducts] = useState<EquipmentProduct[]>([]);
  const [suppliers, setSuppliers] = useState<EquipmentSupplier[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [matchedProducts, setMatchedProducts] = useState<Map<number, EquipmentProduct | null>>(new Map());
  const [editedItems, setEditedItems] = useState<Map<number, any>>(new Map());
  const [itemsToReceive, setItemsToReceive] = useState<Map<number, boolean>>(new Map());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState<any>(null);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    product_code: '',
    category_id: '',
    unit_type: 'pcs',
    manufacturer: '',
    model_number: '',
    description: '',
    min_stock_level: '0',
  });
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerData, setHeaderData] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [bulkReceiving, setBulkReceiving] = useState(false);
  const [defaultLocationId, setDefaultLocationId] = useState<string>('');
  const [entryMode, setEntryMode] = useState<'invoice' | 'manual'>('invoice');
  const [manualItems, setManualItems] = useState<any[]>([]);
  const [currentManualItem, setCurrentManualItem] = useState({
    product_id: '',
    quantity: '1',
    package_qty: '1',
    units_per_package: '1',
    total_price: '',
    unit_price: '',
    batch_number: '',
    expiry_date: '',
    location_id: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [productsRes, suppliersRes, categoriesRes, locationsRes] = await Promise.all([
      supabase.from('equipment_products').select('*').eq('is_active', true).order('name'),
      supabase.from('equipment_suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('equipment_categories').select('*').order('name'),
      supabase.from('equipment_locations').select('*').order('name'),
    ]);

    if (productsRes.data) setProducts(productsRes.data);
    if (suppliersRes.data) setSuppliers(suppliersRes.data);
    if (categoriesRes.data) setCategories(categoriesRes.data);
    if (locationsRes.data) {
      setLocations(locationsRes.data);
      const mainWarehouse = locationsRes.data.find(l => l.location_type === 'warehouse');
      if (mainWarehouse) setDefaultLocationId(mainWarehouse.id);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadStatus('idle');
      setUploadMessage('');
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
    } else {
      alert('Prašome pasirinkti PDF failą');
      e.target.value = '';
    }
  };

  const searchProductMatch = async (itemDescription: string): Promise<EquipmentProduct | null> => {
    const searchTerm = itemDescription.toLowerCase();
    const match = products.find(p =>
      p.name.toLowerCase().includes(searchTerm) ||
      searchTerm.includes(p.name.toLowerCase())
    );
    return match || null;
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus('uploading');
    setUploadMessage('Įkeliama...');

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const sanitizeFilename = (filename: string): string => {
        return filename
          .replace(/[()]/g, '')
          .replace(/[^\w\s.-]/g, '_')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_');
      };

      const sanitizedFilename = sanitizeFilename(selectedFile.name);

      const response = await fetch('https://n8n-up8s.onrender.com/webhook/36549f46-a08b-4790-bf56-40cdc919e4c0', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        },
        body: arrayBuffer,
      });

      if (!response.ok) {
        throw new Error(`Serverio klaida: ${response.status}`);
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error('Nepavyko perskaityti serverio atsakymo');
      }

      let invoiceObject;
      if (Array.isArray(data) && data.length > 0) {
        invoiceObject = data[0];
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        invoiceObject = data;
      } else {
        throw new Error('Netinkamas atsakymo formatas');
      }

      if (!invoiceObject.items || !Array.isArray(invoiceObject.items)) {
        throw new Error('Atsakyme nerasta prekių sąrašo');
      }

      setInvoiceData(invoiceObject);
      setHeaderData({
        invoice_number: invoiceObject.invoice.number,
        invoice_date: invoiceObject.invoice.date,
        supplier_name: invoiceObject.supplier.name,
        supplier_code: invoiceObject.supplier.code,
        supplier_vat: invoiceObject.supplier.vat_code,
        total_net: invoiceObject.invoice.total_net || 0,
        total_vat: invoiceObject.invoice.total_vat || 0,
        total_gross: invoiceObject.invoice.total_gross || 0,
      });

      const matches = new Map<number, EquipmentProduct | null>();
      const receiveFlags = new Map<number, boolean>();
      for (let i = 0; i < invoiceObject.items.length; i++) {
        const match = await searchProductMatch(invoiceObject.items[i].description);
        matches.set(i, match);
        receiveFlags.set(i, true);
      }
      setMatchedProducts(matches);
      setItemsToReceive(receiveFlags);

      setUploadStatus('success');
      setUploadMessage(`PDF sėkmingai įkeltas! Rasta ${invoiceObject.items.length} prekių.`);
    } catch (error: any) {
      setUploadStatus('error');
      setUploadMessage(`Klaida: ${error.message}`);
    }
  };

  const handleRemoveFile = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setSelectedFile(null);
    setUploadStatus('idle');
    setUploadMessage('');
    setInvoiceData(null);
    setMatchedProducts(new Map());
    setEditedItems(new Map());
    setItemsToReceive(new Map());
    setHeaderData(null);
    setEditingHeader(false);
  };

  const handleSaveHeader = () => {
    if (headerData && invoiceData) {
      setInvoiceData({
        ...invoiceData,
        invoice: {
          ...invoiceData.invoice,
          number: headerData.invoice_number,
          date: headerData.invoice_date,
          total_net: parseFloat(String(headerData.total_net)) || 0,
          total_vat: parseFloat(String(headerData.total_vat)) || 0,
          total_gross: parseFloat(String(headerData.total_gross)) || 0,
        },
        supplier: {
          ...invoiceData.supplier,
          name: headerData.supplier_name,
          code: headerData.supplier_code,
          vat_code: headerData.supplier_vat,
        },
      });
    }
    setEditingHeader(false);
  };

  const getItemData = (item: any, index: number) => {
    const edited = editedItems.get(index);
    return edited || item;
  };

  const handleItemEdit = (index: number, field: string, value: any) => {
    const currentItem = invoiceData.items[index];
    const edited = editedItems.get(index) || { ...currentItem };
    edited[field] = value;
    const newEdited = new Map(editedItems);
    newEdited.set(index, edited);
    setEditedItems(newEdited);
  };

  const handleProductMatch = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    const newMatches = new Map(matchedProducts);
    newMatches.set(index, product || null);
    setMatchedProducts(newMatches);
  };

  const handleCreateProduct = (item: any, index: number) => {
    const itemData = getItemData(item, index);
    setCreatingProduct({ ...itemData, index });
    setNewProductForm({
      name: itemData.description || '',
      product_code: itemData.sku || '',
      category_id: '',
      unit_type: itemData.unit || 'pcs',
      manufacturer: '',
      model_number: '',
      description: itemData.description || '',
      min_stock_level: '0',
    });
    setShowCreateModal(true);
  };

  const handleSaveNewProduct = async () => {
    if (!newProductForm.name) {
      alert('Įveskite produkto pavadinimą');
      return;
    }

    try {
      const productData = {
        name: newProductForm.name,
        product_code: newProductForm.product_code || null,
        category_id: newProductForm.category_id || null,
        unit_type: newProductForm.unit_type,
        manufacturer: newProductForm.manufacturer || null,
        model_number: newProductForm.model_number || null,
        description: newProductForm.description || null,
        min_stock_level: parseFloat(newProductForm.min_stock_level) || 0,
        is_active: true,
      };

      const { data: newProduct, error } = await supabase
        .from('equipment_products')
        .insert(productData)
        .select()
        .single();

      if (error) throw error;

      await loadData();

      if (creatingProduct.index !== undefined) {
        const newMatches = new Map(matchedProducts);
        newMatches.set(creatingProduct.index, newProduct);
        setMatchedProducts(newMatches);
      }

      setShowCreateModal(false);
      setCreatingProduct(null);
      setNewProductForm({
        name: '',
        product_code: '',
        category_id: '',
        unit_type: 'pcs',
        manufacturer: '',
        model_number: '',
        description: '',
        min_stock_level: '0',
      });
      alert('Produktas sėkmingai sukurtas!');
    } catch (error: any) {
      alert('Klaida kuriant produktą: ' + error.message);
    }
  };

  const handleBulkReceive = async () => {
    if (!invoiceData || !invoiceData.supplier) {
      alert('Nėra sąskaitos duomenų');
      return;
    }

    const matchedItems = invoiceData.items.filter((_: any, index: number) => {
      const matched = matchedProducts.get(index);
      const shouldReceive = itemsToReceive.get(index) !== false;
      return matched !== undefined && matched !== null && shouldReceive;
    });

    if (matchedItems.length === 0) {
      alert('Nėra susieti produktai. Prašome susieti produktus prieš priėmimą.');
      return;
    }

    setBulkReceiving(true);

    try {
      let supplierId = invoiceData.supplier_id;

      if (!supplierId) {
        const { data: existingSupplier } = await supabase
          .from('equipment_suppliers')
          .select('id')
          .eq('name', invoiceData.supplier.name)
          .maybeSingle();

        if (existingSupplier) {
          supplierId = existingSupplier.id;
        } else {
          const { data: newSupplier, error: supplierError } = await supabase
            .from('equipment_suppliers')
            .insert({
              name: invoiceData.supplier.name,
              code: invoiceData.supplier.code || null,
              vat_code: invoiceData.supplier.vat_code || null,
            })
            .select()
            .single();

          if (supplierError) throw supplierError;
          supplierId = newSupplier.id;
        }
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('equipment_invoices')
        .insert({
          invoice_number: invoiceData.invoice.number,
          invoice_date: invoiceData.invoice.date || new Date().toISOString().split('T')[0],
          supplier_id: supplierId,
          supplier_name: invoiceData.supplier.name,
          currency: invoiceData.invoice.currency || 'EUR',
          total_net: parseFloat(invoiceData.invoice.total_net) || 0,
          total_vat: parseFloat(invoiceData.invoice.total_vat) || 0,
          total_gross: parseFloat(invoiceData.invoice.total_gross) || 0,
          pdf_url: selectedFile?.name || null,
          status: 'received',
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const stockEntries = [];
      const invoiceItemsEntries = [];

      for (let i = 0; i < invoiceData.items.length; i++) {
        const matched = matchedProducts.get(i);
        const shouldReceive = itemsToReceive.get(i) !== false;

        if (!matched || !shouldReceive) continue;

        const item = invoiceData.items[i];
        const itemData = getItemData(item, i);

        const quantity = parseFloat(itemData.qty) || 0;
        const unitPrice = parseFloat(itemData.unit_price) || 0;
        const totalPrice = parseFloat(itemData.net) || (quantity * unitPrice);

        const batchData = {
          product_id: matched.id,
          batch_number: itemData.batch || null,
          lot_number: itemData.batch || null,
          invoice_id: invoice.id,
          location_id: defaultLocationId || null,
          received_qty: quantity,
          qty_left: quantity,
          purchase_price: unitPrice,
          expiry_date: itemData.expiry || null,
          notes: itemData.description || null,
        };

        stockEntries.push(batchData);

        const invoiceItemData = {
          invoice_id: invoice.id,
          line_no: itemData.line_no || i + 1,
          product_id: matched.id,
          description: itemData.description,
          quantity: quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          vat_rate: parseFloat(itemData.vat_rate) || 0,
        };

        invoiceItemsEntries.push(invoiceItemData);
      }

      if (stockEntries.length > 0) {
        const { error: batchError } = await supabase.from('equipment_batches').insert(stockEntries);
        if (batchError) throw batchError;
      }

      if (invoiceItemsEntries.length > 0) {
        const { error: itemsError } = await supabase.from('equipment_invoice_items').insert(invoiceItemsEntries);
        if (itemsError) throw itemsError;
      }

      await logAction(
        'receive_equipment_stock',
        'equipment_invoices',
        invoice.id,
        null,
        {
          invoice_number: invoice.invoice_number,
          items_count: stockEntries.length,
          total_gross: invoice.total_gross,
        }
      );

      alert(`Sėkmingai priimta ${stockEntries.length} prekių!`);
      handleRemoveFile();
      await loadData();
      if (onReceived) onReceived();
    } catch (error: any) {
      alert('Klaida priimant prekes: ' + error.message);
    } finally {
      setBulkReceiving(false);
    }
  };

  const toggleItemReceive = (index: number) => {
    const newFlags = new Map(itemsToReceive);
    newFlags.set(index, !itemsToReceive.get(index));
    setItemsToReceive(newFlags);
  };

  const handleAddManualItem = () => {
    if (!currentManualItem.product_id || !currentManualItem.package_qty || !currentManualItem.units_per_package || !currentManualItem.total_price) {
      alert('Prašome užpildyti produktą, pakuočių kiekį, vienetų skaičių ir galutinę kainą');
      return;
    }

    const product = products.find(p => p.id === currentManualItem.product_id);
    if (!product) return;

    const packageQty = parseFloat(currentManualItem.package_qty);
    const unitsPerPackage = parseFloat(currentManualItem.units_per_package);
    const totalQuantity = packageQty * unitsPerPackage;
    const totalPrice = parseFloat(currentManualItem.total_price);
    const unitPrice = totalPrice / totalQuantity;

    const newItem = {
      ...currentManualItem,
      quantity: totalQuantity.toString(),
      unit_price: unitPrice.toFixed(4),
      product_name: product.name,
      product_unit: product.unit_type,
      total_price: totalPrice,
    };

    setManualItems([...manualItems, newItem]);
    setCurrentManualItem({
      product_id: '',
      quantity: '1',
      package_qty: '1',
      units_per_package: '1',
      total_price: '',
      unit_price: '',
      batch_number: '',
      expiry_date: '',
      location_id: '',
      notes: '',
    });
  };

  const handleRemoveManualItem = (index: number) => {
    setManualItems(manualItems.filter((_, i) => i !== index));
  };

  const handleReceiveManualItems = async () => {
    if (manualItems.length === 0) {
      alert('Pridėkite bent vieną prekę');
      return;
    }

    setBulkReceiving(true);
    try {
      const stockEntries = manualItems.map(item => ({
        product_id: item.product_id,
        batch_number: item.batch_number || `BATCH-${Date.now()}`,
        location_id: item.location_id || defaultLocationId || null,
        received_qty: parseFloat(item.quantity),
        qty_left: parseFloat(item.quantity),
        purchase_price: parseFloat(item.unit_price),
        expiry_date: item.expiry_date || null,
        notes: item.notes || null,
      }));

      const { error } = await supabase.from('equipment_batches').insert(stockEntries);
      if (error) throw error;

      await logAction(
        'receive_equipment_stock_manual',
        'equipment_batches',
        null,
        null,
        {
          items_count: stockEntries.length,
          total_value: manualItems.reduce((sum, item) => sum + item.total_price, 0),
        }
      );

      alert(`Sėkmingai priimta ${stockEntries.length} prekių!`);
      setManualItems([]);
      await loadData();
      if (onReceived) onReceived();
    } catch (error: any) {
      alert('Klaida priimant prekes: ' + error.message);
    } finally {
      setBulkReceiving(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Priimti įrangos atsargas</h2>

      <div className="mb-6 flex gap-3 border-b border-gray-200">
        <button
          onClick={() => setEntryMode('invoice')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
            entryMode === 'invoice'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4 inline-block mr-2" />
          Su sąskaita (PDF)
        </button>
        <button
          onClick={() => setEntryMode('manual')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
            entryMode === 'manual'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Plus className="w-4 h-4 inline-block mr-2" />
          Rankinė registracija
        </button>
      </div>

      <div className="space-y-6">
        {entryMode === 'invoice' ? (
          <>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div className="flex items-center justify-center">
            <label className="flex flex-col items-center cursor-pointer">
              <Upload className="w-12 h-12 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">Įkelkite sąskaitą faktūrą (PDF)</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {selectedFile && (
            <div className="mt-4">
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-blue-600 mr-2" />
                  <span className="text-sm text-gray-700">{selectedFile.name}</span>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="text-red-600 hover:text-red-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {uploadStatus === 'idle' && (
                <button
                  onClick={handleFileUpload}
                  className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Apdoroti PDF
                </button>
              )}

              {uploadStatus === 'uploading' && (
                <div className="mt-3 flex items-center justify-center text-blue-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                  {uploadMessage}
                </div>
              )}

              {uploadStatus === 'success' && (
                <div className="mt-3 flex items-center text-green-600">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  {uploadMessage}
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="mt-3 flex items-center text-red-600">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  {uploadMessage}
                </div>
              )}
            </div>
          )}
        </div>

        {invoiceData && (
          <div className="space-y-4">
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Sąskaitos duomenys</h3>
                  {!editingHeader ? (
                    <button
                      onClick={() => setEditingHeader(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Redaguoti
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveHeader}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Išsaugoti
                    </button>
                  )}
                </div>

                {!editingHeader ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Sąskaita Nr.</p>
                        <p className="font-semibold text-gray-900">{invoiceData.invoice.number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Data</p>
                        <p className="font-semibold text-gray-900">{invoiceData.invoice.date}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Valiuta</p>
                        <p className="font-semibold text-gray-900">{invoiceData.invoice.currency}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Tiekėjas</p>
                        <p className="font-semibold text-gray-900">{invoiceData.supplier.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Tiekėjo kodas</p>
                        <p className="font-semibold text-gray-900">{invoiceData.supplier.code || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">PVM kodas</p>
                        <p className="font-semibold text-gray-900">{invoiceData.supplier.vat_code || '-'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border-2 border-green-200">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Suma be PVM</p>
                        <p className="font-bold text-blue-700 text-lg">
                          €{invoiceData.invoice.total_net?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">PVM ({invoiceData.invoice.vat_rate || 0}%)</p>
                        <p className="font-bold text-orange-700 text-lg">
                          €{invoiceData.invoice.total_vat?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Viso su PVM</p>
                        <p className="font-bold text-green-700 text-xl">
                          €{invoiceData.invoice.total_gross?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Sąskaita Nr.</label>
                        <input
                          type="text"
                          value={headerData.invoice_number}
                          onChange={(e) => setHeaderData({ ...headerData, invoice_number: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                        <input
                          type="date"
                          value={headerData.invoice_date}
                          onChange={(e) => setHeaderData({ ...headerData, invoice_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Valiuta</label>
                        <input
                          type="text"
                          value={invoiceData.invoice.currency}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100"
                          disabled
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tiekėjas</label>
                        <input
                          type="text"
                          value={headerData.supplier_name}
                          onChange={(e) => setHeaderData({ ...headerData, supplier_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tiekėjo kodas</label>
                        <input
                          type="text"
                          value={headerData.supplier_code || ''}
                          onChange={(e) => setHeaderData({ ...headerData, supplier_code: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">PVM kodas</label>
                        <input
                          type="text"
                          value={headerData.supplier_vat || ''}
                          onChange={(e) => setHeaderData({ ...headerData, supplier_vat: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 p-4 bg-white rounded-lg border border-gray-300">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Suma be PVM (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={headerData.total_net || 0}
                          onChange={(e) => setHeaderData({ ...headerData, total_net: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">PVM (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={headerData.total_vat || 0}
                          onChange={(e) => setHeaderData({ ...headerData, total_vat: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-orange-700 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Viso su PVM (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={headerData.total_gross || 0}
                          onChange={(e) => setHeaderData({ ...headerData, total_gross: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-green-700 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Numatytoji vieta
              </label>
              <select
                value={defaultLocationId}
                onChange={(e) => setDefaultLocationId(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Pasirinkite vietą</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Prekės ({invoiceData.items.length})</h3>
              {invoiceData.items.map((item: any, index: number) => {
                const itemData = getItemData(item, index);
                const matchedProduct = matchedProducts.get(index);
                const isMatched = matchedProduct !== null && matchedProduct !== undefined;
                const shouldReceive = itemsToReceive.get(index) !== false;

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-xl overflow-hidden transition-all ${
                      !shouldReceive
                        ? 'bg-gray-50 opacity-60 border-gray-200'
                        : isMatched
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50'
                        : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={shouldReceive}
                          onChange={() => toggleItemReceive(index)}
                          className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        {isMatched ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                        <div className="flex-1 flex items-center gap-2">
                          <span className="font-semibold text-gray-700 text-sm">#{item.line_no}:</span>
                          <input
                            type="text"
                            value={getItemData(item, index).description}
                            onChange={(e) => handleItemEdit(index, 'description', e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 text-xs mb-2">
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <span className="text-gray-600">SKU:</span>{' '}
                            <input
                              type="text"
                              value={getItemData(item, index).sku}
                              onChange={(e) => handleItemEdit(index, 'sku', e.target.value)}
                              className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs"
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">Pak. dydis:</span>{' '}
                            <input
                              type="number"
                              step="0.01"
                              value={getItemData(item, index).package_size || ''}
                              onChange={(e) => {
                                handleItemEdit(index, 'package_size', e.target.value);
                                const pkgSize = parseFloat(e.target.value) || 0;
                                const pkgCount = parseFloat(getItemData(item, index).package_count) || 0;
                                if (pkgSize && pkgCount) {
                                  const newQty = (pkgSize * pkgCount).toString();
                                  handleItemEdit(index, 'qty', newQty);
                                  const itemData = getItemData(item, index);
                                  const totalPrice = itemData.editable_total_price !== undefined
                                    ? parseFloat(itemData.editable_total_price)
                                    : (itemData.net ? parseFloat(itemData.net) : 0);
                                  const qty = parseFloat(newQty) || 0;
                                  if (qty > 0 && totalPrice) {
                                    const perUnitPrice = (totalPrice / qty).toFixed(4);
                                    handleItemEdit(index, 'price_per_unit', perUnitPrice);
                                  }
                                }
                              }}
                              className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs"
                              placeholder="10"
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">Kiek pak.:</span>{' '}
                            <input
                              type="number"
                              step="0.01"
                              value={getItemData(item, index).package_count || ''}
                              onChange={(e) => {
                                handleItemEdit(index, 'package_count', e.target.value);
                                const pkgSize = parseFloat(getItemData(item, index).package_size) || 0;
                                const pkgCount = parseFloat(e.target.value) || 0;
                                if (pkgSize && pkgCount) {
                                  const newQty = (pkgSize * pkgCount).toString();
                                  handleItemEdit(index, 'qty', newQty);
                                  const itemData = getItemData(item, index);
                                  const totalPrice = itemData.editable_total_price !== undefined
                                    ? parseFloat(itemData.editable_total_price)
                                    : (itemData.net ? parseFloat(itemData.net) : 0);
                                  const qty = parseFloat(newQty) || 0;
                                  if (qty > 0 && totalPrice) {
                                    const perUnitPrice = (totalPrice / qty).toFixed(4);
                                    handleItemEdit(index, 'price_per_unit', perUnitPrice);
                                  }
                                }
                              }}
                              className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs"
                              placeholder="6"
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">Viso:</span>{' '}
                            <input
                              type="number"
                              step="0.01"
                              value={getItemData(item, index).qty}
                              onChange={(e) => {
                                const newQty = e.target.value;
                                handleItemEdit(index, 'qty', newQty);
                                const itemData = getItemData(item, index);
                                const totalPrice = itemData.editable_total_price !== undefined
                                  ? parseFloat(itemData.editable_total_price)
                                  : (itemData.net ? parseFloat(itemData.net) : 0);
                                const qty = parseFloat(newQty) || 0;
                                if (qty > 0 && totalPrice) {
                                  const perUnitPrice = (totalPrice / qty).toFixed(4);
                                  handleItemEdit(index, 'price_per_unit', perUnitPrice);
                                }
                              }}
                              className="w-16 px-1 py-0.5 border border-green-300 rounded text-xs font-semibold bg-green-50"
                              readOnly={!!(getItemData(item, index).package_size && getItemData(item, index).package_count)}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-gray-600">Galutinė kaina:</span>{' '}
                            <input
                              type="number"
                              step="0.01"
                              value={(() => {
                                const itemData = getItemData(item, index);
                                if (itemData.editable_total_price !== undefined) {
                                  return itemData.editable_total_price;
                                }
                                return itemData.net ? parseFloat(itemData.net).toFixed(2) : '0.00';
                              })()}
                              onChange={(e) => {
                                const totalPrice = e.target.value;
                                handleItemEdit(index, 'editable_total_price', totalPrice);
                                const qty = parseFloat(getItemData(item, index).qty) || 0;
                                if (qty > 0 && totalPrice) {
                                  const perUnitPrice = (parseFloat(totalPrice) / qty).toFixed(4);
                                  handleItemEdit(index, 'price_per_unit', perUnitPrice);
                                }
                              }}
                              className="w-20 px-1 py-0.5 border-2 border-green-300 rounded text-xs font-semibold bg-green-50"
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">
                              {(() => {
                                const unit = matchedProduct?.unit_type || 'vnt';
                                return `${unit} kaina:`;
                              })()}
                            </span>{' '}
                            <input
                              type="number"
                              step="0.0001"
                              value={getItemData(item, index).price_per_unit || ''}
                              readOnly
                              className="w-20 px-1 py-0.5 border-2 border-blue-300 rounded text-xs font-semibold bg-blue-50"
                            />
                          </div>
                        </div>
                        {matchedProduct && (
                          <div className="text-xs text-blue-600 mt-1 font-medium">
                            📦 {matchedProduct.name} - Matavimo vienetas: {matchedProduct.unit_type || 'vnt'}
                            {(() => {
                              const itemData = getItemData(item, index);
                              const finalPrice = itemData.editable_total_price !== undefined
                                ? itemData.editable_total_price
                                : (itemData.net ? parseFloat(itemData.net).toFixed(2) : '0.00');
                              const qty = parseFloat(itemData.qty) || 0;
                              if (finalPrice && qty) {
                                return (
                                  <span className="ml-2">
                                    ({finalPrice} ÷ {qty} = {itemData.price_per_unit || '...'} EUR/{matchedProduct.unit_type || 'vnt'})
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                          <div>
                            <span className="text-gray-600">Serija:</span>{' '}
                            <input
                              type="text"
                              value={getItemData(item, index).batch || ''}
                              onChange={(e) => handleItemEdit(index, 'batch', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              placeholder="Serijos Nr."
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">Galioja iki:</span>{' '}
                            <input
                              type="date"
                              value={getItemData(item, index).expiry || ''}
                              onChange={(e) => handleItemEdit(index, 'expiry', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {isMatched ? (
                        <div className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border border-green-200">
                          <div className="flex items-center gap-2">
                            <span className="text-green-800"><strong>Produktas:</strong></span>
                            <select
                              value={matchedProduct.id}
                              onChange={(e) => handleProductMatch(index, e.target.value)}
                              className="px-2 py-0.5 border border-green-300 rounded text-xs bg-white"
                            >
                              {products.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-amber-800 font-semibold whitespace-nowrap">
                            Produktas nerastas
                          </p>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleProductMatch(index, e.target.value);
                              }
                            }}
                            className="px-2 py-0.5 border border-amber-300 rounded text-xs bg-white flex-1 min-w-[150px]"
                            defaultValue=""
                          >
                            <option value="">Pasirinkti esamą...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleCreateProduct(item, index)}
                            className="flex items-center gap-1 px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors whitespace-nowrap flex-shrink-0"
                          >
                            <PlusCircle className="w-3 h-3" />
                            Sukurti naują
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-xl">
              <h4 className="text-lg font-bold text-gray-900 mb-2">Masinis priėmimas</h4>
              <p className="text-xs text-gray-600 mb-4">
                Patikrinkite produktus ir paspauskite mygtuką norint priimti visas pažymėtas prekes į atsargas.
              </p>
              <button
                onClick={handleBulkReceive}
                disabled={bulkReceiving}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {bulkReceiving ? 'Priimama...' : `Priimti pažymėtus produktus (${
                  Array.from(matchedProducts.entries())
                    .filter(([index, product]) => product !== null && itemsToReceive.get(index) !== false)
                    .length
                })`}
              </button>
            </div>
          </div>
        )}
          </>
        ) : (
          <>
            <div className="bg-gradient-to-br from-blue-50 to-green-50 border-2 border-blue-200 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-blue-900 mb-6 flex items-center gap-2">
                <PlusCircle className="w-6 h-6 text-blue-600" />
                Pridėti prekę į sandėlį
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Produktas <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={currentManualItem.product_id}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, product_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pasirinkite produktą</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pakuočių kiekis <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={currentManualItem.package_qty}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, package_qty: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vienetų pakuotėje <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={currentManualItem.units_per_package}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, units_per_package: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Viso vienetų
                  </label>
                  <div className="w-full border border-gray-200 bg-blue-50 rounded-lg px-3 py-2 text-blue-700 font-bold text-lg">
                    {(parseFloat(currentManualItem.package_qty || '0') * parseFloat(currentManualItem.units_per_package || '0')).toFixed(2)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Galutinė kaina (EUR) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentManualItem.total_price}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, total_price: e.target.value })}
                    className="w-full border border-green-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 text-lg font-semibold"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vnt. kaina (apskaičiuota)
                  </label>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-gray-600 font-medium">
                    €{currentManualItem.total_price && (parseFloat(currentManualItem.package_qty || '0') * parseFloat(currentManualItem.units_per_package || '0')) > 0
                      ? (parseFloat(currentManualItem.total_price) / (parseFloat(currentManualItem.package_qty || '0') * parseFloat(currentManualItem.units_per_package || '0'))).toFixed(4)
                      : '0.0000'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Partijos numeris
                  </label>
                  <input
                    type="text"
                    value={currentManualItem.batch_number}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, batch_number: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="Pvz: BATCH-2024-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Galioja iki
                  </label>
                  <input
                    type="date"
                    value={currentManualItem.expiry_date}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, expiry_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vieta
                  </label>
                  <select
                    value={currentManualItem.location_id}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, location_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pagrindinė vieta</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pastabos
                  </label>
                  <textarea
                    value={currentManualItem.notes}
                    onChange={(e) => setCurrentManualItem({ ...currentManualItem, notes: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Papildoma informacija..."
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleAddManualItem}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-semibold text-lg"
                >
                  <Plus className="w-5 h-5" />
                  Pridėti prekę į sąrašą
                </button>
              </div>
            </div>

            {manualItems.length > 0 && (
              <div className="bg-white border-2 border-green-200 rounded-xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-green-900 mb-6 flex items-center gap-2">
                  <Package className="w-6 h-6 text-green-600" />
                  Pridėtos prekės ({manualItems.length})
                </h3>
                <div className="space-y-3">
                  {manualItems.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{item.product_name}</p>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Pakuotės:</span> {item.package_qty} vnt.
                            </div>
                            <div>
                              <span className="font-medium">Vnt./pakuotė:</span> {item.units_per_package}
                            </div>
                            <div className="col-span-2 text-base text-blue-600 font-semibold">
                              <span className="font-medium">Viso kiekis:</span> {item.quantity} {item.product_unit}
                            </div>
                            <div>
                              <span className="font-medium">Vnt. kaina:</span> €{parseFloat(item.unit_price).toFixed(2)}
                            </div>
                            <div>
                              <span className="font-medium">Bendra kaina:</span> €{item.total_price.toFixed(2)}
                            </div>
                            {item.batch_number && (
                              <div>
                                <span className="font-medium">Partija:</span> {item.batch_number}
                              </div>
                            )}
                            {item.expiry_date && (
                              <div>
                                <span className="font-medium">Galioja iki:</span> {new Date(item.expiry_date).toLocaleDateString('lt-LT')}
                              </div>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-sm text-gray-500 mt-2">{item.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveManualItem(index)}
                          className="ml-4 text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-green-50 border-2 border-green-300 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-lg font-bold text-gray-900">Bendra suma</h4>
                      <p className="text-2xl font-bold text-green-600">
                        €{manualItems.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <p>Iš viso: {manualItems.length} prekių</p>
                    </div>
                  </div>
                  <button
                    onClick={handleReceiveManualItems}
                    disabled={bulkReceiving}
                    className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    <CheckCircle className="w-6 h-6" />
                    {bulkReceiving ? 'Priimama į sandėlį...' : 'Priimti visas atsargas į sandėlį'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Sukurti naują produktą</h3>

            {creatingProduct && (
              <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <h4 className="text-sm font-bold text-blue-900 mb-2">Duomenys iš sąskaitos:</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Pakuotės dydis:</span>
                    <p className="font-bold text-blue-900">{creatingProduct.package_size || 'Nenustatyta'}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Pakuočių skaičius:</span>
                    <p className="font-bold text-blue-900">{creatingProduct.package_count || 'Nenustatyta'}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Viso:</span>
                    <p className="font-bold text-green-700">{creatingProduct.qty || 'Nenustatyta'}</p>
                  </div>
                </div>
                {creatingProduct.package_size && creatingProduct.package_count ? (
                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    {creatingProduct.package_count} pak. × {creatingProduct.package_size} = {creatingProduct.qty} viso
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-2 font-medium">
                    Pakuočių informacija nebuvo automatiškai ištraukta iš PDF
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pavadinimas *</label>
                <input
                  type="text"
                  value={newProductForm.name}
                  onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produkto kodas</label>
                <input
                  type="text"
                  value={newProductForm.product_code}
                  onChange={(e) => setNewProductForm({ ...newProductForm, product_code: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorija</label>
                <select
                  value={newProductForm.category_id}
                  onChange={(e) => setNewProductForm({ ...newProductForm, category_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite kategoriją</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vienetas</label>
                  <select
                    value={newProductForm.unit_type}
                    onChange={(e) => setNewProductForm({ ...newProductForm, unit_type: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="pcs">vnt</option>
                    <option value="kg">kg</option>
                    <option value="l">l</option>
                    <option value="m">m</option>
                    <option value="box">dėžė</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min. atsargos</label>
                  <input
                    type="number"
                    value={newProductForm.min_stock_level}
                    onChange={(e) => setNewProductForm({ ...newProductForm, min_stock_level: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gamintojas</label>
                <input
                  type="text"
                  value={newProductForm.manufacturer}
                  onChange={(e) => setNewProductForm({ ...newProductForm, manufacturer: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelio numeris</label>
                <input
                  type="text"
                  value={newProductForm.model_number}
                  onChange={(e) => setNewProductForm({ ...newProductForm, model_number: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aprašymas</label>
                <textarea
                  value={newProductForm.description}
                  onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreatingProduct(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveNewProduct}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Sukurti produktą
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
