-- ============================================================
--  Wella Glow — Міграція для модуля Записів
--  Запусти в Supabase → SQL Editor
-- ============================================================

-- Додаємо кінець запису (appointments — основна таблиця активних записів)
alter table appointments
    add column if not exists end_time time;

-- Якщо end_time null — за замовчуванням через 1 годину після start
-- (можна виставити тригером, але достатньо в JS)

-- Індекс для швидкого пошуку слотів по майстру+дню
create index if not exists idx_appt_master_date
    on appointments(master_id, appointment_date);

-- appointment_history — архів виконаних, додаємо час якщо нема
alter table appointment_history
    add column if not exists start_time time;
alter table appointment_history
    add column if not exists end_time   time;
