// js/admin-calendar.js
// ══════════════════════════════════════════════════════
//  Wella Glow — Календар записів
// ══════════════════════════════════════════════════════

// ── Auth guard ─────────────────────────────────────────
const _staffId   = localStorage.getItem('wella_staff_id');
const _staffRole = localStorage.getItem('wella_staff_role');
if (!_staffId || !['owner','admin'].includes(_staffRole)) {
    window.location.href = 'staff-login.html';
}

// ── State ──────────────────────────────────────────────
let currentView    = 'week';   // 'week' | 'month'
let currentDate    = new Date();
let allAppts       = [];
let allStaff       = [];
let allClients     = [];
let allServices    = [];
let filterMasterId = '';
let editingApptId  = null;

// Deterministic color palette for masters
const COLORS = [
    '#f43f5e','#fb923c','#facc15','#34d399','#22d3ee','#818cf8','#c084fc','#f472b6','#4ade80'
];
function masterColor(id) {
    const h = (id || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    return COLORS[h % COLORS.length];
}

function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseLocalDate(str) {
    if (!str) return null;
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d);
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadStaff(), loadClients(), loadServices()]);
    buildMasterFilters();
    populateDrawerSelects();
    await loadAppts();
    renderView();
    renderKPIs();
    // Set default date in drawer
    document.getElementById('a-date').value = localDate(new Date());
});

// ══════════════════════════════════════════════════════
//  LOADERS
// ══════════════════════════════════════════════════════

async function loadStaff() {
    const { data } = await window.db.from('staff').select('id,name,commission_rate,position,is_active,avatar_url').eq('is_active', true).order('name');
    allStaff = data || [];
}

async function loadClients() {
    const { data } = await window.db.from('clients').select('id,full_name,phone').order('full_name');
    allClients = data || [];
}

async function loadServices() {
    const { data } = await window.db.from('services').select('*').order('name');
    allServices = data || [];
}

async function loadAppts(force = false) {
    // Fetch a broad range: current month ±2 months for caching
    const now = currentDate;
    const from = localDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const to   = localDate(new Date(now.getFullYear(), now.getMonth() + 3, 0));

    const { data, error } = await window.db
        .from('appointment_history')
        .select('*')
        .gte('visit_date', from)
        .lte('visit_date', to)
        .order('visit_date');

    if (error) { console.error(error); return; }
    allAppts = data || [];
}

// ══════════════════════════════════════════════════════
//  MASTER FILTER
// ══════════════════════════════════════════════════════

function buildMasterFilters() {
    const wrap = document.getElementById('master-filters');
    // Keep "Всі" button, add one per master
    const existing = wrap.querySelector('[data-id=""]');
    wrap.innerHTML = '';
    wrap.appendChild(existing);

    allStaff.forEach(s => {
        const color = masterColor(s.id);
        const btn = document.createElement('button');
        btn.className = 'master-pill';
        btn.dataset.id = s.id;
        btn.textContent = s.name.split(' ')[0]; // first name only
        btn.style.borderColor = color + '44';
        btn.onclick = () => filterMaster(s.id);
        wrap.appendChild(btn);
    });
}

window.filterMaster = function(id) {
    filterMasterId = id;
    document.querySelectorAll('.master-pill').forEach(btn => {
        const active = btn.dataset.id === id;
        btn.classList.toggle('active', active);
        if (active) {
            const color = id ? masterColor(id) : '#f43f5e';
            btn.style.background = color + '22';
            btn.style.borderColor = color + '55';
            btn.style.color = color;
        } else {
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
    });
    renderView();
    renderKPIs();
};

// ══════════════════════════════════════════════════════
//  FILTERED APPOINTMENTS
// ══════════════════════════════════════════════════════

function getFiltered() {
    return filterMasterId
        ? allAppts.filter(a => a.master_id === filterMasterId)
        : allAppts;
}

function apptsForDate(dateStr) {
    return getFiltered().filter(a => a.visit_date === dateStr);
}

// ══════════════════════════════════════════════════════
//  VIEW SWITCHING
// ══════════════════════════════════════════════════════

window.setView = function(v) {
    currentView = v;
    document.getElementById('week-view').classList.toggle('hidden', v !== 'week');
    document.getElementById('month-view').classList.toggle('hidden', v !== 'month');
    document.getElementById('btn-week').classList.toggle('active', v === 'week');
    document.getElementById('btn-month').classList.toggle('active', v === 'month');
    renderView();
};

window.navPrev = function() {
    if (currentView === 'week') currentDate = new Date(currentDate.getTime() - 7*86400000);
    else currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    loadAppts().then(() => { renderView(); renderKPIs(); });
};

window.navNext = function() {
    if (currentView === 'week') currentDate = new Date(currentDate.getTime() + 7*86400000);
    else currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    loadAppts().then(() => { renderView(); renderKPIs(); });
};

window.goToday = function() {
    currentDate = new Date();
    loadAppts().then(() => { renderView(); renderKPIs(); });
};

function renderView() {
    if (currentView === 'week') renderWeek();
    else renderMonth();
}

// ══════════════════════════════════════════════════════
//  WEEK VIEW
// ══════════════════════════════════════════════════════

function getWeekStart(d) {
    const day = d.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day; // Mon=0
    const s = new Date(d);
    s.setDate(d.getDate() + diff);
    s.setHours(0,0,0,0);
    return s;
}

function renderWeek() {
    const weekStart = getWeekStart(currentDate);
    const today     = localDate(new Date());

    // Update period label
    const endDate = new Date(weekStart.getTime() + 6*86400000);
    document.getElementById('period-label').textContent =
        weekStart.toLocaleDateString('uk-UA', { day:'numeric', month:'long' }) + ' — ' +
        endDate.toLocaleDateString('uk-UA', { day:'numeric', month:'long', year:'numeric' });

    const grid = document.getElementById('week-grid');
    grid.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const day   = new Date(weekStart.getTime() + i*86400000);
        const dStr  = localDate(day);
        const isToday = dStr === today;
        const appts = apptsForDate(dStr);

        const col = document.createElement('div');
        col.className = 'day-col' + (isToday ? ' today' : '');

        // Header
        const hdr = document.createElement('div');
        hdr.className = 'day-header';
        hdr.innerHTML = `
            <div class="day-num">${day.getDate()}</div>
            ${appts.length ? `<div class="text-[8px] text-zinc-600 font-black mt-0.5">${appts.length} ${pluralAppt(appts.length)}</div>` : ''}
        `;
        hdr.ondblclick = () => { openApptDrawer(dStr); };
        col.appendChild(hdr);

        // Appointment cards
        appts.forEach(a => {
            const card = buildApptCard(a, 'week');
            col.appendChild(card);
        });

        // Drop-hint
        if (!appts.length) {
            const hint = document.createElement('div');
            hint.className = 'flex-1 flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100 transition';
            hint.innerHTML = `<span class="text-[9px] text-zinc-700 font-bold">+ додати</span>`;
            hint.onclick = () => openApptDrawer(dStr);
            col.appendChild(hint);
        } else {
            const add = document.createElement('div');
            add.className = 'mt-auto pt-1 cursor-pointer';
            add.innerHTML = `<div class="text-[9px] text-zinc-700 font-black text-center hover:text-zinc-400 transition py-1">+ додати</div>`;
            add.onclick = () => openApptDrawer(dStr);
            col.appendChild(add);
        }

        grid.appendChild(col);
    }
}

function buildApptCard(a, mode) {
    const master  = allStaff.find(s => s.id === a.master_id);
    const service = allServices.find(s => s.id === a.service_id);
    const client  = allClients.find(c => c.id === a.client_id);
    const color   = masterColor(a.master_id);
    const statusInfo = getStatusInfo(a.status);

    const card = document.createElement('div');
    card.className = 'appt-card';
    card.style.background = color + '18';
    card.style.borderLeftColor = color;
    card.onclick = (e) => { e.stopPropagation(); openDetail(a.id); };

    card.innerHTML = `
        <div class="appt-card-inner">
            <p class="text-[10px] font-bold text-white leading-tight truncate">${client?.full_name || 'Клієнт'}</p>
            <p class="text-[9px] font-semibold truncate mt-0.5" style="color:${color}aa">${service?.name || '—'}</p>
            <div class="flex items-center justify-between mt-1.5 gap-1">
                <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full ${statusInfo.cls}">${statusInfo.label}</span>
                <span class="text-[9px] font-bold text-white/70">₴${parseFloat(a.price||0).toLocaleString('uk-UA')}</span>
            </div>
        </div>
    `;

    return card;
}

// ══════════════════════════════════════════════════════
//  MONTH VIEW
// ══════════════════════════════════════════════════════

function renderMonth() {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const today = localDate(new Date());

    document.getElementById('period-label').textContent =
        new Date(y, m, 1).toLocaleDateString('uk-UA', { month:'long', year:'numeric' });

    const firstDay = new Date(y, m, 1);
    const lastDay  = new Date(y, m + 1, 0);

    // Start on Monday
    let startDow = firstDay.getDay(); // 0=Sun
    if (startDow === 0) startDow = 7;
    const startOffset = startDow - 1; // days before month start to fill

    const grid = document.getElementById('month-grid');
    grid.innerHTML = '';

    const total = startOffset + lastDay.getDate();
    const cells = Math.ceil(total / 7) * 7;

    for (let i = 0; i < cells; i++) {
        const dayOffset = i - startOffset;
        const cellDate  = new Date(y, m, dayOffset + 1);
        const dStr      = localDate(cellDate);
        const inMonth   = dayOffset >= 0 && dayOffset < lastDay.getDate();
        const isToday   = dStr === today;
        const appts     = apptsForDate(dStr);

        const cell = document.createElement('div');
        cell.className = 'month-day' + (isToday ? ' today' : '') +
                         (!inMonth ? ' other-month' : '') +
                         (appts.length ? ' has-appts' : '');
        if (appts.length) cell.style.cursor = 'pointer';
        cell.onclick = appts.length ? () => showDayAppts(dStr, appts) : null;

        // Day number
        const numEl = document.createElement('div');
        numEl.className = 'month-day-num';
        numEl.textContent = cellDate.getDate();
        cell.appendChild(numEl);

        // Appointment dots (max 4 + overflow)
        const visible = appts.slice(0, 4);
        visible.forEach(a => {
            const dot = document.createElement('div');
            dot.className = 'month-dot';
            dot.style.background = masterColor(a.master_id) + 'bb';
            cell.appendChild(dot);
        });

        if (appts.length > 4) {
            const more = document.createElement('div');
            more.className = 'text-[8px] text-zinc-600 font-black';
            more.textContent = `+${appts.length - 4} ще`;
            cell.appendChild(more);
        }

        // Add button on hover for current month
        if (inMonth) {
            cell.ondblclick = (e) => { e.stopPropagation(); openApptDrawer(dStr); };
        }

        grid.appendChild(cell);
    }
}

// ══════════════════════════════════════════════════════
//  KPI STRIP
// ══════════════════════════════════════════════════════

function renderKPIs() {
    const todayStr  = localDate(new Date());
    const weekStart = getWeekStart(currentDate);
    const weekEnd   = new Date(weekStart.getTime() + 6*86400000);
    const wStartStr = localDate(weekStart);
    const wEndStr   = localDate(weekEnd);

    const filtered = getFiltered();

    const todayAppts = filtered.filter(a => a.visit_date === todayStr);
    const weekAppts  = filtered.filter(a => a.visit_date >= wStartStr && a.visit_date <= wEndStr);
    const weekDone   = weekAppts.filter(a => a.status === 'Виконано');
    const weekRev    = weekAppts.reduce((s, a) => s + parseFloat(a.price || 0), 0);

    document.getElementById('kpi-today').textContent        = todayAppts.length + ' записів';
    document.getElementById('kpi-week-revenue').textContent = '₴' + weekRev.toLocaleString('uk-UA');
    document.getElementById('kpi-week-done').textContent    = weekDone.length + ' / ' + weekAppts.length;
    document.getElementById('kpi-week-total').textContent   = weekAppts.length + ' записів';
}

// ══════════════════════════════════════════════════════
//  STATUS HELPERS
// ══════════════════════════════════════════════════════

function getStatusInfo(status) {
    const map = {
        'Виконано':    { cls:'status-done',    label:'Виконано'   },
        'Новий':       { cls:'status-new',     label:'Новий'      },
        'Підтверджено':{ cls:'status-pending', label:'Підтвержено'},
        'Скасовано':   { cls:'status-cancel',  label:'Скасовано'  },
    };
    return map[status] || { cls:'status-new', label: status || 'Новий' };
}

function pluralAppt(n) {
    if (n === 1) return 'запис';
    if (n >= 2 && n <= 4) return 'записи';
    return 'записів';
}

// ══════════════════════════════════════════════════════
//  DRAWER: ADD / EDIT APPOINTMENT
// ══════════════════════════════════════════════════════

function populateDrawerSelects() {
    const clientSel = document.getElementById('a-client');
    allClients.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.full_name + (c.phone ? ` (${c.phone})` : '');
        clientSel.appendChild(o);
    });

    const serviceSel = document.getElementById('a-service');
    allServices.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name + (s.category ? ` — ${s.category}` : '');
        o.dataset.price    = s.price || 0;
        o.dataset.duration = s.duration || 0;
        serviceSel.appendChild(o);
    });

    const masterSel = document.getElementById('a-master');
    allStaff.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name + (s.position ? ` (${s.position})` : '');
        masterSel.appendChild(o);
    });
}

window.openApptDrawer = function(prefillDate = null, appt = null) {
    editingApptId = appt ? appt.id : null;
    document.getElementById('appt-drawer-title').textContent = appt ? 'Редагувати запис' : 'Новий запис';

    document.getElementById('a-client').value  = appt?.client_id  || '';
    document.getElementById('a-service').value = appt?.service_id || '';
    document.getElementById('a-master').value  = appt?.master_id  || (filterMasterId || '');
    document.getElementById('a-date').value    = prefillDate || appt?.visit_date || localDate(new Date());
    document.getElementById('a-price').value   = appt?.price || '';
    document.getElementById('a-status').value  = appt?.status || 'Новий';

    document.getElementById('service-hint').classList.add('hidden');

    document.getElementById('appt-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
};

window.onServiceChange = function() {
    const sel = document.getElementById('a-service');
    const opt = sel.options[sel.selectedIndex];
    const price = opt?.dataset?.price;
    const dur   = opt?.dataset?.duration;
    if (price) {
        document.getElementById('a-price').value = price;
        document.getElementById('service-hint').classList.remove('hidden');
        document.getElementById('service-hint-text').textContent =
            `Стандартна ціна: ₴${parseFloat(price).toLocaleString('uk-UA')}` +
            (dur ? ` · Тривалість: ${dur} хв` : '');
    }
};

window.saveAppt = async function() {
    const clientId  = document.getElementById('a-client').value;
    const serviceId = document.getElementById('a-service').value;
    const masterId  = document.getElementById('a-master').value;
    const date      = document.getElementById('a-date').value;
    const price     = parseFloat(document.getElementById('a-price').value) || 0;
    const status    = document.getElementById('a-status').value;

    if (!clientId || !serviceId || !masterId || !date) {
        alert('Заповніть обов\'язкові поля: клієнт, послуга, майстер, дата.');
        return;
    }

    const payload = {
        client_id:  clientId,
        service_id: serviceId,
        master_id:  masterId,
        visit_date: date,
        price,
        status,
    };

    let error;
    if (editingApptId) {
        ({ error } = await window.db.from('appointment_history').update(payload).eq('id', editingApptId));
    } else {
        ({ error } = await window.db.from('appointment_history').insert([payload]));
    }

    if (error) { alert('Помилка: ' + error.message); return; }
    closeAllDrawers();
    await loadAppts();
    renderView();
    renderKPIs();
};

// ══════════════════════════════════════════════════════
//  DETAIL DRAWER
// ══════════════════════════════════════════════════════

window.openDetail = function(id) {
    const a = allAppts.find(x => x.id === id);
    if (!a) return;

    const master  = allStaff.find(s => s.id === a.master_id);
    const service = allServices.find(s => s.id === a.service_id);
    const client  = allClients.find(c => c.id === a.client_id);
    const color   = masterColor(a.master_id);
    const si      = getStatusInfo(a.status);

    const dateStr = a.visit_date
        ? parseLocalDate(a.visit_date)?.toLocaleDateString('uk-UA', { day:'2-digit', month:'long', year:'numeric' })
        : '—';

    document.getElementById('detail-body').innerHTML = `
        <!-- Status banner -->
        <div class="p-3 rounded-xl flex items-center justify-between" style="background:${color}15; border:1px solid ${color}33">
            <div>
                <p class="text-[9px] font-black uppercase tracking-widest" style="color:${color}">Запис</p>
                <p class="text-xs font-bold text-white mt-0.5">${dateStr}</p>
            </div>
            <span class="text-[9px] font-black px-2 py-1 rounded-full ${si.cls}">${si.label}</span>
        </div>
        <!-- Info grid -->
        <div class="grid grid-cols-1 gap-2">
            <div class="glass-panel rounded-xl p-3 flex items-center gap-3">
                <i class="fa-solid fa-user w-4 text-zinc-600 text-xs"></i>
                <div>
                    <p class="text-[8px] text-zinc-600 uppercase font-black tracking-widest">Клієнт</p>
                    <p class="text-[12px] font-bold text-white">${client?.full_name || '—'}</p>
                    ${client?.phone ? `<p class="text-[10px] text-zinc-500">${client.phone}</p>` : ''}
                </div>
            </div>
            <div class="glass-panel rounded-xl p-3 flex items-center gap-3">
                <i class="fa-solid fa-scissors w-4 text-zinc-600 text-xs"></i>
                <div>
                    <p class="text-[8px] text-zinc-600 uppercase font-black tracking-widest">Послуга</p>
                    <p class="text-[12px] font-bold text-white">${service?.name || '—'}</p>
                    ${service?.category ? `<p class="text-[10px] text-zinc-500">${service.category}${service.duration ? ' · '+service.duration+' хв' : ''}</p>` : ''}
                </div>
            </div>
            <div class="glass-panel rounded-xl p-3 flex items-center gap-3">
                <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:${color}33; border:1.5px solid ${color}66"></div>
                <div>
                    <p class="text-[8px] text-zinc-600 uppercase font-black tracking-widest">Майстер</p>
                    <p class="text-[12px] font-bold text-white">${master?.name || '—'}</p>
                    ${master?.position ? `<p class="text-[10px] text-zinc-500">${master.position}</p>` : ''}
                </div>
            </div>
            <div class="glass-panel rounded-xl p-3 flex items-center gap-3">
                <i class="fa-solid fa-hryvnia-sign w-4 text-zinc-600 text-xs"></i>
                <div>
                    <p class="text-[8px] text-zinc-600 uppercase font-black tracking-widest">Сума</p>
                    <p class="text-[16px] font-extrabold text-rose-400">₴${parseFloat(a.price||0).toLocaleString('uk-UA')}</p>
                </div>
            </div>
        </div>
    `;

    // Wire buttons
    document.getElementById('detail-edit-btn').onclick = () => {
        closeAllDrawers();
        openApptDrawer(a.visit_date, a);
    };
    document.getElementById('detail-done-btn').onclick = () => updateStatus(id, 'Виконано');
    document.getElementById('detail-cancel-btn').onclick = () => {
        if (confirm('Скасувати цей запис?')) updateStatus(id, 'Скасовано');
    };

    // Hide "done" button if already done
    document.getElementById('detail-done-btn').style.display = a.status === 'Виконано' ? 'none' : '';

    document.getElementById('appt-detail-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
};

async function updateStatus(id, status) {
    const { error } = await window.db
        .from('appointment_history')
        .update({ status })
        .eq('id', id);
    if (error) { alert(error.message); return; }
    closeAllDrawers();
    await loadAppts();
    renderView();
    renderKPIs();
}

// ══════════════════════════════════════════════════════
//  DAY APPOINTMENTS (month view click)
// ══════════════════════════════════════════════════════

function showDayAppts(dStr, appts) {
    const date = parseLocalDate(dStr)?.toLocaleDateString('uk-UA', { day:'numeric', month:'long' });
    document.getElementById('detail-body').innerHTML = `
        <p class="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3">${date}</p>
        <div class="space-y-2">
            ${appts.map(a => {
                const client  = allClients.find(c => c.id === a.client_id);
                const service = allServices.find(s => s.id === a.service_id);
                const color   = masterColor(a.master_id);
                const si      = getStatusInfo(a.status);
                return `
                <div class="p-3 rounded-xl cursor-pointer hover:bg-white/3 transition"
                     style="background:${color}10; border-left:3px solid ${color}66"
                     onclick="openDetail('${a.id}')">
                    <p class="text-[11px] font-bold text-white">${client?.full_name || '—'}</p>
                    <p class="text-[10px] font-semibold mt-0.5" style="color:${color}99">${service?.name || '—'}</p>
                    <div class="flex items-center justify-between mt-1">
                        <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full ${si.cls}">${si.label}</span>
                        <span class="text-[10px] font-bold text-white/60">₴${parseFloat(a.price||0).toLocaleString('uk-UA')}</span>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <button onclick="openApptDrawer('${dStr}')" class="w-full mt-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/8 text-zinc-500 hover:text-white hover:border-white/20 transition flex items-center justify-center gap-2">
            <i class="fa-solid fa-plus text-xs"></i> Додати запис
        </button>
    `;

    // Hide action buttons for day view
    document.getElementById('detail-edit-btn').style.display   = 'none';
    document.getElementById('detail-done-btn').style.display   = 'none';
    document.getElementById('detail-cancel-btn').style.display = 'none';

    document.getElementById('appt-detail-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
}

// ══════════════════════════════════════════════════════
//  CLOSE
// ══════════════════════════════════════════════════════

function closeAllDrawers() {
    document.getElementById('appt-drawer').classList.remove('open');
    document.getElementById('appt-detail-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    // Restore buttons visibility
    ['detail-edit-btn','detail-done-btn','detail-cancel-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
    editingApptId = null;
}
