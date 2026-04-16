// js/admin-bonuses.js
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
let _allClients  = [];
let _ltvMap      = {};   // client_id → { ltv, visits, lastDate }
let _sortKey     = 'bonuses';
let _searchQ     = '';
let _hideZero    = false;
let _editId      = null;
let _editOp      = 'add';
let _bulkGroup   = 'all';

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initSidebarMonth();
    initSidebarProfile();
    await loadData();
    updateBulkPreview();
});
window.addEventListener('monthchange', async () => { await loadData(); });

// ── Load data ─────────────────────────────────────────
async function loadData() {
    const selYM = localStorage.getItem('wella_current_month') ||
        `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

    const [{ data: clients }, { data: history }] = await Promise.all([
        window.db.from('clients').select('*').order('full_name', { ascending: true }),
        window.db.from('appointment_history').select('client_id, price, visit_date'),
    ]);

    _allClients = clients || [];

    // Build LTV map
    _ltvMap = {};
    (history || []).forEach(h => {
        if (!_ltvMap[h.client_id]) _ltvMap[h.client_id] = { ltv: 0, visits: 0, lastDate: null, earnedThisMonth: 0 };
        _ltvMap[h.client_id].ltv    += (h.price || 0);
        _ltvMap[h.client_id].visits += 1;
        if (!_ltvMap[h.client_id].lastDate || h.visit_date > _ltvMap[h.client_id].lastDate)
            _ltvMap[h.client_id].lastDate = h.visit_date;
        // Track current-month earnings for bonus accrual estimate
        if ((h.visit_date || '').startsWith(selYM))
            _ltvMap[h.client_id].earnedThisMonth += (h.price || 0);
    });

    renderKPIs();
    renderTable();
}

// ── KPIs ──────────────────────────────────────────────
function renderKPIs() {
    const withBonuses = _allClients.filter(c => (c.bonuses || 0) > 0);
    const totalBonuses = _allClients.reduce((s, c) => s + (c.bonuses || 0), 0);
    const avgBonuses   = withBonuses.length > 0 ? Math.round(totalBonuses / withBonuses.length) : 0;
    const vipCount     = _allClients.filter(c => c.vip_status).length;
    const total        = _allClients.length || 1;

    // Estimate earned this month: earnRate% of visit price
    const earnRate = parseInt(document.getElementById('rule-earn-rate')?.value || 1);
    const earnedMonth = _allClients.reduce((s, c) => {
        const m = _ltvMap[c.id];
        return s + Math.round((m?.earnedThisMonth || 0) * earnRate / 100);
    }, 0);

    document.getElementById('total-bonuses').textContent = totalBonuses.toLocaleString();
    document.getElementById('clients-with-bonuses').textContent = withBonuses.length;
    document.getElementById('kpi-total').textContent    = totalBonuses.toLocaleString();
    document.getElementById('kpi-avg').textContent      = avgBonuses;
    document.getElementById('kpi-earned').textContent   = `~${earnedMonth}`;
    document.getElementById('kpi-vip').textContent      = vipCount;
    document.getElementById('kpi-vip-bar').style.width  = `${Math.min((vipCount/total)*100, 100)}%`;
}

// ── Render table ──────────────────────────────────────
function renderTable() {
    let list = [..._allClients];

    if (_hideZero) list = list.filter(c => (c.bonuses || 0) > 0);
    if (_searchQ) {
        const q = _searchQ.toLowerCase();
        list = list.filter(c => (c.full_name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));
    }

    if (_sortKey === 'bonuses') list.sort((a, b) => (b.bonuses||0) - (a.bonuses||0));
    if (_sortKey === 'name')    list.sort((a, b) => (a.full_name||'').localeCompare(b.full_name||'', 'uk'));
    if (_sortKey === 'vip')     list.sort((a, b) => (b.vip_status?1:0) - (a.vip_status?1:0));
    if (_sortKey === 'visits')  list.sort((a, b) => (_ltvMap[b.id]?.visits||0) - (_ltvMap[a.id]?.visits||0));

    const tbody = document.getElementById('bonus-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Клієнтів не знайдено</td></tr>`;
        return;
    }

    const MAX_BONUS = Math.max(...list.map(c => c.bonuses || 0), 1);

    tbody.innerHTML = list.map(c => {
        const stats    = _ltvMap[c.id] || {};
        const bonuses  = c.bonuses || 0;
        const pct      = Math.round((bonuses / MAX_BONUS) * 100);
        const initials = (c.full_name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
        const vipHtml  = c.vip_status ? `<span class="vip-badge ml-2">VIP</span>` : '';
        const lastStr  = stats.lastDate ? formatDate(stats.lastDate) : '—';
        const bonusColor = bonuses === 0 ? 'text-zinc-600' : bonuses > 200 ? 'text-amber-400' : 'text-amber-300';

        return `
        <tr class="bonus-row" onclick="openEditModal('${c.id}')">
            <td class="px-6">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-black text-xs text-white neo-gradient">${initials}</div>
                    <div>
                        <p class="text-xs font-bold text-white flex items-center gap-1.5">${c.full_name||'—'}${vipHtml}</p>
                        <p class="text-[9px] text-zinc-600 mt-0.5">${c.phone || c.instagram || '—'}</p>
                    </div>
                </div>
            </td>
            <td class="px-4 min-w-[120px]">
                <p class="${bonusColor} text-sm font-black">${bonuses.toLocaleString()}</p>
                <div class="bonus-bar-wrap w-20"><div class="bonus-bar" style="width:${pct}%"></div></div>
            </td>
            <td class="px-4 hidden md:table-cell"><span class="text-xs font-black text-zinc-400">${stats.visits||0}</span></td>
            <td class="px-4 hidden lg:table-cell"><span class="text-xs font-black text-zinc-300">₴${(stats.ltv||0).toLocaleString()}</span></td>
            <td class="px-4 hidden lg:table-cell"><span class="text-[10px] text-zinc-500 font-bold">${lastStr}</span></td>
            <td class="px-4 text-right pr-6">
                <button onclick="event.stopPropagation();openEditModal('${c.id}')"
                    class="w-8 h-8 rounded-lg bg-white/5 hover:bg-amber-500/10 flex items-center justify-center text-zinc-500 hover:text-amber-400 transition">
                    <i class="fa-solid fa-pen text-[10px]"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ── Sorting / filtering ───────────────────────────────
window.setSort = function(key, btn) {
    _sortKey = key;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
};
window.toggleZeroFilter = function(btn) {
    _hideZero = !_hideZero;
    btn.classList.toggle('active', _hideZero);
    renderTable();
};
window.filterBonus = function() {
    _searchQ = document.getElementById('search-input').value.trim();
    renderTable();
};

// ── Edit modal ────────────────────────────────────────
window.openEditModal = function(id) {
    _editId = id;
    _editOp = 'add';
    const c = _allClients.find(x => x.id === id);
    if (!c) return;
    document.getElementById('edit-client-name').textContent = c.full_name || '—';
    document.getElementById('edit-current-balance').textContent = c.bonuses || 0;
    document.getElementById('edit-amount').value = '';
    document.getElementById('edit-reason').value = '';
    document.getElementById('edit-preview').textContent = '';
    setOp('add');
    document.getElementById('edit-modal').classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');
    document.getElementById('edit-amount').addEventListener('input', updateEditPreview);
};

window.setOp = function(op) {
    _editOp = op;
    document.getElementById('op-add').classList.toggle('active', op === 'add');
    document.getElementById('op-sub').classList.toggle('active', op === 'sub');
    updateEditPreview();
};

function updateEditPreview() {
    const c   = _allClients.find(x => x.id === _editId);
    const amt = parseInt(document.getElementById('edit-amount').value) || 0;
    if (!c || !amt) { document.getElementById('edit-preview').textContent = ''; return; }
    const cur = c.bonuses || 0;
    const nxt = _editOp === 'add' ? cur + amt : Math.max(0, cur - amt);
    const sign = _editOp === 'add' ? '+' : '−';
    document.getElementById('edit-preview').innerHTML =
        `<span class="text-zinc-500">${cur}</span> <span class="${_editOp==='add'?'text-emerald-400':'text-rose-400'}">${sign}${amt}</span> → <span class="text-amber-400 font-black">${nxt}</span> балів`;
}

window.saveBonus = async function() {
    const c   = _allClients.find(x => x.id === _editId);
    const amt = parseInt(document.getElementById('edit-amount').value);
    if (!c || !amt || amt <= 0) { alert('Введіть кількість балів'); return; }

    const cur = c.bonuses || 0;
    const newVal = _editOp === 'add' ? cur + amt : Math.max(0, cur - amt);

    const { error } = await window.db.from('clients').update({ bonuses: newVal }).eq('id', _editId);
    if (error) { alert('Помилка: ' + error.message); return; }

    closeAllModals();
    await loadData();
};

// ── Bulk modal ────────────────────────────────────────
window.openBulkModal = function() {
    document.getElementById('bulk-modal').classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');
    updateBulkPreview();
};

window.setGroup = function(group, btn) {
    _bulkGroup = group;
    document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const bDaySelect = document.getElementById('bulk-birthday-month');
    bDaySelect.classList.toggle('hidden', group !== 'birthday');
    updateBulkPreview();
};

function getBulkTargets() {
    const now = new Date();
    if (_bulkGroup === 'all')      return _allClients;
    if (_bulkGroup === 'vip')      return _allClients.filter(c => c.vip_status);
    if (_bulkGroup === 'zero')     return _allClients.filter(c => !(c.bonuses));
    if (_bulkGroup === 'birthday') {
        const mon = parseInt(document.getElementById('bulk-birthday-month').value) || (now.getMonth() + 1);
        return _allClients.filter(c => {
            if (!c.birthday) return false;
            const bMon = parseInt((c.birthday||'').split('-')[1]);
            return bMon === mon;
        });
    }
    return [];
}

function updateBulkPreview() {
    const targets = getBulkTargets();
    document.getElementById('bulk-count').textContent = targets.length;
}
document.addEventListener('change', e => {
    if (e.target.id === 'bulk-birthday-month') updateBulkPreview();
});

window.applyBulkBonus = async function() {
    const amt    = parseInt(document.getElementById('bulk-amount').value);
    const targets = getBulkTargets();
    if (!amt || amt <= 0) { alert('Введіть кількість балів'); return; }
    if (!targets.length)  { alert('Жодного клієнта у вибраній групі'); return; }
    if (!confirm(`Нарахувати ${amt} балів ${targets.length} клієнтам?`)) return;

    // Update in batches
    const updates = targets.map(c =>
        window.db.from('clients').update({ bonuses: (c.bonuses || 0) + amt }).eq('id', c.id)
    );
    await Promise.all(updates);

    closeAllModals();
    await loadData();
};

// ── Rules modal ───────────────────────────────────────
window.openRulesModal = function() {
    document.getElementById('rules-modal').classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');
};

// ── Close all ─────────────────────────────────────────
window.closeAllModals = function() {
    ['edit-modal','bulk-modal','rules-modal','modal-overlay'].forEach(id =>
        document.getElementById(id)?.classList.remove('open')
    );
    _editId = null;
};

// ── Helpers ───────────────────────────────────────────
function formatDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-');
    return `${d}.${m}.${y}`;
}
