import { supabase } from './supabase';
import { Animal } from './types';

/**
 * Format animal display with tag number only
 * The collar number is displayed separately in the "Kaklo Nr." field
 */
export function formatAnimalDisplay(animal: Animal | null | undefined): string {
  if (!animal) return '-';
  return animal.tag_no || '-';
}

/**
 * Compare strings using Lithuanian locale for alphabetical sorting
 */
export function compareLithuanian(a: string, b: string): number {
  return a.localeCompare(b, 'lt');
}

/**
 * Sort array of objects by a string property using Lithuanian alphabet
 */
export function sortByLithuanian<T>(array: T[], property: keyof T): T[] {
  return [...array].sort((a, b) => {
    const aVal = String(a[property] || '');
    const bVal = String(b[property] || '');
    return compareLithuanian(aVal, bVal);
  });
}

/**
 * Format date for Lithuanian date input (yyyy-MM-dd)
 */
export function formatDateForInput(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Translate product category from English to Lithuanian
 */
export function translateCategory(category: string | undefined): string {
  const translations: Record<string, string> = {
    'medicines': 'Vaistai',
    'prevention': 'Prevencija',
    'vakcina': 'Vakcina',
    'bolusas': 'Bolusas',
    'svirkstukai': 'Švirkštukai',
    'hygiene': 'Higiena',
    'biocide': 'Biocidas',
    'technical': 'Techniniai',
    'treatment_materials': 'Gydymo medžiagos',
    'reproduction': 'Reprodukcija',
  };

  return translations[category || ''] || category || '';
}

/**
 * Fetch all rows from a Supabase table, bypassing the 1000 row limit
 * by using pagination under the hood
 */
export async function fetchAllRows<T>(
  table: string,
  select: string = '*',
  orderBy?: string | string[],
  filters?: { column: string; value: any; operator?: string }[]
): Promise<T[]> {
  let allRows: T[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    // Apply filters
    if (filters) {
      filters.forEach(filter => {
        const operator = filter.operator || 'eq';
        query = (query as any)[operator](filter.column, filter.value);
      });
    }

    // Apply ordering (support single or multiple columns)
    if (orderBy) {
      if (Array.isArray(orderBy)) {
        orderBy.forEach(col => {
          query = query.order(col);
        });
      } else {
        query = query.order(orderBy);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    if (data && data.length > 0) {
      allRows = [...allRows, ...data as T[]];
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Normalize number input by replacing comma with decimal point
 * This allows users to enter numbers using comma (European style)
 */
export function normalizeNumberInput(value: string): string {
  return value.replace(',', '.');
}

/**
 * Parse a number from user input, handling both comma and decimal
 */
export function parseNumberInput(value: string): number {
  const normalized = normalizeNumberInput(value);
  return parseFloat(normalized);
}

/**
 * Fetch latest collar numbers for all animals
 * Uses optimized view instead of full gea_daily table scan
 * Returns a Map of animal_id -> collar_no for fast lookups
 * Uses pagination to handle more than 1000 animals
 */
export async function fetchLatestCollarNumbers(): Promise<Map<string, number>> {
  try {
    // Use fetchAllRows to handle pagination automatically
    const data = await fetchAllRows<{ animal_id: string; collar_no: number }>(
      'vw_animal_latest_collar',
      'animal_id, collar_no'
    );

    const collarMap = new Map<string, number>();
    data.forEach((record) => {
      if (record.collar_no) {
        collarMap.set(record.animal_id, record.collar_no);
      }
    });

    return collarMap;
  } catch (error) {
    console.error('Error fetching collar numbers:', error);
    return new Map();
  }
}

/**
 * Fetch raw GEA tables and build latest avg_milk per tag_no client-side.
 * Avoids the slow gea_daily_cows_joined view - uses simple table fetches like Vaistų Panaudojimas.
 * Returns Map<tag_no, avg_milk_kg>
 */
export async function fetchGeaMilkMap(): Promise<Map<string, number>> {
  try {
    const [imports, at1, at2] = await Promise.all([
      fetchAllRows<{ id: string; created_at: string }>('gea_daily_imports', 'id, created_at', 'created_at'),
      fetchAllRows<{ import_id: string; ear_number: string | null; cow_number: string }>(
        'gea_daily_ataskaita1',
        'import_id, ear_number, cow_number'
      ),
      fetchAllRows<{ import_id: string; cow_number: string; avg_milk_prod_weight: number | null }>(
        'gea_daily_ataskaita2',
        'import_id, cow_number, avg_milk_prod_weight'
      ),
    ]);

    const importDateMap = new Map(imports.map((i) => [i.id, i.created_at]));
    const milkMap = new Map<string, number>();
    const a2ByKey = new Map<string, number>();
    at2.forEach((r) => {
      if (r.avg_milk_prod_weight != null && r.avg_milk_prod_weight > 0) {
        a2ByKey.set(`${r.import_id}:${r.cow_number}`, r.avg_milk_prod_weight);
      }
    });

    const rows: { ear_number: string; created_at: string; avg_milk: number }[] = [];
    at1.forEach((r) => {
      const ear = r.ear_number?.trim();
      if (!ear) return;
      const avgMilk = a2ByKey.get(`${r.import_id}:${r.cow_number}`);
      if (avgMilk == null) return;
      const created = importDateMap.get(r.import_id);
      if (!created) return;
      rows.push({ ear_number: ear, created_at: created, avg_milk: avgMilk });
    });

    rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    rows.forEach((r) => {
      if (!milkMap.has(r.ear_number)) {
        milkMap.set(r.ear_number, r.avg_milk);
      }
    });
    return milkMap;
  } catch (error) {
    console.error('Error fetching GEA milk map:', error);
    return new Map();
  }
}

/**
 * Fetch raw GEA tables and build latest group/status per tag_no client-side.
 * Avoids the slow gea_daily_cows_joined view.
 * Returns Map<tag_no, { group_number, cow_state, import_created_at }>
 */
export async function fetchGeaGroupData(): Promise<
  Map<string, { group_number: string | null; cow_state: string | null; import_created_at: string }>
> {
  try {
    const [imports, at1] = await Promise.all([
      fetchAllRows<{ id: string; created_at: string }>('gea_daily_imports', 'id, created_at', 'created_at'),
      fetchAllRows<{ import_id: string; ear_number: string | null; group_number: string | null; cow_state: string | null }>(
        'gea_daily_ataskaita1',
        'import_id, ear_number, group_number, cow_state'
      ),
    ]);

    const importDateMap = new Map(imports.map((i) => [i.id, i.created_at]));
    const rows: { ear_number: string; group_number: string | null; cow_state: string | null; created_at: string }[] = [];
    at1.forEach((r) => {
      const ear = r.ear_number?.trim();
      if (!ear) return;
      const created = importDateMap.get(r.import_id);
      if (!created) return;
      rows.push({
        ear_number: ear,
        group_number: r.group_number,
        cow_state: r.cow_state,
        created_at: created,
      });
    });

    rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    const result = new Map<string, { group_number: string | null; cow_state: string | null; import_created_at: string }>();
    rows.forEach((r) => {
      if (!result.has(r.ear_number)) {
        result.set(r.ear_number, {
          group_number: r.group_number,
          cow_state: r.cow_state,
          import_created_at: r.created_at,
        });
      }
    });
    return result;
  } catch (error) {
    console.error('Error fetching GEA group data:', error);
    return new Map();
  }
}
