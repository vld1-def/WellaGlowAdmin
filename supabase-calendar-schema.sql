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

-- ============================================================
--  staff_shifts — вихідні, перерви, зміни
--  Розширення існуючої таблиці (staff_id, shift_date, start_time, end_time)
-- ============================================================

alter table staff_shifts
    add column if not exists type        text    default 'day_off',   -- 'day_off' | 'break' | 'shift'
    add column if not exists recurrence  text    default 'once',      -- 'once' | 'weekly' | 'always'
    add column if not exists day_of_week integer,                      -- 1=Пн … 7=Нд (для weekly/always)
    add column if not exists all_day     boolean default true,
    add column if not exists note        text;

-- Якщо shift_date раніше was NOT NULL — зробимо nullable для recurring записів
alter table staff_shifts
    alter column shift_date drop not null;

-- Індекс для швидкого пошуку по майстру
create index if not exists idx_shifts_staff
    on staff_shifts(staff_id);
create index if not exists idx_shifts_date
    on staff_shifts(shift_date) where shift_date is not null;
