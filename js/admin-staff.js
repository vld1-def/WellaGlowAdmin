// js/admin-staff.js
// ══════════════════════════════════════════════════════
//  Wella Glow — Управління персоналом
// ══════════════════════════════════════════════════════

// ── Auth guard ────────────────────────────────────────
const staffId   = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');
if (!staffId || !['owner','admin'].includes(staffRole)) {
    window.location.href = 'staff-login.html';
}

// ── State ─────────────────────────────────────────────
let allStaff        = [];   // active + trial
let allReviews      = [];
let allCandidates   = [];
let editingStaffId  = null;
let permStaffId     = null;
let modalStaffData  = null;
let archiveTab      = 'fired';
let modalTab        = 'info';
let modalChart      = null;
let archiveStaff    = [];   // fired

const MODULES = [
    { key: 'dashboard',  label: 'Дашборд',       icon: 'fa-chart-pie'       },
    { key: 'calendar',   label: 'Записи',         icon: 'fa-calendar-check'  },
    { key: 'finance',    label: 'Фінанси',        icon: 'fa-wallet'          },
    { key: 'clients',    label: 'Клієнти',        icon: 'fa-address-book'    },
    { key: 'inventory',  label: 'Склад',          icon: 'fa-boxes-stacked'   },
    { key: 'staff',      label: 'Персонал',       icon: 'fa-users-gear'      },
    { key: 'bonuses',    label: 'Бонуси',         icon: 'fa-gift'            },
];

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadAll();
});

async function loadAll() {
    await Promise.all([loadStaff(), loadReviews()]);
    loadKPIs();
}

// ══════════════════════════════════════════════════════
//  DATA LOADERS
// ══════════════════════════════════════════════════════

async function loadStaff() {
    const { data, error } = await window.db
        .from('staff')
        .select('*')
        .order('name');

    if (error) { console.error(error); return; }

    const all = data || [];
    allStaff      = all.filter(s => s.status === 'active' || s.status === 'trial');
    allCandidates = all.filter(s => s.status === 'candidate');
    archiveStaff  = all.filter(s => s.status === 'fired');

    document.getElementById('active-count').textContent =
        allStaff.filter(s => s.status === 'active').length;

    renderStaffTable(allStaff);
    renderCandidates(allCandidates.slice(0, 5));
}

async function loadReviews() {
    const { data, error } = await window.db
        .from('reviews')
        .select('*, staff:staff_id(name, color)')
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }
    allReviews = data || [];
    renderReviews(allReviews.slice(0, 5));
}

// ── KPIs ──────────────────────────────────────────────
async function loadKPIs() {
    // Average rating
    if (allReviews.length) {
        const avg = allReviews.reduce((s, r) => s + parseFloat(r.rating), 0) / allReviews.length;
        document.getElementById('kpi-rating').innerHTML =
            avg.toFixed(1) + '<span class="text-sm text-zinc-500 font-semibold"> / 5.0</span>';
    } else {
        document.getElementById('kpi-rating').innerHTML =
            '—<span class="text-sm text-zinc-500 font-semibold"> / 5.0</span>';
    }

    // Efficiency = avg rating scaled to /10
    if (allReviews.length) {
        const avgRating = allReviews.reduce((s, r) => s + parseFloat(r.rating), 0) / allReviews.length;
        const eff = (avgRating / 5 * 10).toFixed(1);
        document.getElementById('kpi-efficiency').innerHTML =
            eff + '<span class="text-sm text-zinc-500 font-semibold">/10</span>';
    }

    // Payroll fund: sum of (staff.salary_percent / 100 * monthly revenue)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [apptRes, txRes] = await Promise.all([
        window.db.from('appointment_history')
            .select('total_price')
            .gte('date', monthStart)
            .lte('date', monthEnd),
        window.db.from('transactions')
            .select('amount')
            .eq('type', 'income')
            .gte('date', monthStart)
            .lte('date', monthEnd),
    ]);

    const revenue =
        (apptRes.data || []).reduce((s, r) => s + parseFloat(r.total_price || 0), 0) +
        (txRes.data || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    const avgPct = allStaff.length
        ? allStaff.reduce((s, m) => s + (m.salary_percent || 40), 0) / allStaff.length
        : 40;

    const fund = Math.round(revenue * avgPct / 100);
    document.getElementById('kpi-payroll').textContent = fund
        ? '₴' + fund.toLocaleString('uk-UA')
        : '₴0';
}

// ══════════════════════════════════════════════════════
//  RENDER: STAFF TABLE
// ══════════════════════════════════════════════════════

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function statusBadge(status) {
    const map = {
        active:    ['badge-active',    'Активний'],
        trial:     ['badge-trial',     'Випробувальний'],
        candidate: ['badge-candidate', 'Кандидат'],
        fired:     ['badge-fired',     'Архів'],
    };
    const [cls, label] = map[status] || ['badge-active', status];
    return `<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${cls}">${label}</span>`;
}

function starRating(rating) {
    if (!rating) return '<span class="text-[10px] text-zinc-600">—</span>';
    const full  = Math.round(parseFloat(rating));
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa-solid fa-star text-[9px] ${i <= full ? 'star-full' : 'star-empty'}"></i>`;
    }
    return `<span class="flex items-center gap-0.5">${html} <span class="text-[10px] text-zinc-400 ml-1 font-bold">${parseFloat(rating).toFixed(1)}</span></span>`;
}

function tenureDays(hireDate) {
    if (!hireDate) return '—';
    const days = Math.floor((Date.now() - new Date(hireDate).getTime()) / 86400000);
    if (days < 30)  return days + ' дн.';
    if (days < 365) return Math.floor(days / 30) + ' міс.';
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return y + ' р.' + (m ? ' ' + m + ' міс.' : '');
}

function staffRow(s, appointments = 0, revenue = 0) {
    const avgRating = (() => {
        const revs = allReviews.filter(r => r.staff_id === s.id);
        if (!revs.length) return null;
        return revs.reduce((sum, r) => sum + parseFloat(r.rating), 0) / revs.length;
    })();

    return `
    <tr class="border-b border-white/3 hover:bg-white/2 transition cursor-pointer" onclick="openProfile('${s.id}')">
        <td class="py-3 pr-4">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                     style="background:${s.color || '#f43f5e'}22; border:1.5px solid ${s.color || '#f43f5e'}55; color:${s.color || '#f43f5e'}">
                    ${getInitials(s.name)}
                </div>
                <div>
                    <p class="text-[12px] font-bold text-white leading-tight">${s.name}</p>
                    <p class="text-[10px] text-zinc-500 font-semibold">${s.position || s.role || '—'}</p>
                </div>
            </div>
        </td>
        <td class="py-3 pr-4 hidden md:table-cell text-[11px] text-zinc-400 font-semibold">${tenureDays(s.hire_date)}</td>
        <td class="py-3 pr-4 hidden lg:table-cell text-[11px] text-zinc-400 font-semibold">${appointments}</td>
        <td class="py-3 pr-4 hidden lg:table-cell text-[11px] text-white font-bold">₴${revenue.toLocaleString('uk-UA')}</td>
        <td class="py-3 pr-4">
            <span class="text-[11px] font-bold text-rose-400">${s.salary_percent || 40}%</span>
        </td>
        <td class="py-3 pr-4">${starRating(avgRating)}</td>
        <td class="py-3 pr-4">${statusBadge(s.status)}</td>
        <td class="py-3" onclick="event.stopPropagation()">
            <div class="relative inline-block">
                <button onclick="toggleActions('${s.id}')"
                    class="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/5 transition">
                    <i class="fa-solid fa-ellipsis text-xs"></i>
                </button>
                <div id="actions-${s.id}" class="actions-menu" onclick="event.stopPropagation()">
                    <div class="actions-item" onclick="openProfile('${s.id}'); closeActions()">
                        <i class="fa-solid fa-id-card w-4"></i> Картка
                    </div>
                    <div class="actions-item" onclick="editStaff('${s.id}'); closeActions()">
                        <i class="fa-solid fa-pen w-4"></i> Редагувати
                    </div>
                    <div class="actions-item" onclick="openPermissions('${s.id}'); closeActions()">
                        <i class="fa-solid fa-shield-halved w-4"></i> Доступи
                    </div>
                    ${s.status === 'active' || s.status === 'trial' ? `
                    <div class="actions-item danger" onclick="archiveStaffMember('${s.id}'); closeActions()">
                        <i class="fa-solid fa-box-archive w-4"></i> Архівувати
                    </div>` : `
                    <div class="actions-item success" onclick="activateStaff('${s.id}'); closeActions()">
                        <i class="fa-solid fa-user-check w-4"></i> Взяти у штат
                    </div>`}
                </div>
            </div>
        </td>
    </tr>`;
}

async function renderStaffTable(list) {
    const tbody = document.getElementById('staff-table-body');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-[11px] text-zinc-600 font-semibold">Нікого не знайдено</td></tr>`;
        document.getElementById('staff-count-label').textContent = '0 працівників';
        return;
    }

    // Load monthly stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const { data: appts } = await window.db
        .from('appointment_history')
        .select('staff_id, total_price')
        .gte('date', monthStart)
        .lte('date', monthEnd);

    const apptMap = {};
    (appts || []).forEach(a => {
        if (!a.staff_id) return;
        if (!apptMap[a.staff_id]) apptMap[a.staff_id] = { count: 0, revenue: 0 };
        apptMap[a.staff_id].count++;
        apptMap[a.staff_id].revenue += parseFloat(a.total_price || 0);
    });

    tbody.innerHTML = list.map(s => {
        const stat = apptMap[s.id] || { count: 0, revenue: 0 };
        return staffRow(s, stat.count, stat.revenue);
    }).join('');

    document.getElementById('staff-count-label').textContent =
        list.length + ' ' + pluralize(list.length, 'працівник', 'працівники', 'працівників');
}

function pluralize(n, one, few, many) {
    const mod10  = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return few;
    return many;
}

// ── Filter ────────────────────────────────────────────
function filterStaff() {
    const q = document.getElementById('staff-search').value.toLowerCase().trim();
    const filtered = allStaff.filter(s =>
        s.name?.toLowerCase().includes(q) || s.position?.toLowerCase().includes(q)
    );
    renderStaffTable(filtered);
}

// ══════════════════════════════════════════════════════
//  RENDER: CANDIDATES
// ══════════════════════════════════════════════════════

function candidateRow(s) {
    return `
    <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-white/3 transition cursor-pointer" onclick="openProfile('${s.id}')">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black flex-shrink-0"
             style="background:${s.color || '#818cf8'}22; color:${s.color || '#818cf8'}">
            ${getInitials(s.name)}
        </div>
        <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-white truncate">${s.name}</p>
            <p class="text-[10px] text-zinc-500 font-semibold truncate">${s.position || 'Посада не вказана'}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
            <button onclick="event.stopPropagation(); activateStaff('${s.id}')"
                class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-400/10 transition">
                Взяти
            </button>
            <button onclick="event.stopPropagation(); archiveStaffMember('${s.id}')"
                class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:bg-white/5 hover:text-zinc-400 transition">
                Архів
            </button>
        </div>
    </div>`;
}

function renderCandidates(list) {
    const el = document.getElementById('candidates-list');
    if (!list.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-4 font-semibold">Немає кандидатів</p>`;
        return;
    }
    el.innerHTML = list.map(s => candidateRow(s)).join('');
}

// ══════════════════════════════════════════════════════
//  RENDER: REVIEWS
// ══════════════════════════════════════════════════════

function reviewCard(r, showStaffName = false) {
    const stars = Array.from({length:5}, (_,i) =>
        `<i class="fa-solid fa-star text-[9px] ${i < Math.round(r.rating) ? 'star-full' : 'star-empty'}"></i>`
    ).join('');
    const date = new Date(r.created_at).toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const staffName = showStaffName && r.staff?.name ? `<span class="text-rose-400">${r.staff.name}</span> · ` : '';
    return `
    <div class="p-3 rounded-xl border border-white/5 bg-white/2">
        <div class="flex items-start justify-between gap-2 mb-1.5">
            <div>
                <p class="text-[11px] font-bold text-white">${r.client_name}</p>
                <p class="text-[9px] text-zinc-600 font-semibold">${staffName}${date}</p>
            </div>
            <div class="flex items-center gap-0.5 flex-shrink-0">${stars}</div>
        </div>
        ${r.comment ? `<p class="text-[11px] text-zinc-400 font-semibold leading-relaxed line-clamp-2">${r.comment}</p>` : ''}
    </div>`;
}

function renderReviews(list) {
    const el = document.getElementById('reviews-list');
    if (!list.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-4 font-semibold">Відгуків поки немає</p>`;
        return;
    }
    el.innerHTML = list.map(r => reviewCard(r, true)).join('');
}

// ══════════════════════════════════════════════════════
//  DRAWERS
// ══════════════════════════════════════════════════════

function openOverlay() {
    document.getElementById('drawer-overlay').classList.add('open');
}

function closeAllDrawers() {
    ['staff-drawer','archive-drawer','reviews-drawer','candidates-drawer'].forEach(id => {
        document.getElementById(id).classList.remove('open');
    });
    document.getElementById('drawer-overlay').classList.remove('open');
    editingStaffId = null;
}

// ── Add/Edit Staff Drawer ─────────────────────────────
function openStaffDrawer(staffData = null) {
    editingStaffId = staffData ? staffData.id : null;
    document.getElementById('staff-drawer-title').textContent = staffData ? 'Редагування' : 'Новий працівник';

    document.getElementById('s-name').value          = staffData?.name          || '';
    document.getElementById('s-phone').value         = staffData?.phone         || '';
    document.getElementById('s-position').value      = staffData?.position      || '';
    document.getElementById('s-role').value          = staffData?.role          || 'master';
    document.getElementById('s-status').value        = staffData?.status        || 'active';
    document.getElementById('s-hire-date').value     = staffData?.hire_date     || '';
    document.getElementById('s-salary-percent').value = staffData?.salary_percent ?? 40;
    document.getElementById('s-color').value         = staffData?.color         || '#f43f5e';
    document.getElementById('s-notes').value         = staffData?.notes         || '';
    document.getElementById('s-password').value      = '';

    document.getElementById('staff-drawer').classList.add('open');
    openOverlay();
}

function editStaff(id) {
    const s = [...allStaff, ...allCandidates, ...archiveStaff].find(s => s.id === id);
    if (s) openStaffDrawer(s);
}

window.saveStaff = async function() {
    const name = document.getElementById('s-name').value.trim();
    if (!name) { alert('Введіть ім\'я!'); return; }

    const payload = {
        name,
        phone:          document.getElementById('s-phone').value.trim() || null,
        position:       document.getElementById('s-position').value.trim() || null,
        role:           document.getElementById('s-role').value,
        status:         document.getElementById('s-status').value,
        hire_date:      document.getElementById('s-hire-date').value || null,
        salary_percent: parseInt(document.getElementById('s-salary-percent').value) || 40,
        color:          document.getElementById('s-color').value,
        notes:          document.getElementById('s-notes').value.trim() || null,
    };

    const pwd = document.getElementById('s-password').value.trim();
    if (pwd) payload.password = pwd;

    let error;
    if (editingStaffId) {
        ({ error } = await window.db.from('staff').update(payload).eq('id', editingStaffId));
    } else {
        payload.is_active = true;
        ({ error } = await window.db.from('staff').insert([payload]));
    }

    if (error) { alert('Помилка: ' + error.message); return; }
    closeAllDrawers();
    loadAll();
};

// ── Archive Drawer ────────────────────────────────────
function openArchiveDrawer() {
    renderArchiveList(archiveTab);
    document.getElementById('archive-drawer').classList.add('open');
    openOverlay();
}

window.switchArchiveTab = function(tab) {
    archiveTab = tab;
    ['fired','trial','candidate'].forEach(t => {
        document.getElementById('arch-tab-' + t).classList.toggle('active', t === tab);
    });
    renderArchiveList(tab);
};

function renderArchiveList(tab) {
    let list;
    if (tab === 'fired')     list = archiveStaff;
    else if (tab === 'trial') list = allStaff.filter(s => s.status === 'trial');
    else                      list = allCandidates;

    const el = document.getElementById('archive-list');
    if (!list.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Порожньо</p>`;
        return;
    }
    el.innerHTML = list.map(s => `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/2">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black flex-shrink-0"
                 style="background:${s.color||'#f43f5e'}22; color:${s.color||'#f43f5e'}">
                ${getInitials(s.name)}
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${s.name}</p>
                <p class="text-[10px] text-zinc-500 font-semibold">${s.position || s.role || '—'}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <button onclick="editStaff('${s.id}')"
                    class="px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:bg-white/5 hover:text-white transition">
                    <i class="fa-solid fa-pen text-[9px]"></i>
                </button>
                ${tab !== 'active' ? `
                <button onclick="activateStaff('${s.id}')"
                    class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-400/10 transition">
                    Взяти
                </button>` : ''}
            </div>
        </div>
    `).join('');
}

// ── Permissions Drawer ────────────────────────────────
window.openPermissions = async function(id) {
    permStaffId = id;
    const s = [...allStaff, ...allCandidates, ...archiveStaff].find(x => x.id === id);
    document.getElementById('perm-staff-name').textContent = s?.name || '';

    const { data: perms } = await window.db
        .from('staff_permissions')
        .select('*')
        .eq('staff_id', id);

    const permMap = {};
    (perms || []).forEach(p => { permMap[p.module] = p.can_access; });

    document.getElementById('perm-list').innerHTML = MODULES.map(m => `
        <div class="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background:rgba(244,63,94,0.1)">
                    <i class="fa-solid ${m.icon} text-rose-500 text-xs"></i>
                </div>
                <span class="text-[12px] font-bold text-white">${m.label}</span>
            </div>
            <label class="perm-toggle">
                <input type="checkbox" id="perm-${m.key}" ${permMap[m.key] ? 'checked' : ''}>
                <span class="perm-slider"></span>
            </label>
        </div>
    `).join('');

    // Close other drawers but not overlay
    ['staff-drawer','archive-drawer','reviews-drawer','candidates-drawer'].forEach(id => {
        document.getElementById(id).classList.remove('open');
    });
    document.getElementById('permissions-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    // Permissions drawer needs separate close
};

window.closePermissions = function() {
    document.getElementById('permissions-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    permStaffId = null;
};

window.savePermissions = async function() {
    if (!permStaffId) return;
    const upserts = MODULES.map(m => ({
        staff_id:   permStaffId,
        module:     m.key,
        can_access: document.getElementById('perm-' + m.key)?.checked ?? false,
    }));

    const { error } = await window.db
        .from('staff_permissions')
        .upsert(upserts, { onConflict: 'staff_id,module' });

    if (error) { alert('Помилка: ' + error.message); return; }
    closePermissions();
};

// ── Reviews Drawer ────────────────────────────────────
window.openReviewsDrawer = function() {
    // Populate staff filter
    const staffSet = [...new Set(allReviews.map(r => r.staff_id))];
    const sel = document.getElementById('reviews-filter-staff');
    sel.innerHTML = '<option value="">Всі майстри</option>' +
        allStaff.filter(s => staffSet.includes(s.id)).map(s =>
            `<option value="${s.id}">${s.name}</option>`
        ).join('');

    renderAllReviews(allReviews);
    document.getElementById('reviews-drawer').classList.add('open');
    openOverlay();
};

function renderAllReviews(list) {
    const el = document.getElementById('all-reviews-list');
    if (!list.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Відгуків немає</p>`;
        return;
    }
    el.innerHTML = list.map(r => reviewCard(r, true)).join('');
}

window.filterReviews = function() {
    const q       = document.getElementById('reviews-search').value.toLowerCase().trim();
    const staffF  = document.getElementById('reviews-filter-staff').value;
    let list = allReviews;
    if (q)      list = list.filter(r => r.client_name?.toLowerCase().includes(q) || r.comment?.toLowerCase().includes(q));
    if (staffF) list = list.filter(r => r.staff_id === staffF);
    renderAllReviews(list);
};

// ── Candidates Drawer ─────────────────────────────────
window.openCandidatesDrawer = function() {
    const el = document.getElementById('all-candidates-list');
    if (!allCandidates.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Кандидатів немає</p>`;
    } else {
        el.innerHTML = allCandidates.map(s => candidateRow(s)).join('');
    }
    document.getElementById('candidates-drawer').classList.add('open');
    openOverlay();
};

// ══════════════════════════════════════════════════════
//  ACTIONS DROPDOWN
// ══════════════════════════════════════════════════════

function toggleActions(id) {
    const menu = document.getElementById('actions-' + id);
    const isOpen = menu.classList.contains('open');
    closeActions();
    if (!isOpen) menu.classList.add('open');
}

function closeActions() {
    document.querySelectorAll('.actions-menu.open').forEach(m => m.classList.remove('open'));
}

document.addEventListener('click', () => closeActions());

// ── Archive / Activate ────────────────────────────────
window.archiveStaffMember = async function(id) {
    if (!confirm('Архівувати цього працівника?')) return;
    const { error } = await window.db
        .from('staff')
        .update({ status: 'fired' })
        .eq('id', id);
    if (error) { alert(error.message); return; }
    loadAll();
};

window.activateStaff = async function(id) {
    const { error } = await window.db
        .from('staff')
        .update({ status: 'active', is_active: true })
        .eq('id', id);
    if (error) { alert(error.message); return; }
    closeAllDrawers();
    loadAll();
};

// ══════════════════════════════════════════════════════
//  PROFILE MODAL
// ══════════════════════════════════════════════════════

window.openProfile = async function(id) {
    const s = [...allStaff, ...allCandidates, ...archiveStaff].find(x => x.id === id);
    if (!s) return;
    modalStaffData = s;
    modalTab = 'info';

    // Avatar
    const avatar = document.getElementById('modal-avatar');
    avatar.textContent = getInitials(s.name);
    avatar.style.background = (s.color || '#f43f5e') + '22';
    avatar.style.border      = '2px solid ' + (s.color || '#f43f5e') + '55';
    avatar.style.color        = s.color || '#f43f5e';

    document.getElementById('modal-name').textContent     = s.name;
    document.getElementById('modal-position').textContent = s.position || s.role || '—';
    document.getElementById('modal-phone').textContent    = s.phone || '—';
    document.getElementById('modal-hire-date').textContent = s.hire_date
        ? new Date(s.hire_date).toLocaleDateString('uk-UA') : '—';
    document.getElementById('modal-tenure').textContent   = tenureDays(s.hire_date);
    document.getElementById('modal-salary').textContent   = (s.salary_percent || 40) + '%';
    document.getElementById('modal-notes').textContent    = s.notes || 'Немає нотаток';

    // Rating from reviews
    const myRevs = allReviews.filter(r => r.staff_id === id);
    const avgR = myRevs.length
        ? (myRevs.reduce((s, r) => s + parseFloat(r.rating), 0) / myRevs.length).toFixed(1)
        : '—';
    document.getElementById('modal-rating').textContent = avgR === '—' ? '—' : '⭐ ' + avgR;

    // Status badge
    document.getElementById('modal-status-badge').innerHTML = statusBadge(s.status);

    // Reset tabs
    switchModalTab('info');

    document.getElementById('profile-modal').classList.add('open');
};

window.closeProfileModal = function() {
    document.getElementById('profile-modal').classList.remove('open');
    if (modalChart) { modalChart.destroy(); modalChart = null; }
    modalStaffData = null;
};

window.switchModalTab = function(tab) {
    modalTab = tab;
    ['info','chart','reviews'].forEach(t => {
        document.getElementById('modal-tab-'   + t).classList.toggle('active', t === tab);
        document.getElementById('modal-' + t + '-tab').classList.toggle('hidden', t !== tab);
    });

    if (tab === 'chart' && modalStaffData) {
        renderModalChart(modalStaffData.id);
    }
    if (tab === 'reviews' && modalStaffData) {
        const myRevs = allReviews.filter(r => r.staff_id === modalStaffData.id);
        const el = document.getElementById('modal-reviews-list');
        el.innerHTML = myRevs.length
            ? myRevs.map(r => reviewCard(r, false)).join('')
            : `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Відгуків немає</p>`;
    }
};

async function renderModalChart(staffId) {
    if (modalChart) { modalChart.destroy(); modalChart = null; }

    const now = new Date();
    const labels = [];
    const values = [];

    // Last 6 months
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = d.toISOString().slice(0, 10);
        const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
        labels.push(d.toLocaleDateString('uk-UA', { month: 'short' }));

        const { data } = await window.db
            .from('appointment_history')
            .select('total_price')
            .eq('staff_id', staffId)
            .gte('date', start)
            .lte('date', end);

        values.push((data || []).reduce((s, r) => s + parseFloat(r.total_price || 0), 0));
    }

    const ctx = document.getElementById('modal-revenue-chart').getContext('2d');
    modalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Виручка ₴',
                data: values,
                backgroundColor: 'rgba(244,63,94,0.2)',
                borderColor: '#f43f5e',
                borderWidth: 2,
                borderRadius: 8,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color:'#52525b', font:{size:10,family:'Manrope'} }, grid:{ display:false } },
                y: { ticks: { color:'#52525b', font:{size:10,family:'Manrope'}, callback: v => '₴'+v.toLocaleString('uk-UA') }, grid:{ color:'rgba(255,255,255,0.03)' } }
            }
        }
    });
}

// ══════════════════════════════════════════════════════
//  REPORT DOWNLOAD
// ══════════════════════════════════════════════════════

window.downloadLastMonthReport = async function() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0);
    const start = firstDay.toISOString().slice(0, 10);
    const end   = lastDay.toISOString().slice(0, 10);

    const monthLabel = firstDay.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

    // Fetch all appointments for last month
    const { data: appts } = await window.db
        .from('appointment_history')
        .select('date, staff_id, total_price, service_name, payment_type')
        .gte('date', start)
        .lte('date', end)
        .order('date');

    // Build staff map
    const staffMap = {};
    [...allStaff, ...archiveStaff].forEach(s => { staffMap[s.id] = s; });

    // Group by staff
    const report = {};
    (appts || []).forEach(a => {
        const s = staffMap[a.staff_id];
        const name = s?.name || 'Невідомий';
        if (!report[name]) report[name] = { name, position: s?.position || '—', salary_percent: s?.salary_percent || 40, appointments: 0, revenue: 0 };
        report[name].appointments++;
        report[name].revenue += parseFloat(a.total_price || 0);
    });

    const rows = Object.values(report).map(r => ({
        ...r,
        payroll: Math.round(r.revenue * r.salary_percent / 100)
    }));

    // CSV
    const BOM = '\uFEFF';
    const headers = ['Майстер','Посада','Записів','Виручка (₴)','% ЗП','Нарахування (₴)'];
    const csv = BOM + [
        headers.join(';'),
        ...rows.map(r => [r.name, r.position, r.appointments, r.revenue.toFixed(2), r.salary_percent + '%', r.payroll.toFixed(2)].join(';'))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Звіт_персонал_${monthLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};
