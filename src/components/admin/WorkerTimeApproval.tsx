import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, CheckCircle, XCircle, User, Calendar, AlertCircle } from 'lucide-react';

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

export function WorkerTimeApproval() {
  const { user, logAction } = useAuth();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'completed' | 'all'>('completed');
  const [filterLocation, setFilterLocation] = useState<'all' | 'farm' | 'warehouse'>('all');
  const [reviewingEntry, setReviewingEntry] = useState<TimeEntry | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [filterStatus, filterLocation]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('worker_time_entries_detail')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filterStatus === 'completed') {
        query = query.eq('status', 'completed');
      }

      if (filterLocation !== 'all') {
        query = query.eq('work_location', filterLocation);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTimeEntries(data || []);
    } catch (error) {
      console.error('Error loading time entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (entryId: string, notes: string = '') => {
    try {
      const { error } = await supabase
        .from('worker_time_entries')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .eq('id', entryId);

      if (error) throw error;

      await logAction('approve_time_entry', 'worker_time_entries', entryId);
      loadData();
      setReviewingEntry(null);
      setReviewNotes('');
    } catch (error: any) {
      console.error('Error approving time entry:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleReject = async (entryId: string, notes: string) => {
    if (!notes.trim()) {
      alert('Prašome nurodyti atmetimo priežastį');
      return;
    }

    try {
      const { error } = await supabase
        .from('worker_time_entries')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', entryId);

      if (error) throw error;

      await logAction('reject_time_entry', 'worker_time_entries', entryId);
      loadData();
      setReviewingEntry(null);
      setReviewNotes('');
    } catch (error: any) {
      console.error('Error rejecting time entry:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedEntries.size === 0) {
      alert('Pasirinkite bent vieną įrašą');
      return;
    }

    if (!confirm(`Patvirtinti ${selectedEntries.size} įrašų?`)) return;

    try {
      const { error } = await supabase
        .from('worker_time_entries')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', Array.from(selectedEntries));

      if (error) throw error;

      await logAction('bulk_approve_time_entries', 'worker_time_entries', undefined, undefined, {
        count: selectedEntries.size,
      });

      setSelectedEntries(new Set());
      loadData();
    } catch (error: any) {
      console.error('Error bulk approving:', error);
      alert('Klaida: ' + error.message);
    }
  };

  const toggleSelection = (entryId: string) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(entryId)) {
      newSelected.delete(entryId);
    } else {
      newSelected.add(entryId);
    }
    setSelectedEntries(newSelected);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Laukiama</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Patvirtinta</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Atmesta</span>;
      case 'active':
        return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">Aktyvus</span>;
      default:
        return null;
    }
  };

  const completedEntries = timeEntries.filter(e => e.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700 mb-1">Laukia patvirtinimo</p>
          <p className="text-2xl font-bold text-yellow-900">{completedEntries.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700 mb-1">Patvirtinta šiandien</p>
          <p className="text-2xl font-bold text-green-900">
            {timeEntries.filter(e => e.status === 'approved' && e.reviewed_at && new Date(e.reviewed_at).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 mb-1">Aktyvūs darbuotojai</p>
          <p className="text-2xl font-bold text-blue-900">
            {timeEntries.filter(e => e.status === 'active').length}
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-700 mb-1">Viso įrašų</p>
          <p className="text-2xl font-bold text-slate-900">{timeEntries.length}</p>
        </div>
      </div>

      {/* Filters and Bulk Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="completed">Laukiantys patvirtinimo</option>
              <option value="all">Visi įrašai</option>
            </select>

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

          {selectedEntries.size > 0 && (
            <button
              onClick={handleBulkApprove}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Patvirtinti pasirinktus ({selectedEntries.size})
            </button>
          )}
        </div>
      </div>

      {/* Time Entries List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Darbo laiko įrašai</h3>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Kraunama...</p>
          </div>
        ) : timeEntries.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Įrašų nerasta</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {timeEntries.map((entry) => (
              <div key={entry.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  {entry.status === 'completed' && (
                    <input
                      type="checkbox"
                      checked={selectedEntries.has(entry.id)}
                      onChange={() => toggleSelection(entry.id)}
                      className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-semibold text-gray-900">{entry.worker_name}</p>
                          <p className="text-sm text-gray-600">{entry.worker_email}</p>
                        </div>
                      </div>
                      {getStatusBadge(entry.status)}
                    </div>

                    {/* Date and Location */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-4 h-4" />
                        {formatDate(entry.date)}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.work_location === 'farm' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {entry.work_location === 'farm' ? 'Ferma' : 'Technikos kiemas'}
                      </span>
                    </div>

                    {/* Time Details */}
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Planuota</p>
                        <p className="font-medium text-gray-900">
                          {entry.scheduled_start ? `${entry.scheduled_start.substring(0, 5)} - ${entry.scheduled_end?.substring(0, 5)}` : 'Nėra grafiko'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Faktiškai</p>
                        <p className="font-medium text-gray-900">
                          {formatTime(entry.actual_start_time)}
                          {entry.actual_end_time && ` - ${formatTime(entry.actual_end_time)}`}
                        </p>
                        {entry.hours_worked !== null && (
                          <p className="text-xs text-blue-600 mt-1">
                            Iš viso: {entry.hours_worked.toFixed(2)} val.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {entry.notes && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-700 mb-1">Darbuotojo pastabos:</p>
                        <p className="text-sm text-blue-900">{entry.notes}</p>
                      </div>
                    )}

                    {/* Review Notes */}
                    {entry.review_notes && (
                      <div className="bg-gray-100 rounded-lg p-3">
                        <p className="text-xs text-gray-700 mb-1">
                          Peržiūrėjo: {entry.reviewed_by_name} ({entry.reviewed_at && new Date(entry.reviewed_at).toLocaleString('lt-LT')})
                        </p>
                        <p className="text-sm text-gray-900">{entry.review_notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {entry.status === 'completed' && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            setReviewingEntry(entry);
                            setReviewNotes('');
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Patvirtinti
                        </button>
                        <button
                          onClick={() => {
                            setReviewingEntry(entry);
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Peržiūrėti laiko įrašą
            </h3>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Darbuotojas</p>
                <p className="font-semibold text-gray-900">{reviewingEntry.worker_name}</p>
                <p className="text-xs text-gray-600">{formatDate(reviewingEntry.date)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pastabos (neprivaloma patvirtinant, privaloma atmetant)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Įveskite pastabas..."
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
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Atšaukti
              </button>
              <button
                onClick={() => handleReject(reviewingEntry.id, reviewNotes)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Atmesti
              </button>
              <button
                onClick={() => handleApprove(reviewingEntry.id, reviewNotes)}
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
