import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, User, Calendar, Clock, FileText, AlertTriangle, ExternalLink } from 'lucide-react';

interface TaskReport {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_email: string;
  task_type: string;
  task_id: string;
  task_name: string;
  completion_status: string;
  work_description: string;
  hours_spent: number | null;
  notes: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  work_order: 'Remonto darbas',
  maintenance_schedule: 'Planinis aptarnavimas',
  farm_equipment_service: 'Fermos įrangos aptarnavimas',
};

const COMPLETION_STATUS_LABELS: Record<string, string> = {
  completed: 'Užbaigta',
  in_progress: 'Vykdoma',
  blocked: 'Užblokuota',
};

const COMPLETION_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  blocked: 'bg-red-100 text-red-800',
};

export function WorkerTaskApproval() {
  const { user, logAction } = useAuth();
  const [taskReports, setTaskReports] = useState<TaskReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending');
  const [filterTaskType, setFilterTaskType] = useState<'all' | string>('all');
  const [reviewingReport, setReviewingReport] = useState<TaskReport | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [updateTaskStatus, setUpdateTaskStatus] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterStatus, filterTaskType]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('worker_task_reports_detail')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterStatus === 'pending') {
        query = query.eq('status', 'pending');
      }

      if (filterTaskType !== 'all') {
        query = query.eq('task_type', filterTaskType);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTaskReports(data || []);
    } catch (error) {
      console.error('Error loading task reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reportId: string, taskType: string, taskId: string, notes: string = '') => {
    try {
      // Update report status
      const { error: reportError } = await supabase
        .from('worker_task_reports')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .eq('id', reportId);

      if (reportError) throw reportError;

      // Optionally update the original task status if requested
      if (updateTaskStatus) {
        if (taskType === 'work_order') {
          await supabase
            .from('maintenance_work_orders')
            .update({ status: 'completed' })
            .eq('id', taskId);
        }
        // Note: maintenance_schedule doesn't have a "completed" status, it just updates last_performed_date
      }

      await logAction('approve_task_report', 'worker_task_reports', reportId);
      loadData();
      setReviewingReport(null);
      setReviewNotes('');
      setUpdateTaskStatus(false);
    } catch (error: any) {
      console.error('Error approving task report:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleReject = async (reportId: string, notes: string) => {
    if (!notes.trim()) {
      alert('Prašome nurodyti atmetimo priežastį');
      return;
    }

    try {
      const { error } = await supabase
        .from('worker_task_reports')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', reportId);

      if (error) throw error;

      await logAction('reject_task_report', 'worker_task_reports', reportId);
      loadData();
      setReviewingReport(null);
      setReviewNotes('');
    } catch (error: any) {
      console.error('Error rejecting task report:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const formatDateTime = (datetime: string) => {
    return new Date(datetime).toLocaleString('lt-LT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Laukiama</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Patvirtinta</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Atmesta</span>;
      default:
        return null;
    }
  };

  const pendingReports = taskReports.filter(r => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700 mb-1">Laukia patvirtinimo</p>
          <p className="text-2xl font-bold text-yellow-900">{pendingReports.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700 mb-1">Patvirtinta šiandien</p>
          <p className="text-2xl font-bold text-green-900">
            {taskReports.filter(r => r.status === 'approved' && r.reviewed_at && new Date(r.reviewed_at).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 mb-1">Remonto darbai</p>
          <p className="text-2xl font-bold text-blue-900">
            {taskReports.filter(r => r.task_type === 'work_order').length}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-700 mb-1">Aptarnavimai</p>
          <p className="text-2xl font-bold text-purple-900">
            {taskReports.filter(r => r.task_type === 'maintenance_schedule').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="pending">Laukiantys patvirtinimo</option>
            <option value="all">Visi pranešimai</option>
          </select>

          <select
            value={filterTaskType}
            onChange={(e) => setFilterTaskType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="all">Visi tipai</option>
            <option value="work_order">Remonto darbai</option>
            <option value="maintenance_schedule">Planiniai aptarnavimai</option>
            <option value="farm_equipment_service">Fermos įranga</option>
          </select>
        </div>
      </div>

      {/* Task Reports List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Darbuotojų pranešimai apie darbus</h3>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Kraunama...</p>
          </div>
        ) : taskReports.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Pranešimų nerasta</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {taskReports.map((report) => (
              <div key={report.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-semibold text-gray-900">{report.worker_name}</p>
                        <p className="text-sm text-gray-600">{report.worker_email}</p>
                      </div>
                    </div>
                    {getStatusBadge(report.status)}
                  </div>

                  {/* Task Info */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-blue-700 mb-1">{TASK_TYPE_LABELS[report.task_type]}</p>
                        <p className="font-semibold text-blue-900">{report.task_name || 'Užduotis'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${COMPLETION_STATUS_COLORS[report.completion_status]}`}>
                        {COMPLETION_STATUS_LABELS[report.completion_status]}
                      </span>
                    </div>
                  </div>

                  {/* Work Description */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-700 mb-2 font-medium">Darbo aprašymas:</p>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{report.work_description}</p>
                  </div>

                  {/* Details */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4" />
                      Pateikta: {formatDateTime(report.created_at)}
                    </div>
                    {report.hours_spent && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-4 h-4" />
                        Sugaišta: {report.hours_spent} val.
                      </div>
                    )}
                  </div>

                  {/* Additional Notes */}
                  {report.notes && (
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-700 mb-1">Papildomos pastabos:</p>
                      <p className="text-sm text-gray-900">{report.notes}</p>
                    </div>
                  )}

                  {/* Review Notes */}
                  {report.review_notes && (
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-700 mb-1">
                        Peržiūrėjo: {report.reviewed_by_name} ({report.reviewed_at && new Date(report.reviewed_at).toLocaleString('lt-LT')})
                      </p>
                      <p className="text-sm text-gray-900">{report.review_notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {report.status === 'pending' && (
                    <div className="flex gap-2 pt-2 border-t">
                      <button
                        onClick={() => {
                          setReviewingReport(report);
                          setReviewNotes('');
                          setUpdateTaskStatus(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Patvirtinti
                      </button>
                      <button
                        onClick={() => {
                          setReviewingReport(report);
                          setReviewNotes('');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        Atmesti
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewingReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Peržiūrėti darbo ataskaitą
            </h3>

            <div className="space-y-4 mb-6">
              {/* Worker Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Darbuotojas</p>
                <p className="font-semibold text-gray-900">{reviewingReport.worker_name}</p>
                <p className="text-xs text-gray-600">{reviewingReport.worker_email}</p>
              </div>

              {/* Task Info */}
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-700">{TASK_TYPE_LABELS[reviewingReport.task_type]}</p>
                <p className="font-semibold text-blue-900">{reviewingReport.task_name}</p>
                <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${COMPLETION_STATUS_COLORS[reviewingReport.completion_status]}`}>
                  {COMPLETION_STATUS_LABELS[reviewingReport.completion_status]}
                </span>
              </div>

              {/* Work Description */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Darbo aprašymas:</p>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{reviewingReport.work_description}</p>
                </div>
              </div>

              {/* Hours and Notes */}
              {(reviewingReport.hours_spent || reviewingReport.notes) && (
                <div className="grid grid-cols-2 gap-3">
                  {reviewingReport.hours_spent && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Sugaištos valandos</p>
                      <p className="font-semibold text-gray-900">{reviewingReport.hours_spent} val.</p>
                    </div>
                  )}
                  {reviewingReport.notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-600 mb-1">Papildomos pastabos</p>
                      <p className="text-sm text-gray-900">{reviewingReport.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Review Options */}
              {reviewingReport.task_type === 'work_order' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateTaskStatus}
                      onChange={(e) => setUpdateTaskStatus(e.target.checked)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">
                        Pažymėti remonto darbą kaip užbaigtą
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Tai automatiškai atnaujins darbo užsakymo būseną į "Užbaigta"
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Review Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Administratoriaus pastabos
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Įveskite pastabas (privaloma atmetant)..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setReviewingReport(null);
                  setReviewNotes('');
                  setUpdateTaskStatus(false);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Atšaukti
              </button>
              <button
                onClick={() => handleReject(reviewingReport.id, reviewNotes)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Atmesti
              </button>
              <button
                onClick={() => handleApprove(reviewingReport.id, reviewingReport.task_type, reviewingReport.task_id, reviewNotes)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Patvirtinti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
