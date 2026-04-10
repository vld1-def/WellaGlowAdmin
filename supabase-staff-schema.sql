-- ============================================================
--  Wella Glow — Модуль персоналу
--  Запусти в Supabase → SQL Editor
--  Існуючі стовпці staff: id, name, role, revenue,
--  appointments_count, is_active, phone, password,
--  commission_rate, created_at
-- ============================================================

-- ── 1. Розширення таблиці staff ──────────────────────────────────────────────
alter table staff add column if not exists position   text;
alter table staff add column if not exists hire_date  date;
alter table staff add column if not exists status     text not null default 'active'
    check (status in ('active','trial','candidate','fired'));
alter table staff add column if not exists notes      text;
alter table staff add column if not exists avatar_url text;
-- Примітка: commission_rate (integer) вже є в таблиці — це % ЗП майстра.
-- is_active (boolean) вже є — синхронізується зі status при зміні.

-- ── 2. Відгуки на майстрів ───────────────────────────────────────────────────
-- Таблиця вже існує з колонками:
-- client_id, rating, comment, created_at, appointment_id, staff_id
-- Лише додаємо індекси, якщо їх немає
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

-- ── 4. Storage bucket для фото ───────────────────────────────────────────────
-- Створи в Supabase → Storage → New Bucket → "staff-avatars" → Public: ON
-- Або виконай через SQL:
insert into storage.buckets (id, name, public)
values ('staff-avatars', 'staff-avatars', true)
on conflict (id) do nothing;

-- RLS: повний доступ для всіх (anon + authenticated) до бакету staff-avatars
-- Це дозволяє завантажувати фото через браузер з anon-ключем
create policy if not exists "Allow all on staff-avatars"
  on storage.objects
  for all
  to anon, authenticated
  using ( bucket_id = 'staff-avatars' )
  with check ( bucket_id = 'staff-avatars' );

-- ⚠️  Якщо policy вище не спрацьовує:
-- Supabase Dashboard → Storage → staff-avatars bucket → Policies →
-- натисни "New policy" → "For full customization" → дозволь SELECT/INSERT/UPDATE/DELETE для role=anon
