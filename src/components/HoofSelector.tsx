import { HoofLeg, HoofClaw } from '../lib/types';

interface HoofSelectorProps {
  selectedLeg: HoofLeg | null;
  selectedClaw: HoofClaw | null;
  onSelect: (leg: HoofLeg, claw: HoofClaw) => void;
  examinedClaws?: Set<string>;
  clawSeverities?: Map<string, number>;
}

export function HoofSelector({
  selectedLeg,
  selectedClaw,
  onSelect,
  examinedClaws = new Set(),
  clawSeverities = new Map()
}: HoofSelectorProps) {

  const getClawKey = (leg: HoofLeg, claw: HoofClaw) => `${leg}-${claw}`;

  const getSeverityColor = (severity: number | undefined) => {
    if (!severity) return 'bg-gray-100';
    if (severity === 0) return 'bg-green-100';
    if (severity === 1) return 'bg-yellow-100';
    if (severity === 2) return 'bg-orange-100';
    if (severity === 3) return 'bg-red-200';
    if (severity === 4) return 'bg-red-400';
    return 'bg-gray-100';
  };

  const renderClaw = (leg: HoofLeg, claw: HoofClaw, position: 'left' | 'right') => {
    const key = getClawKey(leg, claw);
    const isExamined = examinedClaws.has(key);
    const severity = clawSeverities.get(key);
    const isSelected = selectedLeg === leg && selectedClaw === claw;

    const baseClasses = "relative w-8 h-16 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:scale-110 hover:shadow-lg";
    const selectedClasses = isSelected ? "ring-4 ring-blue-500 border-blue-600" : "border-gray-300";
    const colorClasses = isExamined ? getSeverityColor(severity) : "bg-white";

    return (
      <div
        key={key}
        className={`${baseClasses} ${selectedClasses} ${colorClasses}`}
        onClick={() => onSelect(leg, claw)}
        title={`${leg} - ${claw === 'inner' ? 'Vidinis' : 'Išorinis'}`}
      >
        {isExamined && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-xs font-bold text-gray-700">{severity || '✓'}</div>
          </div>
        )}
        <div className="absolute -bottom-5 left-0 right-0 text-[10px] text-center text-gray-600">
          {claw === 'inner' ? 'V' : 'I'}
        </div>
      </div>
    );
  };

  const renderLeg = (leg: HoofLeg, side: 'front' | 'hind', position: 'left' | 'right') => {
    const label = `${side === 'front' ? 'Priekinė' : 'Galinė'} ${position === 'left' ? 'kairė' : 'dešinė'}`;

    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-gray-200">
        <div className="text-sm font-semibold text-gray-700 mb-2">{label}</div>
        <div className="text-xs text-gray-500 mb-1">{leg}</div>
        <div className="flex gap-2 items-center">
          {renderClaw(leg, 'inner', position)}
          {renderClaw(leg, 'outer', position)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Pasirinkite nagą</h3>
        <p className="text-sm text-gray-600">
          Spauskite ant nago norėdami įvesti būklę. V = Vidinis, I = Išorinis
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="text-center text-sm font-medium text-gray-700">Priekinės kojos</div>
          <div className="flex justify-around">
            {renderLeg('FL', 'front', 'left')}
            {renderLeg('FR', 'front', 'right')}
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-center text-sm font-medium text-gray-700">Galinės kojos</div>
          <div className="flex justify-around">
            {renderLeg('HL', 'hind', 'left')}
            {renderLeg('HR', 'hind', 'right')}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-600">Sunkumo skalė:</div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-green-100 border border-gray-300"></div>
            <span className="text-xs">0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-yellow-100 border border-gray-300"></div>
            <span className="text-xs">1</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-orange-100 border border-gray-300"></div>
            <span className="text-xs">2</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-200 border border-gray-300"></div>
            <span className="text-xs">3</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-400 border border-gray-300"></div>
            <span className="text-xs">4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
