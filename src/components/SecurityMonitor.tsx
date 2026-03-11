import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, AlertTriangle, CheckCircle, XCircle, Clock, MapPin } from 'lucide-react';
import { formatDateLT } from '../lib/formatters';

interface FailedLogin {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  attempted_at: string;
}

interface LoginStats {
  totalLogins: number;
  failedLogins: number;
  successRate: number;
  uniqueIPs: number;
  suspiciousIPs: Array<{ ip: string; count: number }>;
}

export function SecurityMonitor() {
  const [failedLogins, setFailedLogins] = useState<FailedLogin[]>([]);
  const [stats, setStats] = useState<LoginStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: logs, error: logsError } = await supabase
        .from('user_audit_logs')
        .select('*')
        .or('action.eq.user_login,action.eq.failed_login')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      const totalLogins = logs?.filter(l => l.action === 'user_login').length || 0;
      const failedLoginCount = logs?.filter(l => l.action === 'failed_login').length || 0;
      const successRate = totalLogins + failedLoginCount > 0
        ? (totalLogins / (totalLogins + failedLoginCount)) * 100
        : 100;

      const ips = logs?.map(l => l.ip_address).filter(Boolean) || [];
      const uniqueIPs = new Set(ips).size;

      const ipCounts: { [key: string]: number } = {};
      const failedIpCounts: { [key: string]: number } = {};

      logs?.forEach(log => {
        if (log.ip_address) {
          ipCounts[log.ip_address] = (ipCounts[log.ip_address] || 0) + 1;
          if (log.action === 'failed_login') {
            failedIpCounts[log.ip_address] = (failedIpCounts[log.ip_address] || 0) + 1;
          }
        }
      });

      const suspiciousIPs = Object.entries(failedIpCounts)
        .filter(([_, count]) => count >= 3)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count);

      setStats({
        totalLogins,
        failedLogins: failedLoginCount,
        successRate,
        uniqueIPs,
        suspiciousIPs
      });

      const failedLoginLogs = logs?.filter(l => l.action === 'failed_login').map(log => ({
        id: log.id,
        email: log.new_data?.email || 'Unknown',
        ip_address: log.ip_address,
        user_agent: log.new_data?.user_agent || null,
        reason: log.new_data?.reason || 'Invalid credentials',
        attempted_at: log.created_at
      })) || [];

      setFailedLogins(failedLoginLogs);

    } catch (error: any) {
      console.error('Error loading security data:', error);
      alert('Klaida kraunant saugumo duomenis: ' + error.message);
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Sėkmingi prisijungimai</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.totalLogins}</p>
            </div>
            <CheckCircle className="h-12 w-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Nesėkmingi bandymai</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.failedLogins}</p>
            </div>
            <XCircle className="h-12 w-12 text-red-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Sėkmės rodiklis</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.successRate.toFixed(1)}%</p>
            </div>
            <Shield className="h-12 w-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Unikalūs IP</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">{stats.uniqueIPs}</p>
            </div>
            <MapPin className="h-12 w-12 text-purple-500" />
          </div>
        </div>
      </div>

      {stats.suspiciousIPs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 mb-3">Įtartini IP adresai</h3>
              <div className="space-y-2">
                {stats.suspiciousIPs.map(({ ip, count }) => (
                  <div key={ip} className="flex items-center justify-between bg-white p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-red-600" />
                      <span className="font-mono text-sm text-gray-900">{ip}</span>
                    </div>
                    <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                      {count} nesėkmingų bandymų
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-600" />
          Nesėkmingi prisijungimo bandymai
        </h3>

        {failedLogins.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600">Puiku! Nėra nesėkmingų prisijungimo bandymų.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Laikas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    El. paštas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP adresas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priežastis
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {failedLogins.map((login) => (
                  <tr key={login.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {formatDateLT(login.attempted_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {login.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="font-mono text-sm text-gray-900">
                          {login.ip_address || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                        {login.reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Shield className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Saugumo rekomendacijos</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Stebėkite IP adresus su daugiau nei 3 nesėkmingais bandymais</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Įspėkite vartotojus apie įtartinę veiklą jų paskyrose</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Apsvarstykite dviejų veiksnių autentifikavimą kritiniams vartotojams</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Reguliariai peržiūrėkite audito žurnalus</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
