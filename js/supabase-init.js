// Підключення Supabase (використовуємо CDN версію)
const { createClient } = supabase;

const SUPABASE_URL = 'https://ghuzeonifbzqdtwbiudz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MlqmF9XLX9_jABWSABO8KQ_NSCr91NU';

const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Робимо клієнт доступним глобально під коротким ім'ям db
window.db = _supabase;
