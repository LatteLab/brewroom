UPDATE public.pos_drink_logs SET kerb = NULL WHERE voided_at IS NOT NULL AND kerb IS NOT NULL;
