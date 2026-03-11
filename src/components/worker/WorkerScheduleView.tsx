import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { TimeTrackingPanel } from './TimeTrackingPanel';

interface WorkerScheduleViewProps {
  workLocation: 'farm' | 'warehouse';
  activeTimeEntry: any | null;
  onTimeEntryChange: () => void;
}

interface Schedule {
  id: string;
  date: string;
  shift_start: string;
  shift_end: string;
  schedule_type: string;
  notes: string;
}

interface TimeEntry {
  id: string;
  date: string;
  actual_start_time: string;
  actual_end_time: string | null;
  status: string;
  notes: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
}

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  work: 'Darbas',
  off: 'Poilsis',
  vacation: 'Atostogos',
  sick: 'Liga',
  training: 'Mokymai',
};

const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  work: 'bg-green-100 text-green-800 border-green-300',
  off: 'bg-gray-100 text-gray-800 border-gray-300',
  vacation: 'bg-blue-100 text-blue-800 border-blue-300',
  sick: 'bg-red-100 text-red-800 border-red-300',
  training: 'bg-purple-100 text-purple-800 border-purple-300',
};

export function WorkerScheduleView({ workLocation, activeTimeEntry, onTimeEntryChange }: WorkerScheduleViewProps) {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStart(new Date()));

  useEffect(() => {
    loadData();
  }, [user, currentWeekStart]);

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
  }

  function getWeekDates(start: Date): Date[] {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  }

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const weekDates = getWeekDates(currentWeekStart);
      const startDate = weekDates[0].toISOString().split('T')[0];
      const endDate = weekDates[6].toISOString().split('T')[0];

      // Load schedules
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('worker_schedules')
        .select('*')
        .eq('worker_id', user.id)
        .eq('work_location', workLocation)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      if (schedulesError) throw schedulesError;

      // Load time entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('worker_time_entries')
        .select('*')
        .eq('worker_id', user.id)
        .eq('work_location', workLocation)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (entriesError) throw entriesError;

      setSchedules(schedulesData || []);
      setTimeEntries(entriesData || []);
    } catch (error) {
      console.error('Error loading schedule data:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(newStart);
  };

  const getTodaySchedule = () => {
    const today = new Date().toISOString().split('T')[0];
    return schedules.find(s => s.date === today);
  };

  const getTimeEntryForDate = (date: string) => {
    return timeEntries.find(e => e.date === date);
  };

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    return time.substring(0, 5);
  };

  const formatDateTime = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'completed':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Aktyvus';
      case 'completed':
        return 'Laukiama patvirtinimo';
      case 'approved':
        return 'Patvirtinta';
      case 'rejected':
        return 'Atmesta';
      default:
        return status;
    }
  };

  const todaySchedule = getTodaySchedule();
  const weekDates = getWeekDates(currentWeekStart);
  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Kraunama...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's Schedule & Time Tracking */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Šiandienos grafikas
          </h2>
          
          {todaySchedule ? (
            <div className="space-y-3">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${SCHEDULE_TYPE_COLORS[todaySchedule.schedule_type] || 'bg-gray-100 text-gray-800'}`}>
                {SCHEDULE_TYPE_LABELS[todaySchedule.schedule_type] || todaySchedule.schedule_type}
              </div>
              
              {todaySchedule.schedule_type === 'work' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-gray-600">Pradžia:</span>
                    <span className="font-semibold">{formatTime(todaySchedule.shift_start)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-gray-600">Pabaiga:</span>
                    <span className="font-semibold">{formatTime(todaySchedule.shift_end)}</span>
                  </div>
                </div>
              )}
              
              {todaySchedule.notes && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{todaySchedule.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Šiandien nėra suplanuoto grafiko</p>
          )}
        </div>

        {/* Time Tracking */}
        <TimeTrackingPanel
          workLocation={workLocation}
          todaySchedule={todaySchedule}
          activeTimeEntry={activeTimeEntry}
          onTimeEntryChange={() => {
            onTimeEntryChange();
            loadData();
          }}
        />
      </div>

      {/* Weekly Schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Savaitės grafikas</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateWeek('prev')}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ←
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
              {weekDates[0].toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })} - {weekDates[6].toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })}
            </span>
            <button
              onClick={() => navigateWeek('next')}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              →
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {weekDates.map((date) => {
            const dateStr = date.toISOString().split('T')[0];
            const schedule = schedules.find(s => s.date === dateStr);
            const timeEntry = getTimeEntryForDate(dateStr);
            const isToday = dateStr === today;

            return (
              <div
                key={dateStr}
                className={`p-4 rounded-lg border ${isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[80px]">
                      <p className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>
                        {date.toLocaleDateString('lt-LT', { weekday: 'short' }).toUpperCase()}
                      </p>
                      <p className={`text-lg font-bold ${isToday ? 'text-blue-900' : 'text-gray-900'}`}>
                        {date.getDate()}
                      </p>
                    </div>

                    {schedule ? (
                      <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full border text-xs font-medium ${SCHEDULE_TYPE_COLORS[schedule.schedule_type]}`}>
                          {SCHEDULE_TYPE_LABELS[schedule.schedule_type]}
                        </div>
                        {schedule.schedule_type === 'work' && (
                          <span className="text-sm text-gray-700">
                            {formatTime(schedule.shift_start)} - {formatTime(schedule.shift_end)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Nėra grafiko</span>
                    )}
                  </div>

                  {timeEntry && (
                    <div className="flex items-center gap-2">
                      {getStatusIcon(timeEntry.status)}
                      <div className="text-right">
                        <p className="text-xs text-gray-600">{getStatusLabel(timeEntry.status)}</p>
                        <p className="text-sm font-medium text-gray-900">
                          {formatDateTime(timeEntry.actual_start_time)}
                          {timeEntry.actual_end_time && ` - ${formatDateTime(timeEntry.actual_end_time)}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {timeEntry?.review_notes && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <p className="text-xs text-gray-600">Admin pastaba:</p>
                    <p className="text-sm text-gray-800">{timeEntry.review_notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
