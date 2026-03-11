import { useState, useEffect } from 'react';
import { X, Calendar, AlertTriangle, Clock, CheckCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { TechnikaReminderService, Reminder } from '../../lib/reminderService';
import { formatDateLT } from '../../lib/formatters';

interface ReminderCalendarViewProps {
  onClose: () => void;
}

export function ReminderCalendarView({ onClose }: ReminderCalendarViewProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [groupedReminders, setGroupedReminders] = useState<Record<string, Reminder[]>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filterType, setFilterType] = useState<'all' | Reminder['type']>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | Reminder['status']>('all');
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      const allReminders = await TechnikaReminderService.getAllReminders();
      setReminders(allReminders);

      const grouped = await TechnikaReminderService.getRemindersGroupedByDate();
      setGroupedReminders(grouped);
    } catch (error) {
      console.error('Error loading reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReminders = reminders.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  const getStatusIcon = (status: Reminder['status']) => {
    switch (status) {
      case 'expired':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'today':
        return <Clock className="w-5 h-5 text-orange-600" />;
      case 'tomorrow':
        return <Calendar className="w-5 h-5 text-yellow-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStatusBadge = (status: Reminder['status']) => {
    switch (status) {
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'today':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'tomorrow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getPriorityBadge = (priority: Reminder['priority']) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const getStatusText = (reminder: Reminder) => {
    if (reminder.status === 'expired') {
      return `Pasibaigė prieš ${Math.abs(reminder.daysUntil)} d.`;
    }
    if (reminder.status === 'today') {
      return 'Šiandien';
    }
    if (reminder.status === 'tomorrow') {
      return 'Rytoj';
    }
    return `Po ${reminder.daysUntil} d.`;
  };

  const typeLabels: Record<Reminder['type'], string> = {
    technical_inspection: 'TA',
    insurance: 'Draudimas',
    fire_extinguisher: 'Gesintuvas',
    maintenance_schedule: 'Planinis aptarnavimas',
    farm_equipment: 'Fermos įranga',
    work_order: 'Remonto darbas',
  };

  const statusLabels: Record<Reminder['status'], string> = {
    expired: 'Pasibaigę',
    today: 'Šiandien',
    tomorrow: 'Rytoj',
    upcoming: 'Artėja',
  };

  const stats = {
    expired: filteredReminders.filter(r => r.status === 'expired').length,
    today: filteredReminders.filter(r => r.status === 'today').length,
    tomorrow: filteredReminders.filter(r => r.status === 'tomorrow').length,
    upcoming: filteredReminders.filter(r => r.status === 'upcoming').length,
  };

  // Group reminders by date for calendar view
  const getRemindersForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return groupedReminders[dateStr] || [];
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'next') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Visi priminimai</h2>
              <p className="text-slate-200 text-sm mt-1">
                Iš viso: {filteredReminders.length} priminimų
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-200">
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-900">{stats.expired}</p>
                <p className="text-sm text-red-600 font-medium">Pasibaigę</p>
              </div>
            </div>
          </div>
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-orange-900">{stats.today}</p>
                <p className="text-sm text-orange-600 font-medium">Šiandien</p>
              </div>
            </div>
          </div>
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-yellow-900">{stats.tomorrow}</p>
                <p className="text-sm text-yellow-600 font-medium">Rytoj</p>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-blue-900">{stats.upcoming}</p>
                <p className="text-sm text-blue-600 font-medium">Artėja</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and View Toggle */}
        <div className="p-6 border-b border-gray-200 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filtrai:</span>
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              >
                <option value="all">Visi tipai</option>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              >
                <option value="all">Visi statusai</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Sąrašas
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Kalendorius
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {viewMode === 'list' ? (
            <div className="space-y-3">
              {filteredReminders.map(reminder => (
                <div
                  key={reminder.id}
                  className={`bg-white border-2 rounded-xl p-4 hover:shadow-md transition-shadow ${
                    reminder.status === 'expired'
                      ? 'border-red-200 bg-red-50/30'
                      : reminder.status === 'today'
                      ? 'border-orange-200 bg-orange-50/30'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {getStatusIcon(reminder.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${getPriorityBadge(reminder.priority)}`}>
                              {reminder.priority.toUpperCase()}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${getStatusBadge(reminder.status)}`}>
                              {getStatusText(reminder)}
                            </span>
                          </div>
                          <h3 className="font-bold text-gray-900 text-lg">{reminder.category}</h3>
                          <p className="text-sm text-gray-600 mt-1">{reminder.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center gap-2 text-gray-500">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm font-medium">{formatDateLT(reminder.dueDate)}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{reminder.relatedEntity}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredReminders.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Nėra priminimų pagal pasirinktus filtrus</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-bold text-gray-900">
                  {currentDate.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long' })}
                </h3>
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'].map(day => (
                  <div key={day} className="text-center font-bold text-gray-600 text-sm py-2">
                    {day}
                  </div>
                ))}
                {getDaysInMonth(currentDate).map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const dateReminders = getRemindersForDate(date).filter(r => {
                    if (filterType !== 'all' && r.type !== filterType) return false;
                    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
                    return true;
                  });

                  const isToday = date.toDateString() === new Date().toDateString();
                  const hasCritical = dateReminders.some(r => r.status === 'expired' || r.status === 'today');
                  const hasHigh = dateReminders.some(r => r.priority === 'high');

                  return (
                    <div
                      key={date.toISOString()}
                      className={`aspect-square border-2 rounded-lg p-2 ${
                        isToday ? 'border-slate-600 bg-slate-50' : 'border-gray-200'
                      } ${dateReminders.length > 0 ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}
                      title={dateReminders.map(r => `${r.category}: ${r.description}`).join('\n')}
                    >
                      <div className="text-sm font-semibold text-gray-700">{date.getDate()}</div>
                      {dateReminders.length > 0 && (
                        <div className="mt-1 space-y-1">
                          <div className={`text-xs font-bold px-1 rounded ${
                            hasCritical ? 'bg-red-500 text-white' : hasHigh ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'
                          }`}>
                            {dateReminders.length}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
