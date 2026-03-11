import { useState, useEffect } from 'react';

interface TeatSelectorProps {
  selectedSickTeats: string[];
  selectedDisabledTeats: string[];
  onSickTeatsChange: (teats: string[]) => void;
  onDisabledTeatsChange: (teats: string[]) => void;
  readonly?: boolean;
}

const TEAT_POSITIONS = [
  { id: 'k1', label: 'K1', side: 'Kairė priekis' },
  { id: 'k2', label: 'K2', side: 'Kairė užpakalis' },
  { id: 'd1', label: 'D1', side: 'Dešinė priekis' },
  { id: 'd2', label: 'D2', side: 'Dešinė užpakalis' },
];

export function TeatSelector({
  selectedSickTeats,
  selectedDisabledTeats,
  onSickTeatsChange,
  onDisabledTeatsChange,
  readonly = false,
}: TeatSelectorProps) {
  const toggleSick = (teatId: string) => {
    if (readonly) return;

    if (selectedSickTeats.includes(teatId)) {
      onSickTeatsChange(selectedSickTeats.filter(t => t !== teatId));
    } else {
      onSickTeatsChange([...selectedSickTeats, teatId]);
    }
  };

  const toggleDisabled = (teatId: string) => {
    if (readonly) return;

    if (selectedDisabledTeats.includes(teatId)) {
      onDisabledTeatsChange(selectedDisabledTeats.filter(t => t !== teatId));
    } else {
      onDisabledTeatsChange([...selectedDisabledTeats, teatId]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {TEAT_POSITIONS.map((teat) => {
          const isSick = selectedSickTeats.includes(teat.id);
          const isDisabled = selectedDisabledTeats.includes(teat.id);

          return (
            <div key={teat.id} className="space-y-1">
              <div
                className={`
                  relative w-full rounded border transition-all
                  ${readonly ? 'cursor-default' : 'cursor-pointer hover:shadow-sm'}
                  ${isSick ? 'bg-red-100 border-red-500' : ''}
                  ${isDisabled ? 'bg-gray-300 border-gray-500' : ''}
                  ${!isSick && !isDisabled ? 'bg-green-50 border-green-300' : ''}
                `}
                style={{ aspectRatio: '1', minHeight: '30px' }}
                onClick={() => !readonly && !isDisabled && toggleSick(teat.id)}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-sm font-bold text-gray-700">
                    {teat.label}
                  </span>
                </div>
              </div>

              {!readonly && (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleSick(teat.id)}
                    disabled={isDisabled}
                    className={`
                      text-[10px] py-0.5 px-1 rounded transition-colors
                      ${isSick
                        ? 'bg-red-600 text-white'
                        : 'bg-red-50 text-red-700 hover:bg-red-100'
                      }
                      ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    {isSick ? '✓' : 'S'}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleDisabled(teat.id)}
                    className={`
                      text-[10px] py-0.5 px-1 rounded transition-colors
                      ${isDisabled
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }
                    `}
                  >
                    {isDisabled ? '✓' : 'I'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(selectedSickTeats.length > 0 || selectedDisabledTeats.length > 0) && (
        <div className="text-xs text-gray-600 bg-white border border-gray-300 p-1.5 rounded">
          {selectedSickTeats.length > 0 && (
            <div>
              <span className="font-medium">Sergantys:</span>{' '}
              {selectedSickTeats.map(t => TEAT_POSITIONS.find(p => p.id === t)?.label).join(', ')}
            </div>
          )}
          {selectedDisabledTeats.length > 0 && (
            <div>
              <span className="font-medium">Išjungti:</span>{' '}
              {selectedDisabledTeats.map(t => TEAT_POSITIONS.find(p => p.id === t)?.label).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeatDisplay({ sickTeats, disabledTeats }: { sickTeats: string[]; disabledTeats: string[] }) {
  if (!sickTeats?.length && !disabledTeats?.length) return null;

  return (
    <div className="text-sm space-y-1">
      {sickTeats?.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
            Sergantys spenys:
          </span>
          <span className="text-gray-700">
            {sickTeats.map(t => TEAT_POSITIONS.find(p => p.id === t)?.label).join(', ')}
          </span>
        </div>
      )}
      {disabledTeats?.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs font-medium">
            Išjungti spenys:
          </span>
          <span className="text-gray-700">
            {disabledTeats.map(t => TEAT_POSITIONS.find(p => p.id === t)?.label).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}

export { TEAT_POSITIONS };
