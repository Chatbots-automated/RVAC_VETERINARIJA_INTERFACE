import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Users, TrendingUp, Clock, BarChart3, Award, Filter, X } from 'lucide-react';
import { translateAction } from '../lib/actionTranslations';
import { formatDateLT } from '../lib/formatters';

interface ActivityStats {
  totalActions: number;
  uniqueUsers: number;
  todayActions: number;
  weekActions: number;
  mostActiveUser: { email: string; count: number } | null;
  mostUsedFeature: { action: string; count: number } | null;
  peakHour: number;
  hourlyActivity: Array<{ hour: number; count: number }>;
  actionBreakdown: Array<{ action: string; count: number }>;
  recentActivity: Array<any>;
  userStats: Array<{ userId: string; email: string; count: number; lastActive: string }>;
}

export function UserActivityDashboard() {
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserLogs, setSelectedUserLogs] = useState<any[]>([]);
  const [selectedAction, setSelectedAction] = useState('');
  const [lastDays, setLastDays] = useState('7');

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadUserLogs();
    }
  }, [selectedUserId, selectedAction, lastDays]);

  const loadUserLogs = async () => {
    if (!selectedUserId) return;

    try {
      let query = supabase
        .from('user_audit_logs')
        .select('*')
        .eq('user_id', selectedUserId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (lastDays) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(lastDays));
        query = query.gte('created_at', daysAgo.toISOString());
      }

      if (selectedAction) {
        query = query.eq('action', selectedAction);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSelectedUserLogs(data || []);
    } catch (error: any) {
      console.error('Error loading user logs:', error);
      alert('Klaida kraunant vartotojo žurnalą: ' + error.message);
    }
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data: logs, error } = await supabase
        .from('user_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: usersData } = await supabase.auth.admin.listUsers();

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const todayActions = logs.filter(l => new Date(l.created_at) >= todayStart).length;
      const weekActions = logs.filter(l => new Date(l.created_at) >= weekStart).length;
      const uniqueUsers = new Set(logs.map(l => l.user_id)).size;

      const userCounts: { [key: string]: number } = {};
      logs.forEach(log => {
        userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
      });

      const mostActiveUserId = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];
      const mostActiveUser = mostActiveUserId
        ? {
            email: usersData?.users.find(u => u.id === mostActiveUserId[0])?.email || 'Unknown',
            count: mostActiveUserId[1]
          }
        : null;

      const actionCounts: { [key: string]: number } = {};
      logs.forEach(log => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      });

      const mostUsedAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];
      const mostUsedFeature = mostUsedAction
        ? { action: mostUsedAction[0], count: mostUsedAction[1] }
        : null;

      const hourCounts: { [key: number]: number } = {};
      logs.forEach(log => {
        const hour = new Date(log.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const peakHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      const peakHour = peakHourEntry ? parseInt(peakHourEntry[0]) : 0;

      const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: hourCounts[i] || 0
      }));

      const actionBreakdown = Object.entries(actionCounts)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const recentActivity = logs.slice(0, 10).map(log => ({
        ...log,
        user_email: usersData?.users.find(u => u.id === log.user_id)?.email || 'Unknown'
      }));

      const userStatsMap: { [key: string]: { count: number; lastActive: string } } = {};
      logs.forEach(log => {
        if (!userStatsMap[log.user_id]) {
          userStatsMap[log.user_id] = { count: 0, lastActive: log.created_at };
        }
        userStatsMap[log.user_id].count++;
        if (new Date(log.created_at) > new Date(userStatsMap[log.user_id].lastActive)) {
          userStatsMap[log.user_id].lastActive = log.created_at;
        }
      });

      const userStats = Object.entries(userStatsMap)
        .map(([userId, data]) => ({
          userId,
          email: usersData?.users.find(u => u.id === userId)?.email || 'Unknown',
          count: data.count,
          lastActive: data.lastActive
        }))
        .sort((a, b) => b.count - a.count);

      setStats({
        totalActions: logs.length,
        uniqueUsers,
        todayActions,
        weekActions,
        mostActiveUser,
        mostUsedFeature,
        peakHour,
        hourlyActivity,
        actionBreakdown,
        recentActivity,
        userStats
      });

    } catch (error: any) {
      console.error('Error loading stats:', error);
      alert('Klaida kraunant statistiką: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  const maxHourlyCount = Math.max(...stats.hourlyActivity.map(h => h.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Viso veiksmų</p>
              <p className="text-3xl font-bold mt-2">{stats.totalActions.toLocaleString()}</p>
            </div>
            <Activity className="h-12 w-12 text-red-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Aktyvūs vartotojai</p>
              <p className="text-3xl font-bold mt-2">{stats.uniqueUsers}</p>
            </div>
            <Users className="h-12 w-12 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Šiandien</p>
              <p className="text-3xl font-bold mt-2">{stats.todayActions.toLocaleString()}</p>
            </div>
            <TrendingUp className="h-12 w-12 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Šią savaitę</p>
              <p className="text-3xl font-bold mt-2">{stats.weekActions.toLocaleString()}</p>
            </div>
            <Clock className="h-12 w-12 text-orange-200" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-500" />
            Aktyviausias vartotojas
          </h3>
          {stats.mostActiveUser ? (
            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div>
                <p className="font-medium text-gray-900">{stats.mostActiveUser.email}</p>
                <p className="text-sm text-gray-600">{stats.mostActiveUser.count} veiksmų</p>
              </div>
              <div className="text-3xl">🏆</div>
            </div>
          ) : (
            <p className="text-gray-500">Nėra duomenų</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Populiariausia funkcija
          </h3>
          {stats.mostUsedFeature ? (
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
              <div>
                <p className="font-medium text-gray-900">{translateAction(stats.mostUsedFeature.action)}</p>
                <p className="text-sm text-gray-600">{stats.mostUsedFeature.count} kartų</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
          ) : (
            <p className="text-gray-500">Nėra duomenų</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Aktyvumas pagal valandas (paskutinės 24 val)
        </h3>
        <div className="flex items-end justify-between h-48 gap-1">
          {stats.hourlyActivity.map(({ hour, count }) => (
            <div key={hour} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-gradient-to-t from-red-500 to-red-400 rounded-t transition-all hover:from-red-600 hover:to-red-500"
                style={{
                  height: maxHourlyCount > 0 ? `${(count / maxHourlyCount) * 100}%` : '0%',
                  minHeight: count > 0 ? '4px' : '0px'
                }}
                title={`${hour}:00 - ${count} veiksmų`}
              />
              <span className="text-xs text-gray-500">{hour}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-4 text-center">
          Didžiausias aktyvumas: {stats.peakHour}:00 val.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-red-500" />
          Top 10 veiksmų
        </h3>
        <div className="space-y-3">
          {stats.actionBreakdown.map((item, index) => (
            <div key={item.action} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{translateAction(item.action)}</span>
                  <span className="text-sm text-gray-600">{item.count}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full transition-all"
                    style={{ width: `${(item.count / stats.totalActions) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" />
          Vartotojų aktyvumas
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vartotojas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Veiksmų</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pask. aktyvumas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Veiksmai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stats.userStats.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDateLT(user.lastActive)}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => {
                        setSelectedUserId(user.userId);
                        setSelectedAction('');
                      }}
                      className="text-red-600 hover:text-red-700 font-medium"
                    >
                      Peržiūrėti žurnalą
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUserId && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-red-500" />
              Vartotojo aktyvumo žurnalas
            </h3>
            <button
              onClick={() => {
                setSelectedUserId(null);
                setSelectedUserLogs([]);
                setSelectedAction('');
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vartotojas</label>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setSelectedAction('');
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                {stats.userStats.map((user) => (
                  <option key={user.userId} value={user.userId}>{user.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Laikotarpis</label>
              <select
                value={lastDays}
                onChange={(e) => setLastDays(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="1">Paskutinė diena</option>
                <option value="7">Paskutinė savaitė</option>
                <option value="30">Paskutinis mėnuo</option>
                <option value="90">Paskutiniai 3 mėnesiai</option>
                <option value="">Visas laikas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Veiksmas</label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="">Visi veiksmai</option>
                {Array.from(new Set(selectedUserLogs.map(log => log.action))).map(action => (
                  <option key={action} value={action}>{translateAction(action)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-sm text-gray-600 mb-4">
            Rodoma {selectedUserLogs.length} įrašų
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {selectedUserLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      log.action.includes('create') ? 'bg-green-100 text-green-800' :
                      log.action.includes('update') ? 'bg-blue-100 text-blue-800' :
                      log.action.includes('delete') ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {translateAction(log.action)}
                    </span>
                    {log.table_name && (
                      <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                        {log.table_name}
                      </span>
                    )}
                  </div>
                  {log.new_data && Object.keys(log.new_data).length > 0 && (
                    <p className="text-xs text-gray-600 mt-1">
                      {Object.entries(log.new_data).slice(0, 3).map(([key, value]) => (
                        <span key={key} className="mr-3">
                          <span className="font-medium">{key}:</span> {String(value).substring(0, 30)}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-gray-500">
                  {formatDateLT(log.created_at)}
                </div>
              </div>
            ))}
            {selectedUserLogs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Šiuo laikotarpiu veiksmų nerasta
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
