-- Explicitly grant SELECT on the view
GRANT SELECT ON public.vw_treated_animals_detailed TO authenticated;
GRANT SELECT ON public.vw_treated_animals_detailed TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
