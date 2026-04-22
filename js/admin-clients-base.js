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
let _coldFilter   = false;
let _searchQ      = '';
let _currentId  = null; // open modal client id
let _activeTab  = 'history';

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initSidebarMonth();
    initSidebarProfile();
    // Show export button for owners only
    if (localStorage.getItem('wella_staff_role') === 'owner') {
        document.getElementById('export-btn-wrap')?.classList.remove('hidden');
    }
    await loadClients();
});

// Close export dropdown on outside click
document.addEventListener('click', e => {
    if (!e.target.closest('#export-dropdown-wrap')) {
        document.getElementById('export-dropdown')?.classList.add('hidden');
    }
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

    // 2. Fetch appointment_history + non-cancelled appointments + staff names in parallel
    const [histRes, completedRes, staffRes] = await Promise.all([
        window.db.from('appointment_history').select('client_id, price, visit_date, master_id'),
        window.db.from('appointments').select('client_id, price, appointment_date, master_id, status'),
        window.db.from('staff').select('id, name')
    ]);
    // Filter out cancelled appointments client-side (status values vary: 'cancelled'/'Скасовано')
    const activeAppts = (completedRes.data || []).filter(a => {
        const s = (a.status || '').toLowerCase();
        return s !== 'cancelled' && s !== 'скасовано' && a.status !== 'Скасовано';
    });

    // Staff name lookup
    const staffNameMap = Object.fromEntries((staffRes.data || []).map(s => [s.id, s.name]));

    // Build lookup: client_id → { ltv, visits, lastDate, masterCount:{id:n} }
    const statsMap = {};
    function addRow(clientId, price, date, masterId) {
        if (!clientId) return;
        if (!statsMap[clientId]) statsMap[clientId] = { ltv: 0, visits: 0, lastDate: null, masterCount: {} };
        statsMap[clientId].ltv    += (price || 0);
        statsMap[clientId].visits += 1;
        if (!statsMap[clientId].lastDate || date > statsMap[clientId].lastDate)
            statsMap[clientId].lastDate = date;
        if (masterId) statsMap[clientId].masterCount[masterId] = (statsMap[clientId].masterCount[masterId] || 0) + 1;
    }
    (histRes.data || []).forEach(h => addRow(h.client_id, h.price, h.visit_date, h.master_id));
    activeAppts.forEach(a => addRow(a.client_id, a.price, a.appointment_date, a.master_id));

    // Determine favorite master per client
    function getFavMaster(clientId) {
        const mc = statsMap[clientId]?.masterCount || {};
        let bestId = null, bestCount = 0;
        Object.entries(mc).forEach(([id, count]) => { if (count > bestCount) { bestCount = count; bestId = id; } });
        return bestId ? { id: bestId, name: staffNameMap[bestId] || '—' } : null;
    }

    // Determine "new this month" threshold
    const selYM = localStorage.getItem('wella_current_month') || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

    _allClients = clients.map(c => ({
        ...c,
        _ltv:       statsMap[c.id]?.ltv      || 0,
        _visits:    statsMap[c.id]?.visits   || 0,
        _lastDate:  statsMap[c.id]?.lastDate || null,
        _isNew:     (c.created_at || '').startsWith(selYM),
        _favMaster: getFavMaster(c.id)
    }));

    // Header counters
    document.getElementById('total-count').textContent = _allClients.length;
    document.getElementById('vip-count').textContent   = _allClients.filter(c => c.vip_status).length;
    document.getElementById('new-count').textContent   = _allClients.filter(c => c._isNew).length;

    renderTable();
}

// ── Get filtered + sorted clients (shared by render & export) ─
function getFilteredClients() {
    let list = [..._allClients];

    // VIP filter
    if (_vipOnly) list = list.filter(c => c.vip_status);

    // Cold filter (no visit in 3+ months)
    if (_coldFilter) {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        list = list.filter(c => {
            if (!c._lastDate) return true;
            return new Date(c._lastDate) < threeMonthsAgo;
        });
    }

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
    if (_currentSort === 'ltv')    list.sort((a, b) => b._ltv    - a._ltv);
    if (_currentSort === 'visits') list.sort((a, b) => b._visits - a._visits);
    if (_currentSort === 'last')   list.sort((a, b) => (b._lastDate || '').localeCompare(a._lastDate || ''));
    if (_currentSort === 'new')    list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (_currentSort === 'name')   list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'uk'));

    return list;
}

// ── Render table ──────────────────────────────────────
function renderTable() {
    const list = getFilteredClients();

    const tbody = document.getElementById('clients-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-16 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Клієнтів не знайдено</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const lastStr  = c._lastDate ? formatDate(c._lastDate) : '—';
        const vipHtml  = c.vip_status ? `<span class="vip-badge ml-2">VIP</span>` : '';
        const favHtml  = c._favMaster ? `<span class="text-[8px] text-rose-400 font-bold mt-0.5 flex items-center gap-1"><i class="fa-solid fa-heart text-[7px]"></i>${c._favMaster.name}</span>` : '';
        return `
        <tr class="client-row" onclick="openClientModal('${c.id}')">
            <td class="px-6">
                <div>
                    <p class="text-xs font-bold text-white flex items-center gap-1.5">${c.full_name || '—'}${vipHtml}</p>
                    <p class="text-[9px] text-zinc-600 mt-0.5">${c.instagram || c.phone || '—'}</p>
                    ${favHtml}
                </div>
            </td>
            <td class="px-4"><span class="text-xs font-black text-white">₴${c._ltv.toLocaleString()}</span></td>
            <td class="px-4"><span class="text-xs font-black text-zinc-300">${c._visits}</span></td>
            <td class="px-4 hidden md:table-cell"><span class="text-xs font-black text-amber-400">${c.bonuses || 0}</span></td>
            <td class="px-4 hidden sm:table-cell"><span class="text-[10px] text-zinc-500 font-bold">${lastStr}</span></td>
            <td class="px-4 hidden sm:table-cell"><span class="text-[10px] text-zinc-500 font-bold">${c.phone || '—'}</span></td>
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

window.toggleColdFilter = function() {
    _coldFilter = !_coldFilter;
    const btn = document.getElementById('cold-filter-btn');
    if (btn) {
        btn.classList.toggle('active', _coldFilter);
    }
    renderTable();
};

// ── Export helpers ────────────────────────────────────
window.toggleExportDropdown = function() {
    document.getElementById('export-dropdown').classList.toggle('hidden');
};

window.exportClientsCSV = function() {
    const rows = getFilteredClients();
    const headers = ['Імя', 'Телефон', 'Instagram', 'Візити', 'LTV', 'Бонуси', 'Останній візит'];
    const lines = [headers.join(',')];
    rows.forEach(c => {
        lines.push([
            `"${c.full_name || ''}"`,
            `"${c.phone || ''}"`,
            `"${c.instagram || ''}"`,
            c._visits || 0,
            c._ltv || 0,
            c.bonuses || 0,
            `"${c._lastDate || ''}"`
        ].join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clients_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
};

window.exportClientsPDF = function() {
    const rows = getFilteredClients();
    let html = `<html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:11px;color:#111}
        h2{margin-bottom:12px}
        table{width:100%;border-collapse:collapse}
        th{background:#f43f5e;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
        td{padding:5px 8px;border-bottom:1px solid #eee}
        tr:nth-child(even) td{background:#fafafa}
    </style></head><body>
    <h2>База клієнтів — ${new Date().toLocaleDateString('uk-UA')}</h2>
    <table><thead><tr>
        <th>Ім\'я</th><th>Телефон</th><th>Візити</th><th>LTV</th><th>Бонуси</th><th>Останній візит</th>
    </tr></thead><tbody>`;
    rows.forEach(c => {
        const lastStr = c._lastDate ? c._lastDate.split('-').reverse().join('.') : '—';
        html += `<tr><td>${c.full_name || ''}</td><td>${c.phone || ''}</td><td>${c._visits || 0}</td><td>₴${c._ltv || 0}</td><td>${c.bonuses || 0}</td><td>${lastStr}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
};

// ── Open client modal ─────────────────────────────────
window.openClientModal = async function(id) {
    _currentId = id;
    window._openClientId = id;
    _activeTab = 'history';

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

    // Load call-centre notes
    const notesEl = document.getElementById('client-notes');
    if (notesEl) notesEl.value = client.callcenter_notes || '';
};

window.closeClientModal = function() {
    document.getElementById('client-modal').classList.remove('open');
    document.getElementById('modal-overlay').classList.remove('open');
    _currentId = null;
    window._openClientId = null;
};

function clearModal() {
    ['f-name','f-phone','f-instagram','f-birthday','f-allergies','f-preferences','f-formula','f-notes','client-notes','manual-bonus-input'].forEach(id => {
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
    document.getElementById('f-formula').value        = c.color_formula     || c.notes_formula || '';
    document.getElementById('f-notes').value          = c.notes             || c.notes_internal || '';

    const initials = (c.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('modal-avatar').textContent = initials;
    document.getElementById('modal-name-display').textContent = c.full_name || '—';
    document.getElementById('modal-since').textContent = c.created_at ? `Клієнт з ${formatDate(c.created_at.split('T')[0])}` : '';

    if (c.vip_status) document.getElementById('modal-vip-badge').classList.remove('hidden');
    else              document.getElementById('modal-vip-badge').classList.add('hidden');

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

    // Favorite master
    const favEl = document.getElementById('modal-fav-master');
    if (favEl) {
        if (c._favMaster) {
            favEl.innerHTML = `<i class="fa-solid fa-heart text-rose-400 text-[9px]"></i><span>${c._favMaster.name}</span>`;
            favEl.classList.remove('hidden');
        } else {
            favEl.classList.add('hidden');
        }
    }
}

async function renderHistoryPanel(client) {
    const histList = document.getElementById('history-list');
    histList.innerHTML = `<p class="text-zinc-600 text-xs font-bold text-center py-6">Завантаження...</p>`;

    // Query both tables with SELECT * so we don't break on per-env schema differences
    const [histRes2, activeRes, staffRes2, svcRes] = await Promise.all([
        window.db.from('appointment_history').select('*').eq('client_id', client.id),
        window.db.from('appointments').select('*').eq('client_id', client.id),
        window.db.from('staff').select('id, name'),
        window.db.from('services').select('id, name')
    ]);
    if (histRes2.error) console.error('history panel: appointment_history err', histRes2.error.message, histRes2.error.details, histRes2.error.hint, histRes2.error.code);
    if (activeRes.error) console.error('history panel: appointments err', activeRes.error.message, activeRes.error.details, activeRes.error.hint, activeRes.error.code);
    console.log('[history panel] client', client.id, 'hist rows:', (histRes2.data||[]).length, 'appts rows:', (activeRes.data||[]).length);

    const sMap = Object.fromEntries((staffRes2.data || []).map(s => [s.id, s.name]));
    const svcMap = Object.fromEntries((svcRes.data || []).map(s => [s.id, s.name]));
    const pickName = r => r.service_name || r.service || svcMap[r.service_id] || '—';
    // Include all appointments except cancelled
    const activeFiltered = (activeRes.data || []).filter(a => {
        const s = (a.status || '').toLowerCase();
        return s !== 'cancelled' && s !== 'скасовано' && a.status !== 'Скасовано';
    });
    const combined = [
        ...(histRes2.data || []).map(h => ({ service_name: pickName(h), price: h.price, _date: h.visit_date, master_id: h.master_id, payment_method: h.payment_method || h.payment || '' })),
        ...activeFiltered.map(a => ({ service_name: pickName(a), price: a.price, _date: a.appointment_date, master_id: a.master_id, payment_method: a.payment_method || a.payment || '' }))
    ].sort((a, b) => (b._date || '').localeCompare(a._date || '')).slice(0, 30);

    const hist = combined; // reuse variable name below

    if (!hist.length) {
        histList.innerHTML = `<p class="text-zinc-700 text-xs font-bold text-center py-10 uppercase tracking-widest">Немає записів</p>`;
        return;
    }

    histList.innerHTML = hist.map(h => `
        <div class="hist-item py-3 flex justify-between items-start gap-3">
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${h.service_name || '—'}</p>
                <p class="text-[9px] text-zinc-600 mt-0.5">${sMap[h.master_id] || '—'} · ${formatDate(h._date)}</p>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-xs font-black text-white">₴${(h.price || 0).toLocaleString()}</p>
                <p class="text-[8px] text-zinc-700 mt-0.5">${paymentLabel(h.payment_method)}</p>
            </div>
        </div>`).join('');
}

// ── Reviews panel ─────────────────────────────────────
async function renderReviewsPanel(clientId) {
    const revList = document.getElementById('reviews-list');
    revList.innerHTML = `<p class="text-zinc-600 text-xs font-bold text-center py-6">Завантаження...</p>`;

    const { data: reviews } = await window.db
        .from('reviews')
        .select('*, staff(name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

    if (!reviews || reviews.length === 0) {
        revList.innerHTML = `<p class="text-zinc-700 text-xs font-bold text-center py-10 uppercase tracking-widest">Немає відгуків</p>`;
        return;
    }

    const starsHtml = (rating) => {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += `<i class="fa-solid fa-star" style="font-size:9px;color:${i <= rating ? '#fbbf24' : '#27272a'}"></i>`;
        }
        return html;
    };

    revList.innerHTML = reviews.map(r => {
        const rating = parseFloat(r.rating || 0);
        const d = r.created_at ? new Date(r.created_at) : null;
        const dateStr = d ? `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}` : '—';
        return `
        <div class="hist-item py-3">
            <div class="flex items-center justify-between gap-3 mb-1">
                <div class="flex gap-0.5">${starsHtml(Math.round(rating))}</div>
                <p class="text-[9px] text-zinc-600">${r.staff?.name || '—'} · ${dateStr}</p>
            </div>
            ${r.comment ? `<p class="text-[10px] text-zinc-400 leading-relaxed mt-1">${r.comment}</p>` : ''}
        </div>`;
    }).join('');
}

// ── Tab switch ────────────────────────────────────────
window.switchTab = function(tab) {
    _activeTab = tab;
    document.getElementById('tab-history').classList.toggle('active', tab === 'history');
    document.getElementById('tab-reviews').classList.toggle('active', tab === 'reviews');
    document.getElementById('history-list').classList.toggle('hidden', tab !== 'history');
    document.getElementById('reviews-list').classList.toggle('hidden', tab !== 'reviews');
    if (tab === 'reviews' && _currentId) {
        renderReviewsPanel(_currentId);
    }
};

// ── Save client ───────────────────────────────────────
window.saveClient = async function() {
    const name     = document.getElementById('f-name').value.trim();
    if (!name) { alert('Введіть ім\'я клієнта'); return; }

    // Only send columns that are guaranteed to exist in the schema
    const payload = {
        full_name: name,
        phone:     document.getElementById('f-phone').value.trim()     || null,
        instagram: document.getElementById('f-instagram').value.trim() || null,
        birthday:  document.getElementById('f-birthday').value         || null,
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

// ── Call-centre notes ─────────────────────────────────
window.saveClientNotes = async function() {
    const clientId = window._openClientId;
    if (!clientId) return;
    const notes = document.getElementById('client-notes')?.value || '';
    const { error } = await window.db.from('clients').update({ callcenter_notes: notes }).eq('id', clientId);
    if (error) { alert('Помилка: ' + error.message); return; }
    // Update local cache
    const cached = _allClients.find(c => c.id === clientId);
    if (cached) cached.callcenter_notes = notes;
    // Button feedback
    const btn = document.querySelector('button[onclick="saveClientNotes()"]');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Збережено';
        setTimeout(() => btn.innerHTML = orig, 1500);
    }
};

// ── Manual bonus ──────────────────────────────────────
window.addManualBonus = async function() {
    const clientId = window._openClientId;
    const pts = parseInt(document.getElementById('manual-bonus-input')?.value || '0');
    if (!clientId || !pts || pts < 1) { alert('Введіть кількість балів'); return; }
    // Get current bonuses
    const { data: c } = await window.db.from('clients').select('bonuses').eq('id', clientId).single();
    const newPts = (c?.bonuses || 0) + pts;
    const { error } = await window.db.from('clients').update({ bonuses: newPts }).eq('id', clientId);
    if (error) { alert('Помилка: ' + error.message); return; }
    // Update local cache and modal display
    const cached = _allClients.find(cl => cl.id === clientId);
    if (cached) cached.bonuses = newPts;
    document.getElementById('modal-bonuses').textContent = newPts;
    document.getElementById('manual-bonus-input').value = '';
    alert(`Нараховано ${pts} бонусів. Всього: ${newPts}`);
};
