-- ============================================================
--  Wella Glow — Фінансовий модуль
--  Запусти цей скрипт в Supabase → SQL Editor
-- ============================================================

-- 1. РЕЄСТР ТРАНЗАКЦІЙ
-- -----------------------------------------------------------
create table if not exists transactions (
    id             uuid        primary key default gen_random_uuid(),
    date           date        not null default current_date,
    type           text        not null check (type in ('income', 'expense')),
    category       text        not null,
    -- категорії витрат: salary | rent_utilities | materials | other
    -- категорії доходів: income
    comment        text,
    payment_method text        not null default 'cash'
                               check (payment_method in ('cash', 'card', 'transfer')),
    amount         numeric(10,2) not null check (amount >= 0),
    -- amount завжди позитивне; тип визначається полем type
    staff_id       uuid        references staff(id) on delete set null,
    created_at     timestamptz not null default now()
);

-- Індекси для швидких запитів по місяцях
create index if not exists idx_transactions_date     on transactions(date desc);
create index if not exists idx_transactions_type     on transactions(type);
create index if not exists idx_transactions_category on transactions(category);


-- 2. ГОТІВКА В КАСІ ТА НА РАХУНКУ
-- -----------------------------------------------------------
create table if not exists cash_register (
    id           serial      primary key,
    cash_amount  numeric(10,2) not null default 0,   -- готівка в касі
    bank_amount  numeric(10,2) not null default 0,   -- на розрахунковому рахунку
    updated_at   timestamptz not null default now()
);

-- Один рядок на студію (singleton)
insert into cash_register (cash_amount, bank_amount)
select 12400, 156000
where not exists (select 1 from cash_register);


-- ============================================================
--  ТЕСТОВІ ДАНІ (можна видалити після перевірки)
-- ============================================================

-- Виплата ЗП майстрам
insert into transactions (date, type, category, comment, payment_method, amount) values
    (current_date - 9,  'expense', 'salary',         'Виплата основної частини (Анна Король)',   'card',     12500),
    (current_date - 9,  'expense', 'salary',         'Виплата основної частини (Марина Іванець)', 'card',    10800),
    (current_date - 8,  'expense', 'salary',         'Аванс (Оксана Білик)',                     'cash',     4000),

-- Оренда та комунальні
    (current_date - 7,  'expense', 'rent_utilities', 'Оренда приміщення — квітень',              'transfer', 28000),
    (current_date - 6,  'expense', 'rent_utilities', 'Електроенергія',                           'transfer',  3200),
    (current_date - 6,  'expense', 'rent_utilities', 'Інтернет + телефон',                       'card',       850),

-- Матеріали
    (current_date - 5,  'expense', 'materials',      'OPI гель-лак (20 пляшок)',                 'card',      6400),
    (current_date - 4,  'expense', 'materials',      'Дезінфектор Lysoform',                     'cash',      1200),
    (current_date - 3,  'expense', 'materials',      'Одноразові матеріали (рукавиці, серветки)', 'card',     2100),

-- Інше
    (current_date - 2,  'expense', 'other',          'Реклама Instagram',                        'card',      3500),
    (current_date - 1,  'expense', 'other',          'Ремонт обладнання',                        'cash',      1800);

-- ============================================================
--  RLS (Row Level Security) — опціонально для продакшену
-- ============================================================

-- Увімкнути RLS
-- alter table transactions  enable row level security;
-- alter table cash_register enable row level security;

-- Дозволити читання тільки для аутентифікованих (owner/admin)
-- create policy "finance_read" on transactions
--     for select using (auth.role() = 'authenticated');

-- create policy "cash_read" on cash_register
--     for select using (auth.role() = 'authenticated');
