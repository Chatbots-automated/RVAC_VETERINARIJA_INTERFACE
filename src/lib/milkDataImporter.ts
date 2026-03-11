import { supabase } from './supabase';

interface ScrapedMilkData {
  scraped_at: string;
  url: string;
  range: {
    from: string;
    to: string;
  };
  results: {
    [gamintojo_id: string]: {
      gamintojo_id: string;
      label: string;
      meta: {
        imone: string;
        rajonas: string;
        punktas: string;
        gamintojas: string;
        periodas: {
          nuo: string;
          iki: string;
        };
      };
      tables: {
        pieno_sudeties_tyrimai?: {
          rows: any[];
          summary: any[];
        };
        pieno_kokybes_tyrimai?: {
          rows: any[];
          summary: any[];
        };
      };
    };
  };
}

function parseDate(dateStr: string): string {
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr;
}

export async function importMilkTestData(scrapedData: ScrapedMilkData) {
  try {
    const dateFrom = parseDate(scrapedData.range.from);
    const dateTo = parseDate(scrapedData.range.to);

    const { data: session, error: sessionError } = await supabase
      .from('milk_scrape_sessions')
      .insert({
        scraped_at: scrapedData.scraped_at,
        url: scrapedData.url,
        date_from: dateFrom,
        date_to: dateTo,
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    for (const [gamintojo_id, producerData] of Object.entries(scrapedData.results)) {
      let producer = await supabase
        .from('milk_producers')
        .select('*')
        .eq('gamintojo_id', gamintojo_id)
        .maybeSingle();

      if (!producer.data) {
        const { data: newProducer, error: producerError } = await supabase
          .from('milk_producers')
          .insert({
            gamintojo_id: gamintojo_id,
            gamintojas_code: producerData.meta.gamintojas,
            label: producerData.label,
            imone: producerData.meta.imone,
            rajonas: producerData.meta.rajonas,
            punktas: producerData.meta.punktas,
          })
          .select()
          .single();

        if (producerError) throw producerError;
        producer.data = newProducer;
      } else {
        await supabase
          .from('milk_producers')
          .update({
            gamintojas_code: producerData.meta.gamintojas,
            label: producerData.label,
            imone: producerData.meta.imone,
            rajonas: producerData.meta.rajonas,
            punktas: producerData.meta.punktas,
            updated_at: new Date().toISOString(),
          })
          .eq('id', producer.data.id);
      }

      if (producerData.tables.pieno_sudeties_tyrimai) {
        const compositionRows = producerData.tables.pieno_sudeties_tyrimai.rows.map((row: any) => ({
          producer_id: producer.data!.id,
          scrape_session_id: session.id,
          paemimo_data: parseDate(row.paemimo_data),
          atvezimo_data: parseDate(row.atvezimo_data),
          tyrimo_data: parseDate(row.tyrimo_data),
          riebalu_kiekis: row.riebalu_kiekis,
          baltymu_kiekis: row.baltymu_kiekis,
          laktozes_kiekis: row.laktozes_kiekis,
          persk_koef: row.persk_koef,
          ureja_mg_100ml: row.ureja_mg_100ml,
          ph: row.ph,
          pastaba: row.pastaba || '',
          konteineris: row.konteineris,
          plomba: row.plomba || '',
          prot_nr: row.prot_nr,
        }));

        if (compositionRows.length > 0) {
          const { error: compError } = await supabase
            .from('milk_composition_tests')
            .upsert(compositionRows, {
              onConflict: 'producer_id,paemimo_data,konteineris',
            });

          if (compError) console.error('Error inserting composition tests:', compError);
        }

        const compositionSummaries = producerData.tables.pieno_sudeties_tyrimai.summary.map((summary: any) => {
          const isGamintojo = summary.label.includes('Gamintojo');
          return {
            producer_id: isGamintojo ? producer.data!.id : null,
            scrape_session_id: session.id,
            summary_type: isGamintojo ? 'gamintojo' : 'punktas',
            label: summary.label,
            test_type: 'composition',
            data: summary,
          };
        });

        if (compositionSummaries.length > 0) {
          const { error: summaryError } = await supabase
            .from('milk_test_summaries')
            .insert(compositionSummaries);

          if (summaryError) console.error('Error inserting composition summaries:', summaryError);
        }
      }

      if (producerData.tables.pieno_kokybes_tyrimai) {
        const qualityRows = producerData.tables.pieno_kokybes_tyrimai.rows.map((row: any) => ({
          producer_id: producer.data!.id,
          scrape_session_id: session.id,
          paemimo_data: parseDate(row.paemimo_data),
          atvezimo_data: parseDate(row.atvezimo_data),
          tyrimo_data: parseDate(row.tyrimo_data),
          somatiniu_lasteliu_skaicius: row.somatiniu_lasteliu_skaicius_tukst_ml,
          bendras_bakteriju_skaicius: row.bendras_bakteriju_skaicius_tukst_ml,
          neatit_pst: row.neatit_pstsls_isk_l_bbs_isk_l || '',
          konteineris: row.konteineris,
          plomba: row.plomba || '',
          prot_nr: row.prot_nr,
        }));

        if (qualityRows.length > 0) {
          const { error: qualError } = await supabase
            .from('milk_quality_tests')
            .upsert(qualityRows, {
              onConflict: 'producer_id,paemimo_data,konteineris',
            });

          if (qualError) console.error('Error inserting quality tests:', qualError);
        }

        const qualitySummaries = producerData.tables.pieno_kokybes_tyrimai.summary.map((summary: any) => {
          const isGamintojo = summary.label.includes('Gamintojo');
          return {
            producer_id: isGamintojo ? producer.data!.id : null,
            scrape_session_id: session.id,
            summary_type: isGamintojo ? 'gamintojo' : 'punktas',
            label: summary.label,
            test_type: 'quality',
            data: summary,
          };
        });

        if (qualitySummaries.length > 0) {
          const { error: summaryError } = await supabase
            .from('milk_test_summaries')
            .insert(qualitySummaries);

          if (summaryError) console.error('Error inserting quality summaries:', summaryError);
        }
      }
    }

    return { success: true, sessionId: session.id };
  } catch (error) {
    console.error('Error importing milk test data:', error);
    throw error;
  }
}

export async function getMilkTestData(producerId?: string, dateFrom?: string, dateTo?: string) {
  let compositionQuery = supabase
    .from('milk_composition_tests')
    .select(`
      *,
      producer:milk_producers(*)
    `)
    .order('paemimo_data', { ascending: false });

  if (producerId) {
    compositionQuery = compositionQuery.eq('producer_id', producerId);
  }

  if (dateFrom) {
    compositionQuery = compositionQuery.gte('paemimo_data', dateFrom);
  }

  if (dateTo) {
    compositionQuery = compositionQuery.lte('paemimo_data', dateTo);
  }

  let qualityQuery = supabase
    .from('milk_quality_tests')
    .select(`
      *,
      producer:milk_producers(*)
    `)
    .order('paemimo_data', { ascending: false });

  if (producerId) {
    qualityQuery = qualityQuery.eq('producer_id', producerId);
  }

  if (dateFrom) {
    qualityQuery = qualityQuery.gte('paemimo_data', dateFrom);
  }

  if (dateTo) {
    qualityQuery = qualityQuery.lte('paemimo_data', dateTo);
  }

  const [compositionResult, qualityResult] = await Promise.all([
    compositionQuery,
    qualityQuery,
  ]);

  return {
    composition: compositionResult.data || [],
    quality: qualityResult.data || [],
    error: compositionResult.error || qualityResult.error,
  };
}

export async function getProducers() {
  const { data, error } = await supabase
    .from('milk_producers')
    .select('*')
    .order('label', { ascending: true });

  return { data, error };
}
