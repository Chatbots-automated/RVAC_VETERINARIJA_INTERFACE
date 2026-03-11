-- Product quality reviews and optional quality check schedules

CREATE TABLE IF NOT EXISTS public.product_quality_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.equipment_products(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  comment text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_quality_reviews_product
  ON public.product_quality_reviews(product_id);

CREATE INDEX IF NOT EXISTS idx_product_quality_reviews_date
  ON public.product_quality_reviews(review_date);

-- Optional per-product quality check schedule (e.g. every 3 months)
CREATE TABLE IF NOT EXISTS public.product_quality_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.equipment_products(id) ON DELETE CASCADE,
  interval_value integer NOT NULL CHECK (interval_value > 0),
  interval_type text NOT NULL CHECK (interval_type IN ('days', 'months', 'years')),
  last_checked_date date,
  next_due_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_quality_schedule_unique
  ON public.product_quality_schedules(product_id)
  WHERE is_active = true;

ALTER TABLE public.product_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_quality_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on product_quality_reviews"
  ON public.product_quality_reviews
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on product_quality_schedules"
  ON public.product_quality_schedules
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

