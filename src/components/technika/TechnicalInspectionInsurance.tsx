import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, Calendar, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  vehicle_type: string;
  registration_number: string | null;
  technical_inspection_due_date: string | null;
  insurance_expiry_date: string | null;
}

type FilterType = 'all' | 'ta_soon' | 'insurance_soon' | 'expired';

interface TechnicalInspectionInsuranceProps {
  workerMode?: boolean;
}

export function TechnicalInspectionInsurance({ workerMode = false }: TechnicalInspectionInsuranceProps = {}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      fetchVehicles();
    }
  }, [user?.id]);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      // Load all vehicles (not filtered by created_by for workers to see all)
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, make, model, vehicle_type, registration_number, technical_inspection_due_date, insurance_expiry_date')
        .order('make');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (date: string | null): number | null => {
    if (!date) return null;
    const expiryDate = new Date(date);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusColor = (daysUntil: number | null): string => {
    if (daysUntil === null) return 'gray';
    if (daysUntil < 0) return 'red';
    if (daysUntil <= 30) return 'orange';
    if (daysUntil <= 60) return 'yellow';
    return 'green';
  };

  const getStatusText = (daysUntil: number | null): string => {
    if (daysUntil === null) return 'Nenustatyta';
    if (daysUntil < 0) return `Pasibaigė prieš ${Math.abs(daysUntil)} d.`;
    if (daysUntil === 0) return 'Baigiasi šiandien';
    if (daysUntil === 1) return 'Baigiasi rytoj';
    return `Baigiasi po ${daysUntil} d.`;
  };

  const vehicleTypeLabels: any = {
    car: 'Automobilis',
    truck: 'Sunkvežimis',
    tractor: 'Traktorius',
    cylinder: 'Cilindras',
    semi_trailer: 'Puspriekabė',
    car_light: 'Lengvasis automobilis',
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const taDays = getDaysUntil(vehicle.technical_inspection_due_date);
    const insuranceDays = getDaysUntil(vehicle.insurance_expiry_date);

    switch (filter) {
      case 'ta_soon':
        return taDays !== null && taDays <= 60 && taDays >= 0;
      case 'insurance_soon':
        return insuranceDays !== null && insuranceDays <= 60 && insuranceDays >= 0;
      case 'expired':
        return (taDays !== null && taDays < 0) || (insuranceDays !== null && insuranceDays < 0);
      default:
        return true;
    }
  });

  const stats = {
    total: vehicles.length,
    needsRenewal: vehicles.filter((v) => {
      const taDays = getDaysUntil(v.technical_inspection_due_date);
      const insuranceDays = getDaysUntil(v.insurance_expiry_date);
      return (taDays !== null && taDays <= 60 && taDays >= 0) || (insuranceDays !== null && insuranceDays <= 60 && insuranceDays >= 0);
    }).length,
    expired: vehicles.filter((v) => {
      const taDays = getDaysUntil(v.technical_inspection_due_date);
      const insuranceDays = getDaysUntil(v.insurance_expiry_date);
      return (taDays !== null && taDays < 0) || (insuranceDays !== null && insuranceDays < 0);
    }).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Iš viso</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
              <Shield className="w-6 h-6 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Reikia atnaujinti</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats.needsRenewal}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Pasibaigę</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{stats.expired}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-gray-900">Techninės apžiūros ir draudimai</h3>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
            >
              <option value="all">Visi ({vehicles.length})</option>
              <option value="ta_soon">TA baigiasi netrukus</option>
              <option value="insurance_soon">Draudimas baigiasi netrukus</option>
              <option value="expired">Pasibaigę</option>
            </select>
          </div>
        </div>

        {filteredVehicles.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">
              {filter === 'all'
                ? 'Nėra registruotų transporto priemonių'
                : 'Nerasta transporto priemonių pagal pasirinktą filtrą'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">Pavadinimas</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">Tipas</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">Valst. numeris</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">TA galiojimas</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">TA būklė</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">Draudimo galiojimas</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 text-sm">Draudimo būklė</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => {
                  const taDays = getDaysUntil(vehicle.technical_inspection_due_date);
                  const insuranceDays = getDaysUntil(vehicle.insurance_expiry_date);
                  const taColor = getStatusColor(taDays);
                  const insuranceColor = getStatusColor(insuranceDays);

                  return (
                    <tr key={vehicle.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-gray-900">{vehicle.make} {vehicle.model}</td>
                      <td className="py-3.5 px-4 text-gray-600 text-sm">{vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type}</td>
                      <td className="py-3.5 px-4 text-gray-600 text-sm">{vehicle.registration_number || '-'}</td>
                      <td className="py-3.5 px-4 text-gray-600 text-sm">
                        {vehicle.technical_inspection_due_date
                          ? new Date(vehicle.technical_inspection_due_date).toLocaleDateString('lt-LT')
                          : '-'
                        }
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                            taColor === 'red' ? 'bg-red-50 text-red-700 border border-red-200' :
                            taColor === 'orange' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                            taColor === 'yellow' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                            taColor === 'green' ? 'bg-green-50 text-green-700 border border-green-200' :
                            'bg-gray-50 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {getStatusText(taDays)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 text-sm">
                        {vehicle.insurance_expiry_date
                          ? new Date(vehicle.insurance_expiry_date).toLocaleDateString('lt-LT')
                          : '-'
                        }
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                            insuranceColor === 'red' ? 'bg-red-50 text-red-700 border border-red-200' :
                            insuranceColor === 'orange' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                            insuranceColor === 'yellow' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                            insuranceColor === 'green' ? 'bg-green-50 text-green-700 border border-green-200' :
                            'bg-gray-50 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {getStatusText(insuranceDays)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-1">Priminimas</p>
            <p>Šiame sąraše rodomos visos registruotos transporto priemonės. Reguliariai tikrinkite techninės apžiūros ir draudimo galiojimo terminus.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
