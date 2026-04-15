// js/admin-clients-base.js
const staffId   = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');
if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

// ── Month Selector (sidebar) ──────────────────────────
const _MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
function initSidebarMonth() {
    let ym = localStorage.getItem('wella_current_month');
    if (!ym) { const n = new Date(); ym = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
    localStorage.setItem('wella_current_month', ym);
    const [y, m] = ym.split('-').map(Number);
    const el = document.getElementById('sidebar-month-label');
    if (el) el.textContent = `${_MONTHS_UA[m-1]} ${y}`;
}
window.monthStep = function(dir) {
    let ym = localStorage.getItem('wella_current_month') || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    let [y, m] = ym.split('-').map(Number);
    m += dir; if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    const next = `${y}-${String(m).padStart(2,'0')}`;
    localStorage.setItem('wella_current_month', next);
    const [ny, nm] = next.split('-').map(Number);
    const el = document.getElementById('sidebar-month-label');
    if (el) el.textContent = `${_MONTHS_UA[nm-1]} ${ny}`;
    window.dispatchEvent(new Event('monthchange'));
};

// ── Profile ───────────────────────────────────────────
function initSidebarProfile() {
    const name = localStorage.getItem('wella_staff_name') || '';
    const role = localStorage.getItem('wella_staff_role') || '';
    const av = document.getElementById('sidebar-avatar');
    const un = document.getElementById('sidebar-uname');
    const ur = document.getElementById('sidebar-urole');
    if (av) av.textContent = name.charAt(0).toUpperCase() || 'A';
    if (un) un.textContent = name || '—';
    if (ur) ur.textContent = role;
}
window.doLogout = function() {
    ['wella_staff_id','wella_staff_role','wella_staff_name','wella_proc_list'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'staff-login.html';
};

// ── State ─────────────────────────────────────────────
let _allClients   = [];   // raw from DB with ltv/visits computed
let _currentSort  = 'name';
let _vipOnly      = false;
let _searchQ      = '';
let _currentId    = null; // open modal client id
let _currentVip   = false;
let _activeTab    = 'history';

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initSidebarMonth();
    initSidebarProfile();
    await loadClients();
});

window.addEventListener('monthchange', async () => {
    await loadClients();
});

// ── Load clients ──────────────────────────────────────
async function loadClients() {
    const tbody = document.getElementById('clients-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-16 text-center"><div class="skeleton h-4 w-48 mx-auto"></div></td></tr>`;

    // 1. Fetch all clients
    const { data: clients, error } = await window.db
        .from('clients')
        .select('*')
        .order('full_name', { ascending: true });

    if (error || !clients) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-rose-400 text-xs font-bold uppercase">Помилка завантаження</td></tr>`;
        return;
    }

    // 2. Fetch all appointment_history for LTV/visits/last date
    const { data: history } = await window.db
        .from('appointment_history')
        .select('client_id, price, visit_date');

    // Build lookup: client_id → { ltv, visits, lastDate }
    const statsMap = {};
    (history || []).forEach(h => {
        if (!statsMap[h.client_id]) statsMap[h.client_id] = { ltv: 0, visits: 0, lastDate: null };
        statsMap[h.client_id].ltv    += (h.price || 0);
        statsMap[h.client_id].visits += 1;
        if (!statsMap[h.client_id].lastDate || h.visit_date > statsMap[h.client_id].lastDate)
            statsMap[h.client_id].lastDate = h.visit_date;
    });

    // Determine "new this month" threshold
    const selYM = localStorage.getItem('wella_current_month') || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

    _allClients = clients.map(c => ({
        ...c,
        _ltv:      statsMap[c.id]?.ltv      || 0,
        _visits:   statsMap[c.id]?.visits   || 0,
        _lastDate: statsMap[c.id]?.lastDate || null,
        _isNew:    (c.created_at || '').startsWith(selYM)
    }));

    // Header counters
    document.getElementById('total-count').textContent = _allClients.length;
    document.getElementById('vip-count').textContent   = _allClients.filter(c => c.vip_status).length;
    document.getElementById('new-count').textContent   = _allClients.filter(c => c._isNew).length;

    renderTable();
}

// ── Render table ──────────────────────────────────────
function renderTable() {
    let list = [..._allClients];

    // VIP filter
    if (_vipOnly) list = list.filter(c => c.vip_status);

    // Search
    if (_searchQ) {
        const q = _searchQ.toLowerCase();
        list = list.filter(c =>
            (c.full_name || '').toLowerCase().includes(q) ||
            (c.phone || '').includes(q) ||
            (c.instagram || '').toLowerCase().includes(q)
        );
    }

    // Sort
    if (_currentSort === 'ltv')   list.sort((a, b) => b._ltv    - a._ltv);
    if (_currentSort === 'visits') list.sort((a, b) => b._visits - a._visits);
    if (_currentSort === 'last')  list.sort((a, b) => (b._lastDate || '').localeCompare(a._lastDate || ''));
    if (_currentSort === 'new')   list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (_currentSort === 'name')  list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'uk'));

    const tbody = document.getElementById('clients-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-16 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Клієнтів не знайдено</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const initials = (c.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        const lastStr  = c._lastDate ? formatDate(c._lastDate) : '—';
        const vipHtml  = c.vip_status ? `<span class="vip-badge ml-2">VIP</span>` : '';
        return `
        <tr class="client-row" onclick="openClientModal('${c.id}')">
            <td class="px-6">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-black text-xs text-white neo-gradient">${initials}</div>
                    <div>
                        <p class="text-xs font-bold text-white flex items-center gap-1.5">${c.full_name || '—'}${vipHtml}</p>
                        <p class="text-[9px] text-zinc-600 mt-0.5">${c.instagram || c.phone || '—'}</p>
                    </div>
                </div>
            </td>
            <td class="px-4"><span class="text-xs font-black text-white">₴${c._ltv.toLocaleString()}</span></td>
            <td class="px-4"><span class="text-xs font-black text-zinc-300">${c._visits}</span></td>
            <td class="px-4"><span class="text-xs font-black text-amber-400">${c.bonuses || 0}</span></td>
            <td class="px-4"><span class="text-[10px] text-zinc-500 font-bold">${lastStr}</span></td>
            <td class="px-4"><span class="text-[10px] text-zinc-500 font-bold">${c.phone || '—'}</span></td>
            <td class="px-2 text-right pr-5"><i class="fa-solid fa-chevron-right text-zinc-700 text-xs"></i></td>
        </tr>`;
    }).join('');
}

// ── Sorting / filtering ───────────────────────────────
window.setSort = function(key, btn) {
    _currentSort = key;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
};

window.toggleVipFilter = function(btn) {
    _vipOnly = !_vipOnly;
    btn.classList.toggle('active', _vipOnly);
    renderTable();
};

window.filterClients = function() {
    _searchQ = document.getElementById('search-input').value.trim();
    renderTable();
};

// ── Open client modal ─────────────────────────────────
window.openClientModal = async function(id) {
    _currentId  = id;
    _activeTab  = 'history';
    _currentVip = false;

    // Show modal
    document.getElementById('client-modal').classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');

    // Reset form
    clearModal();

    if (!id) {
        // New client
        document.getElementById('modal-name-display').textContent = 'Новий клієнт';
        document.getElementById('modal-since').textContent = '';
        document.getElementById('modal-delete-btn').classList.add('hidden');
        document.getElementById('modal-avatar').textContent = '+';
        return;
    }

    // Existing client
    document.getElementById('modal-delete-btn').classList.remove('hidden');

    const client = _allClients.find(c => c.id === id);
    if (!client) return;

    fillForm(client);
    renderHistoryPanel(client);
};

window.closeClientModal = function() {
    document.getElementById('client-modal').classList.remove('open');
    document.getElementById('modal-overlay').classList.remove('open');
    _currentId = null;
};

function clearModal() {
    ['f-name','f-phone','f-instagram','f-birthday','f-allergies','f-preferences','f-formula','f-notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('modal-ltv').textContent    = '₴0';
    document.getElementById('modal-bonuses').textContent = '0';
    document.getElementById('modal-avg').textContent    = '₴0';
    document.getElementById('modal-last-date').textContent = '—';
    document.getElementById('modal-visits-count').textContent = '0 візитів';
    document.getElementById('history-list').innerHTML = `<p class="text-zinc-700 text-xs font-bold text-center py-10 uppercase tracking-widest">Немає записів</p>`;
    document.getElementById('reviews-list').innerHTML = `<p class="text-zinc-700 text-xs font-bold text-center py-10 uppercase tracking-widest">Немає відгуків</p>`;
    document.getElementById('modal-vip-badge').classList.add('hidden');
    document.getElementById('tab-history').classList.add('active');
    document.getElementById('tab-reviews').classList.remove('active');
    document.getElementById('history-list').classList.remove('hidden');
    document.getElementById('reviews-list').classList.add('hidden');
}

function fillForm(c) {
    document.getElementById('f-name').value           = c.full_name || '';
    document.getElementById('f-phone').value          = c.phone     || '';
    document.getElementById('f-instagram').value      = c.instagram || '';
    document.getElementById('f-birthday').value       = c.birthday  || '';
    document.getElementById('f-allergies').value      = c.notes_allergies   || '';
    document.getElementById('f-preferences').value    = c.notes_preferences || '';
    document.getElementById('f-formula').value        = c.color_formula     || '';
    document.getElementById('f-notes').value          = c.notes             || '';

    _currentVip = !!c.vip_status;
    const initials = (c.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('modal-avatar').textContent = initials;
    document.getElementById('modal-name-display').textContent = c.full_name || '—';
    document.getElementById('modal-since').textContent = c.created_at ? `Клієнт з ${formatDate(c.created_at.split('T')[0])}` : '';

    if (_currentVip) document.getElementById('modal-vip-badge').classList.remove('hidden');
    else             document.getElementById('modal-vip-badge').classList.add('hidden');

    // Phone link
    document.getElementById('modal-phone-link').href = c.phone ? `tel:${c.phone}` : '#';

    // Instagram link
    let instaHandle = (c.instagram || '').replace('@', '');
    document.getElementById('modal-insta-link').href = instaHandle ? `https://instagram.com/${instaHandle}` : '#';

    // Financial
    document.getElementById('modal-ltv').textContent    = `₴${c._ltv.toLocaleString()}`;
    document.getElementById('modal-bonuses').textContent = c.bonuses || 0;
    const avg = c._visits > 0 ? Math.round(c._ltv / c._visits) : 0;
    document.getElementById('modal-avg').textContent     = `₴${avg.toLocaleString()}`;
    document.getElementById('modal-last-date').textContent = c._lastDate ? formatDate(c._lastDate) : '—';
    document.getElementById('modal-visits-count').textContent = `${c._visits} візитів`;
}

async function renderHistoryPanel(client) {
    const histList = document.getElementById('history-list');
    histList.innerHTML = `<p class="text-zinc-600 text-xs font-bold text-center py-6">Завантаження...</p>`;

    const { data: hist } = await window.db
        .from('appointment_history')
        .select('*, staff(name)')
        .eq('client_id', client.id)
        .order('visit_date', { ascending: false })
        .limit(30);

    if (!hist || hist.length === 0) {
        histList.innerHTML = `<p class="text-zinc-700 text-xs font-bold text-center py-10 uppercase tracking-widest">Немає записів</p>`;
        return;
    }

    histList.innerHTML = hist.map(h => `
        <div class="hist-item py-3 flex justify-between items-start gap-3">
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${h.service_name || '—'}</p>
                <p class="text-[9px] text-zinc-600 mt-0.5">${h.staff?.name || '—'} · ${formatDate(h.visit_date)}</p>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-xs font-black text-white">₴${(h.price || 0).toLocaleString()}</p>
                <p class="text-[8px] text-zinc-700 mt-0.5">${paymentLabel(h.payment_method)}</p>
            </div>
        </div>`).join('');
}

// ── Tab switch ────────────────────────────────────────
window.switchTab = function(tab) {
    _activeTab = tab;
    document.getElementById('tab-history').classList.toggle('active', tab === 'history');
    document.getElementById('tab-reviews').classList.toggle('active', tab === 'reviews');
    document.getElementById('history-list').classList.toggle('hidden', tab !== 'history');
    document.getElementById('reviews-list').classList.toggle('hidden', tab !== 'reviews');
};

// ── VIP toggle ────────────────────────────────────────
window.toggleVip = function() {
    _currentVip = !_currentVip;
    document.getElementById('modal-vip-badge').classList.toggle('hidden', !_currentVip);
};

// ── Save client ───────────────────────────────────────
window.saveClient = async function() {
    const name     = document.getElementById('f-name').value.trim();
    if (!name) { alert('Введіть ім\'я клієнта'); return; }

    const payload = {
        full_name:          name,
        phone:              document.getElementById('f-phone').value.trim()       || null,
        instagram:          document.getElementById('f-instagram').value.trim()   || null,
        birthday:           document.getElementById('f-birthday').value           || null,
        vip_status:         _currentVip,
        notes_allergies:    document.getElementById('f-allergies').value.trim()   || null,
        notes_preferences:  document.getElementById('f-preferences').value.trim() || null,
        color_formula:      document.getElementById('f-formula').value.trim()     || null,
        notes:              document.getElementById('f-notes').value.trim()       || null,
    };

    let err;
    if (_currentId) {
        ({ error: err } = await window.db.from('clients').update(payload).eq('id', _currentId));
    } else {
        ({ error: err } = await window.db.from('clients').insert(payload));
    }

    if (err) { alert('Помилка збереження: ' + err.message); return; }

    closeClientModal();
    await loadClients();
};

// ── Delete client ─────────────────────────────────────
window.deleteClient = async function() {
    if (!_currentId) return;
    if (!confirm('Видалити клієнта? Цю дію не можна скасувати.')) return;

    const { error } = await window.db.from('clients').delete().eq('id', _currentId);
    if (error) { alert('Помилка видалення'); return; }

    closeClientModal();
    await loadClients();
};

// ── Helpers ───────────────────────────────────────────
function formatDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-');
    return `${d}.${m}.${y}`;
}

function paymentLabel(method) {
    const map = { cash: 'Готівка', card: 'Картка', transfer: 'Переказ' };
    return map[method] || method || '';
}
