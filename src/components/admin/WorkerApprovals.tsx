import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, CheckCircle, XCircle, User, Calendar, FileText, AlertCircle } from 'lucide-react';

interface TimeEntry {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_email: string;
  work_location: string;
  date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start_time: string;
  actual_end_time: string | null;
  status: string;
  notes: string | null;
  hours_worked: number | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
}

interface TaskReport {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_email: string;
  time_entry_id: string | null;
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

interface CombinedEntry {
  timeEntry: TimeEntry;
  taskReports: TaskReport[];
}

const TASK_TYPE_LABELS: Record<string, string> = {
  work_order: 'Remonto darbas',
  maintenance_schedule: 'Planinis aptarnavimas',
  farm_equipment_service: 'Fermos įrangos aptarnavimas',
  technical_inspection: 'Techninė apžiūra',
};

const COMPLETION_STATUS_LABELS: Record<string, string> = {
  completed: 'Užbaigta',
  in_progress: 'Vykdoma',
  blocked: 'Užblokuota',
};

export function WorkerApprovals() {
  const { user, logAction } = useAuth();
  const [combinedEntries, setCombinedEntries] = useState<CombinedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState<'all' | 'farm' | 'warehouse'>('all');
  const [reviewingEntry, setReviewingEntry] = useState<CombinedEntry | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [updateTaskStatus, setUpdateTaskStatus] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterLocation]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load pending time entries
      let timeQuery = supabase
        .from('worker_time_entries_detail')
        .select('*')
        .eq('status', 'completed')
        .order('date', { ascending: false });

      if (filterLocation !== 'all') {
        timeQuery = timeQuery.eq('work_location', filterLocation);
      }

      const { data: timeEntries, error: timeError } = await timeQuery;
      if (timeError) throw timeError;

      // Load all task reports (to link with time entries)
      const { data: taskReports, error: taskError } = await supabase
        .from('worker_task_reports_detail')
        .select('*')
        .eq('status', 'pending');

      if (taskError) throw taskError;

      // Combine time entries with their task reports
      const combined: CombinedEntry[] = (timeEntries || []).map(entry => ({
        timeEntry: entry,
        taskReports: (taskReports || []).filter(report => report.time_entry_id === entry.id),
      }));

      setCombinedEntries(combined);
    } catch (error) {
      console.error('Error loading approval data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAll = async (entry: CombinedEntry, notes: string = '') => {
    try {
      // Approve time entry
      const { error: timeError } = await supabase
        .from('worker_time_entries')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .eq('id', entry.timeEntry.id);

      if (timeError) throw timeError;

      // Approve all task reports
      if (entry.taskReports.length > 0) {
        const { error: reportsError } = await supabase
          .from('worker_task_reports')
          .update({
            status: 'approved',
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || null,
          })
          .in('id', entry.taskReports.map(r => r.id));

        if (reportsError) throw reportsError;

        // Update task statuses if requested
        if (updateTaskStatus) {
          for (const report of entry.taskReports) {
            if (report.task_type === 'work_order' && report.completion_status === 'completed') {
              await supabase
                .from('maintenance_work_orders')
                .update({ status: 'completed' })
                .eq('id', report.task_id);
            }
          }
        }
      }

      await logAction('approve_worker_shift', 'worker_time_entries', entry.timeEntry.id);
      loadData();
      setReviewingEntry(null);
      setReviewNotes('');
      setUpdateTaskStatus(false);
    } catch (error: any) {
      console.error('Error approving:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleReject = async (entry: CombinedEntry, notes: string) => {
    if (!notes.trim()) {
      alert('Prašome nurodyti atmetimo priežastį');
      return;
    }

    try {
      // Reject time entry
      const { error: timeError } = await supabase
        .from('worker_time_entries')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', entry.timeEntry.id);

      if (timeError) throw timeError;

      // Reject all task reports
      if (entry.taskReports.length > 0) {
        const { error: reportsError } = await supabase
          .from('worker_task_reports')
          .update({
            status: 'rejected',
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString(),
            review_notes: notes,
          })
          .in('id', entry.taskReports.map(r => r.id));

        if (reportsError) throw reportsError;
      }

      await logAction('reject_worker_shift', 'worker_time_entries', entry.timeEntry.id);
      loadData();
      setReviewingEntry(null);
      setReviewNotes('');
    } catch (error: any) {
      console.error('Error rejecting:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const formatTime = (datetime: string) => {
    return new Date(datetime).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('lt-LT', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700 mb-1">Laukia patvirtinimo</p>
          <p className="text-2xl font-bold text-yellow-900">{combinedEntries.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 mb-1">Su užduotimis</p>
          <p className="text-2xl font-bold text-blue-900">
            {combinedEntries.filter(e => e.taskReports.length > 0).length}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700 mb-1">Viso užduočių</p>
          <p className="text-2xl font-bold text-green-900">
            {combinedEntries.reduce((sum, e) => sum + e.taskReports.length, 0)}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-700 mb-1">Viso valandų</p>
          <p className="text-2xl font-bold text-purple-900">
            {combinedEntries.reduce((sum, e) => sum + (e.timeEntry.hours_worked || 0), 0).toFixed(1)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <select
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value as any)}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="all">Visos vietos</option>
          <option value="farm">Ferma</option>
          <option value="warehouse">Technikos kiemas</option>
        </select>
      </div>

      {/* Combined Entries List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Darbuotojų darbo ataskaitos</h3>
          <p className="text-sm text-gray-600 mt-1">Darbo laikas ir atliktos užduotys</p>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Kraunama...</p>
          </div>
        ) : combinedEntries.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nėra laukiančių patvirtinimo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {combinedEntries.map((entry) => (
              <div key={entry.timeEntry.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="space-y-4">
                  {/* Worker Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-semibold text-gray-900">{entry.timeEntry.worker_name}</p>
                        <p className="text-sm text-gray-600">{entry.timeEntry.worker_email}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      entry.timeEntry.work_location === 'farm' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      {entry.timeEntry.work_location === 'farm' ? 'Ferma' : 'Technikos kiemas'}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    {formatDate(entry.timeEntry.date)}
                  </div>

                  {/* Time Details */}
                  <div className="grid grid-cols-2 gap-4 bg-blue-50 rounded-lg p-4">
                    <div>
                      <p className="text-xs text-blue-700 mb-1">Planuota</p>
                      <p className="font-medium text-blue-900">
                        {entry.timeEntry.scheduled_start 
                          ? `${entry.timeEntry.scheduled_start.substring(0, 5)} - ${entry.timeEntry.scheduled_end?.substring(0, 5)}` 
                          : 'Nėra grafiko'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-700 mb-1">Faktiškai</p>
                      <p className="font-medium text-blue-900">
                        {formatTime(entry.timeEntry.actual_start_time)}
                        {entry.timeEntry.actual_end_time && ` - ${formatTime(entry.timeEntry.actual_end_time)}`}
                      </p>
                      {entry.timeEntry.hours_worked !== null && (
                        <p className="text-xs text-blue-600 mt-1">
                          Iš viso: {entry.timeEntry.hours_worked.toFixed(2)} val.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Task Reports */}
                  {entry.taskReports.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Atliktos užduotys ({entry.taskReports.length})
                      </p>
                      <div className="space-y-3">
                        {entry.taskReports.map(report => (
                          <div key={report.id} className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-xs text-gray-600">{TASK_TYPE_LABELS[report.task_type]}</p>
                                <p className="font-medium text-gray-900">{report.task_name || 'Užduotis'}</p>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                report.completion_status === 'completed' ? 'bg-green-100 text-green-800' :
                                report.completion_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {COMPLETION_STATUS_LABELS[report.completion_status]}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.work_description}</p>
                            {report.hours_spent && (
                              <p className="text-xs text-gray-600 mt-2">
                                Sugaišta: {report.hours_spent} val.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Worker Notes */}
                  {entry.timeEntry.notes && (
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-700 mb-1">Darbuotojo pastabos:</p>
                      <p className="text-sm text-gray-900">{entry.timeEntry.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <button
                      onClick={() => {
                        setReviewingEntry(entry);
                        setReviewNotes('');
                        setUpdateTaskStatus(false);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Patvirtinti viską
                    </button>
                    <button
                      onClick={() => {
                        setReviewingEntry(entry);
                        setReviewNotes('');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      <XCircle className="w-4 h-4" />
                      Atmesti
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Peržiūrėti darbo ataskaitą
            </h3>

            <div className="space-y-4 mb-6">
              {/* Worker Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Darbuotojas</p>
                <p className="font-semibold text-gray-900">{reviewingEntry.timeEntry.worker_name}</p>
                <p className="text-xs text-gray-600">{formatDate(reviewingEntry.timeEntry.date)}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Dirbo: {reviewingEntry.timeEntry.hours_worked?.toFixed(2)} val.
                </p>
              </div>

              {/* Task Reports Summary */}
              {reviewingEntry.taskReports.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-900 mb-2">
                    Pranešė apie {reviewingEntry.taskReports.length} užduočių
                  </p>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {reviewingEntry.taskReports.map(report => (
                      <li key={report.id}>
                        • {report.task_name} ({TASK_TYPE_LABELS[report.task_type]})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Update Task Status Option */}
              {reviewingEntry.taskReports.some(r => r.task_type === 'work_order' && r.completion_status === 'completed') && (
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
                        Pažymėti užbaigtus remonto darbus kaip užbaigtus
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Automatiškai atnaujins darbo užsakymų būseną
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
                  setReviewingEntry(null);
                  setReviewNotes('');
                  setUpdateTaskStatus(false);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Atšaukti
              </button>
              <button
                onClick={() => handleReject(reviewingEntry, reviewNotes)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Atmesti
              </button>
              <button
                onClick={() => handleApproveAll(reviewingEntry, reviewNotes)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                Patvirtinti viską
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
