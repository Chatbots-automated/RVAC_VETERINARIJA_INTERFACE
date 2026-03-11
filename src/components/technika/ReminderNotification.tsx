import { useState, useEffect } from 'react';
import { Bell, X, Calendar, AlertTriangle, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { TechnikaReminderService, Reminder } from '../../lib/reminderService';
import { formatDateLT } from '../../lib/formatters';

interface ReminderNotificationProps {
  onViewAll: () => void;
}

export function ReminderNotification({ onViewAll }: ReminderNotificationProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasNewReminders, setHasNewReminders] = useState(false);

  useEffect(() => {
    loadReminders();
    
    // Refresh reminders every 5 minutes
    const interval = setInterval(() => {
      loadReminders();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const loadReminders = async () => {
    try {
      const allReminders = await TechnikaReminderService.getAllReminders();
      // Only show critical and high priority, or today/tomorrow
      const filtered = allReminders.filter(r => 
        r.priority === 'critical' || 
        r.priority === 'high' || 
        r.status === 'today' || 
        r.status === 'tomorrow'
      );
      
      if (filtered.length > reminders.length && reminders.length > 0) {
        setHasNewReminders(true);
      }
      
      setReminders(filtered);
    } catch (error) {
      console.error('Error loading reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: Reminder['status']) => {
    switch (status) {
      case 'expired':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'today':
        return <Clock className="w-4 h-4 text-orange-600" />;
      case 'tomorrow':
        return <Calendar className="w-4 h-4 text-yellow-600" />;
      default:
        return <CheckCircle className="w-4 h-4 text-blue-600" />;
    }
  };

  const getStatusColor = (status: Reminder['status']) => {
    switch (status) {
      case 'expired':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'today':
        return 'bg-orange-50 border-orange-200 text-orange-900';
      case 'tomorrow':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-900';
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

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
    setHasNewReminders(false);
  };

  const criticalCount = reminders.filter(r => r.status === 'expired' || r.status === 'today').length;
  const highPriorityCount = reminders.filter(r => r.priority === 'high' || r.status === 'tomorrow').length;

  if (loading) {
    return null;
  }

  // Don't show if no reminders
  if (reminders.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md">
      {isMinimized ? (
        // Minimized state - just a badge with count
        <button
          onClick={handleMinimize}
          className={`relative bg-white rounded-full shadow-2xl border-2 p-4 hover:scale-105 transition-transform ${
            criticalCount > 0 ? 'border-red-500' : 'border-orange-500'
          }`}
        >
          <Bell className={`w-6 h-6 ${criticalCount > 0 ? 'text-red-600' : 'text-orange-600'}`} />
          <span className={`absolute -top-2 -right-2 w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center ${
            criticalCount > 0 ? 'bg-red-600' : 'bg-orange-600'
          }`}>
            {reminders.length}
          </span>
          {hasNewReminders && (
            <span className="absolute top-0 right-0 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </button>
      ) : (
        // Expanded state - show reminders
        <div className="bg-white rounded-2xl shadow-2xl border-2 border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-lg">Priminimai</h3>
                  <p className="text-xs text-slate-200">
                    {criticalCount > 0 && `${criticalCount} kritiniai`}
                    {criticalCount > 0 && highPriorityCount > 0 && ', '}
                    {highPriorityCount > 0 && `${highPriorityCount} svarbūs`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleMinimize}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Reminder list */}
          <div className="max-h-96 overflow-y-auto">
            {reminders.slice(0, 5).map(reminder => (
              <div
                key={reminder.id}
                className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  reminder.status === 'expired' ? 'bg-red-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(reminder.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">
                          {reminder.category}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 truncate">
                          {reminder.description}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${getStatusColor(reminder.status)}`}>
                        {getStatusText(reminder)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {formatDateLT(reminder.dueDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {reminders.length > 2 && (
            <div className="bg-gray-50 p-3 border-t border-gray-200">
              <button
                onClick={onViewAll}
                className="w-full flex items-center justify-center gap-2 text-slate-700 hover:text-slate-900 font-semibold text-sm transition-colors group"
              >
                <span>Peržiūrėti viską ({reminders.length})</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
