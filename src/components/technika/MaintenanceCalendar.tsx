import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  status: 'overdue' | 'today' | 'upcoming' | 'ok';
  type?: string;
  details?: string;
  onClick?: () => void;
}

interface MaintenanceCalendarProps {
  events: CalendarEvent[];
  onClose?: () => void;
}

export function MaintenanceCalendar({ events, onClose }: MaintenanceCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isCollapsed, setIsCollapsed] = useState(false);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis',
    'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'
  ];

  const dayNames = ['Sek', 'Pir', 'Ant', 'Tre', 'Ket', 'Pen', 'Šeš'];

  const getEventsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(event => event.date === dateStr);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue':
        return 'bg-red-500 text-white';
      case 'today':
        return 'bg-orange-500 text-white';
      case 'upcoming':
        return 'bg-yellow-500 text-white';
      case 'ok':
        return 'bg-green-500 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'overdue':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'today':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'upcoming':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'ok':
        return 'bg-green-100 text-green-700 border-green-300';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-300';
    }
  };

  const renderCalendarDays = () => {
    const days = [];
    const totalCells = Math.ceil((daysInMonth + startingDayOfWeek) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const day = i - startingDayOfWeek + 1;
      const isValidDay = day > 0 && day <= daysInMonth;
      const dayEvents = isValidDay ? getEventsForDate(day) : [];
      const isTodayDate = isValidDay && isToday(day);

      days.push(
        <div
          key={i}
          className={`min-h-24 border border-gray-200 p-2 ${
            isValidDay ? 'bg-white' : 'bg-gray-50'
          } ${isTodayDate ? 'ring-2 ring-blue-500' : ''}`}
        >
          {isValidDay && (
            <>
              <div className={`text-sm font-semibold mb-1 ${isTodayDate ? 'text-blue-600' : 'text-gray-700'}`}>
                {day}
                {isTodayDate && <span className="ml-1 text-xs">(Šiandien)</span>}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 2).map((event, idx) => (
                  <div
                    key={idx}
                    onClick={event.onClick}
                    className={`text-xs px-2 py-1 rounded cursor-pointer hover:shadow-md transition-all ${getStatusColor(
                      event.status
                    )}`}
                    title={event.details || event.title}
                  >
                    <div className="font-medium truncate">{event.title}</div>
                    {event.type && <div className="text-xs opacity-90 truncate">{event.type}</div>}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-xs text-gray-500 font-medium px-2">
                    +{dayEvents.length - 2} daugiau
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    return days;
  };

  const upcomingEvents = events
    .filter(e => {
      const eventDate = new Date(e.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return eventDate >= today;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 10);

  if (isCollapsed) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-4 shadow-lg mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Aptarnavimų kalendorius</h3>
              <p className="text-sm text-gray-600">
                {events.filter(e => e.status === 'overdue').length} vėluoja, {events.filter(e => e.status === 'upcoming').length} artėja
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(false)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              Rodyti kalendorių
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-xl border-2 border-blue-200 shadow-2xl mb-6 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <CalendarIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Aptarnavimų kalendorius</h3>
              <p className="text-blue-100 text-sm">
                {events.filter(e => e.status === 'overdue').length} vėluoja · {events.filter(e => e.status === 'upcoming').length} artėja · {events.filter(e => e.status === 'ok').length} OK
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors backdrop-blur-sm"
            >
              <ChevronUp className="w-4 h-4" />
              Suskleisti
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Calendar Controls */}
            <div className="bg-gray-50 border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={previousMonth}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <div className="text-center">
                  <h4 className="text-xl font-bold text-gray-900">
                    {monthNames[month]} {year}
                  </h4>
                  <button
                    onClick={goToToday}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Šiandien
                  </button>
                </div>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" />
                </button>
              </div>
            </div>

            {/* Day Names */}
            <div className="grid grid-cols-7 bg-gray-100 border-b border-gray-200">
              {dayNames.map((day) => (
                <div key={day} className="text-center py-2 text-sm font-semibold text-gray-700">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7">{renderCalendarDays()}</div>
          </div>

          {/* Upcoming Events Sidebar */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
            <h4 className="text-lg font-bold text-gray-900 mb-4">Artimiausi aptarnavimai</h4>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {upcomingEvents.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Nėra artimų aptarnavimų</p>
              ) : (
                upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={event.onClick}
                    className={`border-2 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all ${getStatusBadgeColor(
                      event.status
                    )}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold text-gray-900 text-sm">{event.title}</div>
                      <span className="text-xs font-medium whitespace-nowrap ml-2">
                        {new Date(event.date).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {event.type && <div className="text-xs text-gray-600 mb-1">{event.type}</div>}
                    {event.details && <div className="text-xs text-gray-500 line-clamp-2">{event.details}</div>}
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          event.status === 'overdue'
                            ? 'bg-red-200 text-red-800'
                            : event.status === 'today'
                            ? 'bg-orange-200 text-orange-800'
                            : event.status === 'upcoming'
                            ? 'bg-yellow-200 text-yellow-800'
                            : 'bg-green-200 text-green-800'
                        }`}
                      >
                        {event.status === 'overdue'
                          ? 'Vėluoja'
                          : event.status === 'today'
                          ? 'Šiandien'
                          : event.status === 'upcoming'
                          ? 'Artėja'
                          : 'OK'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span className="text-sm text-gray-700">Vėluoja</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-500"></div>
              <span className="text-sm text-gray-700">Šiandien</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500"></div>
              <span className="text-sm text-gray-700">Artėja (14 d.)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span className="text-sm text-gray-700">OK</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
