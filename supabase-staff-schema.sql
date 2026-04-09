-- ============================================================
--  Wella Glow — Модуль персоналу
--  Запусти в Supabase → SQL Editor
-- ============================================================

-- ── 1. Розширення таблиці staff ──────────────────────────────────────────────
alter table staff add column if not exists position      text;
alter table staff add column if not exists hire_date     date;
alter table staff add column if not exists status        text not null default 'active'
    check (status in ('active','trial','candidate','fired'));
alter table staff add column if not exists salary_percent integer not null default 40;
alter table staff add column if not exists color         text default '#f43f5e';
alter table staff add column if not exists notes         text;
-- color зберігається як HEX (#f43f5e). Ініціали рахуються в JS з name.

-- ── 2. Відгуки на майстрів ───────────────────────────────────────────────────
create table if not exists reviews (
    id          uuid        primary key default gen_random_uuid(),
    staff_id    uuid        not null references staff(id) on delete cascade,
    client_id   uuid        references clients(id) on delete set null,
    client_name text        not null,
    rating      numeric(2,1) not null check (rating >= 1 and rating <= 5),
    comment     text,
    created_at  timestamptz not null default now()
);

create index if not exists idx_reviews_staff_id   on reviews(staff_id);
create index if not exists idx_reviews_created_at on reviews(created_at desc);

-- ── 3. Доступи персоналу ─────────────────────────────────────────────────────
-- Модулі: dashboard | calendar | finance | clients | inventory | staff | bonuses
create table if not exists staff_permissions (
    id          uuid    primary key default gen_random_uuid(),
    staff_id    uuid    not null references staff(id) on delete cascade,
    module      text    not null,
    can_access  boolean not null default false,
    unique(staff_id, module)
);

create index if not exists idx_permissions_staff on staff_permissions(staff_id);

-- ── Дефолтні доступи для нового admin ───────────────────────────────────────
-- (виклич вручну після додавання нового адміна)
-- insert into staff_permissions (staff_id, module, can_access) values
--     ('UUID', 'dashboard', true), ('UUID', 'calendar', true),
--     ('UUID', 'clients',   true), ('UUID', 'inventory', true),
--     ('UUID', 'bonuses',   true), ('UUID', 'finance',  false),
--     ('UUID', 'staff',     false);

-- ── Тестові дані ─────────────────────────────────────────────────────────────
-- Reviews
insert into reviews (staff_id, client_name, rating, comment, created_at)
select s.id, 'Оксана М.', 5.0,
       '«Найкраще фарбування в моєму житті! Анна справжня чарівниця.»',
       now() - interval '1 day'
from staff s where s.name ilike '%Анн%' limit 1;

insert into reviews (staff_id, client_name, rating, comment, created_at)
select s.id, 'Ірина В.', 4.9,
       '«Дуже задоволена роботою! Все охайно і швидко.»',
       now() - interval '2 days'
from staff s where s.name ilike '%Анн%' limit 1;

insert into reviews (staff_id, client_name, rating, comment, created_at)
select s.id, 'Марта Л.', 5.0,
       '«Неймовірно! Буду тільки до цього майстра.»',
       now() - interval '3 days'
from staff s where s.role = 'master' limit 1;
