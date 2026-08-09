-- Adds an optional secondary classification for Gel Blasters only.
-- Existing products remain valid and unclassified until an administrator selects a Type.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_type text;
