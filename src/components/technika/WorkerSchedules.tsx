import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, ChevronLeft, ChevronRight, Clock, User, Trash2, X, Edit2, AlertCircle, Users } from 'lucide-react';

interface Worker {
  id: string;
  full_name: string;
  work_location?: string;
}

interface Schedule {
  id: string;
  worker_id: string;
  date: string;
  shift_start: string;
  shift_end: string;
  schedule_type: string;
  notes: string;
  work_location?: string;
}

interface WorkerSchedulesProps {
  workLocation?: 'farm' | 'warehouse';
}

const SCHEDULE_TYPES = [
  { value: 'work', label: 'Darbas', color: 'bg-green-500', lightColor: 'bg-green-100', borderColor: 'border-green-600' },
  { value: 'off', label: 'Poilsis', color: 'bg-gray-400', lightColor: 'bg-gray-100', borderColor: 'border-gray-500' },
  { value: 'vacation', label: 'Atostogos', color: 'bg-blue-500', lightColor: 'bg-blue-100', borderColor: 'border-blue-600' },
  { value: 'sick', label: 'Liga', color: 'bg-red-500', lightColor: 'bg-red-100', borderColor: 'border-red-600' },
  { value: 'training', label: 'Mokymai', color: 'bg-purple-500', lightColor: 'bg-purple-100', borderColor: 'border-purple-600' },
];

export function WorkerSchedules({ workLocation }: WorkerSchedulesProps = {}) {
  const { logAction } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [selectedScheduleType, setSelectedScheduleType] = useState('work');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ date: string; hour: number; dayIndex: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ date: string; hour: number; dayIndex: number } | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [hoveredScheduleId, setHoveredScheduleId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'multi'>('single');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [multiLayout, setMultiLayout] = useState<'rows' | 'overlay'>('rows');
  const timelineRef = useRef<HTMLDivElement>(null);

  // Worker colors for overlay mode
  const workerColors = [
    { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-blue-900', light: 'bg-blue-50' },
    { bg: 'bg-green-500', border: 'border-green-600', text: 'text-green-900', light: 'bg-green-50' },
    { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-purple-900', light: 'bg-purple-50' },
    { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-orange-900', light: 'bg-orange-50' },
    { bg: 'bg-pink-500', border: 'border-pink-600', text: 'text-pink-900', light: 'bg-pink-50' },
    { bg: 'bg-teal-500', border: 'border-teal-600', text: 'text-teal-900', light: 'bg-teal-50' },
    { bg: 'bg-indigo-500', border: 'border-indigo-600', text: 'text-indigo-900', light: 'bg-indigo-50' },
    { bg: 'bg-rose-500', border: 'border-rose-600', text: 'text-rose-900', light: 'bg-rose-50' },
  ];

  // Load work hours from localStorage or use defaults
  const [workStartHour, setWorkStartHour] = useState(() => {
    const saved = localStorage.getItem('workerSchedules_startHour');
    return saved ? parseInt(saved, 10) : 6;
  });
  const [workEndHour, setWorkEndHour] = useState(() => {
    const saved = localStorage.getItem('workerSchedules_endHour');
    return saved ? parseInt(saved, 10) : 18;
  });

  // Save work hours to localStorage when they change
  useEffect(() => {
    localStorage.setItem('workerSchedules_startHour', workStartHour.toString());
  }, [workStartHour]);

  useEffect(() => {
    localStorage.setItem('workerSchedules_endHour', workEndHour.toString());
  }, [workEndHour]);

  // Generate hours array based on work hours
  const HOURS = Array.from({ length: workEndHour - workStartHour }, (_, i) => workStartHour + i);

  useEffect(() => {
    loadData();
  }, [currentDate, workLocation]);

  const loadData = async () => {
    // Load workers - filter by work_location if specified
    const workersQuery = supabase
      .from('users')
      .select('id, full_name, work_location')
      .order('full_name');
    
    if (workLocation) {
      workersQuery.or(`work_location.eq.${workLocation},work_location.eq.both`);
    }
    
    const workersRes = await workersQuery;

    // Load schedules - filter by work_location if specified
    const schedulesQuery = supabase
      .from('worker_schedules')
      .select('*')
      .order('date', { ascending: true });
    
    if (workLocation) {
      schedulesQuery.eq('work_location', workLocation);
    }
    
    const schedulesRes = await schedulesQuery;

    if (workersRes.data) {
      setWorkers(workersRes.data);
      if (!selectedWorker && workersRes.data.length > 0) {
        setSelectedWorker(workersRes.data[0].id);
      }
    }
    if (schedulesRes.data) setSchedules(schedulesRes.data);
  };

  const getWeekDates = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay() + 1);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const formatDateKey = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const parseTime = (timeStr: string | null): { hour: number; minute: number } => {
    if (!timeStr) return { hour: 0, minute: 0 };
    const parts = timeStr.split(':');
    return {
      hour: parseInt(parts[0], 10) || 0,
      minute: parseInt(parts[1], 10) || 0
    };
  };

  const getSchedulesForCell = (date: Date, hour: number, workerId?: string) => {
    const dateKey = formatDateKey(date);
    return schedules.filter(s => {
      const targetWorkerId = workerId || selectedWorker;
      if (s.worker_id !== targetWorkerId || s.date !== dateKey) return false;
      const start = parseTime(s.shift_start);
      const end = parseTime(s.shift_end);

      const cellStart = hour;
      const cellEnd = hour + 1;
      const scheduleStart = start.hour + start.minute / 60;
      const scheduleEnd = end.hour + end.minute / 60;

      return scheduleStart < cellEnd && scheduleEnd > cellStart;
    });
  };

  const handleMouseDown = (date: Date, hour: number, dayIndex: number, e: React.MouseEvent) => {
    // Don't start drag if clicking on a schedule block
    if ((e.target as HTMLElement).closest('[data-schedule-block]')) {
      return;
    }
    
    if (!selectedWorker) {
      alert('Prašome pasirinkti darbuotoją');
      return;
    }
    setIsDragging(true);
    setHoveredScheduleId(null);
    setDeleteConfirmId(null);
    const dateKey = formatDateKey(date);
    setDragStart({ date: dateKey, hour, dayIndex });
    setDragEnd({ date: dateKey, hour, dayIndex });
  };

  const handleMouseEnter = (date: Date, hour: number, dayIndex: number) => {
    if (isDragging && dragStart) {
      const dateKey = formatDateKey(date);
      setDragEnd({ date: dateKey, hour, dayIndex });
    }
  };

  const handleMouseUp = async () => {
    if (isDragging && dragStart && dragEnd && selectedWorker) {
      const schedules = [];

      if (dragStart.dayIndex === dragEnd.dayIndex) {
        const startHour = Math.min(dragStart.hour, dragEnd.hour);
        const endHour = Math.max(dragStart.hour, dragEnd.hour) + 1;

        schedules.push({
          worker_id: selectedWorker,
          date: dragStart.date,
          shift_start: `${String(startHour).padStart(2, '0')}:00`,
          shift_end: `${String(endHour).padStart(2, '0')}:00`,
          schedule_type: selectedScheduleType,
          notes: '',
        });
      } else {
        const minDayIndex = Math.min(dragStart.dayIndex, dragEnd.dayIndex);
        const maxDayIndex = Math.max(dragStart.dayIndex, dragEnd.dayIndex);
        const dates = getWeekDates();

        for (let i = minDayIndex; i <= maxDayIndex; i++) {
          const currentDate = formatDateKey(dates[i]);
          let startHour, endHour;

          if (i === minDayIndex) {
            startHour = dragStart.dayIndex === minDayIndex ? dragStart.hour : dragEnd.hour;
            endHour = workEndHour;
          } else if (i === maxDayIndex) {
            startHour = workStartHour;
            endHour = (dragStart.dayIndex === maxDayIndex ? dragStart.hour : dragEnd.hour) + 1;
          } else {
            startHour = workStartHour;
            endHour = workEndHour;
          }

          if (startHour < endHour) {
            schedules.push({
              worker_id: selectedWorker,
              date: currentDate,
              shift_start: `${String(startHour).padStart(2, '0')}:00`,
              shift_end: `${String(endHour).padStart(2, '0')}:00`,
              schedule_type: selectedScheduleType,
              notes: '',
              work_location: workLocation || 'warehouse',
            });
          }
        }
      }

      try {
        const { error } = await supabase.from('worker_schedules').insert(schedules);
        if (error) throw error;

        await logAction('add_worker_schedule', 'worker_schedules', undefined, undefined, {
          worker_id: selectedWorker,
          dates: schedules.map(s => s.date).join(', '),
          count: schedules.length
        });
        loadData();
      } catch (error: any) {
        console.error('Error:', error);
        alert(`Klaida: ${error.message}`);
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const isCellInDragRange = (hour: number, dayIndex: number) => {
    if (!isDragging || !dragStart || !dragEnd) return false;

    const minDayIndex = Math.min(dragStart.dayIndex, dragEnd.dayIndex);
    const maxDayIndex = Math.max(dragStart.dayIndex, dragEnd.dayIndex);

    if (dayIndex < minDayIndex || dayIndex > maxDayIndex) return false;

    if (minDayIndex === maxDayIndex) {
      const minHour = Math.min(dragStart.hour, dragEnd.hour);
      const maxHour = Math.max(dragStart.hour, dragEnd.hour);
      return hour >= minHour && hour <= maxHour;
    }

    if (dayIndex === minDayIndex) {
      const startHour = dragStart.dayIndex === minDayIndex ? dragStart.hour : dragEnd.hour;
      return hour >= startHour;
    }

    if (dayIndex === maxDayIndex) {
      const endHour = dragStart.dayIndex === maxDayIndex ? dragStart.hour : dragEnd.hour;
      return hour <= endHour;
    }

    return true;
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase.from('worker_schedules').delete().eq('id', scheduleId);
      if (error) throw error;

      await logAction('delete_worker_schedule', 'worker_schedules', scheduleId);
      setDeleteConfirmId(null);
      setShowEditModal(false);
      setEditingSchedule(null);
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule) return;

    try {
      const { error } = await supabase
        .from('worker_schedules')
        .update({
          shift_start: editingSchedule.shift_start,
          shift_end: editingSchedule.shift_end,
          schedule_type: editingSchedule.schedule_type,
          notes: editingSchedule.notes,
        })
        .eq('id', editingSchedule.id);

      if (error) throw error;
      await logAction('update_worker_schedule', 'worker_schedules', editingSchedule.id, undefined, {
        shift_start: editingSchedule.shift_start,
        shift_end: editingSchedule.shift_end,
        schedule_type: editingSchedule.schedule_type,
        notes: editingSchedule.notes,
      });
      setShowEditModal(false);
      setEditingSchedule(null);
      setDeleteConfirmId(null);
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const dates = getWeekDates();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Calendar className="w-6 h-6 text-slate-600" />
            <h3 className="text-xl font-bold text-gray-800">Darbuotojų grafikai</h3>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('single')}
              className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'single'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">Vienas</span>
            </button>
            <button
              onClick={() => setViewMode('multi')}
              className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'multi'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Visi</span>
            </button>
          </div>
        </div>

        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {viewMode === 'single' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas</label>
              <select
                value={selectedWorker}
                onChange={(e) => setSelectedWorker(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              >
                <option value="">Pasirinkite darbuotoją</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Darbuotojai</label>
                <button
                  onClick={() => {
                    if (selectedWorkers.length === workers.length) {
                      setSelectedWorkers([]);
                    } else {
                      setSelectedWorkers(workers.map(w => w.id));
                    }
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  {selectedWorkers.length === workers.length ? 'Atžymėti visus' : 'Žymėti visus'}
                </button>
              </div>
              <div className="border border-gray-300 rounded-lg px-3 py-2 max-h-24 overflow-y-auto bg-white">
                {workers.map(worker => (
                  <label key={worker.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedWorkers.includes(worker.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedWorkers([...selectedWorkers, worker.id]);
                        } else {
                          setSelectedWorkers(selectedWorkers.filter(id => id !== worker.id));
                        }
                      }}
                      className="rounded border-gray-300 text-slate-600 focus:ring-slate-500"
                    />
                    <span className="text-sm">{worker.full_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'multi' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Išdėstymas</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMultiLayout('rows')}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    multiLayout === 'rows'
                      ? 'border-slate-600 bg-slate-50 text-slate-900'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  Eilutės
                </button>
                <button
                  onClick={() => setMultiLayout('overlay')}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    multiLayout === 'overlay'
                      ? 'border-slate-600 bg-slate-50 text-slate-900'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  Sluoksniai
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grafiko tipas</label>
            <select
              value={selectedScheduleType}
              onChange={(e) => setSelectedScheduleType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            >
              {SCHEDULE_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Darbo pradžia</label>
            <select
              value={workStartHour}
              onChange={(e) => {
                const newStart = parseInt(e.target.value, 10);
                if (newStart < workEndHour) {
                  setWorkStartHour(newStart);
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            >
              {Array.from({ length: 24 }, (_, i) => i).map(h => (
                <option key={h} value={h} disabled={h >= workEndHour}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Darbo pabaiga</label>
            <select
              value={workEndHour}
              onChange={(e) => {
                const newEnd = parseInt(e.target.value, 10);
                if (newEnd > workStartHour) {
                  setWorkEndHour(newEnd);
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                <option key={h} value={h} disabled={h <= workStartHour}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <div className={`flex-1 p-3 rounded-lg border-2 ${SCHEDULE_TYPES.find(t => t.value === selectedScheduleType)?.lightColor} ${SCHEDULE_TYPES.find(t => t.value === selectedScheduleType)?.borderColor}`}>
              <div className="text-xs text-gray-600 mb-1">Braižykite norėdami pridėti</div>
              <div className="font-semibold text-gray-900">
                {SCHEDULE_TYPES.find(t => t.value === selectedScheduleType)?.label}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigateWeek('prev')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-lg font-semibold text-gray-800">
            {dates[0].toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })} - {dates[6].toLocaleDateString('lt-LT', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <button
            onClick={() => navigateWeek('next')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {(viewMode === 'single' && selectedWorker) || (viewMode === 'multi' && selectedWorkers.length > 0) ? (
          viewMode === 'single' ? (
            <div
              ref={timelineRef}
              className="border border-gray-300 rounded-lg overflow-hidden"
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
            <div className="flex">
              <div className="w-16 flex-shrink-0 bg-gray-50 border-r border-gray-300">
                <div className="h-12 border-b border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                  Laikas
                </div>
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="h-12 border-b border-gray-200 flex items-center justify-center text-xs text-gray-600"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-x-auto">
                <div className="flex min-w-max">
                  {dates.map((date, dateIdx) => (
                    <div key={dateIdx} className="flex-1 min-w-[120px] border-r border-gray-300 last:border-r-0">
                      <div className="h-12 border-b border-gray-300 flex flex-col items-center justify-center bg-gray-50 px-2">
                        <div className="text-xs font-semibold text-gray-700">
                          {['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'][date.getDay()]}
                        </div>
                        <div className="text-sm text-gray-600">{date.getDate()}</div>
                      </div>

                      <div className="relative">
                        {HOURS.map(hour => {
                          const cellSchedules = getSchedulesForCell(date, hour);
                          const isInDragRange = isCellInDragRange(hour, dateIdx);
                          const scheduleTypeColor = SCHEDULE_TYPES.find(t => t.value === selectedScheduleType);

                          return (
                            <div
                              key={hour}
                              className={`h-12 border-b border-gray-200 relative transition-colors ${
                                isInDragRange
                                  ? scheduleTypeColor?.lightColor
                                  : cellSchedules.length === 0 ? 'hover:bg-blue-50 cursor-cell' : ''
                              }`}
                              onMouseDown={(e) => handleMouseDown(date, hour, dateIdx, e)}
                              onMouseEnter={() => handleMouseEnter(date, hour, dateIdx)}
                            >
                              {cellSchedules.map(schedule => {
                                const scheduleType = SCHEDULE_TYPES.find(t => t.value === schedule.schedule_type);
                                const start = parseTime(schedule.shift_start);
                                const end = parseTime(schedule.shift_end);

                                const scheduleStartInHours = start.hour + start.minute / 60;
                                const scheduleEndInHours = end.hour + end.minute / 60;
                                const cellStartInHours = hour;

                                // Show the schedule in the first visible cell it appears in
                                const scheduleStartHour = Math.floor(scheduleStartInHours);
                                const firstVisibleHour = Math.max(scheduleStartHour, workStartHour);
                                const isFirstCell = firstVisibleHour === hour;

                                if (!isFirstCell) return null;

                                // Calculate visual properties
                                const visualStartInHours = Math.max(scheduleStartInHours, workStartHour);
                                const visualEndInHours = Math.min(scheduleEndInHours, workEndHour);
                                const durationInHours = visualEndInHours - visualStartInHours;
                                const heightInPixels = durationInHours * 48;
                                const topOffset = (visualStartInHours - cellStartInHours) * 48;
                                const isHovered = hoveredScheduleId === schedule.id;
                                const isDeleting = deleteConfirmId === schedule.id;
                                const startsBeforeVisible = scheduleStartInHours < workStartHour;
                                const endsAfterVisible = scheduleEndInHours > workEndHour;

                                return (
                                  <div
                                    key={schedule.id}
                                    data-schedule-block="true"
                                    className={`absolute inset-x-1 ${scheduleType?.color} text-white rounded-md px-2 py-1 text-xs font-medium shadow-md border-l-4 ${scheduleType?.borderColor} cursor-pointer z-10 transition-all ${
                                      isHovered ? 'ring-2 ring-white ring-opacity-50 scale-[1.02] shadow-lg' : ''
                                    } ${isDeleting ? 'ring-2 ring-red-400' : ''}`}
                                    style={{
                                      top: `${topOffset}px`,
                                      height: `${heightInPixels}px`,
                                      minHeight: '36px'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      if (!isDragging) {
                                        setHoveredScheduleId(schedule.id);
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.stopPropagation();
                                      setHoveredScheduleId(null);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isDragging) {
                                        setEditingSchedule(schedule);
                                        setShowEditModal(true);
                                      }
                                    }}
                                  >
                                    {isDeleting ? (
                                      <div className="flex flex-col items-center justify-center h-full gap-1">
                                        <AlertCircle className="w-4 h-4" />
                                        <div className="text-[10px] font-bold">Ištrinti?</div>
                                        <div className="flex gap-1">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteSchedule(schedule.id);
                                            }}
                                            className="px-2 py-0.5 bg-white text-red-600 rounded text-[10px] font-bold hover:bg-red-50"
                                          >
                                            Taip
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteConfirmId(null);
                                            }}
                                            className="px-2 py-0.5 bg-white bg-opacity-20 rounded text-[10px] hover:bg-opacity-30"
                                          >
                                            Ne
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-start justify-between h-full gap-1">
                                        <div className="flex-1 min-w-0 pt-0.5">
                                          <div className="font-semibold truncate text-[11px]">
                                            {startsBeforeVisible && '↑ '}
                                            {scheduleType?.label}
                                            {endsAfterVisible && ' ↓'}
                                          </div>
                                          <div className="text-[10px] opacity-90 mt-0.5">
                                            {schedule.shift_start.substring(0, 5)} - {schedule.shift_end.substring(0, 5)}
                                          </div>
                                          {schedule.notes && (
                                            <div className="text-[9px] opacity-75 truncate mt-0.5" title={schedule.notes}>
                                              {schedule.notes}
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingSchedule(schedule);
                                              setShowEditModal(true);
                                            }}
                                            className={`p-1 hover:bg-white hover:bg-opacity-20 rounded transition-all ${
                                              isHovered ? 'opacity-100' : 'opacity-0'
                                            }`}
                                            title="Redaguoti"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteConfirmId(schedule.id);
                                            }}
                                            className={`p-1 hover:bg-red-500 hover:bg-opacity-30 rounded transition-all ${
                                              isHovered ? 'opacity-100' : 'opacity-0'
                                            }`}
                                            title="Ištrinti"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          ) : (
            // Multi-worker view
            multiLayout === 'rows' ? (
              // Rows layout - each worker in separate row
              <div className="border border-gray-300 rounded-lg overflow-auto" style={{ maxHeight: '70vh' }}>
                <div className="flex">
                {/* Worker names column */}
                <div className="sticky left-0 z-20 bg-white border-r border-gray-300">
                  <div className="w-40 h-12 border-b border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-700 bg-gray-50">
                    Darbuotojas
                  </div>
                  {selectedWorkers.map(workerId => {
                    const worker = workers.find(w => w.id === workerId);
                    const rowHeight = HOURS.length * 48;
                    return (
                      <div 
                        key={workerId} 
                        className="w-40 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 flex items-center" 
                        style={{ height: `${rowHeight}px` }}
                      >
                        <span className="truncate">{worker?.full_name}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Calendar grid */}
                <div className="flex-1 overflow-x-auto">
                  <div className="flex min-w-max">
                    {dates.map((date, dateIdx) => (
                      <div key={dateIdx} className="flex-1 min-w-[120px] border-r border-gray-300 last:border-r-0">
                        <div className="h-12 border-b border-gray-300 flex flex-col items-center justify-center bg-gray-50 px-2">
                          <div className="text-xs font-semibold text-gray-700">
                            {['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'][date.getDay()]}
                          </div>
                          <div className="text-sm text-gray-600">{date.getDate()}</div>
                        </div>

                        {selectedWorkers.map(workerId => (
                          <div 
                            key={`${workerId}-${dateIdx}`} 
                            className="relative border-b border-gray-200" 
                            style={{ height: `${HOURS.length * 48}px` }}
                          >
                            {HOURS.map(hour => {
                              const cellSchedules = getSchedulesForCell(date, hour, workerId);
                              const cellTop = (hour - workStartHour) * 48;
                              
                              return (
                                <div 
                                  key={hour} 
                                  className="absolute inset-x-0 border-t border-gray-100 first:border-t-0" 
                                  style={{ top: `${cellTop}px`, height: '48px' }}
                                >
                                  {cellSchedules.map(schedule => {
                                    const scheduleType = SCHEDULE_TYPES.find(t => t.value === schedule.schedule_type);
                                    const start = parseTime(schedule.shift_start);
                                    const end = parseTime(schedule.shift_end);

                                    const scheduleStartInHours = start.hour + start.minute / 60;
                                    const scheduleEndInHours = end.hour + end.minute / 60;

                                    // Show the schedule in the first visible cell it appears in
                                    const scheduleStartHour = Math.floor(scheduleStartInHours);
                                    const firstVisibleHour = Math.max(scheduleStartHour, workStartHour);
                                    const isFirstCell = firstVisibleHour === hour;
                                    if (!isFirstCell) return null;

                                    // Calculate visual properties
                                    const visualStartInHours = Math.max(scheduleStartInHours, workStartHour);
                                    const visualEndInHours = Math.min(scheduleEndInHours, workEndHour);
                                    const durationInHours = visualEndInHours - visualStartInHours;
                                    const heightInPixels = durationInHours * 48;
                                    const topOffset = (visualStartInHours - hour) * 48;
                                    const startsBeforeVisible = scheduleStartInHours < workStartHour;
                                    const endsAfterVisible = scheduleEndInHours > workEndHour;

                                    return (
                                      <div
                                        key={schedule.id}
                                        className={`absolute inset-x-1 ${scheduleType?.color} text-white rounded px-2 py-1 text-[10px] font-medium shadow-sm border-l-2 ${scheduleType?.borderColor} cursor-pointer hover:shadow-md transition-shadow`}
                                        style={{
                                          top: `${topOffset}px`,
                                          height: `${heightInPixels}px`,
                                          minHeight: '20px'
                                        }}
                                        onClick={() => {
                                          setEditingSchedule(schedule);
                                          setShowEditModal(true);
                                        }}
                                        title={`${workers.find((w: Worker) => w.id === workerId)?.full_name}\n${scheduleType?.label}\n${schedule.shift_start.substring(0, 5)} - ${schedule.shift_end.substring(0, 5)}`}
                                      >
                                        <div className="truncate font-semibold leading-tight">
                                          {startsBeforeVisible && '↑ '}
                                          {scheduleType?.label}
                                          {endsAfterVisible && ' ↓'}
                                        </div>
                                        {heightInPixels > 30 && (
                                          <div className="text-[9px] opacity-90 truncate">
                                            {schedule.shift_start.substring(0, 5)} - {schedule.shift_end.substring(0, 5)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            ) : (
              // Overlay layout - all workers on same grid with different colors
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="flex">
                  {/* Time column */}
                  <div className="w-16 flex-shrink-0 bg-gray-50 border-r border-gray-300">
                    <div className="h-12 border-b border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                      Laikas
                    </div>
                    {HOURS.map(hour => (
                      <div
                        key={hour}
                        className="h-12 border-b border-gray-200 flex items-center justify-center text-xs text-gray-600"
                      >
                        {String(hour).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex min-w-max">
                      {dates.map((date, dateIdx) => (
                        <div key={dateIdx} className="flex-1 min-w-[120px] border-r border-gray-300 last:border-r-0">
                          <div className="h-12 border-b border-gray-300 flex flex-col items-center justify-center bg-gray-50 px-2">
                            <div className="text-xs font-semibold text-gray-700">
                              {['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'][date.getDay()]}
                            </div>
                            <div className="text-sm text-gray-600">{date.getDate()}</div>
                          </div>

                          <div className="relative">
                            {HOURS.map(hour => {
                              // Collect all schedules from all selected workers for this cell
                              const allCellSchedules = selectedWorkers.flatMap((workerId, workerIndex) => {
                                const schedules = getSchedulesForCell(date, hour, workerId);
                                return schedules.map(schedule => ({ ...schedule, workerId, workerIndex }));
                              });

                              return (
                                <div
                                  key={hour}
                                  className="h-12 border-b border-gray-200 relative"
                                >
                                  {allCellSchedules.map((scheduleWithWorker) => {
                                    const schedule = scheduleWithWorker;
                                    const scheduleType = SCHEDULE_TYPES.find(t => t.value === schedule.schedule_type);
                                    const start = parseTime(schedule.shift_start);
                                    const end = parseTime(schedule.shift_end);

                                    const scheduleStartInHours = start.hour + start.minute / 60;
                                    const scheduleEndInHours = end.hour + end.minute / 60;

                                    const scheduleStartHour = Math.floor(scheduleStartInHours);
                                    const firstVisibleHour = Math.max(scheduleStartHour, workStartHour);
                                    const isFirstCell = firstVisibleHour === hour;
                                    if (!isFirstCell) return null;

                                    const visualStartInHours = Math.max(scheduleStartInHours, workStartHour);
                                    const visualEndInHours = Math.min(scheduleEndInHours, workEndHour);
                                    const durationInHours = visualEndInHours - visualStartInHours;
                                    const heightInPixels = durationInHours * 48;
                                    const topOffset = (visualStartInHours - hour) * 48;
                                    const startsBeforeVisible = scheduleStartInHours < workStartHour;
                                    const endsAfterVisible = scheduleEndInHours > workEndHour;
                                    
                                    // Use worker color instead of schedule type color
                                    const workerColor = workerColors[schedule.workerIndex % workerColors.length];
                                    const worker = workers.find(w => w.id === schedule.workerId);
                                    
                                    return (
                                      <div
                                        key={schedule.id}
                                        className={`absolute inset-x-1 ${workerColor.bg} text-white rounded-md px-2 py-1 text-xs font-medium shadow-md border-l-4 ${workerColor.border} cursor-pointer z-10 transition-all hover:shadow-lg hover:scale-[1.02]`}
                                        style={{
                                          top: `${topOffset}px`,
                                          height: `${heightInPixels}px`,
                                          minHeight: '36px',
                                          opacity: 0.9
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingSchedule(schedule);
                                          setShowEditModal(true);
                                        }}
                                        title={`${worker?.full_name}\n${scheduleType?.label}\n${schedule.shift_start.substring(0, 5)} - ${schedule.shift_end.substring(0, 5)}`}
                                      >
                                        <div className="font-semibold truncate text-[11px]">
                                          {startsBeforeVisible && '↑ '}
                                          {worker?.full_name}
                                          {endsAfterVisible && ' ↓'}
                                        </div>
                                        <div className="text-[10px] opacity-90 mt-0.5 truncate">
                                          {scheduleType?.label}
                                        </div>
                                        {heightInPixels > 50 && (
                                          <div className="text-[10px] opacity-90 mt-0.5">
                                            {schedule.shift_start.substring(0, 5)} - {schedule.shift_end.substring(0, 5)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Legend for overlay view */}
                <div className="border-t border-gray-300 bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Darbuotojai:</div>
                  <div className="flex flex-wrap gap-3">
                    {selectedWorkers.map((workerId, index) => {
                      const worker = workers.find(w => w.id === workerId);
                      const color = workerColors[index % workerColors.length];
                      return (
                        <div key={workerId} className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${color.bg} border-2 ${color.border}`}></div>
                          <span className="text-sm text-gray-700">{worker?.full_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          )
        ) : (
          <div className="text-center py-12 text-gray-500 border border-gray-200 rounded-lg">
            {viewMode === 'single' ? (
              <>
                <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Pasirinkite darbuotoją iš sąrašo</p>
              </>
            ) : (
              <>
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Pasirinkite darbuotojus iš sąrašo</p>
              </>
            )}
          </div>
        )}

        {viewMode === 'single' && selectedWorker && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3 text-sm">
              <Clock className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
              <div className="flex-1">
                <div className="font-semibold mb-2 text-blue-900">Kaip naudotis grafiku:</div>
                <div className="grid md:grid-cols-2 gap-3 text-blue-800">
                  <div>
                    <div className="font-medium text-blue-900 mb-1">Pridėti grafiką:</div>
                    <ul className="space-y-1 text-sm text-blue-700">
                      <li>• Pasirinkite grafiko tipą viršuje</li>
                      <li>• Spustelėkite ir tempkite kalendoriuje</li>
                      <li>• Galite brėžti per kelias dienas</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium text-blue-900 mb-1">Redaguoti/Ištrinti:</div>
                    <ul className="space-y-1 text-sm text-blue-700">
                      <li>• Užveskite pelę ant grafiko</li>
                      <li>• Spauskite <Edit2 className="w-3 h-3 inline" /> redaguoti</li>
                      <li>• Spauskite <Trash2 className="w-3 h-3 inline" /> ištrinti</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      </div>

      {showEditModal && editingSchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Redaguoti grafiką</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingSchedule(null);
                  setDeleteConfirmId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas</label>
                <input
                  type="text"
                  value={workers.find(w => w.id === editingSchedule.worker_id)?.full_name || ''}
                  disabled
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="text"
                  value={new Date(editingSchedule.date).toLocaleDateString('lt-LT', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                  disabled
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grafiko tipas</label>
                <select
                  value={editingSchedule.schedule_type}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, schedule_type: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                >
                  {SCHEDULE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pradžia</label>
                  <input
                    type="time"
                    value={editingSchedule.shift_start}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, shift_start: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pabaiga</label>
                  <input
                    type="time"
                    value={editingSchedule.shift_end}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, shift_end: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pastabos</label>
                <textarea
                  value={editingSchedule.notes || ''}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, notes: e.target.value })}
                  placeholder="Pridėti pastabas (nebūtina)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>
            </div>

            {deleteConfirmId === editingSchedule.id ? (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800 mb-3">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">Ar tikrai norite ištrinti šį grafiką?</span>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Atšaukti
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(editingSchedule.id)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
                  >
                    Taip, ištrinti
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-2 mt-6">
                <button
                  onClick={() => setDeleteConfirmId(editingSchedule.id)}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Ištrinti
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingSchedule(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Atšaukti
                  </button>
                  <button
                    onClick={handleUpdateSchedule}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-semibold"
                  >
                    Išsaugoti
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
