-- Wella Glow — Inventory schema
-- Run in Supabase → SQL Editor

create table if not exists inventory_items (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    sku           text,
    category      text,           -- Фарби | Догляд | Технічні | Розхідники
    unit          text default 'шт.',
    quantity      integer default 0,
    min_quantity  integer default 0,  -- threshold for low/critical status
    cost_per_unit numeric(10,2) default 0,
    supplier      text,
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_inventory_updated
    before update on inventory_items
    for each row execute function set_updated_at();

-- Indexes
create index if not exists idx_inv_category on inventory_items(category);
create index if not exists idx_inv_sku on inventory_items(sku) where sku is not null;

-- RLS
alter table inventory_items enable row level security;
create policy "admin full access" on inventory_items
    for all using (true) with check (true);

-- Sample data (optional, remove if not needed)
insert into inventory_items (name, sku, category, unit, quantity, min_quantity, cost_per_unit, supplier) values
    ('Wella Koleston 7/0',   'ART-WL-700',  'Фарби',      'шт.', 1,    5,  420,  'Wella Professional'),
    ('Wella Koleston 8/1',   'ART-WL-810',  'Фарби',      'шт.', 12,   5,  420,  'Wella Professional'),
    ('Окислювач Wella 6%',   'ART-WL-OX6',  'Технічні',   'мл.', 450,  500, 0.8, 'Wella Professional'),
    ('Окислювач Wella 9%',   'ART-WL-OX9',  'Технічні',   'мл.', 1200, 500, 0.8, 'Wella Professional'),
    ('Шампунь Wella Brilliance','ART-WL-SH-B','Догляд',    'мл.', 2500, 500, 1.2, 'Wella Professional'),
    ('Маска Wella Fusionplex','ART-WL-MF',   'Догляд',     'мл.', 800,  300, 2.1, 'Wella Professional'),
    ('Фольга перукарська',    'ART-FOIL',    'Розхідники', 'уп.', 3,    5,  85,   'Будь-який'),
    ('Рукавички нітрилові S', 'ART-GLOVE-S', 'Розхідники', 'уп.', 8,    4,  120,  'Медторг'),
    ('Рукавички нітрилові M', 'ART-GLOVE-M', 'Розхідники', 'уп.', 2,    4,  120,  'Медторг'),
    ('Пеньюар одноразовий',   'ART-CAPE',    'Розхідники', 'уп.', 15,   5,  55,   'Будь-який');
