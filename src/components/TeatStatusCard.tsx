import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TEAT_POSITIONS } from './TeatSelector';

interface TeatStatus {
  id: string;
  teat_position: string;
  is_disabled: boolean;
  disabled_date: string | null;
  disabled_reason: string | null;
}

interface Treatment {
  id: string;
  reg_date: string;
  sick_teats: string[];
  clinical_diagnosis: string | null;
}

interface TeatStatusCardProps {
  animalId: string;
}

export function TeatStatusCard({ animalId }: TeatStatusCardProps) {
  const [teatStatuses, setTeatStatuses] = useState<TeatStatus[]>([]);
  const [recentTreatments, setRecentTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeatStatuses();
  }, [animalId]);

  const loadTeatStatuses = async () => {
    setLoading(true);
    try {
      const [statusRes, treatmentsRes] = await Promise.all([
        supabase
          .from('teat_status')
          .select('*')
          .eq('animal_id', animalId),
        supabase
          .from('treatments')
          .select('id, reg_date, sick_teats, clinical_diagnosis')
          .eq('animal_id', animalId)
          .order('reg_date', { ascending: false })
          .limit(5)
      ]);

      if (!statusRes.error && statusRes.data) {
        setTeatStatuses(statusRes.data);
      }

      if (!treatmentsRes.error && treatmentsRes.data) {
        setRecentTreatments(treatmentsRes.data);
      }
    } catch (error) {
      console.error('Error loading teat statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Spenų būsena</h4>
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-2">
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const disabledTeats = teatStatuses.filter(t => t.is_disabled);

  // Get sick teats from most recent treatment
  const sickTeatsFromTreatments = new Set<string>();
  if (recentTreatments.length > 0) {
    const mostRecentTreatment = recentTreatments[0];
    if (mostRecentTreatment.sick_teats && Array.isArray(mostRecentTreatment.sick_teats)) {
      mostRecentTreatment.sick_teats.forEach(teat => sickTeatsFromTreatments.add(teat.toLowerCase()));
    }
  }

  const hasAnyIssues = disabledTeats.length > 0 || sickTeatsFromTreatments.size > 0;

  if (!hasAnyIssues) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-2">Spenų būsena</h4>
        <p className="text-sm text-green-700">✓ Visi spenys veikiantys</p>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
      <h4 className="font-semibold text-gray-900 mb-3">Spenų būsena</h4>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {TEAT_POSITIONS.map((teat) => {
          const status = teatStatuses.find(t => t.teat_position === teat.id.toLowerCase());
          const isDisabled = status?.is_disabled || false;
          const isSick = sickTeatsFromTreatments.has(teat.id.toLowerCase());

          let bgColor = 'bg-green-100';
          let borderColor = 'border-green-400';
          let statusLabel = null;

          if (isDisabled) {
            bgColor = 'bg-gray-300';
            borderColor = 'border-gray-500';
            statusLabel = 'Išjungtas';
          } else if (isSick) {
            bgColor = 'bg-red-200';
            borderColor = 'border-red-500';
            statusLabel = 'Sergantis';
          }

          return (
            <div
              key={teat.id}
              className={`
                relative aspect-square rounded-lg border-2 transition-all
                ${bgColor} ${borderColor}
              `}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-700">
                  {teat.label}
                </span>
                <span className="text-[10px] text-gray-600 mt-1">
                  {teat.side}
                </span>
              </div>

              {statusLabel && (
                <div className={`absolute top-1 right-1 text-white text-[10px] px-1.5 py-0.5 rounded ${
                  isDisabled ? 'bg-gray-700' : 'bg-red-600'
                }`}>
                  {statusLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded p-3 space-y-2">
        {sickTeatsFromTreatments.size > 0 && (
          <div className="mb-2 pb-2 border-b border-gray-200">
            <div className="text-sm font-medium text-red-700 mb-1">
              Sergantys spenys: {Array.from(sickTeatsFromTreatments).map(t => TEAT_POSITIONS.find(p => p.id.toLowerCase() === t)?.label).join(', ')}
            </div>
            {recentTreatments[0] && (
              <div className="text-xs text-gray-600">
                <div>Data: {new Date(recentTreatments[0].reg_date).toLocaleDateString()}</div>
                {recentTreatments[0].clinical_diagnosis && (
                  <div>Diagnozė: {recentTreatments[0].clinical_diagnosis}</div>
                )}
              </div>
            )}
          </div>
        )}

        {disabledTeats.length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-900 mb-1">
              Išjungti spenys: {disabledTeats.map(t => TEAT_POSITIONS.find(p => p.id.toLowerCase() === t.teat_position)?.label).join(', ')}
            </div>
            {disabledTeats.map(teat => (
              <div key={teat.id} className="text-xs text-gray-600 border-t border-gray-200 pt-2 mt-1">
                <div><strong>{TEAT_POSITIONS.find(p => p.id.toLowerCase() === teat.teat_position)?.label}:</strong></div>
                {teat.disabled_date && (
                  <div>Išjungtas: {new Date(teat.disabled_date).toLocaleDateString()}</div>
                )}
                {teat.disabled_reason && (
                  <div>Priežastis: {teat.disabled_reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
