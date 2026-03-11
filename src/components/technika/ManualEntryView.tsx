import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, Clock, User, Copy, Trash2, BarChart3, Edit2, Save, X, Plus, Settings } from 'lucide-react';

interface Worker {
  id: string;
  full_name: string;
  work_location?: string;
}

interface DayEntry {
  date: string;
  start_time: string;
  end_time: string;
  worker_type: 'darbuotojas' | 'vairuotojas' | 'traktorininkas';
  lunch_type: 'none' | 'half' | 'full';
  work_description: string;
  work_descriptions: string[];
  measurement_value: string;
  measurement_unit_id: string;
  comments: string;
  non_driving_hours: string;
}

interface MeasurementUnit {
  id: string;
  worker_type: string;
  unit_name: string;
  unit_abbreviation: string;
  work_location: string;
}

interface WorkDescription {
  id: string;
  worker_type: string;
  description: string;
  work_location: string;
}

interface SavedEntry {
  id: string;
  worker_id: string;
  entry_date: string;
  start_time: string;
  end_time: string;
  hours_worked: number;
  notes: string;
  worker_type: string;
  lunch_type: string;
  work_description: string;
  work_descriptions?: string[];
  measurement_value: number;
  measurement_unit_id: string;
  comments: string;
  non_driving_hours: number;
  worker?: { full_name: string };
  measurement_unit?: { unit_name: string; unit_abbreviation: string };
}

interface ManualEntryViewProps {
  workLocation: 'farm' | 'warehouse';
}

const DAY_NAMES = ['Sk', 'Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št'];

function normalizeTimeToHHMM(value: string): string {
  const v = value.trim();
  if (!v) return '';
  let h = 0, m = 0;
  const match = v.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) {
    h = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
  } else {
    const digits = v.replace(/\D/g, '');
    if (digits.length < 3) return v;
    h = parseInt(digits.slice(0, 2) || '0', 10);
    m = parseInt(digits.slice(2, 4) || '0', 10);
  }
  h = Math.min(23, Math.max(0, h));
  m = Math.min(59, Math.max(0, m));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calculateHours(startTime: string, endTime: string, lunchType: 'none' | 'half' | 'full' = 'full'): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  let hours = (endMinutes - startMinutes) / 60;
  
  // Apply lunch deduction
  if (lunchType === 'full') {
    hours = Math.max(0, hours - 1);
  } else if (lunchType === 'half') {
    hours = Math.max(0, hours - 0.5);
  }
  
  return hours;
}

function getDaysInMonth(year: number, month: number): DayEntry[] {
  const days: DayEntry[] = [];
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({
      date: dateStr,
      start_time: '',
      end_time: '',
      worker_type: 'darbuotojas',
      lunch_type: 'full',
      work_description: '',
      work_descriptions: [],
      measurement_value: '',
      measurement_unit_id: '',
      comments: '',
      non_driving_hours: ''
    });
  }
  return days;
}

export function ManualEntryView({ workLocation }: ManualEntryViewProps) {
  const { logAction } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [activeTab, setActiveTab] = useState<'ivesti' | 'perziura' | 'vienetai'>(() => {
    const params = new URLSearchParams(window.location.search);
    const entrytab = params.get('entrytab');
    return (entrytab as 'ivesti' | 'perziura' | 'vienetai') || 'ivesti';
  });

  // Įvesti tab state
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [bulkStartTime, setBulkStartTime] = useState('');
  const [bulkEndTime, setBulkEndTime] = useState('');
  const [showBulkFill, setShowBulkFill] = useState(false);
  const [bulkWorkerType, setBulkWorkerType] = useState<'darbuotojas' | 'vairuotojas' | 'traktorininkas'>('darbuotojas');
  const [bulkLunchType, setBulkLunchType] = useState<'none' | 'half' | 'full'>('full');

  // Peržiūra tab state
  const [viewWorker, setViewWorker] = useState<string>('');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<SavedEntry | null>(null);
  const [showAllWorkers, setShowAllWorkers] = useState(true);
  const [workerTypeFilter, setWorkerTypeFilter] = useState<'all' | 'darbuotojas' | 'vairuotojas' | 'traktorininkas'>('all');
  const [allWorkersData, setAllWorkersData] = useState<any[]>([]);
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Measurement units state
  const [measurementUnits, setMeasurementUnits] = useState<MeasurementUnit[]>([]);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitAbbr, setNewUnitAbbr] = useState('');
  const [newUnitWorkerType, setNewUnitWorkerType] = useState<'vairuotojas' | 'traktorininkas'>('vairuotojas');
  
  // Work descriptions state
  const [workDescriptions, setWorkDescriptions] = useState<WorkDescription[]>([]);
  const [newWorkDesc, setNewWorkDesc] = useState('');
  const [newWorkDescWorkerType, setNewWorkDescWorkerType] = useState<'vairuotojas' | 'traktorininkas'>('vairuotojas');
  
  // Refs for auto-advancing inputs
  const timeInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Update URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('entrytab', activeTab);
    const newUrl = `?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }, [activeTab]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const entrytab = params.get('entrytab');
      if (entrytab) {
        setActiveTab(entrytab as 'ivesti' | 'perziura' | 'vienetai');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    loadWorkers();
    loadMeasurementUnits();
    loadWorkDescriptions();
  }, [workLocation]);

  useEffect(() => {
    if (selectedWorker && selectedMonth) {
      const days = getDaysInMonth(selectedMonth.getFullYear(), selectedMonth.getMonth());
      setDayEntries(days);
      loadExistingEntriesForMonth();
    } else {
      setDayEntries([]);
    }
  }, [selectedWorker, selectedMonth]);

  const loadExistingEntriesForMonth = async () => {
    if (!selectedWorker) return;
    const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

    let manualQuery = supabase
      .from('manual_time_entries')
      .select('entry_date, start_time, end_time, worker_type, lunch_type, work_description, measurement_value, measurement_unit_id, comments, non_driving_hours')
      .eq('worker_id', selectedWorker)
      .gte('entry_date', startDate.toISOString().split('T')[0])
      .lte('entry_date', endDate.toISOString().split('T')[0]);

    const { data: manualData } = await manualQuery;

    if (manualData && manualData.length > 0) {
      setDayEntries(prev =>
        prev.map(d => {
          const existing = manualData.find((m: any) => m.entry_date === d.date);
          return existing ? { 
            ...d, 
            start_time: existing.start_time?.slice(0, 5) || '', 
            end_time: existing.end_time?.slice(0, 5) || '',
            worker_type: existing.worker_type || 'darbuotojas',
            lunch_type: existing.lunch_type || 'full',
            work_description: existing.work_description || '',
            work_descriptions: existing.work_description ? existing.work_description.split(',').map((s: string) => s.trim()) : [],
            measurement_value: existing.measurement_value?.toString() || '',
            measurement_unit_id: existing.measurement_unit_id || '',
            comments: existing.comments || '',
            non_driving_hours: existing.non_driving_hours?.toString() || ''
          } : d;
        })
      );
      return;
    }

    const scheduleQuery = supabase
      .from('worker_schedules')
      .select('date, shift_start, shift_end')
      .eq('worker_id', selectedWorker)
      .eq('schedule_type', 'work')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    if (workLocation) {
      scheduleQuery.eq('work_location', workLocation);
    }

    const { data: scheduleData } = await scheduleQuery;

    if (scheduleData && scheduleData.length > 0) {
      setDayEntries(prev =>
        prev.map(d => {
          const existing = scheduleData.find((s: any) => s.date === d.date);
          return existing ? { ...d, start_time: existing.shift_start?.slice(0, 5) || '', end_time: existing.shift_end?.slice(0, 5) || '' } : d;
        })
      );
    }
  };

  useEffect(() => {
    if (activeTab === 'perziura') {
      if (showAllWorkers && viewMonth) {
        loadAllWorkersStats();
      } else if (viewWorker && viewMonth) {
        loadSavedEntries();
      }
    }
  }, [activeTab, viewWorker, viewMonth, showAllWorkers]);

  const loadWorkers = async () => {
    const query = supabase
      .from('users')
      .select('id, full_name, work_location')
      .order('full_name');
    if (workLocation) {
      query.or(`work_location.eq.${workLocation},work_location.eq.both`);
    }
    const { data } = await query;
    if (data) {
      setWorkers(data);
      if (!selectedWorker && data.length > 0) setSelectedWorker(data[0].id);
      if (!viewWorker && data.length > 0) setViewWorker(data[0].id);
    }
  };

  const loadMeasurementUnits = async () => {
    const query = supabase
      .from('measurement_units')
      .select('*')
      .eq('is_active', true)
      .order('worker_type')
      .order('unit_name');

    if (workLocation) {
      query.or(`work_location.eq.${workLocation},work_location.eq.both`);
    }

    const { data } = await query;
    if (data) {
      setMeasurementUnits(data);
    }
  };

  const loadWorkDescriptions = async () => {
    const { data } = await supabase
      .from('work_descriptions')
      .select('*')
      .eq('work_location', workLocation)
      .eq('is_active', true)
      .order('worker_type')
      .order('description');

    if (data) {
      setWorkDescriptions(data);
    }
  };

  const addMeasurementUnit = async () => {
    if (!newUnitName.trim() || !newUnitAbbr.trim()) {
      alert('Įveskite vieneto pavadinimą ir santrumpą');
      return;
    }

    try {
      const { error } = await supabase
        .from('measurement_units')
        .insert({
          work_location: workLocation || 'both',
          worker_type: newUnitWorkerType,
          unit_name: newUnitName.trim(),
          unit_abbreviation: newUnitAbbr.trim(),
        });

      if (error) throw error;

      await logAction('create_measurement_unit', 'measurement_units', null, null, {
        unit_name: newUnitName,
        worker_type: newUnitWorkerType,
      });

      setNewUnitName('');
      setNewUnitAbbr('');
      loadMeasurementUnits();
      alert('Vienetas sėkmingai pridėtas!');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const addWorkDescription = async () => {
    if (!newWorkDesc.trim()) {
      alert('Įveskite darbo aprašymą');
      return;
    }

    try {
      const { error } = await supabase
        .from('work_descriptions')
        .insert({
          work_location: workLocation,
          worker_type: newWorkDescWorkerType,
          description: newWorkDesc.trim(),
        });

      if (error) throw error;

      await logAction('create_work_description', 'work_descriptions', null, null, {
        description: newWorkDesc,
        worker_type: newWorkDescWorkerType,
      });

      setNewWorkDesc('');
      loadWorkDescriptions();
      alert('Darbo aprašymas sėkmingai pridėtas!');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const deleteWorkDescription = async (descId: string) => {
    if (!confirm('Ar tikrai norite ištrinti šį darbo aprašymą?')) return;

    try {
      const { error } = await supabase
        .from('work_descriptions')
        .update({ is_active: false })
        .eq('id', descId);

      if (error) throw error;

      await logAction('delete_work_description', 'work_descriptions', descId, null, null);
      loadWorkDescriptions();
      alert('Darbo aprašymas sėkmingai ištrintas!');
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const deleteMeasurementUnit = async (unitId: string) => {
    if (!confirm('Ar tikrai norite ištrinti šį vienetą?')) return;

    try {
      const { error } = await supabase
        .from('measurement_units')
        .update({ is_active: false })
        .eq('id', unitId);

      if (error) throw error;

      await logAction('delete_measurement_unit', 'measurement_units', unitId);
      loadMeasurementUnits();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const loadAllWorkersStats = async () => {
    const startDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const endDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    let query = supabase
      .from('manual_time_entries')
      .select(`*, worker:users!worker_id(full_name), measurement_unit:measurement_units(unit_name, unit_abbreviation)`)
      .gte('entry_date', startDate.toISOString().split('T')[0])
      .lte('entry_date', endDate.toISOString().split('T')[0])
      .order('entry_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error loading all workers stats:', error);
      return;
    }

    setAllWorkersData(data || []);
  };

  const loadSavedEntries = async () => {
    if (!viewWorker) return;
    const startDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const endDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    let manualQuery = supabase
      .from('manual_time_entries')
      .select(`*, worker:users!worker_id(full_name), measurement_unit:measurement_units(unit_name, unit_abbreviation)`)
      .eq('worker_id', viewWorker)
      .gte('entry_date', startDate.toISOString().split('T')[0])
      .lte('entry_date', endDate.toISOString().split('T')[0])
      .order('entry_date', { ascending: true });

    const { data: manualData, error: manualError } = await manualQuery;

    if (!manualError && manualData && manualData.length > 0) {
      setSavedEntries(manualData);
      return;
    }

    const scheduleQuery = supabase
      .from('worker_schedules')
      .select(`id, worker_id, date, shift_start, shift_end, notes, users!worker_id(full_name)`)
      .eq('worker_id', viewWorker)
      .eq('schedule_type', 'work')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (workLocation) {
      scheduleQuery.eq('work_location', workLocation);
    }

    const { data: scheduleData, error: scheduleError } = await scheduleQuery;

    if (scheduleError) {
      setSavedEntries([]);
      return;
    }

    const transformed = (scheduleData || []).map((s: any) => {
      const hours = calculateHours(s.shift_start, s.shift_end);
      let workerName = 'Unknown';
      if (s.users) {
        workerName = typeof s.users === 'object' && s.users?.full_name ? s.users.full_name : s.users?.[0]?.full_name || 'Unknown';
      }
      return {
        id: s.id,
        worker_id: s.worker_id,
        entry_date: s.date,
        start_time: s.shift_start,
        end_time: s.shift_end,
        hours_worked: Math.abs(hours),
        notes: s.notes || '',
        worker: { full_name: workerName },
      };
    });
    setSavedEntries(transformed);
  };

  const updateDayEntry = (date: string, field: keyof DayEntry, value: string) => {
    setDayEntries(prev =>
      prev.map(d => (d.date === date ? { ...d, [field]: value } : d))
    );
  };

  const toggleWorkDescription = (date: string, description: string) => {
    setDayEntries(prev =>
      prev.map(d => {
        if (d.date !== date) return d;
        const current = d.work_descriptions || [];
        const exists = current.includes(description);
        return {
          ...d,
          work_descriptions: exists 
            ? current.filter(desc => desc !== description)
            : [...current, description]
        };
      })
    );
  };

  const handleTimeInput = (date: string, field: 'start_time' | 'end_time', value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    
    // Auto-format with colon after 2 digits
    let formatted = digits;
    if (digits.length >= 2) {
      formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4);
    }
    
    updateDayEntry(date, field, formatted);
    
    // Auto-advance logic
    if (digits.length === 4) {
      const currentIndex = dayEntries.findIndex(d => d.date === date);
      
      if (field === 'start_time') {
        // Move to end_time of same day
        const endRef = timeInputRefs.current[`${date}-end_time`];
        if (endRef) {
          setTimeout(() => endRef.focus(), 0);
        }
      } else if (field === 'end_time') {
        // Move to start_time of next day
        if (currentIndex < dayEntries.length - 1) {
          const nextDate = dayEntries[currentIndex + 1].date;
          const nextStartRef = timeInputRefs.current[`${nextDate}-start_time`];
          if (nextStartRef) {
            setTimeout(() => nextStartRef.focus(), 0);
          }
        }
      }
    }
  };

  const handleTimeBlur = (date: string, field: 'start_time' | 'end_time') => {
    setDayEntries(prev =>
      prev.map(d => {
        if (d.date !== date) return d;
        const val = field === 'start_time' ? d.start_time : d.end_time;
        const normalized = normalizeTimeToHHMM(val);
        return normalized ? { ...d, [field]: normalized } : d;
      })
    );
  };

  const copyFromPreviousDay = (currentDate: string) => {
    const currentIndex = dayEntries.findIndex(d => d.date === currentDate);
    if (currentIndex <= 0) return;
    const prevDay = dayEntries[currentIndex - 1];
    if (!prevDay.start_time || !prevDay.end_time) {
      alert('Ankstesnė diena neturi laiko įrašų');
      return;
    }
    setDayEntries(prev =>
      prev.map(d => 
        d.date === currentDate 
          ? {
              ...d,
              start_time: prevDay.start_time,
              end_time: prevDay.end_time,
              worker_type: prevDay.worker_type,
              lunch_type: prevDay.lunch_type,
              work_description: prevDay.work_description,
              work_descriptions: [...prevDay.work_descriptions],
              measurement_value: prevDay.measurement_value,
              measurement_unit_id: prevDay.measurement_unit_id,
              comments: prevDay.comments,
              non_driving_hours: prevDay.non_driving_hours
            }
          : d
      )
    );
  };

  const applyBulkFill = () => {
    if (!bulkStartTime || !bulkEndTime) {
      alert('Įveskite pradžios ir pabaigos laiką');
      return;
    }
    const normalizedStart = normalizeTimeToHHMM(bulkStartTime);
    const normalizedEnd = normalizeTimeToHHMM(bulkEndTime);
    if (!normalizedStart || !normalizedEnd) {
      alert('Neteisingas laiko formatas');
      return;
    }
    setDayEntries(prev =>
      prev.map(d => {
        const date = new Date(d.date);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (skipWeekends && isWeekend) return d;
        return { 
          ...d, 
          start_time: normalizedStart, 
          end_time: normalizedEnd,
          worker_type: bulkWorkerType,
          lunch_type: bulkLunchType
        };
      })
    );
    setShowBulkFill(false);
    setBulkStartTime('');
    setBulkEndTime('');
  };

  const clearAllTimes = () => {
    if (!confirm('Ar tikrai norite išvalyti visus laikus?')) return;
    setDayEntries(prev => prev.map(d => ({ 
      ...d, 
      start_time: '', 
      end_time: '',
      work_description: '',
      work_descriptions: [],
      measurement_value: '',
      measurement_unit_id: '',
      comments: '',
      non_driving_hours: ''
    })));
  };


  const deleteEntireDay = async (entryDate: string) => {
    if (!confirm(`Ar tikrai norite ištrinti visus ${entryDate} įrašus?`)) return;
    try {
      await supabase
        .from('manual_time_entries')
        .delete()
        .eq('worker_id', viewWorker)
        .eq('entry_date', entryDate);

      await supabase
        .from('worker_schedules')
        .delete()
        .eq('worker_id', viewWorker)
        .eq('date', entryDate);

      loadSavedEntries();
    } catch (error) {
      console.error('Error deleting day:', error);
      alert('Klaida trinant dieną');
    }
  };

  const saveEditedEntry = async () => {
    if (!editingEntry) return;
    try {
      const normalizedStart = normalizeTimeToHHMM(editingEntry.start_time);
      const normalizedEnd = normalizeTimeToHHMM(editingEntry.end_time);
      
      if (!normalizedStart || !normalizedEnd) {
        alert('Neteisingas laiko formatas');
        return;
      }

      await supabase
        .from('manual_time_entries')
        .update({
          start_time: normalizedStart,
          end_time: normalizedEnd,
          worker_type: editingEntry.worker_type,
          lunch_type: editingEntry.lunch_type,
          work_description: editingEntry.work_description || null,
          measurement_value: editingEntry.measurement_value || null,
          measurement_unit_id: editingEntry.measurement_unit_id || null,
          comments: editingEntry.comments || null,
          non_driving_hours: editingEntry.non_driving_hours || null,
        })
        .eq('id', editingEntry.id);

      await supabase
        .from('worker_schedules')
        .update({
          shift_start: normalizedStart,
          shift_end: normalizedEnd,
          notes: `${calculateHours(normalizedStart, normalizedEnd, editingEntry.lunch_type as any).toFixed(2)}h`,
        })
        .eq('worker_id', editingEntry.worker_id)
        .eq('date', editingEntry.entry_date);

      await logAction('update_manual_entry', 'manual_time_entries', editingEntry.id);
      
      setEditingEntryId(null);
      setEditingEntry(null);
      loadSavedEntries();
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const saveEntries = async () => {
    if (!selectedWorker) {
      alert('Pasirinkite darbuotoją');
      return;
    }

    const validEntries = dayEntries.filter(d => d.start_time && d.end_time);
    if (validEntries.length === 0) {
      alert('Įveskite bent vieną dieną su pradžios ir pabaigos laiku');
      return;
    }

    setSaving(true);
    try {
      const datesToSave = validEntries.map(e => e.date);

      await supabase.from('worker_schedules').delete().eq('worker_id', selectedWorker).in('date', datesToSave);
      await supabase.from('manual_time_entries').delete().eq('worker_id', selectedWorker).in('entry_date', datesToSave);

      const schedulesToInsert = validEntries.map(entry => ({
        worker_id: selectedWorker,
        date: entry.date,
        shift_start: entry.start_time,
        shift_end: entry.end_time,
        schedule_type: 'work',
        notes: `${calculateHours(entry.start_time, entry.end_time, entry.lunch_type).toFixed(2)}h`,
        work_location: workLocation,
      }));

      const { error: scheduleError } = await supabase
        .from('worker_schedules')
        .insert(schedulesToInsert);

      if (scheduleError) throw scheduleError;

      const timeEntriesToInsert = validEntries.map(entry => ({
        worker_id: selectedWorker,
        entry_date: entry.date,
        start_time: entry.start_time,
        end_time: entry.end_time,
        worker_type: entry.worker_type,
        lunch_type: entry.lunch_type,
        work_description: entry.work_descriptions.length > 0 ? entry.work_descriptions.join(', ') : (entry.work_description || null),
        measurement_value: entry.measurement_value ? parseFloat(entry.measurement_value) : null,
        measurement_unit_id: entry.measurement_unit_id || null,
        comments: entry.comments || null,
        non_driving_hours: entry.non_driving_hours ? parseFloat(entry.non_driving_hours) : null,
        notes: 'Įvesta iš lapų',
      }));

      await supabase.from('manual_time_entries').insert(timeEntriesToInsert);

      await logAction('create_manual_schedules', 'worker_schedules', null, null, {
        count: schedulesToInsert.length,
        worker_id: selectedWorker,
        month: selectedMonth.toISOString(),
      });

      alert('Grafikai sėkmingai išsaugoti!');
      setDayEntries(prev => prev.map(d => ({ 
        ...d, 
        start_time: '', 
        end_time: '',
        work_description: '',
        work_descriptions: [],
        measurement_value: '',
        measurement_unit_id: '',
        comments: '',
        non_driving_hours: ''
      })));
      if (activeTab === 'perziura' && viewWorker === selectedWorker) {
        loadSavedEntries();
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Klaida: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const totalHours = dayEntries.reduce(
    (sum, d) => {
      if (d.worker_type === 'vairuotojas') {
        return sum + (d.non_driving_hours ? parseFloat(d.non_driving_hours) : 0);
      }
      return sum + calculateHours(d.start_time, d.end_time, d.lunch_type);
    },
    0
  );
  const filledDays = dayEntries.filter(d => d.start_time && d.end_time).length;
  const avgHoursPerDay = filledDays > 0 ? totalHours / filledDays : 0;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('ivesti')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
            activeTab === 'ivesti'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Įvesti iš lapų
        </button>
        <button
          onClick={() => setActiveTab('perziura')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
            activeTab === 'perziura'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Peržiūra
        </button>
        <button
          onClick={() => setActiveTab('vienetai')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
            activeTab === 'vienetai'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          Matavimo vienetai
        </button>
      </div>

      {activeTab === 'ivesti' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Surašyti iš lapų</h3>
          <p className="text-sm text-gray-600 mb-6">
            Pasirinkite darbuotoją ir mėnesį. Dienos bus automatiškai užpildytos – įveskite tik pradžios ir pabaigos laiką klaviatūra (pvz. 08:10–18:53).
          </p>

          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div className="min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas</label>
              <select
                value={selectedWorker}
                onChange={e => setSelectedWorker(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pasirinkite darbuotoją</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mėnuo</label>
              <input
                type="month"
                value={`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`}
                onChange={e => {
                  const [y, m] = e.target.value.split('-');
                  setSelectedMonth(new Date(parseInt(y), parseInt(m) - 1, 1));
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skipWeekends"
                checked={skipWeekends}
                onChange={e => setSkipWeekends(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="skipWeekends" className="text-sm text-gray-700 cursor-pointer">
                Praleisti savaitgalius
              </label>
            </div>
            <button
              onClick={() => setShowBulkFill(!showBulkFill)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Užpildyti visas dienas
            </button>
            <button
              onClick={clearAllTimes}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Išvalyti
            </button>
          </div>

          {showBulkFill && (
            <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Užpildyti visas dienas tuo pačiu laiku</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pradžia</label>
                  <input
                    type="text"
                    value={bulkStartTime}
                    onChange={e => setBulkStartTime(e.target.value)}
                    onBlur={() => setBulkStartTime(normalizeTimeToHHMM(bulkStartTime))}
                    placeholder="08:00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pabaiga</label>
                  <input
                    type="text"
                    value={bulkEndTime}
                    onChange={e => setBulkEndTime(e.target.value)}
                    onBlur={() => setBulkEndTime(normalizeTimeToHHMM(bulkEndTime))}
                    placeholder="17:00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojo tipas</label>
                  <select
                    value={bulkWorkerType}
                    onChange={e => setBulkWorkerType(e.target.value as any)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="darbuotojas">Darbuotojas</option>
                    <option value="vairuotojas">Vairuotojas</option>
                    <option value="traktorininkas">Traktorininkas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pietūs</label>
                  <select
                    value={bulkLunchType}
                    onChange={e => setBulkLunchType(e.target.value as any)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="none">Be pietų</option>
                    <option value="half">Pusė pietų (30min)</option>
                    <option value="full">Su pietumis (1h)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={applyBulkFill}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Pritaikyti
                </button>
                <button
                  onClick={() => {
                    setShowBulkFill(false);
                    setBulkStartTime('');
                    setBulkEndTime('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Atšaukti
                </button>
              </div>
              <p className="text-xs text-purple-700 mt-2">
                {skipWeekends ? '✓ Savaitgaliai bus praleisti' : 'Užpildys visas dienas įskaitant savaitgalius'}
              </p>
            </div>
          )}

          {selectedWorker && dayEntries.length > 0 && (
            <>
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Data</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Pradžia</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Pabaiga</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Tipas</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Pietūs</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Darbas/Matavimas</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Val.</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Komentarai</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map((day, index) => {
                      const date = new Date(day.date);
                      const dayName = DAY_NAMES[date.getDay()];
                      const hours = calculateHours(day.start_time, day.end_time, day.lunch_type);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      const availableUnits = measurementUnits.filter(u => u.worker_type === day.worker_type);
                      
                      return (
                        <tr key={day.date} className={`border-b border-gray-100 hover:bg-blue-50/50 ${isWeekend ? 'bg-gray-50' : ''}`}>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span className={`text-xs uppercase ${isWeekend ? 'text-gray-400' : 'text-gray-500'}`}>{dayName}</span>{' '}
                            {date.toLocaleDateString('lt-LT', { day: 'numeric', month: 'short' })}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              ref={el => timeInputRefs.current[`${day.date}-start_time`] = el}
                              type="text"
                              value={day.start_time}
                              onChange={e => handleTimeInput(day.date, 'start_time', e.target.value)}
                              onBlur={() => handleTimeBlur(day.date, 'start_time')}
                              placeholder="0810"
                              maxLength={5}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                              title="Įveskite 4 skaitmenis, pvz. 0810"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              ref={el => timeInputRefs.current[`${day.date}-end_time`] = el}
                              type="text"
                              value={day.end_time}
                              onChange={e => handleTimeInput(day.date, 'end_time', e.target.value)}
                              onBlur={() => handleTimeBlur(day.date, 'end_time')}
                              placeholder="1853"
                              maxLength={5}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                              title="Įveskite 4 skaitmenis, pvz. 1853"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={day.worker_type}
                              onChange={e => updateDayEntry(day.date, 'worker_type', e.target.value)}
                              className="w-28 px-1 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                            >
                              <option value="darbuotojas">Darb.</option>
                              <option value="vairuotojas">Vair.</option>
                              <option value="traktorininkas">Trakt.</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={day.lunch_type}
                              onChange={e => updateDayEntry(day.date, 'lunch_type', e.target.value)}
                              className="w-20 px-1 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                            >
                              <option value="none">Be</option>
                              <option value="half">Pusė</option>
                              <option value="full">Pilni</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            {day.worker_type === 'darbuotojas' ? (
                              <input
                                type="text"
                                value={day.work_description}
                                onChange={e => updateDayEntry(day.date, 'work_description', e.target.value)}
                                placeholder="Atliekamas darbas"
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                              />
                            ) : (
                              <div className="flex flex-col gap-1">
                                <div className="flex gap-1">
                                  <select
                                    value=""
                                    onChange={e => {
                                      if (e.target.value && !day.work_descriptions.includes(e.target.value)) {
                                        toggleWorkDescription(day.date, e.target.value);
                                      }
                                    }}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                  >
                                    <option value="">+ Pridėti darbą</option>
                                    {workDescriptions
                                      .filter(desc => desc.worker_type === day.worker_type && !day.work_descriptions.includes(desc.description))
                                      .map(desc => (
                                        <option key={desc.id} value={desc.description}>
                                          {desc.description}
                                        </option>
                                      ))}
                                  </select>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={day.measurement_value}
                                    onChange={e => updateDayEntry(day.date, 'measurement_value', e.target.value)}
                                    placeholder="0"
                                    className="w-16 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                  />
                                  <select
                                    value={day.measurement_unit_id}
                                    onChange={e => updateDayEntry(day.date, 'measurement_unit_id', e.target.value)}
                                    className="w-20 px-1 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                  >
                                    <option value="">Vnt.</option>
                                    {availableUnits.map(unit => (
                                      <option key={unit.id} value={unit.id}>
                                        {unit.unit_abbreviation}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {day.work_descriptions.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {day.work_descriptions.map((desc, idx) => (
                                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                                        {desc}
                                        <button
                                          onClick={() => toggleWorkDescription(day.date, desc)}
                                          className="hover:bg-blue-200 rounded-full p-0.5"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {day.worker_type === 'vairuotojas' ? (
                              <input
                                type="number"
                                step="0.1"
                                value={day.non_driving_hours}
                                onChange={e => updateDayEntry(day.date, 'non_driving_hours', e.target.value)}
                                placeholder="0"
                                className="w-16 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                title="Valandos nevairuojant"
                              />
                            ) : (
                              <span className={`font-semibold text-xs ${hours > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                                {hours > 0 ? `${hours.toFixed(1)}h` : '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={day.comments}
                              onChange={e => updateDayEntry(day.date, 'comments', e.target.value)}
                              placeholder="Pastabos"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            {index > 0 && (
                              <button
                                onClick={() => copyFromPreviousDay(day.date)}
                                className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                title="Kopijuoti iš ankstesnės dienos"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Monthly Statistics */}
              {filledDays > 0 && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      <div className="text-xs text-blue-700 font-medium">Užpildyta dienų</div>
                    </div>
                    <div className="text-2xl font-bold text-blue-900">{filledDays}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-green-600" />
                      <div className="text-xs text-green-700 font-medium">Viso valandų</div>
                    </div>
                    <div className="text-2xl font-bold text-green-900">{totalHours.toFixed(1)}h</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                      <div className="text-xs text-purple-700 font-medium">Vidutiniškai/dieną</div>
                    </div>
                    <div className="text-2xl font-bold text-purple-900">{avgHoursPerDay.toFixed(1)}h</div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={saveEntries}
                  disabled={filledDays === 0 || saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
                >
                  {saving ? 'Išsaugoma...' : `Išsaugoti (${filledDays})`}
                </button>
              </div>
            </>
          )}

          {!selectedWorker && (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Pasirinkite darbuotoją ir mėnesį</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'perziura' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Peržiūra</h3>
          <p className="text-sm text-gray-600 mb-6">
            Pasirinkite darbuotoją ir mėnesį, kad peržiūrėtumėte įvestas valandas.
          </p>

          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllWorkers}
                  onChange={e => {
                    setShowAllWorkers(e.target.checked);
                    if (e.target.checked) setViewWorker('');
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Rodyti visus darbuotojus</span>
              </label>
            </div>
            {!showAllWorkers && (
              <div className="min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas</label>
                <select
                  value={viewWorker}
                  onChange={e => setViewWorker(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pasirinkite darbuotoją</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mėnuo</label>
              <input
                type="month"
                value={`${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`}
                onChange={e => {
                  const [y, m] = e.target.value.split('-');
                  setViewMonth(new Date(parseInt(y), parseInt(m) - 1, 1));
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            {showAllWorkers && (
              <>
                <div className="min-w-[150px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipas</label>
                  <select
                    value={workerTypeFilter}
                    onChange={e => setWorkerTypeFilter(e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Visi</option>
                    <option value="darbuotojas">Darbuotojai</option>
                    <option value="vairuotojas">Vairuotojai</option>
                    <option value="traktorininkas">Traktorininkai</option>
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojas</label>
                  <select
                    value={selectedWorkerFilter}
                    onChange={e => setSelectedWorkerFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Visi darbuotojai</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.full_name}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[150px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input
                    type="date"
                    value={selectedDateFilter}
                    onChange={e => setSelectedDateFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
          </div>

          {showAllWorkers ? (
            (() => {
              const filteredData = allWorkersData
                .filter(entry => {
                  if (workerTypeFilter !== 'all' && entry.worker_type !== workerTypeFilter) return false;
                  if (selectedWorkerFilter && entry.worker_id !== selectedWorkerFilter) return false;
                  if (selectedDateFilter && entry.entry_date !== selectedDateFilter) return false;
                  return true;
                });

              const workerStats = filteredData.reduce((acc: any, entry: any) => {
                const workerId = entry.worker_id;
                if (!acc[workerId]) {
                  acc[workerId] = {
                    worker_id: workerId,
                    worker_name: entry.worker?.full_name || 'Unknown',
                    worker_type: entry.worker_type,
                    total_hours: 0,
                    entries: []
                  };
                }
                acc[workerId].total_hours += entry.hours_worked || 0;
                acc[workerId].entries.push(entry);
                return acc;
              }, {});

              const workersList = Object.values(workerStats);

              return filteredData.length > 0 ? (
                <>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Darbuotojas</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-700">Viso val.</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Data</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Pradžia</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Pabaiga</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Tipas</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Pietūs</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Darbas/Matavimas</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Val.</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">Komentarai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workersList.map((worker: any, workerIdx: number) => {
                          const workerBg = workerIdx % 2 === 0 ? 'bg-blue-50/40' : 'bg-white';
                          const workerBorder = 'border-blue-300';
                          
                          return (
                            <>
                              {worker.entries.map((entry: any, idx: number) => {
                                const date = new Date(entry.entry_date);
                                const dayName = DAY_NAMES[date.getDay()];
                                return (
                                  <tr key={entry.id} className={`border-b border-gray-200 hover:bg-blue-100/30 ${workerBg}`}>
                                    {idx === 0 ? (
                                      <>
                                        <td rowSpan={worker.entries.length} className={`px-3 py-3 font-bold text-gray-900 border-r-4 ${workerBorder} ${workerBg}`}>
                                          <div>{worker.worker_name}</div>
                                          <div className="text-xs font-normal text-gray-600 mt-0.5">
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                              {worker.worker_type === 'darbuotojas' ? 'Darb.' : worker.worker_type === 'vairuotojas' ? 'Vair.' : 'Trakt.'}
                                            </span>
                                          </div>
                                        </td>
                                        <td rowSpan={worker.entries.length} className={`px-3 py-3 text-right border-r-4 ${workerBorder} ${workerBg}`}>
                                          <div className="text-2xl font-bold text-green-700">{worker.total_hours.toFixed(1)}h</div>
                                          <div className="text-xs text-gray-600 mt-1">{worker.entries.length} įrašų</div>
                                        </td>
                                      </>
                                    ) : null}
                                  <td className="px-3 py-3 whitespace-nowrap">
                                    <span className="text-gray-500 text-xs uppercase">{dayName}</span>{' '}
                                    {date.toLocaleDateString('lt-LT', { day: 'numeric', month: 'short' })}
                                  </td>
                                  <td className="px-3 py-3 font-mono text-sm">{entry.start_time}</td>
                                  <td className="px-3 py-3 font-mono text-sm">{entry.end_time}</td>
                                  <td className="px-3 py-3">
                                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                      {entry.worker_type === 'darbuotojas' ? 'Darb.' : entry.worker_type === 'vairuotojas' ? 'Vair.' : 'Trakt.'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                      {entry.lunch_type === 'none' ? 'Be' : entry.lunch_type === 'half' ? 'Pusė' : 'Pilni'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3">
                                    {entry.worker_type === 'darbuotojas' ? (
                                      <span className="text-xs text-gray-700">{entry.work_description || '-'}</span>
                                    ) : (
                                      <div className="text-xs text-gray-700">
                                        <div>{entry.work_description || '-'}</div>
                                        {entry.measurement_value && (
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            {entry.measurement_value} {entry.measurement_unit?.unit_abbreviation || ''}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="font-semibold text-green-700 text-sm">{entry.hours_worked?.toFixed(1) || '0.0'}h</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="text-xs text-gray-600">{entry.comments || '-'}</span>
                                  </td>
                                </tr>
                              );
                            })}
                            {workerIdx < workersList.length - 1 && (
                              <tr className="h-2 bg-gray-300">
                                <td colSpan={10} className="p-0"></td>
                              </tr>
                            )}
                          </>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">Nėra įrašų šiam mėnesiui</p>
                </div>
              );
            })()
          ) : viewWorker ? (
            savedEntries.length > 0 ? (
              <>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Data</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Pradžia</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Pabaiga</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Tipas</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Pietūs</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Darbas/Matavimas</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Val.</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Komentarai</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedEntries.map(entry => {
                        const date = new Date(entry.entry_date);
                        const dayName = DAY_NAMES[date.getDay()];
                        const isEditing = editingEntryId === entry.id;

                        return (
                          <tr key={entry.id} className="border-b border-gray-100">
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-gray-500 text-xs uppercase">{dayName}</span>{' '}
                              {date.toLocaleDateString('lt-LT', { day: 'numeric', month: 'short' })}
                            </td>
                            {isEditing && editingEntry ? (
                              <>
                                <td className="px-3 py-3">
                                  <input
                                    type="text"
                                    value={editingEntry.start_time}
                                    onChange={e => setEditingEntry({ ...editingEntry, start_time: e.target.value })}
                                    onBlur={() => setEditingEntry({ ...editingEntry, start_time: normalizeTimeToHHMM(editingEntry.start_time) })}
                                    className="w-20 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    type="text"
                                    value={editingEntry.end_time}
                                    onChange={e => setEditingEntry({ ...editingEntry, end_time: e.target.value })}
                                    onBlur={() => setEditingEntry({ ...editingEntry, end_time: normalizeTimeToHHMM(editingEntry.end_time) })}
                                    className="w-20 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <select
                                    value={editingEntry.worker_type}
                                    onChange={e => setEditingEntry({ ...editingEntry, worker_type: e.target.value })}
                                    className="w-28 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                  >
                                    <option value="darbuotojas">Darbuotojas</option>
                                    <option value="vairuotojas">Vairuotojas</option>
                                    <option value="traktorininkas">Traktorininkas</option>
                                  </select>
                                </td>
                                <td className="px-3 py-3">
                                  <select
                                    value={editingEntry.lunch_type}
                                    onChange={e => setEditingEntry({ ...editingEntry, lunch_type: e.target.value })}
                                    className="w-24 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                  >
                                    <option value="none">Be pietų</option>
                                    <option value="half">Pusė (30min)</option>
                                    <option value="full">Pilni (1h)</option>
                                  </select>
                                </td>
                                <td className="px-3 py-3">
                                  {editingEntry.worker_type === 'darbuotojas' ? (
                                    <input
                                      type="text"
                                      value={editingEntry.work_description || ''}
                                      onChange={e => setEditingEntry({ ...editingEntry, work_description: e.target.value })}
                                      placeholder="Atliekamas darbas"
                                      className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                    />
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex gap-1">
                                        <select
                                          value=""
                                          onChange={e => {
                                            if (e.target.value) {
                                              const current = editingEntry.work_descriptions || (editingEntry.work_description ? editingEntry.work_description.split(',').map(s => s.trim()) : []);
                                              if (!current.includes(e.target.value)) {
                                                const newDescs = [...current, e.target.value];
                                                setEditingEntry({ 
                                                  ...editingEntry, 
                                                  work_descriptions: newDescs,
                                                  work_description: newDescs.join(', ')
                                                });
                                              }
                                            }
                                          }}
                                          className="flex-1 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                        >
                                          <option value="">+ Pridėti darbą</option>
                                          {workDescriptions
                                            .filter(desc => {
                                              const current = editingEntry.work_descriptions || (editingEntry.work_description ? editingEntry.work_description.split(',').map(s => s.trim()) : []);
                                              return desc.worker_type === editingEntry.worker_type && !current.includes(desc.description);
                                            })
                                            .map(desc => (
                                              <option key={desc.id} value={desc.description}>
                                                {desc.description}
                                              </option>
                                            ))}
                                        </select>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={editingEntry.measurement_value || ''}
                                          onChange={e => setEditingEntry({ ...editingEntry, measurement_value: parseFloat(e.target.value) || 0 })}
                                          placeholder="0"
                                          className="w-16 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                        />
                                        <select
                                          value={editingEntry.measurement_unit_id || ''}
                                          onChange={e => setEditingEntry({ ...editingEntry, measurement_unit_id: e.target.value })}
                                          className="w-20 px-1 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                        >
                                          <option value="">Vnt.</option>
                                          {measurementUnits
                                            .filter(u => u.worker_type === editingEntry.worker_type)
                                            .map(unit => (
                                              <option key={unit.id} value={unit.id}>
                                                {unit.unit_abbreviation}
                                              </option>
                                            ))}
                                        </select>
                                      </div>
                                      {(() => {
                                        const workDescs = editingEntry.work_descriptions || (editingEntry.work_description ? editingEntry.work_description.split(',').map(s => s.trim()) : []);
                                        return workDescs.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {workDescs.map((desc, idx) => (
                                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                                                {desc}
                                                <button
                                                  onClick={() => {
                                                    const newDescs = workDescs.filter(d => d !== desc);
                                                    setEditingEntry({ 
                                                      ...editingEntry, 
                                                      work_descriptions: newDescs,
                                                      work_description: newDescs.join(', ')
                                                    });
                                                  }}
                                                  className="hover:bg-blue-200 rounded-full p-0.5"
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {editingEntry.worker_type === 'vairuotojas' ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={editingEntry.non_driving_hours || ''}
                                      onChange={e => setEditingEntry({ ...editingEntry, non_driving_hours: parseFloat(e.target.value) || 0 })}
                                      placeholder="0"
                                      className="w-16 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                      title="Valandos nevairuojant"
                                    />
                                  ) : (
                                    <span className="font-semibold text-blue-700 text-xs">
                                      {calculateHours(editingEntry.start_time, editingEntry.end_time, editingEntry.lunch_type as any).toFixed(1)}h
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    type="text"
                                    value={editingEntry.comments || ''}
                                    onChange={e => setEditingEntry({ ...editingEntry, comments: e.target.value })}
                                    placeholder="Pastabos"
                                    className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-xs"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={saveEditedEntry}
                                      className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                      title="Išsaugoti"
                                    >
                                      <Save className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingEntryId(null);
                                        setEditingEntry(null);
                                      }}
                                      className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                      title="Atšaukti"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-3 font-mono text-sm">{entry.start_time}</td>
                                <td className="px-3 py-3 font-mono text-sm">{entry.end_time}</td>
                                <td className="px-3 py-3">
                                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                    {entry.worker_type === 'darbuotojas' ? 'Darb.' : entry.worker_type === 'vairuotojas' ? 'Vair.' : 'Trakt.'}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                    {entry.lunch_type === 'none' ? 'Be' : entry.lunch_type === 'half' ? 'Pusė' : 'Pilni'}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  {entry.worker_type === 'darbuotojas' ? (
                                    <span className="text-xs text-gray-700">{entry.work_description || '-'}</span>
                                  ) : (
                                    <div className="text-xs text-gray-700">
                                      <div>{entry.work_description || '-'}</div>
                                      {entry.measurement_value && (
                                        <div className="text-xs text-gray-500 mt-0.5">
                                          {entry.measurement_value} {entry.measurement_unit?.unit_abbreviation || ''}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <span className="font-semibold text-green-700 text-sm">{entry.hours_worked.toFixed(1)}h</span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="text-xs text-gray-600">{entry.comments || '-'}</span>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingEntryId(entry.id);
                                        setEditingEntry({ 
                                          ...entry,
                                          work_descriptions: entry.work_description ? entry.work_description.split(',').map(s => s.trim()) : []
                                        });
                                      }}
                                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                      title="Redaguoti"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => deleteEntireDay(entry.entry_date)}
                                      className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                                      title="Ištrinti visą dieną"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Monthly Statistics for Peržiūra */}
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      <div className="text-xs text-blue-700 font-medium">Darbo dienų</div>
                    </div>
                    <div className="text-2xl font-bold text-blue-900">{savedEntries.length}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-green-600" />
                      <div className="text-xs text-green-700 font-medium">Viso valandų</div>
                    </div>
                    <div className="text-2xl font-bold text-green-900">
                      {savedEntries.reduce((s, e) => s + (e.hours_worked || 0), 0).toFixed(1)}h
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                      <div className="text-xs text-purple-700 font-medium">Vidutiniškai/dieną</div>
                    </div>
                    <div className="text-2xl font-bold text-purple-900">
                      {(savedEntries.reduce((s, e) => s + (e.hours_worked || 0), 0) / savedEntries.length).toFixed(1)}h
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Nėra įrašų šiam darbuotojui ir mėnesiui</p>
              </div>
            )
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Pasirinkite darbuotoją ir mėnesį</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'vienetai' && (
        <div className="space-y-6">
          {/* Work Descriptions Management */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Darbo aprašymų valdymas</h3>
            <p className="text-sm text-gray-600 mb-6">
              Sukurkite ir tvarkykite darbo aprašymus vairuotojams ir traktorininkams.
            </p>

            {/* Add new work description form */}
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Pridėti naują darbo aprašymą</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojo tipas</label>
                  <select
                    value={newWorkDescWorkerType}
                    onChange={e => setNewWorkDescWorkerType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="vairuotojas">Vairuotojas</option>
                    <option value="traktorininkas">Traktorininkas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Darbo aprašymas</label>
                  <input
                    type="text"
                    value={newWorkDesc}
                    onChange={e => setNewWorkDesc(e.target.value)}
                    placeholder="pvz. Žemės darbai"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={addWorkDescription}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Pridėti
                  </button>
                </div>
              </div>
            </div>

            {/* Work descriptions list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Vairuotojas descriptions */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Vairuotojas
                </h4>
                <div className="space-y-2">
                  {workDescriptions
                    .filter(desc => desc.worker_type === 'vairuotojas')
                    .map(desc => (
                      <div
                        key={desc.id}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{desc.description}</div>
                        <button
                          onClick={() => deleteWorkDescription(desc.id)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="Ištrinti"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  {workDescriptions.filter(desc => desc.worker_type === 'vairuotojas').length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      Nėra sukurtų darbo aprašymų
                    </div>
                  )}
                </div>
              </div>

              {/* Traktorininkas descriptions */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Traktorininkas
                </h4>
                <div className="space-y-2">
                  {workDescriptions
                    .filter(desc => desc.worker_type === 'traktorininkas')
                    .map(desc => (
                      <div
                        key={desc.id}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{desc.description}</div>
                        <button
                          onClick={() => deleteWorkDescription(desc.id)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="Ištrinti"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  {workDescriptions.filter(desc => desc.worker_type === 'traktorininkas').length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      Nėra sukurtų darbo aprašymų
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Measurement Units Management */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Matavimo vienetų valdymas</h3>
            <p className="text-sm text-gray-600 mb-6">
              Sukurkite ir tvarkykite matavimu vienetus vairuotojams ir traktorininkams.
            </p>

          {/* Add new unit form */}
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-3">Pridėti naują vienetą</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Darbuotojo tipas</label>
                <select
                  value={newUnitWorkerType}
                  onChange={e => setNewUnitWorkerType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="vairuotojas">Vairuotojas</option>
                  <option value="traktorininkas">Traktorininkas</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pavadinimas</label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)}
                  placeholder="pvz. Priekaba"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Santrumpa</label>
                <input
                  type="text"
                  value={newUnitAbbr}
                  onChange={e => setNewUnitAbbr(e.target.value)}
                  placeholder="pvz. prk"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addMeasurementUnit}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Pridėti
                </button>
              </div>
            </div>
          </div>

          {/* Units list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vairuotojas units */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Vairuotojas
              </h4>
              <div className="space-y-2">
                {measurementUnits
                  .filter(u => u.worker_type === 'vairuotojas')
                  .map(unit => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-gray-800">{unit.unit_name}</div>
                        <div className="text-xs text-gray-500">Santrumpa: {unit.unit_abbreviation}</div>
                      </div>
                      <button
                        onClick={() => deleteMeasurementUnit(unit.id)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                        title="Ištrinti"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                {measurementUnits.filter(u => u.worker_type === 'vairuotojas').length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Nėra sukurtų vienetų
                  </div>
                )}
              </div>
            </div>

            {/* Traktorininkas units */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Traktorininkas
              </h4>
              <div className="space-y-2">
                {measurementUnits
                  .filter(u => u.worker_type === 'traktorininkas')
                  .map(unit => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-gray-800">{unit.unit_name}</div>
                        <div className="text-xs text-gray-500">Santrumpa: {unit.unit_abbreviation}</div>
                      </div>
                      <button
                        onClick={() => deleteMeasurementUnit(unit.id)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                        title="Ištrinti"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                {measurementUnits.filter(u => u.worker_type === 'traktorininkas').length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Nėra sukurtų vienetų
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
