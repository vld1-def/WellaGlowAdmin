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
let allStaff       = [];
let allReviews     = [];
let allCandidates  = [];
let editingStaffId = null;
let permStaffId    = null;
let modalStaffData = null;
let archiveTab     = 'fired';
let modalTab       = 'info';
let modalChart     = null;
let archiveStaff   = [];
let staffVisibleCount = 5;
let teamSchedWeek  = new Date();

// Sorting + pinning
let staffSortBy  = 'pin';   // 'pin'|'role'|'tenure'|'appointments'|'earnings'
let staffSortDir = 'asc';
let pinnedIds    = new Set(JSON.parse(localStorage.getItem('wella_pinned') || '[]'));
let staffApptMap = {};      // cached per-staff stats for sorting

// Role access
let roleAccessTab = 'admin';
const ROLE_DEFAULTS = {
    admin:  { dashboard:true,  calendar:true,  finance:true,  clients:true,  inventory:true,  staff:true,  bonuses:true  },
    master: { dashboard:false, calendar:true,  finance:false, clients:false, inventory:false, staff:false, bonuses:false },
};

const MODULES = [
    { key: 'dashboard',  label: 'Дашборд',   icon: 'fa-chart-pie'      },
    { key: 'calendar',   label: 'Записи',     icon: 'fa-calendar-check' },
    { key: 'finance',    label: 'Фінанси',    icon: 'fa-wallet'         },
    { key: 'clients',    label: 'Клієнти',    icon: 'fa-address-book'   },
    { key: 'inventory',  label: 'Склад',      icon: 'fa-boxes-stacked'  },
    { key: 'staff',      label: 'Персонал',   icon: 'fa-users-gear'     },
    { key: 'bonuses',    label: 'Бонуси',     icon: 'fa-gift'           },
];

// Deterministic avatar color from staff id (no DB column needed)
const AVATAR_COLORS = ['#f43f5e','#fb923c','#facc15','#4ade80','#34d399','#22d3ee','#818cf8','#c084fc','#f472b6'];
function getAvatarColor(s) {
    const hash = (s.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// Timezone-safe local date string (avoids UTC shift on toISOString)
function localDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ── Month Selector (sidebar) ─────────────────────────
const _MONTHS_UA=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
function initSidebarMonth(){
    let ym=localStorage.getItem('wella_current_month');
    if(!ym){const n=new Date();ym=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
    localStorage.setItem('wella_current_month',ym);
    const[y,m]=ym.split('-').map(Number);
    const el=document.getElementById('sidebar-month-label');
    if(el)el.textContent=`${_MONTHS_UA[m-1]} ${y}`;
}
window.monthStep=function(dir){
    let ym=localStorage.getItem('wella_current_month')||`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    let[y,m]=ym.split('-').map(Number);
    m+=dir;if(m>12){m=1;y++;}if(m<1){m=12;y--;}
    const next=`${y}-${String(m).padStart(2,'0')}`;
    localStorage.setItem('wella_current_month',next);
    const[ny,nm]=next.split('-').map(Number);
    const el=document.getElementById('sidebar-month-label');
    if(el)el.textContent=`${_MONTHS_UA[nm-1]} ${ny}`;
    window.dispatchEvent(new Event('monthchange'));
};

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initSidebarMonth();
    initColState();
    loadAll();
});

// Reload KPIs when month selector changes
window.addEventListener('monthchange', () => loadKPIs());

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

    // Support both status column (new) and is_active fallback (existing)
    const getStatus = s => s.status || (s.is_active ? 'active' : 'fired');

    allStaff      = all.filter(s => ['active','trial'].includes(getStatus(s)));
    allCandidates = all.filter(s => getStatus(s) === 'candidate');
    archiveStaff  = all.filter(s => getStatus(s) === 'fired');

    // Normalise status field on each record for uniform use downstream
    all.forEach(s => { if (!s.status) s.status = getStatus(s); });

    document.getElementById('active-count').textContent =
        allStaff.filter(s => s.status === 'active').length;

    renderStaffTable(allStaff);
    renderCandidates(allCandidates.slice(0, 5));
}

async function loadReviews() {
    const { data, error } = await window.db
        .from('reviews')
        .select('*, staff:staff_id(name), client:client_id(full_name)')
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
        const eff = (avg / 5 * 10).toFixed(1);
        document.getElementById('kpi-efficiency').innerHTML =
            eff + '<span class="text-sm text-zinc-500 font-semibold">/10</span>';
    } else {
        document.getElementById('kpi-rating').innerHTML =
            '—<span class="text-sm text-zinc-500 font-semibold"> / 5.0</span>';
    }

    // Payroll fund = avg commission_rate % of monthly revenue
    const now = new Date();
    const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd   = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const [apptRes, paidRes] = await Promise.all([
        window.db.from('appointment_history')
            .select('master_id, price')
            .gte('visit_date', monthStart)
            .lte('visit_date', monthEnd),
        window.db.from('transactions')
            .select('amount, staff_id')
            .eq('type', 'expense')
            .eq('category', 'salary')
            .gte('date', monthStart)
            .lte('date', monthEnd),
    ]);

    // Payroll: sum each master's actual earned (their revenue × their commission rate)
    const apptRows = apptRes.data || [];
    const staffMap = {};
    [...allStaff, ...archiveStaff].forEach(s => { staffMap[s.id] = s; });
    let fund = 0;
    apptRows.forEach(a => {
        const s = staffMap[a.master_id];
        const pct = s?.commission_rate || 40;
        fund += parseFloat(a.price || 0) * pct / 100;
    });

    // Subtract already-paid salary this month
    const paid = (paidRes.data || []).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const remaining = Math.max(0, Math.round(fund) - Math.round(paid));
    document.getElementById('kpi-payroll').textContent = '₴' + remaining.toLocaleString('uk-UA');
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function avatarEl(s, size = 'w-9 h-9', textSize = 'text-[11px]') {
    const color = getAvatarColor(s);
    if (s.avatar_url) {
        return `<img src="${s.avatar_url}" alt="${s.name}"
                    class="${size} rounded-xl object-cover flex-shrink-0"
                    onerror="this.outerHTML=fallbackAvatar('${s.id}','${s.name}','${size}','${textSize}')">`;
    }
    return `<div class="${size} rounded-xl flex items-center justify-center ${textSize} font-black flex-shrink-0"
                 style="background:${color}22; border:1.5px solid ${color}55; color:${color}">
                ${getInitials(s.name)}
            </div>`;
}

window.fallbackAvatar = function(id, name, size, textSize) {
    const color = AVATAR_COLORS[(id || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % AVATAR_COLORS.length];
    return `<div class="${size} rounded-xl flex items-center justify-center ${textSize} font-black flex-shrink-0"
                 style="background:${color}22;border:1.5px solid ${color}55;color:${color}">
                ${(name||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')}
            </div>`;
};

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
    if (rating === null || rating === undefined) return '<span class="text-[10px] text-zinc-600">—</span>';
    const full = Math.round(parseFloat(rating));
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

function pluralize(n, one, few, many) {
    const mod10  = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return few;
    return many;
}

function getClientName(r) {
    return r.client?.full_name || 'Клієнт';
}

// ══════════════════════════════════════════════════════
//  RENDER: STAFF TABLE
// ══════════════════════════════════════════════════════

function staffRow(s, appointments = 0, revenue = 0, weekRevenue = 0) {
    const revs = allReviews.filter(r => r.staff_id === s.id);
    const avgRating = revs.length
        ? revs.reduce((sum, r) => sum + parseFloat(r.rating), 0) / revs.length
        : null;
    const earned     = Math.round(revenue     * (s.commission_rate || 40) / 100);
    const weekEarned = Math.round(weekRevenue * (s.commission_rate || 40) / 100);
    const isPinned = pinnedIds.has(s.id);

    return `
    <tr class="staff-row hover:bg-white/2 transition cursor-pointer" onclick="openProfile('${s.id}')">
        <td class="py-3 pr-4">
            <div class="flex items-center gap-3">
                ${avatarEl(s)}
                <div>
                    <p class="text-[12px] font-bold text-white leading-tight">${s.name}</p>
                    <p class="text-[10px] text-zinc-500 font-semibold">${s.position || s.role || '—'}</p>
                </div>
            </div>
        </td>
        <td class="sc-tenure  py-3 pr-4 hidden md:table-cell text-[11px] text-zinc-400 font-semibold">${tenureDays(s.hire_date)}</td>
        <td class="sc-appt    py-3 pr-4 hidden lg:table-cell text-[11px] text-zinc-400 font-semibold">${appointments}</td>
        <td class="sc-revenue py-3 pr-4 hidden lg:table-cell text-[11px] text-white font-bold">₴${revenue.toLocaleString('uk-UA')}</td>
        <td class="sc-earned  py-3 pr-4 hidden lg:table-cell text-[11px] text-emerald-400 font-bold">₴${earned.toLocaleString('uk-UA')}</td>
        <td class="sc-wrev    py-3 pr-4 hidden lg:table-cell text-[11px] font-bold" style="color:#f59e0b">₴${weekRevenue.toLocaleString('uk-UA')}</td>
        <td class="sc-wearn   py-3 pr-4 hidden lg:table-cell text-[11px] font-bold" style="color:#22d3ee">₴${weekEarned.toLocaleString('uk-UA')}</td>
        <td class="sc-rate    py-3 pr-4">
            <span class="text-[11px] font-bold text-rose-400">${s.commission_rate || 40}%</span>
        </td>
        <td class="sc-rating  py-3 pr-4">${starRating(avgRating)}</td>
        <td class="sc-status  py-3 pr-4">${statusBadge(s.status)}</td>
        <td class="py-3" onclick="event.stopPropagation()">
            <div class="flex items-center gap-1">
                <button onclick="togglePin('${s.id}')" title="${isPinned?'Відкріпити':'Закріпити'}"
                    class="w-7 h-7 rounded-lg flex items-center justify-center transition ${isPinned?'text-rose-500 bg-rose-500/10':'text-zinc-700 hover:text-zinc-400 hover:bg-white/5'}">
                    <i class="fa-solid fa-thumbtack text-[9px]"></i>
                </button>
                <button onclick="toggleActions('${s.id}', this)"
                    class="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/5 transition">
                    <i class="fa-solid fa-ellipsis text-xs"></i>
                </button>
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

    const now = new Date();
    const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd   = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    // Week: Mon–Sun of current week
    const dow = now.getDay() || 7;
    const weekStart = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow - 1)));
    const weekEnd   = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dow)));

    // Query both appointment_history (completed) and appointments (active/upcoming)
    const [{ data: histMonth }, { data: histWeek }, { data: activeMonth }, { data: activeWeek }] = await Promise.all([
        window.db.from('appointment_history').select('master_id, price').gte('visit_date', monthStart).lte('visit_date', monthEnd),
        window.db.from('appointment_history').select('master_id, price').gte('visit_date', weekStart).lte('visit_date', weekEnd),
        window.db.from('appointments').select('master_id, price').gte('appointment_date', monthStart).lte('appointment_date', monthEnd).in('status',['done','completed']),
        window.db.from('appointments').select('master_id, price').gte('appointment_date', weekStart).lte('appointment_date', weekEnd).in('status',['done','completed']),
    ]);
    const appts    = [...(histMonth||[]), ...(activeMonth||[])];
    const weekAppts = [...(histWeek||[]),  ...(activeWeek||[])];

    const apptMap = {};
    (appts || []).forEach(a => {
        if (!a.master_id) return;
        if (!apptMap[a.master_id]) apptMap[a.master_id] = { count: 0, revenue: 0, weekRevenue: 0 };
        apptMap[a.master_id].count++;
        apptMap[a.master_id].revenue += parseFloat(a.price || 0);
    });
    (weekAppts || []).forEach(a => {
        if (!a.master_id) return;
        if (!apptMap[a.master_id]) apptMap[a.master_id] = { count: 0, revenue: 0, weekRevenue: 0 };
        apptMap[a.master_id].weekRevenue = (apptMap[a.master_id].weekRevenue || 0) + parseFloat(a.price || 0);
    });
    staffApptMap = apptMap; // cache for sort

    // Sort
    const ROLE_ORDER = { owner: 0, admin: 1, master: 2 };
    const sorted = [...list].sort((a, b) => {
        // Pinned always first
        const ap = pinnedIds.has(a.id) ? 0 : 1;
        const bp = pinnedIds.has(b.id) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (staffSortBy === 'pin') return 0;
        let va, vb;
        if (staffSortBy === 'role') {
            va = ROLE_ORDER[a.role] ?? 9; vb = ROLE_ORDER[b.role] ?? 9;
        } else if (staffSortBy === 'tenure') {
            va = a.hire_date ? new Date(a.hire_date).getTime() : Infinity;
            vb = b.hire_date ? new Date(b.hire_date).getTime() : Infinity;
            // earlier hire = more tenure = should sort first in 'asc'
            return staffSortDir === 'asc' ? va - vb : vb - va;
        } else if (staffSortBy === 'appointments') {
            va = apptMap[a.id]?.count || 0; vb = apptMap[b.id]?.count || 0;
        } else if (staffSortBy === 'earnings') {
            const ra = apptMap[a.id]?.revenue || 0;
            const rb = apptMap[b.id]?.revenue || 0;
            va = ra * (a.commission_rate || 40) / 100;
            vb = rb * (b.commission_rate || 40) / 100;
        } else { return 0; }
        return staffSortDir === 'asc' ? va - vb : vb - va;
    });

    const visible = sorted.slice(0, staffVisibleCount);
    tbody.innerHTML = visible.map(s => {
        const stat = apptMap[s.id] || { count: 0, revenue: 0, weekRevenue: 0 };
        return staffRow(s, stat.count, stat.revenue, stat.weekRevenue || 0);
    }).join('');

    // "Load more" row
    if (sorted.length > staffVisibleCount) {
        const remaining = sorted.length - staffVisibleCount;
        tbody.insertAdjacentHTML('beforeend', `
            <tr id="load-more-row">
                <td colspan="9" class="pt-3 pb-1 text-center">
                    <button onclick="loadMoreStaff()" class="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition">
                        Завантажити ще ${remaining} →
                    </button>
                </td>
            </tr>`);
    }

    document.getElementById('staff-count-label').textContent =
        list.length + ' ' + pluralize(list.length, 'працівник', 'працівники', 'працівників');
}

// ── Report dropdown ───────────────────────────────────
window.toggleReportDropdown = function() {
    const dd = document.getElementById('report-dropdown');
    dd.classList.toggle('hidden');
};

// ── Column toggle ─────────────────────────────────────
const STAFF_COLS = [
    { id: 'tenure',  label: 'Стаж',             def: true },
    { id: 'appt',    label: 'Записи (міс.)',     def: true },
    { id: 'revenue', label: 'Принесено (міс.)',  def: true },
    { id: 'earned',  label: 'Зароблено (міс.)',  def: true },
    { id: 'wrev',    label: 'Принесено (тиж.)',  def: true },
    { id: 'wearn',   label: 'Зароблено (тиж.)',  def: false },
    { id: 'rate',    label: '% ЗП',              def: true },
    { id: 'rating',  label: 'Рейтинг',           def: true },
    { id: 'status',  label: 'Статус',            def: true },
];
let colState = {};
function initColState() {
    const saved = JSON.parse(localStorage.getItem('wella_staff_cols') || '{}');
    STAFF_COLS.forEach(c => { colState[c.id] = c.id in saved ? saved[c.id] : c.def; });
    applyColState();
}
function applyColState() {
    const tbl = document.getElementById('staff-table');
    if (!tbl) return;
    STAFF_COLS.forEach(c => tbl.classList.toggle(`hide-${c.id}`, !colState[c.id]));
    // Render checkbox list
    const dd = document.getElementById('col-dropdown');
    if (dd) {
        dd.innerHTML = STAFF_COLS.map(c => `
            <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                <input type="checkbox" ${colState[c.id]?'checked':''} onchange="toggleCol('${c.id}',this.checked)"
                    class="accent-rose-500 w-3 h-3">
                <span class="text-[10px] font-bold text-zinc-400">${c.label}</span>
            </label>`).join('');
    }
    localStorage.setItem('wella_staff_cols', JSON.stringify(colState));
}
window.toggleCol = function(id, val) {
    colState[id] = val;
    applyColState();
};
window.toggleColDropdown = function() {
    document.getElementById('col-dropdown').classList.toggle('hidden');
};

document.addEventListener('click', e => {
    if (!e.target.closest('#report-dropdown-wrap')) {
        document.getElementById('report-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#col-toggle-wrap')) {
        document.getElementById('col-dropdown')?.classList.add('hidden');
    }
});

async function buildMonthReportData() {
    const now = new Date();
    const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd   = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const { data: appts } = await window.db
        .from('appointment_history').select('master_id, price')
        .gte('visit_date', monthStart).lte('visit_date', monthEnd);
    const apptMap = {};
    (appts || []).forEach(a => {
        if (!a.master_id) return;
        if (!apptMap[a.master_id]) apptMap[a.master_id] = { count: 0, revenue: 0 };
        apptMap[a.master_id].count++;
        apptMap[a.master_id].revenue += parseFloat(a.price || 0);
    });
    return { apptMap, month: now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }) };
}

window.downloadLastMonthCSV = async function() {
    const { apptMap, month } = await buildMonthReportData();
    let csv = `Звіт персоналу — ${month}\n`;
    csv += 'Майстер,Посада,Записи,Виручка (₴),Зароблено (₴),% ЗП\n';
    allStaff.forEach(s => {
        const stat = apptMap[s.id] || { count: 0, revenue: 0 };
        const earned = Math.round(stat.revenue * (s.commission_rate || 40) / 100);
        csv += `"${s.name}","${s.position||s.role||''}",${stat.count},${stat.revenue.toFixed(2)},${earned},${s.commission_rate||40}%\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `staff_report_${new Date().getFullYear()}_${String(new Date().getMonth()+1).padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

window.downloadLastMonthPDF = async function() {
    const { apptMap, month } = await buildMonthReportData();
    const rows = allStaff.map((s, i) => {
        const stat = apptMap[s.id] || { count: 0, revenue: 0 };
        const earned = Math.round(stat.revenue * (s.commission_rate || 40) / 100);
        return `<tr>
            <td>${i+1}</td><td>${s.name}</td><td>${s.position||s.role||'—'}</td>
            <td style="text-align:right">${stat.count}</td>
            <td style="text-align:right">₴${stat.revenue.toLocaleString('uk-UA')}</td>
            <td style="text-align:right">₴${earned.toLocaleString('uk-UA')}</td>
            <td style="text-align:right">${s.commission_rate||40}%</td>
        </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h2{margin-bottom:4px}
        p{color:#666;font-size:13px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse}
        th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:left}
        th{background:#f9fafb;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
        </style></head><body>
        <h2>Звіт персоналу</h2><p>${month} · Дата: ${new Date().toLocaleDateString('uk-UA')}</p>
        <table><thead><tr><th>#</th><th>Майстер</th><th>Посада</th>
        <th style="text-align:right">Записи</th><th style="text-align:right">Виручка</th>
        <th style="text-align:right">Зароблено</th><th style="text-align:right">% ЗП</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <script>window.onload=()=>{window.print();}<\/script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
};

window.loadMoreStaff = function() {
    staffVisibleCount += 5;
    const q = document.getElementById('staff-search').value.toLowerCase().trim();
    const filtered = q
        ? allStaff.filter(s => s.name?.toLowerCase().includes(q) || s.position?.toLowerCase().includes(q))
        : allStaff;
    renderStaffTable(filtered);
};

function filterStaff() {
    staffVisibleCount = 5;
    const q = document.getElementById('staff-search').value.toLowerCase().trim();
    const filtered = allStaff.filter(s =>
        s.name?.toLowerCase().includes(q) || s.position?.toLowerCase().includes(q)
    );
    renderStaffTable(filtered);
}

window.setStaffSort = function(by) {
    if (staffSortBy === by && by !== 'pin') {
        staffSortDir = staffSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        staffSortBy = by;
        staffSortDir = by === 'tenure' ? 'asc' : 'desc';
    }
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('sort-' + by)?.classList.add('active');
    staffVisibleCount = 5;
    filterStaff();
};

window.togglePin = function(id) {
    if (pinnedIds.has(id)) pinnedIds.delete(id);
    else pinnedIds.add(id);
    localStorage.setItem('wella_pinned', JSON.stringify([...pinnedIds]));
    filterStaff();
};

// ══════════════════════════════════════════════════════
//  ROLE ACCESS DRAWER
// ══════════════════════════════════════════════════════

window.openRoleAccess = function() {
    roleAccessTab = 'admin';
    document.getElementById('rtab-admin').classList.add('active');
    renderRolePermList('admin');
    document.getElementById('role-access-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
};

window.closeRoleAccess = function() {
    document.getElementById('role-access-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
};

window.switchRoleTab = function(role) {
    roleAccessTab = role;
    document.getElementById('rtab-admin').classList.toggle('active', role === 'admin');
    renderRolePermList(role);
};

function renderRolePermList(role) {
    const saved = JSON.parse(localStorage.getItem('wella_role_perms_' + role) || 'null');
    const perms = saved || ROLE_DEFAULTS[role] || {};
    document.getElementById('role-perm-list').innerHTML = MODULES.map(m => `
        <div class="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background:rgba(244,63,94,0.1)">
                    <i class="fa-solid ${m.icon} text-rose-500 text-xs"></i>
                </div>
                <span class="text-[12px] font-bold text-white">${m.label}</span>
            </div>
            <label class="perm-toggle">
                <input type="checkbox" id="rperm-${m.key}" ${perms[m.key] ? 'checked' : ''}>
                <span class="perm-slider"></span>
            </label>
        </div>
    `).join('');
}

window.saveRolePermissions = function() {
    const perms = {};
    MODULES.forEach(m => { perms[m.key] = document.getElementById('rperm-' + m.key)?.checked ?? false; });
    localStorage.setItem('wella_role_perms_' + roleAccessTab, JSON.stringify(perms));
    closeRoleAccess();
    // Show brief confirmation
    const btn = document.querySelector('#role-access-drawer .neo-gradient');
    if (btn) { btn.textContent = 'Збережено ✓'; setTimeout(() => { btn.textContent = 'Зберегти'; }, 1500); }
};

// ══════════════════════════════════════════════════════
//  RENDER: CANDIDATES
// ══════════════════════════════════════════════════════

function candidateRow(s) {
    return `
    <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-white/3 transition cursor-pointer" onclick="openProfile('${s.id}')">
        ${avatarEl(s, 'w-8 h-8', 'text-[10px]')}
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
    const clientName = getClientName(r);
    const hasAppt = r.appointment_id;
    return `
    <div class="p-3 rounded-xl border border-white/5 bg-white/2 ${hasAppt ? 'cursor-pointer hover:border-white/10 hover:bg-white/3 transition' : ''}"
         ${hasAppt ? `onclick="showReviewAppt('${r.appointment_id}')"` : ''}>
        <div class="flex items-start justify-between gap-2 mb-1.5">
            <div>
                <p class="text-[11px] font-bold text-white">${clientName}</p>
                <p class="text-[9px] text-zinc-600 font-semibold">${staffName}${date}</p>
            </div>
            <div class="flex items-center gap-0.5 flex-shrink-0">
                ${stars}
                ${hasAppt ? '<i class="fa-solid fa-chevron-right text-[8px] text-zinc-600 ml-1.5"></i>' : ''}
            </div>
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
//  PHOTO UPLOAD
// ══════════════════════════════════════════════════════

window.previewPhoto = function(input) {
    const file = input.files[0];
    if (!file) return;
    // Resize + convert to base64 for storage directly in avatar_url column
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const MAX = 256; // max px on longest side
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        else if (w > MAX) { w = MAX; h = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const b64 = canvas.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        // Show preview
        const preview = document.getElementById('s-avatar-preview');
        preview.innerHTML = `<img src="${b64}" class="w-full h-full object-cover">`;
        // Cache so saveStaff() can read it without re-reading the file
        input._base64 = b64;
    };
    img.src = url;
};

// Returns base64 string (stored directly in staff.avatar_url — no Storage bucket needed)
function getPhotoBase64() {
    const input = document.getElementById('s-photo');
    return input._base64 || null;
}

// ══════════════════════════════════════════════════════
//  DRAWERS
// ══════════════════════════════════════════════════════

function openOverlay() {
    document.getElementById('drawer-overlay').classList.add('open');
}

function closeAllDrawers() {
    ['staff-drawer','archive-drawer','reviews-drawer','candidates-drawer','role-access-drawer'].forEach(id => {
        document.getElementById(id).classList.remove('open');
    });
    document.getElementById('drawer-overlay').classList.remove('open');
    editingStaffId = null;
}

// ── Add/Edit Staff Drawer ─────────────────────────────
function openStaffDrawer(staffData = null) {
    editingStaffId = staffData ? staffData.id : null;
    document.getElementById('staff-drawer-title').textContent = staffData ? 'Редагування' : 'Новий працівник';

    document.getElementById('s-name').value           = staffData?.name            || '';
    document.getElementById('s-phone').value          = staffData?.phone           || '';
    document.getElementById('s-position').value       = staffData?.position        || '';
    document.getElementById('s-role').value           = staffData?.role            || 'master';
    document.getElementById('s-status').value         = staffData?.status          || 'active';
    document.getElementById('s-hire-date').value      = staffData?.hire_date       || '';
    document.getElementById('s-salary-percent').value = staffData?.commission_rate ?? 40;
    document.getElementById('s-notes').value          = staffData?.notes           || '';
    document.getElementById('s-password').value       = '';
    document.getElementById('s-photo').value          = '';

    // Avatar preview
    const preview = document.getElementById('s-avatar-preview');
    if (staffData?.avatar_url) {
        preview.innerHTML = `<img src="${staffData.avatar_url}" class="w-full h-full object-cover">`;
    } else {
        const color = staffData ? getAvatarColor(staffData) : '#f43f5e';
        preview.style.background = color + '22';
        preview.style.color = color;
        preview.innerHTML = staffData ? getInitials(staffData.name) : '?';
    }

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

    const commissionRate = parseInt(document.getElementById('s-salary-percent').value) || 40;
    const statusVal      = document.getElementById('s-status').value;

    const payload = {
        name,
        phone:           document.getElementById('s-phone').value.trim() || null,
        position:        document.getElementById('s-position').value.trim() || null,
        role:            document.getElementById('s-role').value,
        status:          statusVal,
        is_active:       statusVal === 'active',
        hire_date:       document.getElementById('s-hire-date').value || null,
        commission_rate: commissionRate,
        notes:           document.getElementById('s-notes').value.trim() || null,
    };

    const pwd = document.getElementById('s-password').value.trim();
    if (pwd) payload.password = pwd;

    let savedId = editingStaffId;
    let error;

    if (editingStaffId) {
        ({ error } = await window.db.from('staff').update(payload).eq('id', editingStaffId));
    } else {
        const { data, error: insErr } = await window.db.from('staff').insert([payload]).select().single();
        error = insErr;
        if (data) savedId = data.id;
    }

    if (error) { alert('Помилка: ' + error.message); return; }

    // Save photo as base64 directly into avatar_url (no Storage bucket needed)
    const base64 = getPhotoBase64();
    if (base64 && savedId) {
        await window.db.from('staff').update({ avatar_url: base64 }).eq('id', savedId);
    }

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
    if (tab === 'fired')      list = archiveStaff;
    else if (tab === 'trial') list = allStaff.filter(s => s.status === 'trial');
    else                       list = allCandidates;

    const el = document.getElementById('archive-list');
    if (!list.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Порожньо</p>`;
        return;
    }
    el.innerHTML = list.map(s => `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/2">
            ${avatarEl(s, 'w-8 h-8', 'text-[10px]')}
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

    ['staff-drawer','archive-drawer','reviews-drawer','candidates-drawer'].forEach(id => {
        document.getElementById(id).classList.remove('open');
    });
    document.getElementById('permissions-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
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
    const q      = document.getElementById('reviews-search').value.toLowerCase().trim();
    const staffF = document.getElementById('reviews-filter-staff').value;
    let list = allReviews;
    if (q)      list = list.filter(r => getClientName(r).toLowerCase().includes(q) || r.comment?.toLowerCase().includes(q));
    if (staffF) list = list.filter(r => r.staff_id === staffF);
    renderAllReviews(list);
};

// ── Candidates Drawer ─────────────────────────────────
window.openCandidatesDrawer = function() {
    const el = document.getElementById('all-candidates-list');
    el.innerHTML = allCandidates.length
        ? allCandidates.map(s => candidateRow(s)).join('')
        : `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Кандидатів немає</p>`;
    document.getElementById('candidates-drawer').classList.add('open');
    openOverlay();
};

// ══════════════════════════════════════════════════════
//  ACTIONS DROPDOWN — portal rendered at <body> level
//  Avoids backdrop-filter stacking context on .glass-panel
// ══════════════════════════════════════════════════════

let _actionsOpenId = null;

function toggleActions(id, btn) {
    if (_actionsOpenId === id) { closeActions(); return; }
    closeActions();

    const s = [...allStaff, ...allCandidates, ...archiveStaff].find(x => x.id === id);
    if (!s) return;

    const archiveOrActivate = (s.status === 'active' || s.status === 'trial')
        ? `<div class="actions-item danger" onclick="archiveStaffMember('${id}'); closeActions()">
               <i class="fa-solid fa-box-archive w-4"></i> Архівувати
           </div>`
        : `<div class="actions-item success" onclick="activateStaff('${id}'); closeActions()">
               <i class="fa-solid fa-user-check w-4"></i> Взяти у штат
           </div>`;

    const portal = document.getElementById('actions-portal');
    portal.innerHTML = `
        <div class="actions-item" onclick="openProfile('${id}'); closeActions()">
            <i class="fa-solid fa-id-card w-4"></i> Картка
        </div>
        <div class="actions-item" onclick="editStaff('${id}'); closeActions()">
            <i class="fa-solid fa-pen w-4"></i> Редагувати
        </div>
        <div class="actions-item" onclick="openPermissions('${id}'); closeActions()">
            <i class="fa-solid fa-shield-halved w-4"></i> Доступи
        </div>
        ${archiveOrActivate}
    `;

    const rect = btn.getBoundingClientRect();
    portal.style.top   = (rect.bottom + 6) + 'px';
    portal.style.right = (window.innerWidth - rect.right) + 'px';
    portal.style.display = 'block';
    _actionsOpenId = id;
}

function closeActions() {
    const portal = document.getElementById('actions-portal');
    if (portal) { portal.style.display = 'none'; portal.innerHTML = ''; }
    _actionsOpenId = null;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#actions-portal') && !e.target.closest('button[onclick*="toggleActions"]')) {
        closeActions();
    }
});

window.archiveStaffMember = async function(id) {
    if (!confirm('Архівувати цього працівника?')) return;
    const { error } = await window.db
        .from('staff')
        .update({ status: 'fired', is_active: false })
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

    // Avatar
    const avatarEl2 = document.getElementById('modal-avatar');
    const color = getAvatarColor(s);
    if (s.avatar_url) {
        avatarEl2.innerHTML = `<img src="${s.avatar_url}" class="w-full h-full object-cover rounded-2xl">`;
        avatarEl2.style = '';
    } else {
        avatarEl2.textContent = getInitials(s.name);
        avatarEl2.style.background = color + '22';
        avatarEl2.style.border = '2px solid ' + color + '55';
        avatarEl2.style.color  = color;
    }

    document.getElementById('modal-name').textContent     = s.name;
    document.getElementById('modal-position').textContent = s.position || s.role || '—';
    document.getElementById('modal-phone').textContent    = s.phone || '—';
    document.getElementById('modal-hire-date').textContent = s.hire_date
        ? new Date(s.hire_date).toLocaleDateString('uk-UA') : '—';
    document.getElementById('modal-tenure').textContent   = tenureDays(s.hire_date);
    document.getElementById('modal-salary').textContent   = (s.commission_rate || 40) + '%';
    document.getElementById('modal-notes').textContent    = s.notes || 'Немає нотаток';

    const myRevs = allReviews.filter(r => r.staff_id === id);
    const avgR = myRevs.length
        ? (myRevs.reduce((s, r) => s + parseFloat(r.rating), 0) / myRevs.length).toFixed(1)
        : null;
    document.getElementById('modal-rating').textContent = avgR ? '⭐ ' + avgR : '—';
    document.getElementById('modal-status-badge').innerHTML = statusBadge(s.status);

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
    ['info','chart','reviews','shifts','payments'].forEach(t => {
        document.getElementById('modal-tab-' + t)?.classList.toggle('active', t === tab);
        document.getElementById('modal-' + t + '-tab')?.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'chart'    && modalStaffData) renderModalChart(modalStaffData.id);
    if (tab === 'reviews'  && modalStaffData) {
        const myRevs = allReviews.filter(r => r.staff_id === modalStaffData.id);
        document.getElementById('modal-reviews-list').innerHTML = myRevs.length
            ? myRevs.map(r => reviewCard(r, false)).join('')
            : `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Відгуків немає</p>`;
    }
    if (tab === 'shifts'   && modalStaffData) renderModalShifts(modalStaffData.id);
    if (tab === 'payments' && modalStaffData) renderModalPayments(modalStaffData.id);
};

async function renderModalPayments(staffId) {
    const el = document.getElementById('modal-payments-list');
    el.innerHTML = `<p class="text-[10px] text-zinc-600 text-center py-4">Завантаження…</p>`;

    const { data, error } = await window.db
        .from('transactions')
        .select('date, amount, comment, payment_method, subcategory')
        .eq('type', 'expense')
        .eq('category', 'salary')
        .eq('staff_id', staffId)
        .order('date', { ascending: false })
        .limit(50);

    if (error || !data?.length) {
        el.innerHTML = `<p class="text-[11px] text-zinc-600 text-center py-6 font-semibold">Виплат не знайдено</p>`;
        return;
    }

    const fmtDate = d => new Date(d).toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric' });
    const METHOD = { cash:'Готівка', card:'Картка', transfer:'Переказ' };

    el.innerHTML = data.map(t => `
        <div class="flex items-center justify-between py-3 border-b border-white/5">
            <div>
                <p class="text-[11px] font-bold text-white">${fmtDate(t.date)}</p>
                <p class="text-[10px] text-zinc-500 mt-0.5">${t.comment || '—'}</p>
                ${t.subcategory ? `<p class="text-[9px] text-zinc-600">${t.subcategory}</p>` : ''}
            </div>
            <div class="text-right flex-shrink-0 ml-4">
                <p class="text-sm font-black text-rose-400">−₴${parseFloat(t.amount).toLocaleString('uk-UA')}</p>
                <p class="text-[9px] text-zinc-600 mt-0.5">${METHOD[t.payment_method] || t.payment_method || '—'}</p>
            </div>
        </div>`).join('');
}

async function renderModalChart(sid) {
    if (modalChart) { modalChart.destroy(); modalChart = null; }
    const now = new Date();
    const labels = [], values = [];

    for (let i = 5; i >= 0; i--) {
        const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = localDate(d);
        const end   = localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        labels.push(d.toLocaleDateString('uk-UA', { month: 'short' }));
        const [{ data: hist }, { data: active }] = await Promise.all([
            window.db.from('appointment_history').select('price').eq('master_id', sid).gte('visit_date', start).lte('visit_date', end),
            window.db.from('appointments').select('price').eq('master_id', sid).gte('appointment_date', start).lte('appointment_date', end).in('status', ['done','completed']),
        ]);
        const total = [...(hist||[]), ...(active||[])].reduce((s, r) => s + parseFloat(r.price || 0), 0);
        values.push(total);
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

// ══════════════════════════════════════════════════════
//  APPOINTMENT DETAIL MINI-MODAL (from review click)
// ══════════════════════════════════════════════════════

window.showReviewAppt = async function(apptId) {
    const modal = document.getElementById('appt-modal');
    const body  = document.getElementById('appt-modal-body');
    body.innerHTML = `<div class="skeleton h-12 rounded-xl"></div><div class="skeleton h-12 rounded-xl"></div>`;
    modal.classList.add('open');

    const { data: appt, error } = await window.db
        .from('appointment_history')
        .select('*, service:service_id(name, category), client:client_id(full_name), master:master_id(name)')
        .eq('id', apptId)
        .single();

    if (error || !appt) {
        body.innerHTML = `<p class="text-[11px] text-zinc-500 text-center py-4">Запис не знайдено</p>`;
        return;
    }

    const statusColor = appt.status === 'Виконано' ? 'text-emerald-400' : 'text-zinc-400';
    const visitDate = appt.visit_date
        ? new Date(appt.visit_date).toLocaleDateString('uk-UA', { day:'2-digit', month:'long', year:'numeric' })
        : '—';

    body.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div class="glass-panel rounded-xl p-3">
                <p class="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Клієнт</p>
                <p class="text-[12px] font-bold text-white">${appt.client?.full_name || '—'}</p>
            </div>
            <div class="glass-panel rounded-xl p-3">
                <p class="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Майстер</p>
                <p class="text-[12px] font-bold text-white">${appt.master?.name || '—'}</p>
            </div>
            <div class="glass-panel rounded-xl p-3">
                <p class="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Послуга</p>
                <p class="text-[12px] font-bold text-white">${appt.service?.name || '—'}</p>
                ${appt.service?.category ? `<p class="text-[9px] text-zinc-600 mt-0.5">${appt.service.category}</p>` : ''}
            </div>
            <div class="glass-panel rounded-xl p-3">
                <p class="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Дата</p>
                <p class="text-[12px] font-bold text-white">${visitDate}</p>
            </div>
            <div class="glass-panel rounded-xl p-3">
                <p class="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Сума</p>
                <p class="text-[12px] font-bold text-rose-400">₴${parseFloat(appt.price || 0).toLocaleString('uk-UA')}</p>
            </div>
            <div class="glass-panel rounded-xl p-3">
                <p class="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Статус</p>
                <p class="text-[12px] font-bold ${statusColor}">${appt.status || '—'}</p>
            </div>
        </div>
    `;
};

window.closeApptModal = function() {
    document.getElementById('appt-modal').classList.remove('open');
};

// Close on backdrop click
document.getElementById('appt-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeApptModal();
});

// ══════════════════════════════════════════════════════
//  REPORT DOWNLOAD
// ══════════════════════════════════════════════════════

window.downloadLastMonthReport = async function() {
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0);
    const start    = localDate(firstDay);
    const end      = localDate(lastDay);
    const label    = firstDay.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

    const { data: appts } = await window.db
        .from('appointment_history')
        .select('visit_date, master_id, price')
        .gte('visit_date', start)
        .lte('visit_date', end)
        .order('visit_date');

    const staffMap = {};
    [...allStaff, ...archiveStaff].forEach(s => { staffMap[s.id] = s; });

    const report = {};
    (appts || []).forEach(a => {
        const s    = staffMap[a.master_id];
        const name = s?.name || 'Невідомий';
        if (!report[name]) report[name] = {
            name, position: s?.position || '—',
            commission_rate: s?.commission_rate || 40,
            appointments: 0, revenue: 0
        };
        report[name].appointments++;
        report[name].revenue += parseFloat(a.price || 0);
    });

    const rows = Object.values(report).map(r => ({
        ...r, payroll: Math.round(r.revenue * r.commission_rate / 100)
    }));

    const BOM  = '\uFEFF';
    const hdrs = ['Майстер','Посада','Записів','Виручка (₴)','% ЗП','Нарахування (₴)'];
    const csv  = BOM + [
        hdrs.join(';'),
        ...rows.map(r => [r.name, r.position, r.appointments, r.revenue.toFixed(2), r.commission_rate+'%', r.payroll.toFixed(2)].join(';'))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Звіт_персонал_${label}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ══════════════════════════════════════════════════════
//  SHIFTS TAB (in staff profile modal)
// ══════════════════════════════════════════════════════

let modalShiftsWeek = new Date();

function staffWeekStart(d) {
    const dow = d.getDay() || 7;
    const s = new Date(d); s.setDate(d.getDate() - (dow - 1)); s.setHours(0,0,0,0); return s;
}
function fmtDate(d) {
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

async function renderModalShifts(staffId) {
    const ws = staffWeekStart(modalShiftsWeek);
    const we = new Date(ws.getTime() + 6 * 86400000);
    const from = localDate(ws), to = localDate(we);

    document.getElementById('modal-shifts-week-label').textContent = fmtDate(ws) + ' – ' + fmtDate(we);

    const { data } = await window.db.from('staff_shifts').select('*')
        .eq('staff_id', staffId)
        .or(`recurrence.neq.once,and(shift_date.gte.${from},shift_date.lte.${to})`);
    const shifts = data || [];

    const DAY_UA = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
    const TYPE_LABEL = { day_off: 'Вихідний', break: 'Перерва', shift: 'Зміна' };
    const TYPE_COLOR = { day_off: '#f43f5e', break: '#fbbf24', shift: '#34d399' };

    const rows = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ws.getTime() + i * 86400000);
        const dStr = localDate(d);
        const dow = d.getDay() || 7;
        const dayShifts = shifts.filter(s =>
            (s.recurrence === 'once' && s.shift_date === dStr) ||
            (s.recurrence === 'weekly' && s.day_of_week === dow) ||
            (s.recurrence === 'always' && (!s.day_of_week || s.day_of_week === dow))
        );
        const badges = dayShifts.map(s => {
            const c = TYPE_COLOR[s.type] || '#71717a';
            const t = s.all_day ? '' : ` ${s.start_time?.slice(0,5)}–${s.end_time?.slice(0,5)}`;
            return `<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;background:${c}20;color:${c};border:1px solid ${c}44">${TYPE_LABEL[s.type]||s.type}${t}</span>`;
        }).join('');
        const isToday = dStr === localDate(new Date());
        return `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:${isToday?'rgba(244,63,94,.05)':'rgba(255,255,255,.02)'};border:1px solid rgba(255,255,255,${isToday?'.08':'.04'})">
            <div style="min-width:48px;font-size:10px;font-weight:800;color:${isToday?'#f43f5e':'#52525b'}">${DAY_UA[i]}&nbsp;${d.getDate()}</div>
            <div style="flex:1;display:flex;flex-wrap:wrap;gap:4px">${badges || '<span style="font-size:10px;color:#3f3f46;font-weight:600">Робочий день</span>'}</div>
        </div>`;
    }).join('');

    document.getElementById('modal-shifts-list').innerHTML = rows;
}

window.modalShiftsPrev = function() {
    modalShiftsWeek = new Date(modalShiftsWeek.getTime() - 7 * 86400000);
    if (modalStaffData) renderModalShifts(modalStaffData.id);
};
window.modalShiftsNext = function() {
    modalShiftsWeek = new Date(modalShiftsWeek.getTime() + 7 * 86400000);
    if (modalStaffData) renderModalShifts(modalStaffData.id);
};

// ══════════════════════════════════════════════════════
//  TEAM SCHEDULE MODAL
// ══════════════════════════════════════════════════════

window.openTeamSchedule = async function() {
    teamSchedWeek = new Date();
    await renderTeamSchedule();
    document.getElementById('team-sched-modal').style.opacity = '1';
    document.getElementById('team-sched-modal').style.pointerEvents = 'all';
    document.getElementById('drawer-overlay').classList.add('open');
};

window.closeTeamSchedule = function() {
    document.getElementById('team-sched-modal').style.opacity = '0';
    document.getElementById('team-sched-modal').style.pointerEvents = 'none';
    document.getElementById('drawer-overlay').classList.remove('open');
};

window.teamSchedPrev = async function() {
    teamSchedWeek = new Date(teamSchedWeek.getTime() - 7 * 86400000);
    await renderTeamSchedule();
};
window.teamSchedNext = async function() {
    teamSchedWeek = new Date(teamSchedWeek.getTime() + 7 * 86400000);
    await renderTeamSchedule();
};

async function renderTeamSchedule() {
    const ws = staffWeekStart(teamSchedWeek);
    const we = new Date(ws.getTime() + 6 * 86400000);
    const from = localDate(ws), to = localDate(we);
    document.getElementById('team-sched-week-label').textContent = fmtDate(ws) + ' – ' + fmtDate(we);

    const { data: shifts } = await window.db.from('staff_shifts').select('*')
        .or(`recurrence.neq.once,and(shift_date.gte.${from},shift_date.lte.${to})`);
    const allShifts = shifts || [];

    const TYPE_COLOR = { day_off: '#f43f5e', break: '#fbbf24', shift: '#34d399' };
    const TYPE_LABEL = { day_off: 'Вихідний', break: 'Перерва', shift: 'Зміна' };
    const DAY_UA = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

    const container = document.getElementById('team-sched-body');
    container.innerHTML = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ws.getTime() + i * 86400000);
        const dStr = localDate(d);
        const dow = d.getDay() || 7;
        const isToday = dStr === localDate(new Date());

        // gather staff with shifts this day
        const staffEntries = allStaff.map(s => {
            const dayShifts = allShifts.filter(sh =>
                sh.staff_id === s.id && (
                    (sh.recurrence === 'once' && sh.shift_date === dStr) ||
                    (sh.recurrence === 'weekly' && sh.day_of_week === dow) ||
                    (sh.recurrence === 'always' && (!sh.day_of_week || sh.day_of_week === dow))
                )
            );
            return { s, dayShifts };
        }).filter(e => e.dayShifts.length > 0);

        const items = staffEntries.map(({ s, dayShifts }) => {
            const badges = dayShifts.map(sh => {
                const c = TYPE_COLOR[sh.type] || '#71717a';
                const t = sh.all_day ? '' : ` ${sh.start_time?.slice(0,5)}–${sh.end_time?.slice(0,5)}`;
                return `<span style="font-size:8px;font-weight:800;padding:1px 6px;border-radius:20px;background:${c}20;color:${c}">${TYPE_LABEL[sh.type]||sh.type}${t}</span>`;
            }).join('');
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.03)">
                <span style="font-size:10px;font-weight:700;color:#a1a1aa;min-width:90px">${s.name.split(' ')[0]}</span>
                <div style="display:flex;flex-wrap:wrap;gap:3px">${badges}</div>
            </div>`;
        }).join('') || `<p style="font-size:10px;color:#3f3f46;font-weight:600;padding:6px 0">Всі працюють</p>`;

        return `<details style="border-radius:10px;overflow:hidden;margin-bottom:4px" ${isToday?'open':''}>
            <summary style="padding:10px 12px;cursor:pointer;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:${isToday?'#f43f5e':'#71717a'};background:rgba(255,255,255,.03);list-style:none;display:flex;justify-content:space-between;align-items:center">
                <span>${DAY_UA[i]}, ${d.getDate()}</span>
                <span style="font-size:9px;color:#52525b;font-weight:700;text-transform:none;letter-spacing:0">${staffEntries.length ? staffEntries.length+' відміток' : ''}</span>
            </summary>
            <div style="padding:4px 12px 8px">${items}</div>
        </details>`;
    }).join('');
}

// ══════════════════════════════════════════════════════
//  PAYROLL MODAL
// ══════════════════════════════════════════════════════

// payrollData: [{ staff, earned, alrPaid, amount }]
let payrollData  = [];
let payrollMode  = 'month';   // 'month' | 'week'
let payrollWeekDate = new Date(); // anchor date for week navigation

// ── helpers ───────────────────────────────────────────
function payrollWeekBounds(anchor) {
    const d   = new Date(anchor);
    const dow = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - (dow - 1)); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: localDate(mon), to: localDate(sun), mon, sun };
}

async function loadPayrollData(from, to, periodLabel) {
    const [apptRes, paidRes] = await Promise.all([
        window.db.from('appointment_history').select('master_id, price')
            .gte('visit_date', from).lte('visit_date', to),
        window.db.from('transactions').select('amount, staff_id')
            .eq('type', 'expense').eq('category', 'salary')
            .gte('date', from).lte('date', to),
    ]);
    const earningsMap = {};
    (apptRes.data || []).forEach(a => {
        if (!a.master_id) return;
        earningsMap[a.master_id] = (earningsMap[a.master_id] || 0) + parseFloat(a.price || 0);
    });
    const paidMap = {};
    (paidRes.data || []).forEach(t => {
        if (!t.staff_id) return;
        paidMap[t.staff_id] = (paidMap[t.staff_id] || 0) + parseFloat(t.amount || 0);
    });

    payrollData = allStaff
        .filter(s => s.role === 'master' || s.role === 'admin')
        .map(s => {
            const rev     = earningsMap[s.id] || 0;
            const earned  = Math.round(rev * (s.commission_rate || 40) / 100);
            const alrPaid = Math.round(paidMap[s.id] || 0);
            const toPay   = Math.max(0, earned - alrPaid);
            return { staff: s, earned, alrPaid, amount: toPay };
        });

    document.getElementById('payroll-period-label').textContent = periodLabel;
    renderPayrollRows();
}

// ── open / close ──────────────────────────────────────
function getPayrollMonth() {
    const ym = localStorage.getItem('wella_current_month');
    if(ym) { const [y,m]=ym.split('-').map(Number); return {y,m}; }
    const n=new Date(); return {y:n.getFullYear(), m:n.getMonth()+1};
}

window.openPayrollModal = async function() {
    payrollMode = 'month';
    payrollWeekDate = new Date();
    setPayrollModeUI('month');
    const {y,m} = getPayrollMonth();
    const from  = localDate(new Date(y, m-1, 1));
    const to    = localDate(new Date(y, m, 0));
    const label = new Date(y, m-1, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    await loadPayrollData(from, to, label);
    document.getElementById('payroll-modal').classList.remove('hidden');
};

window.closePayrollModal = function() {
    document.getElementById('payroll-modal').classList.add('hidden');
};

// ── period selector ───────────────────────────────────
window.setPayrollMode = async function(mode) {
    payrollMode = mode;
    setPayrollModeUI(mode);
    await refreshPayrollPeriod();
};

function setPayrollModeUI(mode) {
    const btnM = document.getElementById('pr-mode-month');
    const btnW = document.getElementById('pr-mode-week');
    const nav  = document.getElementById('pr-week-nav');
    btnM.className = `px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${mode==='month'?'bg-rose-500/15 text-rose-400':'text-zinc-500 hover:text-white'}`;
    btnW.className = `px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${mode==='week' ?'bg-rose-500/15 text-rose-400':'text-zinc-500 hover:text-white'}`;
    nav.classList.toggle('hidden', mode !== 'week');
}

window.payrollWeekStep = async function(dir) {
    payrollWeekDate = new Date(payrollWeekDate.getTime() + dir * 7 * 86400000);
    await refreshPayrollPeriod();
};

async function refreshPayrollPeriod() {
    if (payrollMode === 'month') {
        const {y,m} = getPayrollMonth();
        const from = localDate(new Date(y, m-1, 1));
        const to   = localDate(new Date(y, m, 0));
        const label = new Date(y, m-1, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
        await loadPayrollData(from, to, label);
    } else {
        const { from, to, mon, sun } = payrollWeekBounds(payrollWeekDate);
        const fmt = d => d.toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit' });
        const label = `${fmt(mon)} — ${fmt(sun)}`;
        document.getElementById('pr-week-label').textContent = label;
        await loadPayrollData(from, to, label);
    }
}

function renderPayrollRows() {
    const tbody = document.getElementById('payroll-rows');
    tbody.innerHTML = payrollData.map((row, i) => `
        <tr class="border-b border-white/5">
            <td class="py-3 pr-3">
                <div class="flex items-center gap-2">
                    ${avatarEl(row.staff, 'w-7 h-7', 'text-[9px]')}
                    <div>
                        <p class="text-[11px] font-bold text-white leading-tight">${row.staff.name.split(' ')[0]}</p>
                        <p class="text-[9px] text-zinc-600">${row.alrPaid > 0 ? '−₴'+row.alrPaid.toLocaleString('uk-UA')+' вже виплачено' : ''}</p>
                    </div>
                </div>
            </td>
            <td class="py-3 pr-3 text-[11px] font-bold text-emerald-400">₴${row.earned.toLocaleString('uk-UA')}</td>
            <td class="py-3 pr-3">
                <input type="number" min="0" value="${row.amount}"
                    oninput="updatePayrollAmount(${i}, this.value)"
                    class="w-24 text-[11px] font-bold text-white bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 outline-none focus:border-rose-500/50">
            </td>
            <td class="py-3">
                <input type="checkbox" id="pr-chk-${i}" ${row.amount > 0 ? 'checked' : ''}
                    onchange="updatePayrollCheck(${i}, this.checked)"
                    class="w-4 h-4 accent-rose-500 cursor-pointer">
            </td>
        </tr>`).join('');
    updatePayrollTotal();
}

window.updatePayrollAmount = function(i, val) {
    payrollData[i].amount = Math.max(0, parseInt(val) || 0);
    updatePayrollTotal();
};

window.updatePayrollCheck = function(i, checked) {
    if (!checked) { payrollData[i]._skip = true; }
    else { delete payrollData[i]._skip; }
    updatePayrollTotal();
};

function updatePayrollTotal() {
    const total = payrollData
        .filter((r, i) => {
            const chk = document.getElementById('pr-chk-'+i);
            return chk ? chk.checked : !r._skip;
        })
        .reduce((s, r) => s + r.amount, 0);
    document.getElementById('payroll-total').textContent = '₴' + total.toLocaleString('uk-UA');
}

window.confirmPayroll = async function() {
    const today = localDate(new Date());
    const toPayRows = payrollData.filter((r, i) => {
        const chk = document.getElementById('pr-chk-'+i);
        return (chk ? chk.checked : !r._skip) && r.amount > 0;
    });
    if (!toPayRows.length) { alert('Не вибрано жодного майстра або сума 0'); return; }

    const transactions = toPayRows.map(r => ({
        date: today,
        type: 'expense',
        category: 'salary',
        subcategory: null,
        amount: r.amount,
        payment_method: 'cash',
        comment: `Виплата ЗП: ${r.staff.name} (${document.getElementById('payroll-period-label').textContent})`,
        staff_id: r.staff.id,
    }));

    const { error } = await window.db.from('transactions').insert(transactions);
    if (error) { alert('Помилка: ' + error.message); return; }

    closePayrollModal();
    loadKPIs(); // refresh payroll fund
    alert(`Виплачено ${toPayRows.length} майстрам на суму ₴${toPayRows.reduce((s,r)=>s+r.amount,0).toLocaleString('uk-UA')}`);
};

// ── CSV export ────────────────────────────────────────
window.generatePayrollCSV = function() {
    const now = new Date();
    const month = document.getElementById('payroll-period-label').textContent || now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    let csv = `Звіт виплат ЗП — ${month}\n`;
    csv += 'Майстер,Зароблено (₴),До виплати (₴)\n';
    payrollData.forEach(r => {
        csv += `"${r.staff.name}",${r.earned},${r.amount}\n`;
    });
    const total = payrollData.reduce((s,r)=>s+r.amount,0);
    csv += `"РАЗОМ",,${total}\n`;

    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `payroll_${now.getFullYear()}_${String(now.getMonth()+1).padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// ── PDF export ────────────────────────────────────────
window.generatePayrollPDF = function() {
    const now = new Date();
    const month = document.getElementById('payroll-period-label').textContent || now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    const total = payrollData.reduce((s,r)=>s+r.amount,0);

    const rows = payrollData.map((r, i) => `
        <tr>
            <td>${i+1}</td>
            <td>${r.staff.name}</td>
            <td style="text-align:right">₴${r.earned.toLocaleString('uk-UA')}</td>
            <td style="text-align:right">₴${r.amount.toLocaleString('uk-UA')}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>
            body{font-family:Arial,sans-serif;padding:32px;color:#111}
            h2{margin-bottom:4px}
            p{color:#666;margin-bottom:20px;font-size:13px}
            table{width:100%;border-collapse:collapse}
            th,td{padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:left}
            th{background:#f9fafb;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
            tfoot td{font-weight:800;border-top:2px solid #111;background:#f9fafb}
        </style></head><body>
        <h2>Звіт виплат ЗП</h2>
        <p>${month} · Дата формування: ${now.toLocaleDateString('uk-UA')}</p>
        <table>
            <thead><tr><th>#</th><th>Майстер</th><th style="text-align:right">Зароблено</th><th style="text-align:right">До виплати</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="3">РАЗОМ</td><td style="text-align:right">₴${total.toLocaleString('uk-UA')}</td></tr></tfoot>
        </table>
        <script>window.onload=()=>{window.print();}<\/script>
        </body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
};
