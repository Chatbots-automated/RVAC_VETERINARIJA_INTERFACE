import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Upload, FileText, X, Check, AlertCircle, Trash2, Package, PlusCircle, CheckCircle as LucideCheckCircle, Edit2, Link2 } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  code: string;
  vat_code: string;
}

interface Product {
  id: string;
  name: string;
  unit_type: string;
  category_id: string | null;
  product_code?: string | null;
}

interface Category {
  id: string;
  name: string;
  description: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string;
  total_gross: number;
  status: string;
  pdf_url: string;
  created_at: string;
}

interface Tool {
  id: string;
  name: string;
  tool_number: string;
}

interface CostCenter {
  id: string;
  name: string;
  description: string | null;
  color: string;
  parent_id?: string | null;
}

interface InvoiceItem {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product?: {
    name: string;
    product_code: string | null;
  };
}

interface StagedFile {
  file: File;
  id: string;
  previewUrl: string;
  selected: boolean;
  status?: 'pending' | 'kept' | 'discarded';
}

interface EquipmentInvoicesProps {
  locationFilter?: 'farm' | 'warehouse';
}

export function EquipmentInvoices({ locationFilter }: EquipmentInvoicesProps = {}) {
  const { logAction, user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [matchedProducts, setMatchedProducts] = useState<Map<number, Product | null>>(new Map());
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [headerData, setHeaderData] = useState<any>(null);
  const [editedItems, setEditedItems] = useState<Map<number, any>>(new Map());
  const [editingHeader, setEditingHeader] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState<any>(null);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    product_code: '',
    unit_type: 'pcs',
    category_id: '',
    manufacturer: '',
    model_number: '',
    description: '',
    min_stock_level: '0',
  });

  // Multi-upload staging states
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [showStagingArea, setShowStagingArea] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<'batch' | 'individual'>('individual');
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'completed'>('idle');
  const [processedInvoices, setProcessedInvoices] = useState<Array<{
    fileId: string;
    fileName: string;
    status: 'pending' | 'parsing' | 'parsed' | 'error';
    invoiceData?: any;
    error?: string;
  }>>([]);

  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [assignmentForm, setAssignmentForm] = useState<{
    invoiceItemId: string;
    assignmentType: string;
    vehicleId: string;
    toolId: string;
    costCenterId: string;
    transportCompany: string;
    notes: string;
  }>({
    invoiceItemId: '',
    assignmentType: '',
    vehicleId: '',
    toolId: '',
    costCenterId: '',
    transportCompany: '',
    notes: '',
  });

  const [unassignedItems, setUnassignedItems] = useState<any[]>([]);
  const [showUnassignedSection, setShowUnassignedSection] = useState(false);

  useEffect(() => {
    loadData();
    loadUnassignedItems();
  }, []);

  const loadData = async () => {
    const [suppliersRes, productsRes, categoriesRes, invoicesRes, toolsRes, costCentersRes] = await Promise.all([
      supabase.from('equipment_suppliers').select('*').order('name'),
      supabase.from('equipment_products').select('*').eq('is_active', true).order('name'),
      supabase.from('equipment_categories').select('*').order('name'),
      supabase.from('equipment_invoices').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('tools').select('id, name, tool_number').order('name'),
      supabase.from('cost_centers').select('id, name, description, color, parent_id').eq('is_active', true).order('name'),
    ]);

    if (suppliersRes.data) setSuppliers(suppliersRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (categoriesRes.data) setCategories(categoriesRes.data);
    if (invoicesRes.data) setInvoices(invoicesRes.data);
    if (toolsRes.data) setTools(toolsRes.data);
    if (costCentersRes.data) setCostCenters(costCentersRes.data);
  };

  const loadUnassignedItems = async () => {
    const { data, error } = await supabase
      .from('equipment_unassigned_invoice_items')
      .select('*')
      .order('invoice_date', { ascending: false });

    if (error) {
      console.error('Error loading unassigned items:', error);
    } else if (data) {
      setUnassignedItems(data);
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

  const handleMultiFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newStagedFiles: StagedFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type === 'application/pdf') {
        newStagedFiles.push({
          file,
          id: `${Date.now()}-${i}`,
          previewUrl: URL.createObjectURL(file),
          selected: true,
        });
      }
    }

    if (newStagedFiles.length === 0) {
      alert('Prašome pasirinkti PDF failus');
      e.target.value = '';
      return;
    }

    setStagedFiles(prev => [...prev, ...newStagedFiles]);
    setShowStagingArea(true);
    e.target.value = '';
  };

  const toggleFileSelection = (id: string) => {
    setStagedFiles(prev => 
      prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f)
    );
  };

  const removeFile = (id: string) => {
    setStagedFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (updated.length === 0) {
        setShowStagingArea(false);
      }
      return updated;
    });
  };

  const clearAllStaged = () => {
    stagedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setStagedFiles([]);
    setShowStagingArea(false);
    setCurrentReviewIndex(0);
    setReviewMode('individual');
  };

  const handleKeepFile = () => {
    setStagedFiles(prev => prev.map((f, idx) => 
      idx === currentReviewIndex ? { ...f, status: 'kept', selected: true } : f
    ));
    if (currentReviewIndex < stagedFiles.length - 1) {
      setCurrentReviewIndex(currentReviewIndex + 1);
    }
  };

  const handleDiscardFile = () => {
    setStagedFiles(prev => prev.map((f, idx) => 
      idx === currentReviewIndex ? { ...f, status: 'discarded', selected: false } : f
    ));
    if (currentReviewIndex < stagedFiles.length - 1) {
      setCurrentReviewIndex(currentReviewIndex + 1);
    }
  };

  const handlePreviousFile = () => {
    if (currentReviewIndex > 0) {
      setCurrentReviewIndex(currentReviewIndex - 1);
    }
  };

  const finishReview = () => {
    const keptFiles = stagedFiles.filter(f => f.status === 'kept');
    if (keptFiles.length === 0) {
      alert('Nepasirinkote jokių failų');
      return;
    }
    setReviewMode('batch');
  };

  const processSelectedFiles = async () => {
    const selectedFiles = stagedFiles.filter(f => f.status === 'kept');

    if (selectedFiles.length === 0) {
      alert('Prašome pasirinkti bent vieną sąskaitą');
      return;
    }

    setProcessingStatus('processing');

    // Initialize processing status for all selected files
    const initialProcessing = selectedFiles.map(f => ({
      fileId: f.id,
      fileName: f.file.name,
      status: 'pending' as const,
    }));
    setProcessedInvoices(initialProcessing);

    // Process all files in parallel
    const processingPromises = selectedFiles.map(async (stagedFile) => {
      try {
        // Update status to parsing
        setProcessedInvoices(prev => 
          prev.map(p => p.fileId === stagedFile.id ? { ...p, status: 'parsing' } : p)
        );

        const arrayBuffer = await stagedFile.file.arrayBuffer();
        const sanitizedFilename = stagedFile.file.name
          .replace(/[()]/g, '')
          .replace(/[^\w\s.-]/g, '_')
          .replace(/\s+/g, '_');

        const response = await fetch('https://n8n-up8s.onrender.com/webhook/36549f46-a08b-4790-bf56-40cdc919e4c0', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            'X-Filename': sanitizedFilename,
          },
          body: arrayBuffer,
        });

        if (!response.ok) {
          throw new Error('Nepavyko įkelti failo');
        }

        const data = await response.json();
        const parsedData = Array.isArray(data) ? data[0] : data;

        // Update status to parsed
        setProcessedInvoices(prev => 
          prev.map(p => p.fileId === stagedFile.id 
            ? { ...p, status: 'parsed', invoiceData: parsedData } 
            : p
          )
        );

        await logAction('upload_equipment_invoice', undefined, undefined, undefined, { filename: sanitizedFilename });

        return { success: true, fileId: stagedFile.id, data: parsedData };
      } catch (error: any) {
        console.error('Error processing file:', stagedFile.file.name, error);
        setProcessedInvoices(prev => 
          prev.map(p => p.fileId === stagedFile.id 
            ? { ...p, status: 'error', error: error.message } 
            : p
          )
        );
        return { success: false, fileId: stagedFile.id, error: error.message };
      }
    });

    // Wait for all to complete
    await Promise.all(processingPromises);

    setProcessingStatus('completed');

    // Show completion message
    const successCount = processedInvoices.filter(p => p.status === 'parsed').length;
    const errorCount = processedInvoices.filter(p => p.status === 'error').length;
    
    if (errorCount === 0) {
      alert(`✅ Visos ${successCount} sąskaitos sėkmingai apdorotos! Dabar galite peržiūrėti ir patvirtinti kiekvieną.`);
    } else {
      alert(`⚠️ Apdorota: ${successCount} sėkmingai, ${errorCount} su klaidomis.`);
    }
  };

  const searchProductMatch = (itemDescription: string): Product | null => {
    const searchTerm = itemDescription.toLowerCase();
    const match = products.find(p =>
      p.name.toLowerCase().includes(searchTerm) ||
      searchTerm.includes(p.name.toLowerCase())
    );
    return match || null;
  };

  const getItemData = (item: any, index: number) => {
    const edited = editedItems.get(index);
    return edited ? { ...item, ...edited } : item;
  };

  const handleItemEdit = (index: number, field: string, value: any) => {
    const currentEdits = editedItems.get(index) || {};
    const newEdits = new Map(editedItems);
    newEdits.set(index, { ...currentEdits, [field]: value });
    setEditedItems(newEdits);
  };

  const handleBatchItemEdit = (index: number, updates: Record<string, any>) => {
    const currentEdits = editedItems.get(index) || {};
    const newEdits = new Map(editedItems);
    newEdits.set(index, { ...currentEdits, ...updates });
    setEditedItems(newEdits);
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
      unit_type: 'pcs',
      category_id: '',
      manufacturer: '',
      model_number: '',
      description: itemData.description || '',
      min_stock_level: '0',
    });
    setShowCreateModal(true);
  };

  const handleSaveNewProduct = async () => {
    if (!newProductForm.name) {
      alert('Prašome įvesti produkto pavadinimą');
      return;
    }

    try {
      const { data: newProduct, error } = await supabase
        .from('equipment_products')
        .insert({
          name: newProductForm.name,
          product_code: newProductForm.product_code || null,
          category_id: newProductForm.category_id || null,
          unit_type: newProductForm.unit_type,
          manufacturer: newProductForm.manufacturer || null,
          model_number: newProductForm.model_number || null,
          description: newProductForm.description || null,
          min_stock_level: parseFloat(newProductForm.min_stock_level) || 0,
          is_active: true,
          default_location_type: locationFilter || 'warehouse',
        })
        .select()
        .single();

      if (error) throw error;

      // Add to products list with full object structure
      const productWithMatch = {
        ...newProduct,
        matched: true,
      };
      setProducts([...products, productWithMatch]);

      // Automatically match the product
      if (creatingProduct) {
        const newMatches = new Map(matchedProducts);
        newMatches.set(creatingProduct.index, newProduct);
        setMatchedProducts(newMatches);
      }

      await logAction('create_equipment_product', 'equipment_products', newProduct.id, null, { name: newProduct.name });

      setShowCreateModal(false);
      setCreatingProduct(null);
      setNewProductForm({
        name: '',
        product_code: '',
        unit_type: 'pcs',
        category_id: '',
        manufacturer: '',
        model_number: '',
        description: '',
        min_stock_level: '0',
      });

      alert('Produktas sėkmingai sukurtas');
    } catch (error: any) {
      console.error('Error creating product:', error);
      alert('Klaida kuriant produktą: ' + error.message);
    }
  };

  const handleFileUpload = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    setUploadStatus('uploading');
    setUploadMessage('Įkeliama...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const sanitizedFilename = file.name
        .replace(/[()]/g, '')
        .replace(/[^\w\s.-]/g, '_')
        .replace(/\s+/g, '_');

      const response = await fetch('https://n8n-up8s.onrender.com/webhook/36549f46-a08b-4790-bf56-40cdc919e4c0', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Filename': sanitizedFilename,
        },
        body: arrayBuffer,
      });

      if (!response.ok) {
        throw new Error('Nepavyko įkelti failo');
      }

      const data = await response.json();

      // Parse the response - it might be an array with a single object
      const parsedData = Array.isArray(data) ? data[0] : data;
      setInvoiceData(parsedData);

      // Handle supplier data - it might be an object or a string
      const supplierName = typeof parsedData.supplier === 'object'
        ? (parsedData.supplier?.name || '')
        : (parsedData.supplier || '');
      const supplierCode = typeof parsedData.supplier === 'object'
        ? (parsedData.supplier?.code || '')
        : (parsedData.supplier_code || '');
      const vatCode = typeof parsedData.supplier === 'object'
        ? (parsedData.supplier?.vat_code || '')
        : (parsedData.vat_code || '');

      // Handle invoice data - might be nested under "invoice" key
      const invoiceInfo = parsedData.invoice || parsedData;

      setHeaderData({
        supplier_name: supplierName,
        supplier_code: supplierCode,
        vat_code: vatCode,
        invoice_number: invoiceInfo.number || invoiceInfo.invoice_number || '',
        invoice_date: invoiceInfo.date || invoiceInfo.invoice_date || new Date().toISOString().split('T')[0],
        currency: invoiceInfo.currency || 'EUR',
        total_net: invoiceInfo.total_net || 0,
        total_vat: invoiceInfo.total_vat || 0,
        total_gross: invoiceInfo.total_gross || 0,
      });

      const newMatches = new Map<number, Product | null>();
      parsedData.items?.forEach((item: any, index: number) => {
        const match = searchProductMatch(item.description || '');
        newMatches.set(index, match);
      });
      setMatchedProducts(newMatches);

      setUploadStatus('success');
      setUploadMessage('Failas sėkmingai apdorotas');
      
      // Hide staging area when processing from multi-upload
      if (showStagingArea) {
        setShowStagingArea(false);
      }
      
      await logAction('upload_equipment_invoice', undefined, undefined, undefined, { filename: sanitizedFilename });
    } catch (error: any) {
      setUploadStatus('error');
      setUploadMessage(error.message || 'Klaida įkeliant failą');
      console.error('Upload error:', error);
    }
  };

  const handleConfirmInvoice = async () => {
    if (!invoiceData || !headerData) return;

    try {
      let supplierId = suppliers.find(s => s.name === headerData.supplier_name)?.id;

      if (!supplierId && headerData.supplier_name) {
        const { data: newSupplier } = await supabase
          .from('equipment_suppliers')
          .insert({ name: headerData.supplier_name })
          .select()
          .single();
        if (newSupplier) supplierId = newSupplier.id;
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('equipment_invoices')
        .insert({
          invoice_number: headerData.invoice_number,
          invoice_date: headerData.invoice_date,
          supplier_id: supplierId,
          supplier_name: headerData.supplier_name,
          total_net: parseFloat(headerData.total_net) || 0,
          total_vat: parseFloat(headerData.total_vat) || 0,
          total_gross: parseFloat(headerData.total_gross) || 0,
          currency: 'EUR',
          status: 'received',
          pdf_url: pdfUrl,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const savedItems: InvoiceItem[] = [];

      for (const [index, item] of (invoiceData.items || []).entries()) {
        const product = matchedProducts.get(index);
        if (!product) continue;

        const itemData = getItemData(item, index);
        const quantity = parseFloat(itemData.qty || itemData.quantity) || 0;
        const totalPrice = itemData.editable_total_price !== undefined
          ? parseFloat(itemData.editable_total_price)
          : (itemData.net ? parseFloat(itemData.net) : 0);
        const unitPrice = quantity > 0 ? totalPrice / quantity : 0;
        const batchNumber = itemData.batch || itemData.lot || '';
        const expiryDate = itemData.expiry || null;

        const { data: batch } = await supabase
          .from('equipment_batches')
          .insert({
            product_id: product.id,
            invoice_id: invoice.id,
            batch_number: batchNumber,
            expiry_date: expiryDate,
            received_qty: quantity,
            qty_left: quantity,
            purchase_price: unitPrice,
          })
          .select()
          .single();

        const { data: savedItem } = await supabase
          .from('equipment_invoice_items')
          .insert({
            invoice_id: invoice.id,
            line_no: itemData.line_no || index + 1,
            product_id: product.id,
            description: itemData.description,
            quantity,
            unit_price: unitPrice,
            total_price: totalPrice,
            batch_id: batch?.id,
          })
          .select('id, product_id, description, quantity, unit_price, total_price')
          .single();

        if (savedItem) {
          savedItems.push({
            ...savedItem,
            product: {
              name: product.name,
              product_code: product.product_code || null,
            },
          });
        }
      }

      await logAction('confirm_equipment_invoice', 'equipment_invoices', invoice.id);

      // Remove the processed file from staged files
      let processedFileId: string | undefined;
      if (selectedFile && stagedFiles.length > 0) {
        processedFileId = stagedFiles.find(f => f.file === selectedFile)?.id;
        if (processedFileId) {
          setStagedFiles(prev => prev.filter(f => f.id !== processedFileId));
        }
      }

      setSavedInvoiceId(invoice.id);
      setInvoiceItems(savedItems);
      setUploadStatus('idle');
      setInvoiceData(null);
      setSelectedFile(null);
      setPdfUrl(null);
      setEditedItems(new Map());
      setMatchedProducts(new Map());
      setHeaderData(null);

      setShowAssignmentModal(true);

      loadData();

      // Check if there are more files to process
      const remainingSelected = stagedFiles.filter(f => f.selected && f.file !== selectedFile);
      if (remainingSelected.length > 0) {
        // Will process next file after assignment modal is closed
      } else if (processedFileId && stagedFiles.filter(f => f.id !== processedFileId).length === 0) {
        setShowStagingArea(false);
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleOpenAssignmentModal = (item: InvoiceItem) => {
    setAssignmentForm({
      invoiceItemId: item.id,
      assignmentType: '',
      vehicleId: '',
      toolId: '',
      costCenterId: '',
      transportCompany: '',
      notes: '',
    });
    setShowAssignmentModal(true);
  };

  const handleSaveAssignment = async () => {
    if (!assignmentForm.invoiceItemId || !assignmentForm.assignmentType) {
      alert('Prašome pasirinkti paskyrimo tipą');
      return;
    }

    if (assignmentForm.assignmentType === 'tool' && !assignmentForm.toolId) {
      alert('Prašome pasirinkti įrankį');
      return;
    }

    if (assignmentForm.assignmentType === 'cost_center' && !assignmentForm.costCenterId) {
      alert('Prašome pasirinkti kaštų centrą');
      return;
    }

    if (assignmentForm.assignmentType === 'transport_service' && !assignmentForm.transportCompany) {
      alert('Prašome įvesti transporto kompaniją');
      return;
    }

    try {
      const { error } = await supabase.from('equipment_invoice_item_assignments').insert({
        invoice_item_id: assignmentForm.invoiceItemId,
        assignment_type: assignmentForm.assignmentType,
        vehicle_id: assignmentForm.vehicleId || null,
        tool_id: assignmentForm.toolId || null,
        cost_center_id: assignmentForm.costCenterId || null,
        transport_company: assignmentForm.transportCompany || null,
        notes: assignmentForm.notes || null,
        assigned_by: user?.id || null,
      });

      if (error) throw error;

      await logAction('assign_equipment_item', 'equipment_invoice_item_assignments', undefined, null, {
        invoice_item_id: assignmentForm.invoiceItemId,
        assignment_type: assignmentForm.assignmentType,
      });

      setInvoiceItems(prev => prev.filter(item => item.id !== assignmentForm.invoiceItemId));
      
      // Reload unassigned items
      await loadUnassignedItems();

      setAssignmentForm({
        invoiceItemId: '',
        assignmentType: '',
        vehicleId: '',
        toolId: '',
        costCenterId: '',
        transportCompany: '',
        notes: '',
      });

      if (invoiceItems.length <= 1) {
        setShowAssignmentModal(false);
        const hasMoreStaged = stagedFiles.filter(f => f.selected).length > 0;
        if (hasMoreStaged) {
          alert('Produktai priskirti! Apdorojama kita sąskaita...');
          await processNextStagedFile();
        } else {
          alert('Visi produktai priskirti sėkmingai!');
        }
      } else {
        alert('Produktas priskirtas');
      }
    } catch (error: any) {
      console.error('Error assigning item:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleSkipAssignment = async () => {
    setInvoiceItems(prev => prev.filter(item => item.id !== assignmentForm.invoiceItemId));
    setAssignmentForm({
      invoiceItemId: '',
      assignmentType: '',
      vehicleId: '',
      toolId: '',
      costCenterId: '',
      transportCompany: '',
      notes: '',
    });

    // Reload unassigned items
    await loadUnassignedItems();

    if (invoiceItems.length <= 1) {
      setShowAssignmentModal(false);
      // Check if there are more files to process from staging
      await processNextStagedFile();
    }
  };

  const processNextStagedFile = async () => {
    // Find next parsed invoice that hasn't been reviewed yet
    const nextParsed = processedInvoices.find(p => p.status === 'parsed' && p.invoiceData);
    
    if (nextParsed) {
      const stagedFile = stagedFiles.find(f => f.id === nextParsed.fileId);
      if (stagedFile) {
        setSelectedFile(stagedFile.file);
        setPdfUrl(stagedFile.previewUrl);
        
        // Set the invoice data directly without re-parsing
        const parsedData = nextParsed.invoiceData;
        setInvoiceData(parsedData);

        // Handle supplier data
        const supplierName = typeof parsedData.supplier === 'object'
          ? (parsedData.supplier?.name || '')
          : (parsedData.supplier || '');
        const supplierCode = typeof parsedData.supplier === 'object'
          ? (parsedData.supplier?.code || '')
          : (parsedData.supplier_code || '');
        const vatCode = typeof parsedData.supplier === 'object'
          ? (parsedData.supplier?.vat_code || '')
          : (parsedData.vat_code || '');

        const invoiceInfo = parsedData.invoice || parsedData;

        setHeaderData({
          supplier_name: supplierName,
          supplier_code: supplierCode,
          vat_code: vatCode,
          invoice_number: invoiceInfo.number || invoiceInfo.invoice_number || '',
          invoice_date: invoiceInfo.date || invoiceInfo.invoice_date || new Date().toISOString().split('T')[0],
          currency: invoiceInfo.currency || 'EUR',
          total_net: invoiceInfo.total_net || 0,
          total_vat: invoiceInfo.total_vat || 0,
          total_gross: invoiceInfo.total_gross || 0,
        });

        const newMatches = new Map<number, Product | null>();
        parsedData.items?.forEach((item: any, index: number) => {
          const match = searchProductMatch(item.description || '');
          newMatches.set(index, match);
        });
        setMatchedProducts(newMatches);

        setUploadStatus('success');
        setUploadMessage('Failas sėkmingai apdorotas');
        
        // Mark this invoice as being reviewed
        setProcessedInvoices(prev => 
          prev.filter(p => p.fileId !== nextParsed.fileId)
        );
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Unassigned Items Section */}
      {unassignedItems.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <h3 className="text-lg font-semibold text-gray-800">
                Nepriskirti produktai ({unassignedItems.length})
              </h3>
            </div>
            <button
              onClick={() => setShowUnassignedSection(!showUnassignedSection)}
              className="text-sm text-amber-700 hover:text-amber-800 font-medium"
            >
              {showUnassignedSection ? 'Slėpti' : 'Rodyti'}
            </button>
          </div>

          {showUnassignedSection && (
            <div className="space-y-3">
              {unassignedItems.map((item) => (
                <div key={item.item_id} className="bg-white border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Package className="w-5 h-5 text-gray-600" />
                        <h4 className="font-semibold text-gray-900">{item.product_name}</h4>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-sm text-gray-600 mb-2">
                        <div>
                          <span className="font-medium">Sąskaita:</span> {item.invoice_number}
                        </div>
                        <div>
                          <span className="font-medium">Data:</span> {new Date(item.invoice_date).toLocaleDateString('lt-LT')}
                        </div>
                        <div>
                          <span className="font-medium">Kiekis:</span> {item.quantity}
                        </div>
                        <div>
                          <span className="font-medium">Suma:</span> {item.total_price.toFixed(2)} EUR
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        <span className="font-medium">Tiekėjas:</span> {item.supplier_name}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        // Set up assignment form and show modal
                        setAssignmentForm({
                          invoiceItemId: item.item_id,
                          assignmentType: '',
                          vehicleId: '',
                          toolId: '',
                          costCenterId: '',
                          transportCompany: '',
                          notes: '',
                        });
                        setInvoiceItems([{
                          id: item.item_id,
                          product_id: item.product_id,
                          description: item.product_name,
                          quantity: item.quantity,
                          unit_price: item.unit_price,
                          total_price: item.total_price,
                          product: {
                            name: item.product_name,
                            product_code: item.product_code,
                          }
                        }]);
                        setShowAssignmentModal(true);
                      }}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-2 whitespace-nowrap"
                    >
                      <Link2 className="w-4 h-4" />
                      Priskirti
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Nauja sąskaita</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-slate-400 transition-colors">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-3 text-sm">Viena sąskaita</p>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="pdf-upload"
            />
            <label
              htmlFor="pdf-upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 cursor-pointer transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              Pasirinkti PDF
            </label>
          </div>

          <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors bg-blue-50">
            <Upload className="w-10 h-10 text-blue-500 mx-auto mb-3" />
            <p className="text-blue-700 mb-3 text-sm font-medium">Kelios sąskaitos vienu metu</p>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleMultiFileSelect}
              className="hidden"
              id="multi-pdf-upload"
              multiple
            />
            <label
              htmlFor="multi-pdf-upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              Pasirinkti kelis PDF
            </label>
          </div>
        </div>

        {selectedFile && !showStagingArea && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-slate-600" />
                <div>
                  <p className="font-medium text-gray-800">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {uploadStatus === 'idle' && (
                  <button
                    onClick={() => handleFileUpload()}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    Apdoroti
                  </button>
                )}
                {uploadStatus === 'uploading' && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600"></div>
                    <span>Apdorojama...</span>
                  </div>
                )}
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPdfUrl(null);
                    setInvoiceData(null);
                  }}
                  className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {uploadMessage && (
              <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
                uploadStatus === 'success' ? 'bg-green-50 text-green-800' :
                uploadStatus === 'error' ? 'bg-red-50 text-red-800' : ''
              }`}>
                {uploadStatus === 'success' && <CheckCircle className="w-5 h-5" />}
                {uploadStatus === 'error' && <AlertCircle className="w-5 h-5" />}
                <span>{uploadMessage}</span>
              </div>
            )}
          </div>
        )}

        {showStagingArea && stagedFiles.length > 0 && (
          <div className="mt-4">
            {reviewMode === 'individual' && stagedFiles.filter(f => !f.status || f.status === 'pending').length > 0 ? (
              /* Individual Review Mode */
              <div className="bg-white border-2 border-blue-500 rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-xl font-bold text-gray-900">
                      Peržiūrėkite sąskaitą {currentReviewIndex + 1} iš {stagedFiles.length}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Pasirinkite, ar norite išsaugoti šią sąskaitą apdorojimui
                    </p>
                  </div>
                  <button
                    onClick={clearAllStaged}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Atšaukti viską
                  </button>
                </div>

                {/* Current File Preview */}
                {stagedFiles[currentReviewIndex] && (
                  <div className="space-y-4">
                    {/* PDF Preview */}
                    <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                      <iframe
                        src={stagedFiles[currentReviewIndex].previewUrl}
                        className="w-full h-[500px]"
                        title="Invoice Preview"
                      />
                    </div>

                    {/* File Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-gray-600" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{stagedFiles[currentReviewIndex].file.name}</p>
                          <p className="text-sm text-gray-600">
                            {(stagedFiles[currentReviewIndex].file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Decision Buttons */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <button
                        onClick={handlePreviousFile}
                        disabled={currentReviewIndex === 0}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ← Atgal
                      </button>

                      <div className="flex gap-3">
                        <button
                          onClick={handleDiscardFile}
                          className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium"
                        >
                          <X className="w-5 h-5" />
                          Išmesti
                        </button>
                        <button
                          onClick={handleKeepFile}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium"
                        >
                          <Check className="w-5 h-5" />
                          Išsaugoti
                        </button>
                      </div>

                      {currentReviewIndex === stagedFiles.length - 1 ? (
                        <button
                          onClick={finishReview}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                          Baigti peržiūrą →
                        </button>
                      ) : (
                        <button
                          onClick={() => setCurrentReviewIndex(currentReviewIndex + 1)}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          Praleisti →
                        </button>
                      )}
                    </div>

                    {/* Progress Indicator */}
                    <div className="flex items-center gap-2 justify-center">
                      {stagedFiles.map((file, idx) => (
                        <div
                          key={file.id}
                          className={`w-2 h-2 rounded-full transition-all ${
                            file.status === 'kept' ? 'bg-green-500' :
                            file.status === 'discarded' ? 'bg-red-500' :
                            idx === currentReviewIndex ? 'bg-blue-500 scale-150' :
                            'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Batch View Mode - Show all selected files */
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-blue-600" />
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800">
                        Pasirinktos sąskaitos ({stagedFiles.filter(f => f.status === 'kept').length})
                      </h4>
                      <p className="text-sm text-gray-600">
                        {processingStatus === 'processing' 
                          ? `Apdorojamos sąskaitos...`
                          : processingStatus === 'completed'
                          ? 'Apdorojimas baigtas!'
                          : 'Paspauskite "Apdoroti pasirinktas" kad pradėtumėte'
                        }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearAllStaged}
                    disabled={processingStatus === 'processing'}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    Išvalyti visas
                  </button>
                </div>

            {/* Progress Bar */}
            {(processingStatus === 'processing' || processingStatus === 'completed') && processedInvoices.length > 0 && (
              <div className="mb-4 bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Apdorojimo progresas</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {Math.round((processedInvoices.filter(p => p.status !== 'pending').length / processedInvoices.length) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                    style={{ 
                      width: `${(processedInvoices.filter(p => p.status !== 'pending').length / processedInvoices.length) * 100}%` 
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                  <span>✅ Apdorota: {processedInvoices.filter(p => p.status === 'parsed').length}</span>
                  <span>⏳ Apdorojama: {processedInvoices.filter(p => p.status === 'parsing').length}</span>
                  <span>❌ Klaidos: {processedInvoices.filter(p => p.status === 'error').length}</span>
                </div>
              </div>
            )}

                {/* Progress Bar */}
                {(processingStatus === 'processing' || processingStatus === 'completed') && processedInvoices.length > 0 && (
                  <div className="mb-4 bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Apdorojimo progresas</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {Math.round((processedInvoices.filter(p => p.status !== 'pending').length / processedInvoices.length) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                        style={{ 
                          width: `${(processedInvoices.filter(p => p.status !== 'pending').length / processedInvoices.length) * 100}%` 
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                      <span>✅ Apdorota: {processedInvoices.filter(p => p.status === 'parsed').length}</span>
                      <span>⏳ Apdorojama: {processedInvoices.filter(p => p.status === 'parsing').length}</span>
                      <span>❌ Klaidos: {processedInvoices.filter(p => p.status === 'error').length}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4 max-h-96 overflow-y-auto">
                  {stagedFiles.filter(f => f.status === 'kept').map((stagedFile) => {
                const processingInfo = processedInvoices.find(p => p.fileId === stagedFile.id);
                const isParsing = processingInfo?.status === 'parsing';
                const isParsed = processingInfo?.status === 'parsed';
                const hasError = processingInfo?.status === 'error';

                return (
                  <div
                    key={stagedFile.id}
                    className={`relative border-2 rounded-lg overflow-hidden transition-all duration-200 ${
                      isParsing
                        ? 'border-blue-300 bg-blue-50 shadow-sm'
                        : isParsed
                        ? 'border-green-300 bg-green-50 shadow-sm'
                        : hasError
                        ? 'border-red-300 bg-red-50 shadow-sm'
                        : stagedFile.selected
                        ? 'border-blue-400 bg-white shadow-sm'
                        : 'border-gray-300 bg-gray-50 opacity-60'
                    }`}
                  >
                    {/* Status Badge */}
                    {isParsing && (
                      <div className="absolute top-2 left-2 z-20 px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded flex items-center gap-1">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        Apdorojama
                      </div>
                    )}
                    {isParsed && (
                      <div className="absolute top-2 left-2 z-20 px-2 py-1 bg-green-500 text-white text-xs font-medium rounded flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Apdorota
                      </div>
                    )}
                    {hasError && (
                      <div className="absolute top-2 left-2 z-20 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded flex items-center gap-1">
                        <X className="w-3 h-3" />
                        Klaida
                      </div>
                    )}

                    {!isParsing && !isParsed && !hasError && (
                      <div className="absolute top-2 left-2 z-10">
                        <input
                          type="checkbox"
                          checked={stagedFile.selected}
                          onChange={() => toggleFileSelection(stagedFile.id)}
                          className="w-5 h-5 rounded cursor-pointer"
                          disabled={processingStatus === 'processing'}
                        />
                      </div>
                    )}

                    {processingStatus === 'idle' && (
                      <button
                        onClick={() => removeFile(stagedFile.id)}
                        className="absolute top-2 right-2 z-10 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}

                    <div className="aspect-[3/4] bg-gray-100 relative">
                      {isParsing && (
                        <div className="absolute inset-0 bg-blue-100 bg-opacity-30 flex items-center justify-center z-10">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                        </div>
                      )}
                      {isParsed && (
                        <div className="absolute inset-0 bg-green-100 bg-opacity-20 flex items-center justify-center z-10">
                          <Check className="w-12 h-12 text-green-500" />
                        </div>
                      )}
                      <iframe
                        src={`${stagedFile.previewUrl}#view=FitH`}
                        className="w-full h-full pointer-events-none"
                        title={stagedFile.file.name}
                      />
                    </div>

                    <div className="p-3 bg-white">
                      <p className="text-sm font-medium text-gray-800 truncate" title={stagedFile.file.name}>
                        {stagedFile.file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(stagedFile.file.size / 1024).toFixed(2)} KB
                      </p>
                      {hasError && (
                        <p className="text-xs text-red-600 mt-1 font-medium">
                          {processingInfo.error}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
                </div>

                <div className="flex items-center justify-between pt-4 border-t-2 border-blue-200">
                  <div className="flex-1">
                    {processingStatus === 'idle' && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">{stagedFiles.filter(f => f.status === 'kept').length}</span> sąskaitų paruošta apdorojimui
                      </p>
                    )}
                {processingStatus === 'processing' && (
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <div>
                      <p className="text-sm font-semibold text-blue-700">Apdorojamos sąskaitos...</p>
                      <p className="text-xs text-gray-600">
                        {processedInvoices.filter(p => p.status === 'parsed').length} iš {processedInvoices.length} apdorota
                      </p>
                    </div>
                  </div>
                )}
                {processingStatus === 'completed' && (
                  <div className="flex items-center gap-3">
                    <Check className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-green-700">Visos sąskaitos apdorotos!</p>
                      <p className="text-xs text-gray-600">
                        {processedInvoices.filter(p => p.status === 'parsed').length} sėkmingai, {' '}
                        {processedInvoices.filter(p => p.status === 'error').length} su klaidomis
                      </p>
                    </div>
                  </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {processingStatus === 'idle' && (
                      <button
                        onClick={processSelectedFiles}
                        disabled={stagedFiles.filter(f => f.status === 'kept').length === 0}
                        className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
                      >
                        <Check className="w-4 h-4" />
                        Apdoroti pasirinktas ({stagedFiles.filter(f => f.status === 'kept').length})
                      </button>
                    )}
                    {processingStatus === 'completed' && processedInvoices.filter(p => p.status === 'parsed').length > 0 && (
                      <button
                        onClick={() => {
                          processNextStagedFile();
                          setShowStagingArea(false);
                        }}
                        className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium"
                      >
                        <FileText className="w-4 h-4" />
                        Pradėti peržiūrą ({processedInvoices.filter(p => p.status === 'parsed').length})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notification for remaining invoices to review */}
        {processedInvoices.filter(p => p.status === 'parsed').length > 0 && !invoiceData && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <FileText className="w-7 h-7 text-green-600" />
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                    {processedInvoices.filter(p => p.status === 'parsed').length}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-800">
                    {processedInvoices.filter(p => p.status === 'parsed').length} sąskaitos laukia peržiūros
                  </p>
                  <p className="text-sm text-gray-600">Spauskite mygtuką, kad pradėtumėte peržiūrą</p>
                </div>
              </div>
              <button
                onClick={() => {
                  processNextStagedFile();
                }}
                className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium"
              >
                <FileText className="w-4 h-4" />
                Pradėti peržiūrą
              </button>
            </div>
          </div>
        )}

        {invoiceData && headerData && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pdfUrl && (
              <div className="lg:sticky lg:top-6 lg:self-start">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Sąskaitos PDF</h3>
                  <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: '800px' }}>
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full"
                      title="Invoice PDF"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
            <div className="border-2 border-blue-300 rounded-xl p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-gray-900">Sąskaitos duomenys</h3>
                  {processedInvoices.filter(p => p.status === 'parsed').length > 0 && (
                    <span className="px-2.5 py-0.5 bg-blue-500 text-white text-xs font-semibold rounded-full">
                      {processedInvoices.filter(p => p.status === 'parsed').length} liko
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setEditingHeader(!editingHeader)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  {editingHeader ? 'Baigti redaguoti' : 'Redaguoti'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-1">Sąskaita Nr.</label>
                  {editingHeader ? (
                    <input
                      type="text"
                      value={headerData.invoice_number}
                      onChange={e => setHeaderData({ ...headerData, invoice_number: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  ) : (
                    <p className="text-lg font-bold text-gray-900">{headerData.invoice_number}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-1">Data</label>
                  {editingHeader ? (
                    <input
                      type="date"
                      value={headerData.invoice_date}
                      onChange={e => setHeaderData({ ...headerData, invoice_date: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-lg font-bold text-gray-900">{headerData.invoice_date}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-1">Valiuta</label>
                  {editingHeader ? (
                    <input
                      type="text"
                      value={headerData.currency}
                      onChange={e => setHeaderData({ ...headerData, currency: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-lg font-bold text-gray-900">{headerData.currency}</p>
                  )}
                </div>
              </div>

              <div className="border-t-2 border-blue-200 pt-4 mb-4">
                <h4 className="text-lg font-bold text-blue-900 mb-3">Tiekėjas</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-1">Tiekėjas</label>
                    {editingHeader ? (
                      <input
                        type="text"
                        value={headerData.supplier_name}
                        onChange={e => setHeaderData({ ...headerData, supplier_name: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
                      />
                    ) : (
                      <p className="text-lg font-bold text-gray-900">{headerData.supplier_name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-1">Tiekėjo kodas</label>
                    {editingHeader ? (
                      <input
                        type="text"
                        value={headerData.supplier_code}
                        onChange={e => setHeaderData({ ...headerData, supplier_code: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-lg font-bold text-gray-900">{headerData.supplier_code || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-1">PVM kodas</label>
                    {editingHeader ? (
                      <input
                        type="text"
                        value={headerData.vat_code}
                        onChange={e => setHeaderData({ ...headerData, vat_code: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-lg font-bold text-gray-900">{headerData.vat_code || '-'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t-2 border-blue-200 pt-4">
                <h4 className="text-lg font-bold text-blue-900 mb-3">Sumos</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
                    <label className="block text-sm font-semibold text-blue-900 mb-1">Suma be PVM</label>
                    {editingHeader ? (
                      <input
                        type="number"
                        step="0.01"
                        value={headerData.total_net}
                        onChange={e => setHeaderData({ ...headerData, total_net: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-lg"
                      />
                    ) : (
                      <p className="text-2xl font-bold text-blue-600">{parseFloat(headerData.total_net).toFixed(2)} EUR</p>
                    )}
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                    <label className="block text-sm font-semibold text-gray-800 mb-1">PVM</label>
                    {editingHeader ? (
                      <input
                        type="number"
                        step="0.01"
                        value={headerData.total_vat}
                        onChange={e => setHeaderData({ ...headerData, total_vat: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg focus:ring-2 focus:ring-gray-600 font-bold text-lg font-mono"
                      />
                    ) : (
                      <p className="text-2xl font-bold text-gray-700 font-mono">{parseFloat(headerData.total_vat).toFixed(2)} EUR</p>
                    )}
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2 border-green-200">
                    <label className="block text-sm font-semibold text-green-900 mb-1">Suma su PVM</label>
                    {editingHeader ? (
                      <input
                        type="number"
                        step="0.01"
                        value={headerData.total_gross}
                        onChange={e => setHeaderData({ ...headerData, total_gross: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 font-bold text-lg"
                      />
                    ) : (
                      <p className="text-2xl font-bold text-green-600">{parseFloat(headerData.total_gross).toFixed(2)} EUR</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Prekės ({invoiceData.items?.length || 0})</h3>
              {invoiceData.items?.map((item: any, index: number) => {
                const itemData = getItemData(item, index);
                const matchedProduct = matchedProducts.get(index);
                const isMatched = matchedProduct !== null && matchedProduct !== undefined;

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-xl overflow-hidden transition-all ${
                      isMatched
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50'
                        : 'border-gray-200 bg-gradient-to-br from-gray-50 to-slate-100'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        {isMatched ? (
                          <LucideCheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        )}
                        <div className="flex-1 flex items-center gap-2">
                          <span className="font-semibold text-gray-700 text-sm">#{item.line_no || index + 1}:</span>
                          <input
                            type="text"
                            value={getItemData(item, index).description}
                            onChange={(e) => handleItemEdit(index, 'description', e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 text-xs mb-2">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <span className="text-gray-600">SKU:</span>{' '}
                            <input
                              type="text"
                              value={getItemData(item, index).sku || ''}
                              onChange={(e) => handleItemEdit(index, 'sku', e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">Vienetas:</span>{' '}
                            <span className="font-semibold text-gray-900">{matchedProduct?.unit_type || item.unit || 'vnt'}</span>
                          </div>
                        </div>

                        <div className="p-3 bg-gray-50 border-2 border-gray-300 rounded mb-2">
                          <p className="text-xs text-gray-700 font-bold mb-2 uppercase tracking-wide">Pakuočių skaičiavimas (optional)</p>
                          <div className="grid grid-cols-5 gap-2 items-end">
                            <div>
                              <label className="block text-gray-700 font-medium mb-0.5 text-xs">Pak. dydis:</label>
                              <input
                                type="number"
                                step="0.01"
                                value={getItemData(item, index).package_size || ''}
                                onChange={(e) => {
                                  const newPkgSize = e.target.value;
                                  const itemData = getItemData(item, index);
                                  const pkgSize = parseFloat(newPkgSize) || 0;
                                  const pkgCount = parseFloat(itemData.package_count || '0') || 0;

                                  const updates: Record<string, any> = {
                                    package_size: newPkgSize
                                  };

                                  if (pkgSize > 0 && pkgCount > 0) {
                                    const newQty = (pkgSize * pkgCount).toFixed(2);
                                    updates.qty = newQty;

                                    const totalPrice = itemData.editable_total_price !== undefined
                                      ? parseFloat(itemData.editable_total_price)
                                      : (itemData.net ? parseFloat(itemData.net) : 0);

                                    if (totalPrice > 0) {
                                      updates.price_per_unit = (totalPrice / parseFloat(newQty)).toFixed(4);
                                    }
                                  } else if (!newPkgSize) {
                                    updates.qty = '';
                                  }

                                  handleBatchItemEdit(index, updates);
                                }}
                                className="w-full px-3 py-2 border border-gray-400 rounded bg-white text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-mono"
                                placeholder="10"
                              />
                            </div>
                            <div className="text-center pb-2">
                              <span className="text-gray-600 font-bold text-lg">×</span>
                            </div>
                            <div>
                              <label className="block text-gray-700 font-medium mb-0.5 text-xs">Kiek pak.:</label>
                              <input
                                type="number"
                                step="0.01"
                                value={getItemData(item, index).package_count || ''}
                                onChange={(e) => {
                                  const newPkgCount = e.target.value;
                                  const itemData = getItemData(item, index);
                                  const pkgSize = parseFloat(itemData.package_size || '0') || 0;
                                  const pkgCount = parseFloat(newPkgCount) || 0;

                                  const updates: Record<string, any> = {
                                    package_count: newPkgCount
                                  };

                                  if (pkgSize > 0 && pkgCount > 0) {
                                    const newQty = (pkgSize * pkgCount).toFixed(2);
                                    updates.qty = newQty;

                                    const totalPrice = itemData.editable_total_price !== undefined
                                      ? parseFloat(itemData.editable_total_price)
                                      : (itemData.net ? parseFloat(itemData.net) : 0);

                                    if (totalPrice > 0) {
                                      updates.price_per_unit = (totalPrice / parseFloat(newQty)).toFixed(4);
                                    }
                                  } else if (!newPkgCount) {
                                    updates.qty = '';
                                  }

                                  handleBatchItemEdit(index, updates);
                                }}
                                className="w-full px-3 py-2 border border-gray-400 rounded bg-white text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-mono"
                                placeholder="6"
                              />
                            </div>
                            <div className="text-center pb-2">
                              <span className="text-gray-600 font-bold text-lg">=</span>
                            </div>
                            <div>
                              <label className="block text-gray-700 font-medium mb-0.5 text-xs">Viso:</label>
                              <input
                                type="number"
                                step="0.01"
                                value={getItemData(item, index).qty || getItemData(item, index).quantity || ''}
                                onChange={(e) => {
                                  const newQty = e.target.value;
                                  handleItemEdit(index, 'qty', newQty);
                                  handleItemEdit(index, 'package_size', '');
                                  handleItemEdit(index, 'package_count', '');

                                  const itemData = getItemData(item, index);
                                  const totalPrice = itemData.editable_total_price !== undefined
                                    ? parseFloat(itemData.editable_total_price)
                                    : (itemData.net ? parseFloat(itemData.net) : 0);
                                  const qty = parseFloat(newQty) || 0;

                                  if (qty > 0 && totalPrice > 0) {
                                    const perUnitPrice = (totalPrice / qty).toFixed(4);
                                    handleItemEdit(index, 'price_per_unit', perUnitPrice);
                                  }
                                }}
                                className={`w-full px-3 py-2 border rounded text-sm font-bold font-mono ${
                                  getItemData(item, index).package_size && getItemData(item, index).package_count
                                    ? 'border-slate-500 bg-slate-100 cursor-not-allowed text-slate-700'
                                    : 'border-gray-400 bg-white focus:ring-2 focus:ring-gray-600 focus:border-gray-600'
                                }`}
                                readOnly={!!(getItemData(item, index).package_size && getItemData(item, index).package_count)}
                                title={getItemData(item, index).package_size && getItemData(item, index).package_count ? 'Apskaičiuota iš pakuočių' : 'Įveskite kiekį tiesiogiai'}
                              />
                            </div>
                          </div>
                          {getItemData(item, index).package_size && getItemData(item, index).package_count && (
                            <div className="mt-2 px-2 py-1 bg-slate-100 border border-slate-300 rounded">
                              <p className="text-xs text-slate-700 font-mono font-medium">
                                = {getItemData(item, index).package_size} × {getItemData(item, index).package_count} = {getItemData(item, index).qty} {matchedProduct?.unit_type || item.unit || 'vnt'}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Edit2 className="w-4 h-4 text-emerald-700" />
                              <label className="block text-sm font-bold text-emerald-900">Galutinė kaina (redaguojama)</label>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={(() => {
                                const itemData = getItemData(item, index);
                                if ('editable_total_price' in (editedItems.get(index) || {})) {
                                  return itemData.editable_total_price || '';
                                }
                                return itemData.net ? parseFloat(itemData.net).toFixed(2) : '0.00';
                              })()}
                              onChange={(e) => {
                                const totalPrice = e.target.value;
                                handleItemEdit(index, 'editable_total_price', totalPrice);
                                const qty = parseFloat(getItemData(item, index).qty || getItemData(item, index).quantity) || 0;
                                if (qty > 0 && totalPrice) {
                                  const perUnitPrice = (parseFloat(totalPrice) / qty).toFixed(4);
                                  handleItemEdit(index, 'price_per_unit', perUnitPrice);
                                } else if (!totalPrice) {
                                  handleItemEdit(index, 'price_per_unit', '');
                                }
                              }}
                              className="w-full px-3 py-2 border-2 border-emerald-400 rounded-lg text-base font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                              placeholder="0.00"
                              title="Galite redaguoti kainą čia - pakeitimai perskaičiuos vieneto kainą"
                            />
                          </div>
                          <div className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              {matchedProduct?.unit_type || 'vnt'} kaina (auto)
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              value={getItemData(item, index).price_per_unit || ''}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base font-semibold bg-gray-100 cursor-not-allowed font-mono"
                              title="Automatiškai apskaičiuojama iš galutinės kainos ir kiekio"
                            />
                          </div>
                        </div>
                        {matchedProduct && (
                          <div className="text-xs text-blue-600 mt-1 font-medium">
                            📦 {matchedProduct.name} - Matavimo vienetas: {matchedProduct.unit_type}
                            {(() => {
                              const itemData = getItemData(item, index);
                              const finalPrice = itemData.editable_total_price !== undefined
                                ? itemData.editable_total_price
                                : (itemData.net ? parseFloat(itemData.net).toFixed(2) : '0.00');
                              const qty = parseFloat(itemData.qty || itemData.quantity) || 0;
                              if (finalPrice && qty) {
                                return (
                                  <span className="ml-2">
                                    ({finalPrice} ÷ {qty} = {itemData.price_per_unit || '...'} EUR/{matchedProduct.unit_type})
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
                              value={getItemData(item, index).batch || getItemData(item, index).lot || ''}
                              onChange={(e) => handleItemEdit(index, 'batch', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              placeholder="Serijos Nr."
                            />
                          </div>
                          <div>
                            <span className="text-gray-600">Galioja iki <span className="text-gray-400 text-xs">(optional)</span>:</span>{' '}
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
                        <div className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border border-emerald-200">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-emerald-800"><strong>Produktas:</strong></span>
                            <input
                              type="text"
                              placeholder="Ieškoti produkto..."
                              value={productSearchTerm}
                              onChange={(e) => setProductSearchTerm(e.target.value)}
                              className="px-2 py-1 border border-emerald-300 rounded text-xs flex-1"
                            />
                            <select
                              value={matchedProduct.id}
                              onChange={(e) => {
                                handleProductMatch(index, e.target.value);
                                setProductSearchTerm('');
                              }}
                              className="px-2 py-0.5 border border-emerald-300 rounded text-xs bg-white"
                            >
                              {products
                                .filter(p => 
                                  !productSearchTerm || 
                                  p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                                  (p.product_code && p.product_code.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                )
                                .map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {p.product_code ? `(${p.product_code})` : ''}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-gray-700 font-semibold whitespace-nowrap">
                            Produktas nerastas
                          </p>
                          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                            <input
                              type="text"
                              placeholder="Ieškoti produkto..."
                              value={productSearchTerm}
                              onChange={(e) => setProductSearchTerm(e.target.value)}
                              className="px-2 py-1 border border-gray-400 rounded text-xs flex-1 min-w-[120px]"
                            />
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleProductMatch(index, e.target.value);
                                  setProductSearchTerm('');
                                }
                              }}
                              className="px-2 py-0.5 border border-gray-400 rounded text-xs bg-white font-mono min-w-[100px]"
                              defaultValue=""
                            >
                              <option value="">Pasirinkti...</option>
                              {products
                                .filter(p => 
                                  !productSearchTerm || 
                                  p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                                  (p.product_code && p.product_code.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                )
                                .map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {p.product_code ? `(${p.product_code})` : ''}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <button
                            onClick={() => handleCreateProduct(item, index)}
                            className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded text-xs font-medium hover:bg-gray-900 transition-all shadow-md whitespace-nowrap flex-shrink-0"
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

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setInvoiceData(null);
                  setSelectedFile(null);
                  setPdfUrl(null);
                  setEditedItems(new Map());
                  setMatchedProducts(new Map());
                  setHeaderData(null);
                  // Show staging area again if there are files
                  if (stagedFiles.length > 0) {
                    setShowStagingArea(true);
                  }
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {stagedFiles.length > 0 ? 'Grįžti į sąrašą' : 'Atšaukti'}
              </button>
              <button
                onClick={handleConfirmInvoice}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <LucideCheckCircle className="w-5 h-5" />
                Patvirtinti pajamavimą
              </button>
            </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Paskutinės sąskaitos</h3>
        <div className="space-y-2">
          {invoices.map(invoice => (
            <div key={invoice.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <FileText className="w-8 h-8 text-slate-600" />
                <div>
                  <p className="font-medium text-gray-800">{invoice.invoice_number}</p>
                  <p className="text-sm text-gray-600">{invoice.supplier_name} · {invoice.invoice_date}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold text-gray-800">€{invoice.total_gross.toFixed(2)}</p>
                  <p className="text-sm text-gray-600">{invoice.status}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
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
                    <p className="font-bold text-green-700">{creatingProduct.qty || creatingProduct.quantity || 'Nenustatyta'}</p>
                  </div>
                </div>
                {creatingProduct.package_size && creatingProduct.package_count ? (
                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    {creatingProduct.package_count} pak. × {creatingProduct.package_size} = {creatingProduct.qty || creatingProduct.quantity} viso
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 mt-2 font-medium">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorija *</label>
                <select
                  value={newProductForm.category_id}
                  onChange={(e) => setNewProductForm({ ...newProductForm, category_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Pasirinkite kategoriją</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
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

      {showAssignmentModal && invoiceItems.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                Priskirti produktus ({invoiceItems.length} liko)
              </h3>
              <button
                onClick={async () => {
                  setShowAssignmentModal(false);
                  setInvoiceItems([]);
                  // Check if there are more files to process
                  await processNextStagedFile();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                Priskiriate produktus transporto priemonėms, įrankiams ar bendrai fermai. Tai leis sekti kiekvieno objekto dalių naudojimą ir išlaidas.
              </p>
            </div>

            {invoiceItems[0] && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-5 h-5 text-slate-600" />
                    <h4 className="font-semibold text-gray-900">
                      {invoiceItems[0].product?.name || invoiceItems[0].description}
                    </h4>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Kiekis:</span> {invoiceItems[0].quantity}
                    </div>
                    <div>
                      <span className="font-medium">Kaina:</span> {invoiceItems[0].unit_price.toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Viso:</span> {invoiceItems[0].total_price.toFixed(2)} EUR
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Paskyrimo tipas</label>
                  
                  {/* Farm Equipment Specific Categories */}
                  {locationFilter === 'farm' && (
                    <>
                      <p className="text-xs text-gray-600 mb-2">Fermos įrangos kategorijos:</p>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                          onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'periodic_service', invoiceItemId: invoiceItems[0].id })}
                          className={`p-3 border-2 rounded-lg transition-all ${
                            assignmentForm.assignmentType === 'periodic_service'
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm">Periodinis servisas</p>
                            <p className="text-xs text-gray-500 mt-1">Planuotas aptarnavimas</p>
                          </div>
                        </button>

                        <button
                          onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'breakdown_repair', invoiceItemId: invoiceItems[0].id })}
                          className={`p-3 border-2 rounded-lg transition-all ${
                            assignmentForm.assignmentType === 'breakdown_repair'
                              ? 'border-red-500 bg-red-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm">Gedimo taisymas</p>
                            <p className="text-xs text-gray-500 mt-1">Skubūs remontai</p>
                          </div>
                        </button>

                        <button
                          onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'parts_replacement', invoiceItemId: invoiceItems[0].id })}
                          className={`p-3 border-2 rounded-lg transition-all ${
                            assignmentForm.assignmentType === 'parts_replacement'
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm">Dalių keitimas</p>
                            <p className="text-xs text-gray-500 mt-1">Nusidėvėjusių dalių keitimas</p>
                          </div>
                        </button>

                        <button
                          onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'modernization', invoiceItemId: invoiceItems[0].id })}
                          className={`p-3 border-2 rounded-lg transition-all ${
                            assignmentForm.assignmentType === 'modernization'
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm">Modernizavimas</p>
                            <p className="text-xs text-gray-500 mt-1">Pagerinimas, atnaujinimas</p>
                          </div>
                        </button>

                        <button
                          onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'safety_inspection', invoiceItemId: invoiceItems[0].id })}
                          className={`p-3 border-2 rounded-lg transition-all ${
                            assignmentForm.assignmentType === 'safety_inspection'
                              ? 'border-yellow-500 bg-yellow-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm">Saugos patikra</p>
                            <p className="text-xs text-gray-500 mt-1">Saugos tikrinimas</p>
                          </div>
                        </button>

                        <button
                          onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'cleaning_maintenance', invoiceItemId: invoiceItems[0].id })}
                          className={`p-3 border-2 rounded-lg transition-all ${
                            assignmentForm.assignmentType === 'cleaning_maintenance'
                              ? 'border-cyan-500 bg-cyan-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm">Valymas ir priežiūra</p>
                            <p className="text-xs text-gray-500 mt-1">Rutininis valymas</p>
                          </div>
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mb-2 mt-4">Arba bendros kategorijos:</p>
                    </>
                  )}

                  {/* General Categories */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <button
                      onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'tool', invoiceItemId: invoiceItems[0].id })}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        assignmentForm.assignmentType === 'tool'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">Įrankiui/Įrangai</p>
                        <p className="text-xs text-gray-500 mt-1">Melžimo įrangai, generatoriui ir kt.</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'building', invoiceItemId: invoiceItems[0].id })}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        assignmentForm.assignmentType === 'building'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">Pastatui</p>
                        <p className="text-xs text-gray-500 mt-1">Tvartui, sandėliui ir kt.</p>
                      </div>
                    </button>

                    {!locationFilter && (
                      <button
                        onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'transport_service', invoiceItemId: invoiceItems[0].id, transportCompany: invoiceData?.supplier || '' })}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          assignmentForm.assignmentType === 'transport_service'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="text-center">
                          <p className="font-semibold text-gray-900">Transporto paslaugos</p>
                          <p className="text-xs text-gray-500 mt-1">Pervežimo, pristatymo paslaugos</p>
                        </div>
                      </button>
                    )}

                    <button
                      onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'general_farm', invoiceItemId: invoiceItems[0].id })}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        assignmentForm.assignmentType === 'general_farm'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">Bendrai fermai</p>
                        <p className="text-xs text-gray-500 mt-1">Bendros paskirties dalys</p>
                      </div>
                    </button>
                  </div>

                  {costCenters.length > 0 && (
                    <div className="border-t pt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-3">Arba kaštų centrui</label>
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                        {costCenters.filter(c => !c.parent_id).map(center => (
                          <div key={center.id} className="space-y-1.5">
                            {/* Parent Level */}
                            <button
                              onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'cost_center', costCenterId: center.id, invoiceItemId: invoiceItems[0].id })}
                              className={`w-full p-3 border-2 rounded-lg transition-all text-left ${
                                assignmentForm.assignmentType === 'cost_center' && assignmentForm.costCenterId === center.id
                                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                                  : 'border-gray-300 hover:border-gray-400 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: center.color }}
                                />
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900 text-sm">{center.name}</p>
                                  {center.description && (
                                    <p className="text-xs text-gray-500 mt-0.5">{center.description}</p>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Children Level */}
                            {costCenters.filter(child => child.parent_id === center.id).map(child => (
                              <div key={child.id} className="ml-6 space-y-1">
                                <button
                                  onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'cost_center', costCenterId: child.id, invoiceItemId: invoiceItems[0].id })}
                                  className={`w-full p-2.5 border-2 rounded-lg transition-all text-left ${
                                    assignmentForm.assignmentType === 'cost_center' && assignmentForm.costCenterId === child.id
                                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                                      : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: child.color }}
                                    />
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-800 text-sm">{child.name}</p>
                                      {child.description && (
                                        <p className="text-xs text-gray-500 mt-0.5">{child.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </button>

                                {/* Grandchildren Level (3rd level) */}
                                {costCenters.filter(grandchild => grandchild.parent_id === child.id).map(grandchild => (
                                  <button
                                    key={grandchild.id}
                                    onClick={() => setAssignmentForm({ ...assignmentForm, assignmentType: 'cost_center', costCenterId: grandchild.id, invoiceItemId: invoiceItems[0].id })}
                                    className={`w-full ml-6 p-2 border-2 rounded-lg transition-all text-left ${
                                      assignmentForm.assignmentType === 'cost_center' && assignmentForm.costCenterId === grandchild.id
                                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                                        : 'border-gray-100 hover:border-gray-200 bg-white'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: grandchild.color }}
                                      />
                                      <div className="flex-1">
                                        <p className="font-medium text-gray-700 text-sm">{grandchild.name}</p>
                                        {grandchild.description && (
                                          <p className="text-xs text-gray-500 mt-0.5">{grandchild.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {assignmentForm.assignmentType === 'tool' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pasirinkite įrankį/įrangą</label>
                    <select
                      value={assignmentForm.toolId}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, toolId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="">-- Pasirinkite --</option>
                      {tools.map(tool => (
                        <option key={tool.id} value={tool.id}>
                          {tool.name} ({tool.tool_number})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {assignmentForm.assignmentType === 'transport_service' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transporto kompanija</label>
                    <input
                      type="text"
                      value={assignmentForm.transportCompany}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, transportCompany: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="Įveskite kompanijos pavadinimą"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Tiekėjas iš sąskaitos: <span className="font-medium">{invoiceData?.supplier || 'Nenurodyta'}</span>
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos (neprivaloma)</label>
                  <textarea
                    value={assignmentForm.notes}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    rows={2}
                    placeholder="Pvz.: Keitimas po gedimo, planinis keitimas..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={handleSkipAssignment}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Praleisti šį produktą
                  </button>
                  <button
                    onClick={handleSaveAssignment}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Link2 className="w-4 h-4" />
                    Priskirti
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
