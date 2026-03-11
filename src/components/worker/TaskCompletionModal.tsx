import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { X, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface TaskCompletionModalProps {
  taskType: 'work_order' | 'maintenance_schedule' | 'farm_equipment_service';
  taskId: string;
  taskName: string;
  taskDescription?: string;
  activeTimeEntry: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

const COMPLETION_STATUS_OPTIONS = [
  { value: 'completed', label: 'Užbaigta', icon: CheckCircle, color: 'text-green-600' },
  { value: 'in_progress', label: 'Vykdoma', icon: Clock, color: 'text-blue-600' },
  { value: 'blocked', label: 'Užblokuota', icon: AlertTriangle, color: 'text-red-600' },
];

export function TaskCompletionModal({
  taskType,
  taskId,
  taskName,
  taskDescription,
  activeTimeEntry,
  onClose,
  onSuccess,
}: TaskCompletionModalProps) {
  const { user, logAction } = useAuth();
  const [completionStatus, setCompletionStatus] = useState<'completed' | 'in_progress' | 'blocked'>('completed');
  const [workDescription, setWorkDescription] = useState('');
  const [hoursSpent, setHoursSpent] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user || !workDescription.trim()) {
      alert('Prašome užpildyti darbo aprašymą');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('worker_task_reports')
        .insert({
          worker_id: user.id,
          time_entry_id: activeTimeEntry?.id || null,
          task_type: taskType,
          task_id: taskId,
          completion_status: completionStatus,
          work_description: workDescription.trim(),
          hours_spent: hoursSpent ? parseFloat(hoursSpent) : null,
          notes: notes.trim() || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      await logAction('worker_task_report', 'worker_task_reports', data.id, null, {
        task_type: taskType,
        task_id: taskId,
        completion_status: completionStatus,
      });

      alert('Ataskaita sėkmingai pateikta! Laukiama administratoriaus patvirtinimo.');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error submitting task report:', error);
      alert('Klaida pateikiant ataskaitą: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Pranešti apie atliktą darbą</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Task Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-700 mb-1">Užduotis</p>
            <p className="font-semibold text-blue-900">{taskName}</p>
            {taskDescription && (
              <p className="text-sm text-blue-800 mt-2">{taskDescription}</p>
            )}
          </div>

          {/* Time Entry Warning */}
          {!activeTimeEntry && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>Dėmesio:</strong> Jūs nesate pradėję darbo laiko apskaitos šiandien. 
                Ataskaita bus pateikta be laiko įrašo.
              </p>
            </div>
          )}

          {/* Completion Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Užbaigimo būsena *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {COMPLETION_STATUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setCompletionStatus(option.value as any)}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      completionStatus === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-6 h-6 mx-auto mb-1 ${option.color}`} />
                    <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Work Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Darbo aprašymas *
            </label>
            <textarea
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="Aprašykite, kokius darbus atlikote..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={4}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Būtina užpildyti. Aprašykite atliktus darbus, naudotas dalis, pastebėtas problemas ir pan.
            </p>
          </div>

          {/* Hours Spent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sugaištos valandos
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={hoursSpent}
              onChange={(e) => setHoursSpent(e.target.value)}
              placeholder="pvz., 2.5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Neprivaloma. Įveskite apytikslį sugaištą laiką valandomis.
            </p>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Papildomos pastabos
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Papildoma informacija, pastebėjimai..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            disabled={loading}
          >
            Atšaukti
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !workDescription.trim()}
          >
            {loading ? 'Siunčiama...' : 'Pateikti ataskaitą'}
          </button>
        </div>
      </div>
    </div>
  );
}
