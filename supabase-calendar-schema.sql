-- ============================================================
--  Wella Glow — Міграція для модуля Записів
--  Запусти в Supabase → SQL Editor
-- ============================================================

-- Додаємо час початку запису (якщо ще немає)
alter table appointment_history
    add column if not exists start_time time;

-- Індекс для швидкого пошуку зайнятих слотів
create index if not exists idx_appt_master_date
    on appointment_history(master_id, visit_date);
