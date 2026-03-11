import { supabase } from './supabase';

export interface Reminder {
  id: string;
  type: 'technical_inspection' | 'insurance' | 'fire_extinguisher' | 'maintenance_schedule' | 'farm_equipment' | 'work_order';
  title: string;
  description: string;
  dueDate: string;
  daysUntil: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'expired' | 'today' | 'tomorrow' | 'upcoming';
  relatedId: string;
  relatedEntity: string; // e.g., "VOLVO 121 TA", "Karusele - Kilimas"
  category: string; // e.g., "TA", "Draudimas", "Gesintuvas"
}

interface ReminderStats {
  total: number;
  expired: number;
  today: number;
  tomorrow: number;
  upcoming: number;
}

export class TechnikaReminderService {
  /**
   * Get days until a date (negative if expired)
   */
  private static getDaysUntil(dateString: string | null): number | null {
    if (!dateString) return null;
    const targetDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Get status based on days until
   */
  private static getStatus(daysUntil: number): Reminder['status'] {
    if (daysUntil < 0) return 'expired';
    if (daysUntil === 0) return 'today';
    if (daysUntil === 1) return 'tomorrow';
    return 'upcoming';
  }

  /**
   * Get priority based on days until
   */
  private static getPriority(daysUntil: number): Reminder['priority'] {
    if (daysUntil < 0) return 'critical';
    if (daysUntil <= 1) return 'critical';
    if (daysUntil <= 7) return 'high';
    if (daysUntil <= 30) return 'medium';
    return 'low';
  }

  /**
   * Fetch Technical Inspection reminders
   */
  private static async getTechnicalInspectionReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, make, model, registration_number, technical_inspection_due_date')
      .not('technical_inspection_due_date', 'is', null);

    if (error || !data) return [];

    return data
      .map(vehicle => {
        const daysUntil = this.getDaysUntil(vehicle.technical_inspection_due_date);
        if (daysUntil === null || daysUntil > 60) return null;

        return {
          id: `ta-${vehicle.id}`,
          type: 'technical_inspection' as const,
          title: 'Techninė apžiūra',
          description: `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.registration_number || ''}`.trim(),
          dueDate: vehicle.technical_inspection_due_date!,
          daysUntil,
          priority: this.getPriority(daysUntil),
          status: this.getStatus(daysUntil),
          relatedId: vehicle.id,
          relatedEntity: vehicle.registration_number || `${vehicle.make} ${vehicle.model}`,
          category: 'TA',
        };
      })
      .filter((r): r is Reminder => r !== null);
  }

  /**
   * Fetch Insurance reminders
   */
  private static async getInsuranceReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, make, model, registration_number, insurance_expiry_date')
      .not('insurance_expiry_date', 'is', null);

    if (error || !data) return [];

    return data
      .map(vehicle => {
        const daysUntil = this.getDaysUntil(vehicle.insurance_expiry_date);
        if (daysUntil === null || daysUntil > 60) return null;

        return {
          id: `insurance-${vehicle.id}`,
          type: 'insurance' as const,
          title: 'Draudimas',
          description: `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.registration_number || ''}`.trim(),
          dueDate: vehicle.insurance_expiry_date!,
          daysUntil,
          priority: this.getPriority(daysUntil),
          status: this.getStatus(daysUntil),
          relatedId: vehicle.id,
          relatedEntity: vehicle.registration_number || `${vehicle.make} ${vehicle.model}`,
          category: 'Draudimas',
        };
      })
      .filter((r): r is Reminder => r !== null);
  }

  /**
   * Fetch Fire Extinguisher reminders
   */
  private static async getFireExtinguisherReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('fire_extinguishers')
      .select(`
        id, 
        serial_number, 
        expiry_date,
        next_inspection_date,
        location:equipment_locations(name),
        vehicle:vehicles(registration_number)
      `)
      .eq('is_active', true);

    if (error || !data) return [];

    const reminders: Reminder[] = [];

    data.forEach(extinguisher => {
      // Check expiry date
      const expiryDaysUntil = this.getDaysUntil(extinguisher.expiry_date);
      if (expiryDaysUntil !== null && expiryDaysUntil <= 60) {
        const location = (extinguisher as any).location?.name || (extinguisher as any).vehicle?.registration_number || 'Nežinoma vieta';
        reminders.push({
          id: `fire-expiry-${extinguisher.id}`,
          type: 'fire_extinguisher' as const,
          title: 'Gesintuvų galiojimas',
          description: `${extinguisher.serial_number} - ${location}`,
          dueDate: extinguisher.expiry_date,
          daysUntil: expiryDaysUntil,
          priority: this.getPriority(expiryDaysUntil),
          status: this.getStatus(expiryDaysUntil),
          relatedId: extinguisher.id,
          relatedEntity: extinguisher.serial_number,
          category: 'Gesintuvo galiojimas',
        });
      }

      // Check inspection date
      if (extinguisher.next_inspection_date) {
        const inspectionDaysUntil = this.getDaysUntil(extinguisher.next_inspection_date);
        if (inspectionDaysUntil !== null && inspectionDaysUntil <= 60) {
          const location = (extinguisher as any).location?.name || (extinguisher as any).vehicle?.registration_number || 'Nežinoma vieta';
          reminders.push({
            id: `fire-inspection-${extinguisher.id}`,
            type: 'fire_extinguisher' as const,
            title: 'Gesintuvų patikra',
            description: `${extinguisher.serial_number} - ${location}`,
            dueDate: extinguisher.next_inspection_date,
            daysUntil: inspectionDaysUntil,
            priority: this.getPriority(inspectionDaysUntil),
            status: this.getStatus(inspectionDaysUntil),
            relatedId: extinguisher.id,
            relatedEntity: extinguisher.serial_number,
            category: 'Gesintuvo patikra',
          });
        }
      }
    });

    return reminders;
  }

  /**
   * Fetch Maintenance Schedule reminders
   */
  private static async getMaintenanceScheduleReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('maintenance_schedules')
      .select(`
        id,
        schedule_name,
        next_due_date,
        next_due_mileage,
        next_due_hours,
        vehicle:vehicles(
          registration_number,
          make,
          model,
          current_mileage,
          current_engine_hours
        )
      `)
      .eq('is_active', true)
      .not('next_due_date', 'is', null);

    if (error || !data) return [];

    return data
      .map(schedule => {
        const daysUntil = this.getDaysUntil(schedule.next_due_date);
        if (daysUntil === null || daysUntil > 60) return null;

        const vehicle = (schedule as any).vehicle;
        const vehicleName = vehicle?.registration_number || `${vehicle?.make || ''} ${vehicle?.model || ''}`.trim();

        return {
          id: `maintenance-${schedule.id}`,
          type: 'maintenance_schedule' as const,
          title: 'Planinis aptarnavimas',
          description: `${vehicleName} - ${schedule.schedule_name}`,
          dueDate: schedule.next_due_date!,
          daysUntil,
          priority: this.getPriority(daysUntil),
          status: this.getStatus(daysUntil),
          relatedId: schedule.id,
          relatedEntity: vehicleName,
          category: 'Technikos aptarnavimas',
        };
      })
      .filter((r): r is Reminder => r !== null);
  }

  /**
   * Fetch Farm Equipment Maintenance reminders
   */
  private static async getFarmEquipmentReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('farm_equipment_items')
      .select(`
        id,
        item_name,
        next_service_date,
        days_until_service,
        service_status,
        farm_equipment:farm_equipment(name)
      `)
      .eq('is_active', true)
      .not('next_service_date', 'is', null);

    if (error || !data) return [];

    return data
      .map(item => {
        const daysUntil = this.getDaysUntil(item.next_service_date);
        if (daysUntil === null || daysUntil > 60) return null;

        const equipmentName = (item as any).farm_equipment?.name || 'Nežinoma įranga';

        return {
          id: `farm-equipment-${item.id}`,
          type: 'farm_equipment' as const,
          title: 'Fermos įrangos aptarnavimas',
          description: `${equipmentName} - ${item.item_name}`,
          dueDate: item.next_service_date!,
          daysUntil,
          priority: this.getPriority(daysUntil),
          status: this.getStatus(daysUntil),
          relatedId: item.id,
          relatedEntity: `${equipmentName} - ${item.item_name}`,
          category: 'Fermos įranga',
        };
      })
      .filter((r): r is Reminder => r !== null);
  }

  /**
   * Fetch Work Order reminders (pending and scheduled)
   */
  private static async getWorkOrderReminders(): Promise<Reminder[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14); // Next 14 days

    const { data, error } = await supabase
      .from('maintenance_work_orders')
      .select(`
        id,
        work_order_number,
        description,
        scheduled_date,
        priority,
        vehicle:vehicles(registration_number, make, model),
        tool:tools(name)
      `)
      .in('status', ['pending', 'in_progress'])
      .not('scheduled_date', 'is', null)
      .lte('scheduled_date', futureDate.toISOString().split('T')[0]);

    if (error || !data) return [];

    return data
      .map(wo => {
        const daysUntil = this.getDaysUntil(wo.scheduled_date);
        if (daysUntil === null || daysUntil > 14) return null;

        const entityName = (wo as any).vehicle?.registration_number || (wo as any).tool?.name || 'Remonto darbas';

        return {
          id: `work-order-${wo.id}`,
          type: 'work_order' as const,
          title: 'Remonto darbas',
          description: `${wo.work_order_number} - ${entityName}`,
          dueDate: wo.scheduled_date!,
          daysUntil,
          priority: wo.priority === 'urgent' || wo.priority === 'high' ? 'critical' : this.getPriority(daysUntil),
          status: this.getStatus(daysUntil),
          relatedId: wo.id,
          relatedEntity: entityName,
          category: 'Remonto darbai',
        };
      })
      .filter((r): r is Reminder => r !== null);
  }

  /**
   * Get all reminders from all sources
   */
  static async getAllReminders(): Promise<Reminder[]> {
    const [
      taReminders,
      insuranceReminders,
      fireExtinguisherReminders,
      maintenanceScheduleReminders,
      farmEquipmentReminders,
      workOrderReminders,
    ] = await Promise.all([
      this.getTechnicalInspectionReminders(),
      this.getInsuranceReminders(),
      this.getFireExtinguisherReminders(),
      this.getMaintenanceScheduleReminders(),
      this.getFarmEquipmentReminders(),
      this.getWorkOrderReminders(),
    ]);

    const allReminders = [
      ...taReminders,
      ...insuranceReminders,
      ...fireExtinguisherReminders,
      ...maintenanceScheduleReminders,
      ...farmEquipmentReminders,
      ...workOrderReminders,
    ];

    // Sort by priority and days until
    return allReminders.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.daysUntil - b.daysUntil;
    });
  }

  /**
   * Get reminder statistics
   */
  static async getReminderStats(): Promise<ReminderStats> {
    const reminders = await this.getAllReminders();

    return {
      total: reminders.length,
      expired: reminders.filter(r => r.status === 'expired').length,
      today: reminders.filter(r => r.status === 'today').length,
      tomorrow: reminders.filter(r => r.status === 'tomorrow').length,
      upcoming: reminders.filter(r => r.status === 'upcoming').length,
    };
  }

  /**
   * Get reminders for a specific date (for calendar view)
   */
  static async getRemindersForDate(date: string): Promise<Reminder[]> {
    const allReminders = await this.getAllReminders();
    return allReminders.filter(r => r.dueDate === date);
  }

  /**
   * Get reminders grouped by date
   */
  static async getRemindersGroupedByDate(): Promise<Record<string, Reminder[]>> {
    const allReminders = await this.getAllReminders();
    const grouped: Record<string, Reminder[]> = {};

    allReminders.forEach(reminder => {
      if (!grouped[reminder.dueDate]) {
        grouped[reminder.dueDate] = [];
      }
      grouped[reminder.dueDate].push(reminder);
    });

    return grouped;
  }
}
