import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

interface NotificationToastProps {
  notification: Notification | null;
  onDismiss: () => void;
  duration?: number;
}

export function NotificationToast({ notification, onDismiss, duration = 2000 }: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [notification, duration, onDismiss]);

  if (!notification) return null;

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-600" />,
    error: <AlertCircle className="w-5 h-5 text-red-600" />,
    info: <Info className="w-5 h-5 text-blue-600" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-600" />,
  };

  const colors = {
    success: 'bg-green-50 border-green-300 text-green-800',
    error: 'bg-red-50 border-red-300 text-red-800',
    info: 'bg-blue-50 border-blue-300 text-blue-800',
    warning: 'bg-amber-50 border-amber-300 text-amber-800',
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 transition-all duration-300 transform ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`${colors[notification.type]} border-2 rounded-lg shadow-lg p-4 pr-12 min-w-[300px] max-w-md relative`}>
        <div className="flex items-start gap-3">
          {icons[notification.type]}
          <p className="text-sm font-medium flex-1">{notification.message}</p>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface NotificationContextValue {
  showNotification: (message: string, type?: NotificationType) => void;
}

let notificationCallback: ((message: string, type: NotificationType) => void) | null = null;

export function setNotificationCallback(callback: (message: string, type: NotificationType) => void) {
  notificationCallback = callback;
}

export function showNotification(message: string, type: NotificationType = 'info') {
  if (notificationCallback) {
    notificationCallback(message, type);
  }
}
