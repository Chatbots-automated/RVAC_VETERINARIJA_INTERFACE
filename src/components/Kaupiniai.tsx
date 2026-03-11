import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  FolderPlus,
  Upload,
  FileText,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  AlertCircle,
  Eye,
  Trash2,
  Plus,
  TrendingUp,
  Package,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled';
  budget_estimate: number | null;
  notes: string | null;
  created_at: string;
}

interface ProjectSummary extends Project {
  total_documents: number;
  processed_documents: number;
  failed_documents: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
  items_total_net: number;
  items_total_vat: number;
  items_total_gross: number;
  total_items: number;
  budget_used_percentage: number | null;
  budget_remaining: number | null;
}

interface Document {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string | null;
  file_url: string | null;
  document_type: string;
  upload_date: string;
  supplier_name: string | null;
  supplier_code: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  vat_rate: number | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error: string | null;
  processed_at: string | null;
  notes: string | null;
  comments: string | null;
  act_number: string | null;
  act_file_path: string | null;
  act_file_url: string | null;
}

interface CostItem {
  id: string;
  project_id: string;
  document_id: string | null;
  line_no: number | null;
  sku: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  net_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  gross_amount: number;
  category: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  notes: string | null;
}

export default function Kaupiniai() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Project modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'active' as Project['status'],
    budget_estimate: '',
    notes: '',
  });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // File upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedActFile, setSelectedActFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [documentType, setDocumentType] = useState<'invoice' | 'receipt' | 'contract' | 'estimate' | 'other'>('invoice');
  const [uploadComments, setUploadComments] = useState('');
  const [uploadActNumber, setUploadActNumber] = useState('');
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [viewerTab, setViewerTab] = useState<'document' | 'act'>('document');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectDocuments(selectedProject);
      loadProjectItems(selectedProject);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      console.log('Loading projects...');
      const { data, error } = await supabase
        .from('cost_accumulation_project_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading projects:', error);
        throw error;
      }
      console.log('Loaded projects:', data);
      if (data && data.length > 0) {
        console.log('First project totals:', {
          total_net: data[0].total_net,
          total_vat: data[0].total_vat,
          total_gross: data[0].total_gross,
          items_total_net: data[0].items_total_net,
          items_total_vat: data[0].items_total_vat,
          items_total_gross: data[0].items_total_gross,
        });
      }
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDocuments = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('cost_accumulation_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('upload_date', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const loadProjectItems = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('cost_accumulation_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const handleSaveProject = async () => {
    console.log('Saving project, form data:', projectForm);
    
    if (!projectForm.name) {
      alert('Prašome įvesti projekto pavadinimą');
      return;
    }

    try {
      const projectData = {
        name: projectForm.name,
        description: projectForm.description || null,
        start_date: projectForm.start_date || null,
        end_date: projectForm.end_date || null,
        status: projectForm.status,
        budget_estimate: projectForm.budget_estimate ? parseFloat(projectForm.budget_estimate) : null,
        notes: projectForm.notes || null,
      };

      console.log('Project data to save:', projectData);

      if (editingProjectId) {
        const { error } = await supabase
          .from('cost_accumulation_projects')
          .update(projectData)
          .eq('id', editingProjectId);

        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        console.log('Project updated successfully');
      } else {
        const { data, error } = await supabase
          .from('cost_accumulation_projects')
          .insert([projectData])
          .select();

        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        console.log('Project created successfully:', data);
      }

      setShowProjectModal(false);
      resetProjectForm();
      loadProjects();
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Klaida išsaugant projektą: ' + (error as any).message);
    }
  };

  const handleEditProject = (project: ProjectSummary) => {
    setEditingProjectId(project.id);
    setProjectForm({
      name: project.name,
      description: project.description || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      status: project.status,
      budget_estimate: project.budget_estimate?.toString() || '',
      notes: project.notes || '',
    });
    setShowProjectModal(true);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Ar tikrai norite ištrinti šį projektą? Visi dokumentai ir išlaidos bus pašalinti.')) return;

    try {
      const { error } = await supabase
        .from('cost_accumulation_projects')
        .update({ is_active: false })
        .eq('id', projectId);

      if (error) throw error;
      loadProjects();
      if (selectedProject === projectId) {
        setSelectedProject(null);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Klaida trinant projektą');
    }
  };

  const resetProjectForm = () => {
    setProjectForm({
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      status: 'active',
      budget_estimate: '',
      notes: '',
    });
    setEditingProjectId(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus('idle');
      setUploadMessage('');
    }
  };

  const handleViewDocument = (doc: Document) => {
    setViewingDocument(doc);
    setViewerTab('document');
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('kaupiniai-documents')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Klaida atsisiunčiant failą');
    }
  };

  const handleDownloadActFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('kaupiniai-acts')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading act file:', error);
      alert('Klaida atsisiunčiant akto failą');
    }
  };

  const handleFileUpload = async () => {
    console.log('handleFileUpload called');
    console.log('selectedFile:', selectedFile);
    console.log('selectedProject:', selectedProject);
    
    if (!selectedFile || !selectedProject) {
      console.log('Missing file or project, returning');
      return;
    }

    setUploadStatus('uploading');
    setUploadMessage('Įkeliama į saugyklą...');

    try {
      console.log('Starting file upload...');
      const sanitizedFilename = selectedFile.name
        .replace(/[()]/g, '')
        .replace(/[^\w\s.-]/g, '_');

      // Upload main document to Supabase Storage
      const timestamp = Date.now();
      const storagePath = `${selectedProject}/${timestamp}_${sanitizedFilename}`;
      
      console.log('Uploading to storage:', storagePath);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kaupiniai-documents')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error('Nepavyko įkelti failo į saugyklą: ' + uploadError.message);
      }

      console.log('File uploaded to storage:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('kaupiniai-documents')
        .getPublicUrl(storagePath);

      console.log('File URL:', urlData.publicUrl);

      // Upload act file if provided
      let actFilePath = null;
      let actFileUrl = null;
      if (selectedActFile) {
        const actSanitizedFilename = selectedActFile.name
          .replace(/[()]/g, '')
          .replace(/[^\w\s.-]/g, '_');
        const actStoragePath = `${selectedProject}/${uploadActNumber || 'ACT'}_${timestamp}_${actSanitizedFilename}`;
        
        console.log('Uploading act file to storage:', actStoragePath);
        const { data: actUploadData, error: actUploadError } = await supabase.storage
          .from('kaupiniai-acts')
          .upload(actStoragePath, selectedActFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (actUploadError) {
          console.error('Act storage upload error:', actUploadError);
          // Don't fail the whole upload if act upload fails
          console.warn('Continuing without act file');
        } else {
          actFilePath = actStoragePath;
          const { data: actUrlData } = supabase.storage
            .from('kaupiniai-acts')
            .getPublicUrl(actStoragePath);
          actFileUrl = actUrlData.publicUrl;
          console.log('Act file uploaded:', actFileUrl);
        }
      }

      // Send file to n8n webhook for parsing
      setUploadMessage('Apdorojama sąskaita faktūra...');
      const arrayBuffer = await selectedFile.arrayBuffer();
      
      console.log('Sending to webhook:', sanitizedFilename);
      const response = await fetch('https://n8n-up8s.onrender.com/webhook/36549f46-a08b-4790-bf56-40cdc919e4c0', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Filename': sanitizedFilename,
        },
        body: arrayBuffer,
      });

      console.log('Webhook response status:', response.status);

      if (!response.ok) {
        throw new Error('Nepavyko apdoroti failo');
      }

      setUploadStatus('processing');
      const webhookData = await response.json();
      console.log('Webhook response data:', webhookData);

      // Process webhook response with storage paths
      await processWebhookResponse(webhookData, sanitizedFilename, storagePath, urlData.publicUrl, actFilePath, actFileUrl);

      setUploadStatus('success');
      setUploadMessage('Failas sėkmingai įkeltas ir apdorotas!');
      setSelectedFile(null);
      setSelectedActFile(null);
      setUploadComments('');
      setUploadActNumber('');
      
      // Reload data
      loadProjects();
      loadProjectDocuments(selectedProject);
      loadProjectItems(selectedProject);

      setTimeout(() => {
        setUploadStatus('idle');
        setUploadMessage('');
      }, 3000);

    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus('error');
      setUploadMessage('Klaida įkeliant failą: ' + (error as any).message);
    }
  };

  const processWebhookResponse = async (
    webhookData: any, 
    filename: string, 
    filePath: string, 
    fileUrl: string,
    actFilePath: string | null,
    actFileUrl: string | null
  ) => {
    if (!selectedProject) return;

    try {
      console.log('Processing webhook data:', webhookData);
      
      // Extract invoice data - handle both formats
      let invoiceData;
      if (Array.isArray(webhookData) && webhookData[0]?.payload) {
        // New format: [{ payload: { supplier, invoice, items } }]
        invoiceData = webhookData[0].payload;
      } else if (Array.isArray(webhookData)) {
        // Old format: [{ supplier, invoice, items }]
        invoiceData = webhookData[0];
      } else {
        // Direct object format
        invoiceData = webhookData;
      }
      
      if (!invoiceData) throw new Error('No invoice data received');
      console.log('Extracted invoice data:', invoiceData);

      const { supplier, invoice, items } = invoiceData;

      // Insert document record
      console.log('Inserting document for project:', selectedProject);
      const documentData = {
        project_id: selectedProject,
        file_name: filename,
        file_path: filePath,
        file_url: fileUrl,
        document_type: documentType,
        supplier_name: supplier?.name || null,
        supplier_code: supplier?.code || null,
        comments: uploadComments || null,
        act_number: uploadActNumber || null,
        act_file_path: actFilePath,
        act_file_url: actFileUrl,
        invoice_number: invoice?.number || null,
        invoice_date: invoice?.date || null,
        due_date: invoice?.due_date || null,
        currency: invoice?.currency || 'EUR',
        total_net: invoice?.total_net || null,
        total_vat: invoice?.total_vat || null,
        total_gross: invoice?.total_gross || null,
        vat_rate: invoice?.vat_rate || null,
        webhook_response: webhookData,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      };
      
      console.log('Document data to insert:', documentData);
      
      const { data: documentRecord, error: docError } = await supabase
        .from('cost_accumulation_documents')
        .insert([documentData])
        .select()
        .single();

      if (docError) {
        console.error('Document insert error:', docError);
        throw docError;
      }
      
      console.log('Document inserted successfully:', documentRecord);

      // Insert cost items
      if (items && items.length > 0) {
        console.log(`Inserting ${items.length} cost items...`);
        const itemsToInsert = items.map((item: any) => ({
          project_id: selectedProject,
          document_id: documentRecord.id,
          line_no: item.line_no,
          sku: item.sku || null,
          description: item.description,
          quantity: item.qty || null,
          unit: item.unit || null,
          unit_price: item.unit_price || null,
          net_amount: item.net || null,
          vat_rate: item.vat_rate || null,
          vat_amount: item.vat || null,
          gross_amount: item.gross || item.net || 0, // Fallback to net if gross is null
          batch_number: item.batch || null,
          expiry_date: item.expiry || null,
        }));

        console.log('Items to insert:', itemsToInsert);

        const { error: itemsError } = await supabase
          .from('cost_accumulation_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Items insert error:', itemsError);
          throw itemsError;
        }
        
        console.log('Items inserted successfully');
      } else {
        console.log('No items to insert');
      }

    } catch (error) {
      console.error('Error processing webhook response:', error);
      throw error;
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Ar tikrai norite ištrinti šį dokumentą?')) return;

    try {
      // Get document to find file paths
      const { data: doc, error: fetchError } = await supabase
        .from('cost_accumulation_documents')
        .select('file_path, act_file_path')
        .eq('id', documentId)
        .single();

      if (fetchError) throw fetchError;

      // Delete from storage if paths exist
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('kaupiniai-documents')
          .remove([doc.file_path]);
        
        if (storageError) {
          console.error('Error deleting file from storage:', storageError);
        }
      }

      if (doc.act_file_path) {
        const { error: actStorageError } = await supabase.storage
          .from('kaupiniai-acts')
          .remove([doc.act_file_path]);
        
        if (actStorageError) {
          console.error('Error deleting act file from storage:', actStorageError);
        }
      }

      // Delete document record
      const { error } = await supabase
        .from('cost_accumulation_documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      if (selectedProject) {
        loadProjects();
        loadProjectDocuments(selectedProject);
        loadProjectItems(selectedProject);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Klaida trinant dokumentą');
    }
  };

  const getStatusBadgeColor = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'on_hold': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'Aktyvus';
      case 'completed': return 'Užbaigtas';
      case 'on_hold': return 'Sustabdytas';
      case 'cancelled': return 'Atšauktas';
      default: return status;
    }
  };

  const selectedProjectData = projects.find(p => p.id === selectedProject);

  return (
    <div className="p-6">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-end">
          <button
            onClick={() => {
              resetProjectForm();
              setShowProjectModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FolderPlus className="w-5 h-5" />
            Naujas projektas
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <FolderPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nėra projektų</h3>
            <p className="text-gray-600 mb-4">Sukurkite pirmąjį projektą išlaidoms sekti</p>
            <button
              onClick={() => setShowProjectModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Sukurti projektą
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Projects List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Projektai ({projects.length})</h2>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`bg-white rounded-lg border-2 transition-all cursor-pointer ${
                    selectedProject === project.id
                      ? 'border-blue-500 shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    onClick={() => {
                      console.log('Project clicked:', project.id, project.name);
                      setSelectedProject(project.id);
                    }}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-600 mb-2">{project.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      {project.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(project.start_date).toLocaleDateString('lt-LT')}
                        </span>
                      )}
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Dokumentai:</span>
                        <span className="font-semibold">{project.total_documents}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Prekių:</span>
                        <span className="font-semibold">{project.total_items}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 text-sm">Viso išlaidų:</span>
                        <span className="font-bold text-green-600">
                          €{parseFloat(project.total_gross || '0').toFixed(2)}
                        </span>
                      </div>
                      {project.budget_estimate && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Biudžetas</span>
                            <span>{project.budget_used_percentage?.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (project.budget_used_percentage || 0) > 90
                                  ? 'bg-red-500'
                                  : (project.budget_used_percentage || 0) > 75
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(project.budget_used_percentage || 0, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="border-t px-4 py-2 bg-gray-50 flex items-center justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditProject(project);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Redaguoti
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Ištrinti
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Project Details */}
            <div className="lg:col-span-2">
              {selectedProjectData ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                      <div className="flex items-center gap-2 text-gray-600 mb-2">
                        <FileText className="w-5 h-5" />
                        <span className="text-sm">Dokumentai</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{selectedProjectData.total_documents}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedProjectData.processed_documents} apdorota
                      </p>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                      <div className="flex items-center gap-2 text-gray-600 mb-2">
                        <Package className="w-5 h-5" />
                        <span className="text-sm">Prekių</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{selectedProjectData.total_items}</p>
                      <p className="text-xs text-gray-500 mt-1">iš visų dokumentų</p>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                      <div className="flex items-center gap-2 text-gray-600 mb-2">
                        <DollarSign className="w-5 h-5" />
                        <span className="text-sm">Bendra suma</span>
                      </div>
                      <p className="text-2xl font-bold text-green-600">
                        €{parseFloat(selectedProjectData.total_gross || '0').toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        PVM: €{parseFloat(selectedProjectData.total_vat || '0').toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* File Upload Section */}
                  <div className="bg-white rounded-lg border p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Įkelti dokumentą</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Dokumento tipas
                        </label>
                        <select
                          value={documentType}
                          onChange={(e) => setDocumentType(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="invoice">Sąskaita faktūra</option>
                          <option value="receipt">Kvitas</option>
                          <option value="contract">Sutartis</option>
                          <option value="estimate">Sąmata</option>
                          <option value="other">Kita</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Pasirinkite failą (PDF)
                        </label>
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileSelect}
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Komentarai (neprivaloma)
                        </label>
                        <textarea
                          value={uploadComments}
                          onChange={(e) => setUploadComments(e.target.value)}
                          placeholder="Įveskite komentarus apie šį dokumentą..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Akto numeris (neprivaloma)
                        </label>
                        <input
                          type="text"
                          value={uploadActNumber}
                          onChange={(e) => setUploadActNumber(e.target.value)}
                          placeholder="Pvz.: AKT-2026-001"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Oficialus akto numeris dokumentui</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Akto failas (neprivaloma)
                        </label>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => setSelectedActFile(e.target.files?.[0] || null)}
                          className="w-full"
                        />
                        {selectedActFile && (
                          <div className="mt-2 flex items-center gap-2 p-2 bg-blue-50 rounded">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-blue-900">{selectedActFile.name}</span>
                            <button
                              onClick={() => setSelectedActFile(null)}
                              className="ml-auto text-red-600 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">Įkelkite pasirašytą akto dokumentą (PDF, DOC, DOCX)</p>
                      </div>

                      {selectedFile && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700">{selectedFile.name}</span>
                          <div className="flex items-center gap-2">
                            {uploadStatus === 'idle' && (
                              <>
                                <button
                                  onClick={() => setSelectedFile(null)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={handleFileUpload}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                  Apdoroti
                                </button>
                              </>
                            )}
                            {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
                              <div className="flex items-center gap-2 text-blue-600">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                                <span className="text-sm">{uploadMessage}</span>
                              </div>
                            )}
                            {uploadStatus === 'success' && (
                              <div className="flex items-center gap-2 text-green-600">
                                <Check className="w-5 h-5" />
                                <span className="text-sm">{uploadMessage}</span>
                              </div>
                            )}
                            {uploadStatus === 'error' && (
                              <div className="flex items-center gap-2 text-red-600">
                                <AlertCircle className="w-5 h-5" />
                                <span className="text-sm">{uploadMessage}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Documents List */}
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Dokumentai ({documents.length})
                      </h3>
                    </div>
                    <div className="divide-y">
                      {documents.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                          <p>Dokumentų nėra. Įkelkite pirmąjį dokumentą.</p>
                        </div>
                      ) : (
                        documents.map((doc) => (
                          <div key={doc.id} className="p-4 hover:bg-gray-50">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <FileText className="w-5 h-5 text-gray-400" />
                                  <h4 className="font-semibold text-gray-900">{doc.file_name}</h4>
                                  {doc.processing_status === 'completed' && (
                                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                      Apdorota
                                    </span>
                                  )}
                                  {doc.processing_status === 'failed' && (
                                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                                      Klaida
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                                  {doc.supplier_name && (
                                    <div>
                                      <span className="font-medium">Tiekėjas:</span> {doc.supplier_name}
                                    </div>
                                  )}
                                  {doc.invoice_number && (
                                    <div>
                                      <span className="font-medium">SF Nr.:</span> {doc.invoice_number}
                                    </div>
                                  )}
                                  {doc.invoice_date && (
                                    <div>
                                      <span className="font-medium">Data:</span>{' '}
                                      {new Date(doc.invoice_date).toLocaleDateString('lt-LT')}
                                    </div>
                                  )}
                                  {doc.total_gross !== null && (
                                    <div>
                                      <span className="font-medium">Suma:</span>{' '}
                                      <span className="font-bold text-green-600">
                                        €{parseFloat(doc.total_gross.toString()).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {doc.act_number && (
                                    <div className="col-span-2">
                                      <span className="font-medium">Akto Nr.:</span>{' '}
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                        {doc.act_number}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {doc.comments && (
                                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                    <p className="text-sm text-gray-700">
                                      <span className="font-medium">Komentarai:</span> {doc.comments}
                                    </p>
                                  </div>
                                )}
                                {doc.processing_error && (
                                  <p className="mt-2 text-sm text-red-600">{doc.processing_error}</p>
                                )}

                                {/* View and Download Buttons */}
                                <div className="mt-3 flex gap-2">
                                  <button
                                    onClick={() => handleViewDocument(doc)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                                  >
                                    <Eye className="w-4 h-4" />
                                    Peržiūrėti
                                  </button>
                                  {doc.file_path && (
                                    <button
                                      onClick={() => handleDownloadFile(doc.file_path!, doc.file_name)}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                    >
                                      <FileText className="w-4 h-4" />
                                      Atsisiųsti dokumentą
                                    </button>
                                  )}
                                  {doc.act_file_path && (
                                    <button
                                      onClick={() => handleDownloadActFile(doc.act_file_path!, `${doc.act_number || 'ACT'}.pdf`)}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                                    >
                                      <FileText className="w-4 h-4" />
                                      Atsisiųsti aktą
                                    </button>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="ml-4 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Cost Items */}
                  {items.length > 0 && (
                    <div className="bg-white rounded-lg border">
                      <div className="p-4 border-b">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Išlaidų eilutės ({items.length})
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                Aprašymas
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                Kiekis
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                Vnt. kaina
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                Suma
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {items.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {item.description}
                                  {item.sku && (
                                    <span className="ml-2 text-xs text-gray-500">({item.sku})</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                  €{item.unit_price?.toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                  €{item.gross_amount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t">
                            <tr>
                              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                Iš viso:
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                                €{items.reduce((sum, item) => sum + item.gross_amount, 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg border p-12 text-center">
                  <FolderPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Pasirinkite projektą
                  </h3>
                  <p className="text-gray-600">
                    Pasirinkite projektą iš kairės, kad matytumėte jo detales ir įkeltumėte dokumentus
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Project Modal */}
        {showProjectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingProjectId ? 'Redaguoti projektą' : 'Naujas projektas'}
                </h2>
                <button
                  onClick={() => {
                    setShowProjectModal(false);
                    resetProjectForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pavadinimas *
                  </label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Pvz., Naujo tvarto statyba"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Aprašymas
                  </label>
                  <textarea
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Trumpas projekto aprašymas..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pradžios data
                    </label>
                    <input
                      type="date"
                      value={projectForm.start_date}
                      onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pabaigos data
                    </label>
                    <input
                      type="date"
                      value={projectForm.end_date}
                      onChange={(e) => setProjectForm({ ...projectForm, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Būsena
                    </label>
                    <select
                      value={projectForm.status}
                      onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="active">Aktyvus</option>
                      <option value="completed">Užbaigtas</option>
                      <option value="on_hold">Sustabdytas</option>
                      <option value="cancelled">Atšauktas</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Biudžetas (EUR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={projectForm.budget_estimate}
                      onChange={(e) => setProjectForm({ ...projectForm, budget_estimate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pastabos
                  </label>
                  <textarea
                    value={projectForm.notes}
                    onChange={(e) => setProjectForm({ ...projectForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Papildomos pastabos..."
                  />
                </div>
              </div>
              <div className="p-6 border-t flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowProjectModal(false);
                    resetProjectForm();
                  }}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Atšaukti
                </button>
                <button
                  onClick={handleSaveProject}
                  disabled={!projectForm.name}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingProjectId ? 'Išsaugoti' : 'Sukurti'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document Viewer Modal */}
        {viewingDocument && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{viewingDocument.file_name}</h3>
                    {viewingDocument.act_number && (
                      <p className="text-sm text-gray-600">Akto Nr.: {viewingDocument.act_number}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setViewingDocument(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6 text-gray-600" />
                  </button>
                </div>

                {/* Tabs for Document and Act */}
                {viewingDocument.act_file_url && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewerTab('document')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        viewerTab === 'document'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Dokumentas
                    </button>
                    <button
                      onClick={() => setViewerTab('act')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        viewerTab === 'act'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Aktas
                    </button>
                  </div>
                )}
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 overflow-hidden">
                {viewerTab === 'document' ? (
                  viewingDocument.file_url ? (
                    <iframe
                      src={viewingDocument.file_url}
                      className="w-full h-full border-0"
                      title="Document Viewer"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Dokumentas nepasiekiamas peržiūrai</p>
                        {viewingDocument.file_path && (
                          <button
                            onClick={() => handleDownloadFile(viewingDocument.file_path!, viewingDocument.file_name)}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Atsisiųsti dokumentą
                          </button>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  viewingDocument.act_file_url ? (
                    <iframe
                      src={viewingDocument.act_file_url}
                      className="w-full h-full border-0"
                      title="Act Viewer"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Aktas nepasiekiamas peržiūrai</p>
                        {viewingDocument.act_file_path && (
                          <button
                            onClick={() => handleDownloadActFile(viewingDocument.act_file_path!, `${viewingDocument.act_number || 'ACT'}.pdf`)}
                            className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            Atsisiųsti aktą
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Footer with Actions */}
              <div className="p-4 border-t flex items-center justify-between bg-gray-50">
                <div className="flex gap-2">
                  {viewingDocument.file_path && (
                    <button
                      onClick={() => handleDownloadFile(viewingDocument.file_path!, viewingDocument.file_name)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      Atsisiųsti dokumentą
                    </button>
                  )}
                  {viewingDocument.act_file_path && (
                    <button
                      onClick={() => handleDownloadActFile(viewingDocument.act_file_path!, `${viewingDocument.act_number || 'ACT'}.pdf`)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      Atsisiųsti aktą
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setViewingDocument(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Uždaryti
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
