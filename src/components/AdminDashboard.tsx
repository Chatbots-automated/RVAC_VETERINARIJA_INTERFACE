import { useState, useEffect } from 'react';
import { UserManagement } from './UserManagement';
import { AuditLogViewer } from './AuditLogViewer';
import { UserActivityDashboard } from './UserActivityDashboard';
import { SecurityMonitor } from './SecurityMonitor';
import { CriticalDataEditor } from './CriticalDataEditor';
import { WorkerApprovals } from './admin/WorkerApprovals';
import { Users, Activity, Shield, FileText, Settings, ClipboardCheck } from 'lucide-react';

type AdminTab = 'users' | 'activity' | 'audit' | 'security' | 'maintenance' | 'worker-approvals';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('admintab');
    return (tab as AdminTab) || 'activity';
  });

  // Update URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('admintab', activeTab);
    const newUrl = `?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }, [activeTab]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('admintab');
      if (tab) {
        setActiveTab(tab as AdminTab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const tabs = [
    { id: 'activity' as AdminTab, label: 'Veiklos apžvalga', icon: Activity },
    { id: 'users' as AdminTab, label: 'Vartotojai', icon: Users },
    { id: 'worker-approvals' as AdminTab, label: 'Darbuotojų ataskaitos', icon: ClipboardCheck },
    { id: 'audit' as AdminTab, label: 'Audito žurnalas', icon: FileText },
    { id: 'security' as AdminTab, label: 'Saugumas', icon: Shield },
    { id: 'maintenance' as AdminTab, label: 'ŽURNALAS', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className={`
                  mr-2 h-5 w-5
                  ${activeTab === tab.id ? 'text-red-500' : 'text-gray-400 group-hover:text-gray-500'}
                `} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'activity' && <UserActivityDashboard />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'worker-approvals' && <WorkerApprovals />}
        {activeTab === 'audit' && <AuditLogViewer />}
        {activeTab === 'security' && <SecurityMonitor />}
        {activeTab === 'maintenance' && <CriticalDataEditor />}
      </div>
    </div>
  );
}
