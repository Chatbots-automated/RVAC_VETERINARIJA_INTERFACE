import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Clock, Play, Square, AlertCircle, CheckSquare } from 'lucide-react';

interface TimeTrackingPanelProps {
  workLocation: 'farm' | 'warehouse';
  todaySchedule: any | null;
  activeTimeEntry: any | null;
  onTimeEntryChange: () => void;
}

interface AvailableTask {
  id: string;
  type: 'work_order' | 'maintenance_schedule' | 'farm_equipment_service' | 'technical_inspection';
  name: string;
  description: string;
  category: string;
}

export function TimeTrackingPanel({
  workLocation,
  todaySchedule,
  activeTimeEntry,
  onTimeEntryChange,
}: TimeTrackingPanelProps) {
  const { user, logAction } = useAuth();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'in' | 'out' | null>(null);
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [workDescription, setWorkDescription] = useState('');

  useEffect(() => {
    if (showConfirm === 'out' && user && activeTimeEntry) {
      loadAvailableTasks();
    }
  }, [showConfirm, user, activeTimeEntry]);

  const loadAvailableTasks = async () => {
    if (!user || !activeTimeEntry) return;

    try {
      const tasks: AvailableTask[] = [];

      // Load work orders assigned to this worker
      const { data: workOrders, error: woError } = await supabase
        .from('maintenance_work_orders')
        .select('id, work_order_number, description, status, order_type')
        .eq('assigned_to', user.id)
        .in('status', ['pending', 'in_progress']);

      if (woError) throw woError;

      if (workOrders) {
        workOrders.forEach(wo => {
          tasks.push({
            id: `work_order_${wo.id}`,
            type: 'work_order',
            name: wo.work_order_number,
            description: wo.description,
            category: 'Remonto darbai',
          });
        });
      }

      // Load maintenance schedules (active and approaching/overdue) - only for warehouse workers
      if (workLocation === 'warehouse') {
        const { data: schedules, error: schedError } = await supabase
          .from('maintenance_schedules')
          .select(`
            id,
            schedule_name,
            maintenance_type,
            next_due_date,
            vehicle:vehicles(registration_number, make, model)
          `)
          .eq('is_active', true);

        if (schedError) throw schedError;

        if (schedules) {
          // Filter to show only schedules that are due soon or overdue
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          schedules.forEach(schedule => {
            if (schedule.next_due_date) {
              const dueDate = new Date(schedule.next_due_date);
              dueDate.setHours(0, 0, 0, 0);
              const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              // Include if overdue or due within 30 days
              if (daysDiff <= 30) {
                tasks.push({
                  id: `maintenance_schedule_${schedule.id}`,
                  type: 'maintenance_schedule',
                  name: schedule.schedule_name,
                  description: `${schedule.vehicle?.registration_number || ''} - ${schedule.vehicle?.make || ''} ${schedule.vehicle?.model || ''}`,
                  category: 'Planiniai aptarnavimai',
                });
              }
            }
          });
        }
      }

      // If farm worker, load farm equipment services
      if (workLocation === 'farm') {
        const { data: farmServices, error: farmError } = await supabase
          .from('farm_equipment_items')
          .select('id, item_name, description, next_service_date')
          .eq('is_active', true);

        if (farmError) throw farmError;

        if (farmServices) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          farmServices.forEach(service => {
            if (service.next_service_date) {
              const dueDate = new Date(service.next_service_date);
              dueDate.setHours(0, 0, 0, 0);
              const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysDiff <= 30) {
                tasks.push({
                  id: `farm_equipment_service_${service.id}`,
                  type: 'farm_equipment_service',
                  name: service.item_name,
                  description: service.description || '',
                  category: 'Fermos įrangos aptarnavimai',
                });
              }
            }
          });
        }
      }

      // Load vehicles for technical inspections (if warehouse worker)
      if (workLocation === 'warehouse') {
        const { data: vehicles, error: vehError } = await supabase
          .from('vehicles')
          .select('id, registration_number, make, model, technical_inspection_due_date, insurance_expiry_date');

        if (vehError) throw vehError;

        if (vehicles) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          vehicles.forEach(vehicle => {
            const taDays = vehicle.technical_inspection_due_date 
              ? Math.ceil((new Date(vehicle.technical_inspection_due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              : null;
            const insuranceDays = vehicle.insurance_expiry_date
              ? Math.ceil((new Date(vehicle.insurance_expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              : null;
            
            // Add if technical inspection or insurance is due within 30 days
            if ((taDays !== null && taDays <= 30) || (insuranceDays !== null && insuranceDays <= 30)) {
              tasks.push({
                id: `technical_inspection_${vehicle.id}`,
                type: 'technical_inspection',
                name: vehicle.registration_number || `${vehicle.make} ${vehicle.model}`,
                description: `TA: ${taDays !== null ? `${taDays}d.` : 'N/A'}, Draudimas: ${insuranceDays !== null ? `${insuranceDays}d.` : 'N/A'}`,
                category: 'Techninės ir draudimai',
              });
            }
          });
        }
      }

      setAvailableTasks(tasks);
    } catch (error) {
      console.error('Error loading available tasks:', error);
    }
  };

  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const handleClockIn = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('worker_time_entries')
        .insert({
          worker_id: user.id,
          work_location: workLocation,
          date: today,
          actual_start_time: now.toISOString(),
          scheduled_start: todaySchedule?.shift_start || null,
          scheduled_end: todaySchedule?.shift_end || null,
          status: 'active',
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      await logAction('worker_clock_in', 'worker_time_entries', data.id, null, {
        date: today,
        time: now.toISOString(),
      });

      setNotes('');
      setShowConfirm(null);
      onTimeEntryChange();
    } catch (error: any) {
      console.error('Error clocking in:', error);
      alert('Klaida: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!user || !activeTimeEntry) return;

    // Validate that work description is provided if tasks are selected
    if (selectedTasks.size > 0 && !workDescription.trim()) {
      alert('Prašome aprašyti atliktus darbus');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(activeTimeEntry.actual_start_time);
      const hoursWorked = (now.getTime() - start.getTime()) / (1000 * 60 * 60);

      // Update time entry
      const { error: timeError } = await supabase
        .from('worker_time_entries')
        .update({
          actual_end_time: now.toISOString(),
          status: 'completed',
          notes: notes || activeTimeEntry.notes,
        })
        .eq('id', activeTimeEntry.id);

      if (timeError) throw timeError;

      // Create task reports for selected tasks
      if (selectedTasks.size > 0) {
        const taskReports = Array.from(selectedTasks).map(taskId => {
          // Parse taskId format: "work_order_uuid", "maintenance_schedule_uuid", "farm_equipment_service_uuid", or "technical_inspection_uuid"
          const parts = taskId.split('_');
          let taskType: string;
          let actualTaskId: string;
          
          if (parts[0] === 'work') {
            taskType = 'work_order';
            actualTaskId = parts.slice(2).join('_'); // Everything after "work_order_"
          } else if (parts[0] === 'maintenance') {
            taskType = 'maintenance_schedule';
            actualTaskId = parts.slice(2).join('_'); // Everything after "maintenance_schedule_"
          } else if (parts[0] === 'farm') {
            taskType = 'farm_equipment_service';
            actualTaskId = parts.slice(3).join('_'); // Everything after "farm_equipment_service_"
          } else if (parts[0] === 'technical') {
            taskType = 'technical_inspection';
            actualTaskId = parts.slice(2).join('_'); // Everything after "technical_inspection_"
          } else {
            // Fallback for any other format
            taskType = parts[0];
            actualTaskId = parts.slice(1).join('_');
          }
          
          return {
            worker_id: user.id,
            time_entry_id: activeTimeEntry.id,
            task_type: taskType,
            task_id: actualTaskId,
            completion_status: 'completed',
            work_description: workDescription.trim(),
            hours_spent: hoursWorked / selectedTasks.size, // Distribute hours evenly
            notes: notes || null,
            status: 'pending',
          };
        });

        const { error: reportsError } = await supabase
          .from('worker_task_reports')
          .insert(taskReports);

        if (reportsError) throw reportsError;

        await logAction('worker_clock_out_with_tasks', 'worker_time_entries', activeTimeEntry.id, null, {
          time: now.toISOString(),
          tasks_reported: selectedTasks.size,
        });
      } else {
        await logAction('worker_clock_out', 'worker_time_entries', activeTimeEntry.id, null, {
          time: now.toISOString(),
        });
      }

      setNotes('');
      setWorkDescription('');
      setSelectedTasks(new Set());
      setShowConfirm(null);
      onTimeEntryChange();
    } catch (error: any) {
      console.error('Error clocking out:', error);
      alert('Klaida: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getElapsedTime = () => {
    if (!activeTimeEntry) return null;
    
    const start = new Date(activeTimeEntry.actual_start_time);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours, minutes, total: `${hours}h ${minutes}m` };
  };

  const elapsed = getElapsedTime();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-blue-600" />
        Darbo laiko apskaita
      </h2>

      {!activeTimeEntry ? (
        // Clock In View
        <div className="space-y-4">
          {todaySchedule?.schedule_type === 'work' ? (
            <>
              <div className="text-center py-4">
                <p className="text-sm text-gray-600 mb-2">Planuota pradžia</p>
                <p className="text-3xl font-bold text-gray-900">
                  {todaySchedule.shift_start?.substring(0, 5) || '-'}
                </p>
              </div>

              {!showConfirm && (
                <button
                  onClick={() => setShowConfirm('in')}
                  className="w-full flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-lg transition-colors"
                >
                  <Play className="w-6 h-6" />
                  Pradėti darbą
                </button>
              )}

              {showConfirm === 'in' && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">
                      Ar tikrai norite pradėti darbą? Dabartinis laikas: <strong>{new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}</strong>
                    </p>
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Pastabos (neprivaloma)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowConfirm(null)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      disabled={loading}
                    >
                      Atšaukti
                    </button>
                    <button
                      onClick={handleClockIn}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                      disabled={loading}
                    >
                      {loading ? 'Fiksuojama...' : 'Patvirtinti'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">
                {todaySchedule ? 'Šiandien nėra darbo diena' : 'Šiandien nėra suplanuoto grafiko'}
              </p>
            </div>
          )}
        </div>
      ) : (
        // Clock Out View
        <div className="space-y-4">
          <div className="text-center py-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-700 mb-2">Dirbate</p>
            <p className="text-4xl font-bold text-green-900">{elapsed?.total}</p>
            <p className="text-xs text-green-600 mt-2">
              Pradėta: {new Date(activeTimeEntry.actual_start_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {todaySchedule?.shift_end && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-600">Planuota pabaiga</p>
              <p className="text-xl font-semibold text-gray-900">
                {todaySchedule.shift_end.substring(0, 5)}
              </p>
            </div>
          )}

          {!showConfirm && (
            <button
              onClick={() => setShowConfirm('out')}
              className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-lg transition-colors"
            >
              <Square className="w-6 h-6" />
              Baigti darbą
            </button>
          )}

          {showConfirm === 'out' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900">
                  Ar tikrai norite baigti darbą? Dabartinis laikas: <strong>{new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}</strong>
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Iš viso dirbote: <strong>{elapsed?.total}</strong>
                </p>
              </div>

              {/* Task Selection - Categorized */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" />
                  Ką dirbote šiandien? (pasirinkite užduotis)
                </p>
                
                {availableTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-3">
                    Nėra priskirtų ar artėjančių užduočių
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {/* Group tasks by category */}
                    {Array.from(new Set(availableTasks.map(t => t.category))).map(category => {
                      const categoryTasks = availableTasks.filter(t => t.category === category);
                      const categorySelected = categoryTasks.filter(t => selectedTasks.has(t.id)).length;
                      
                      return (
                        <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {/* Category Header */}
                          <div className="bg-gray-100 px-3 py-2 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-700 uppercase">{category}</p>
                              {categorySelected > 0 && (
                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                  {categorySelected} pasirinkta
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Category Tasks */}
                          <div className="divide-y divide-gray-100">
                            {categoryTasks.map(task => (
                              <label
                                key={task.id}
                                className="flex items-start gap-3 p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedTasks.has(task.id)}
                                  onChange={() => toggleTaskSelection(task.id)}
                                  className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{task.name}</p>
                                  {task.description && (
                                    <p className="text-xs text-gray-600 mt-0.5">{task.description}</p>
                                  )}
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedTasks.size > 0 && (
                  <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800">
                      Pasirinkta užduočių: <strong>{selectedTasks.size}</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Work Description (required if tasks selected) */}
              {selectedTasks.size > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Darbo aprašymas *
                  </label>
                  <textarea
                    value={workDescription}
                    onChange={(e) => setWorkDescription(e.target.value)}
                    placeholder="Aprašykite, kokius darbus atlikote pasirinktose užduotyse..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Būtina, jei pasirinkote užduotis
                  </p>
                </div>
              )}

              {/* Additional Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Papildomos pastabos
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Papildomos pastabos apie darbo dieną..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowConfirm(null);
                    setSelectedTasks(new Set());
                    setWorkDescription('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Atšaukti
                </button>
                <button
                  onClick={handleClockOut}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50"
                  disabled={loading || (selectedTasks.size > 0 && !workDescription.trim())}
                >
                  {loading ? 'Fiksuojama...' : 'Patvirtinti'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
