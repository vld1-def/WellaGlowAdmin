// js/master-dashboard.js
const masterId   = localStorage.getItem('wella_staff_id');
const masterRole = localStorage.getItem('wella_staff_role');
const masterName = localStorage.getItem('wella_staff_name') || 'Майстер';

// Only masters (and admins who want to preview) can access this page
if (!masterId) window.location.href = 'staff-login.html';

// ── Helpers ───────────────────────────────────────────
function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtTime(t) { return t ? t.slice(0,5) : '—'; }
function fmtDate(str) {
    if (!str) return '—';
    const [y,m,d] = str.split('-');
    return `${d}.${m}.${y}`;
}
const DAY_UA = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
const DAY_FULL_UA = ['Неділя','Понеділок','Вівторок','Середа','Четвер','Пятниця','Субота'];
const MONTH_UA = ['Січня','Лютого','Березня','Квітня','Травня','Червня','Липня','Серпня','Вересня','Жовтня','Листопада','Грудня'];

function fmtShort(n) {
    if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + ' млн';
    if (n >= 1000) return Math.round(n/1000) + ' тис.';
    return n.toLocaleString();
}

window.doLogout = function() {
    ['wella_staff_id','wella_staff_role','wella_staff_name','wella_proc_list'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'staff-login.html';
};

// ── Upcoming view state ───────────────────────────────
let _upcomingView = 'list';
let _upcomingData = [];
let _calWeekOffset = 0;

window.setUpcomingView = function(view) {
    _upcomingView = view;
    _calWeekOffset = 0;
    document.getElementById('btn-view-list').classList.toggle('active', view === 'list');
    document.getElementById('btn-view-cal').classList.toggle('active', view === 'cal');
    document.getElementById('upcoming-list').classList.toggle('hidden', view !== 'list');
    document.getElementById('upcoming-cal').classList.toggle('hidden', view !== 'cal');
    if (view === 'cal') renderUpcomingCal(_upcomingData);
};

window.calWeekPrev = function() { _calWeekOffset--; renderUpcomingCal(_upcomingData); };
window.calWeekNext = function() { _calWeekOffset++; renderUpcomingCal(_upcomingData); };

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Header
    const av = document.getElementById('master-avatar');
    const nm = document.getElementById('master-name');
    if (av) av.textContent = masterName.charAt(0).toUpperCase();
    if (nm) nm.textContent = masterName;

    const now = new Date();
    const todayEl = document.getElementById('today-label');
    if (todayEl) todayEl.textContent = `${DAY_UA[now.getDay()]}, ${now.getDate()} ${MONTH_UA[now.getMonth()]}`;

    await Promise.all([loadTodaySchedule(), loadUpcoming(), loadMonthStats()]);
});

// ── Today's schedule ──────────────────────────────────
async function loadTodaySchedule() {
    const today = localDate(new Date());
    const { data: appts } = await window.db
        .from('appointments')
        .select('*, clients(id, full_name)')
        .eq('master_id', masterId)
        .eq('appointment_date', today)
        .order('appointment_time', { ascending: true });

    const list = document.getElementById('today-list');
    const countEl = document.getElementById('today-done-count');

    if (!appts || appts.length === 0) {
        list.innerHTML = `<p class="py-10 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Сьогодні немає записів</p>`;
        if (countEl) countEl.textContent = '0 / 0 виконано';
        document.getElementById('kpi-today').textContent = 0;
        return;
    }

    document.getElementById('kpi-today').textContent = appts.length;
    const doneCount = appts.filter(a => a.status === 'done' || a.status === 'completed').length;
    if (countEl) countEl.textContent = `${doneCount} / ${appts.length} виконано`;
    document.getElementById('kpi-today').textContent = appts.length;
    const kpiTodaySub = document.getElementById('kpi-today-sub');
    if (kpiTodaySub) kpiTodaySub.textContent = `${doneCount} / ${appts.length} виконано`;

    list.innerHTML = appts.map(a => {
        const isDone = a.status === 'done' || a.status === 'completed';
        const isCancelled = a.status === 'cancelled';
        const dotClass = isDone ? 'done' : (a.status === 'confirmed' ? 'confirmed' : 'pending');
        return `
        <div class="appt-row py-4 flex items-center justify-between gap-3 ${isCancelled ? 'opacity-40' : ''}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="status-dot ${dotClass}"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-[12px] font-bold text-white truncate">${a.clients?.full_name || 'Гість'}</p>
                    <p class="text-[10px] text-zinc-500 mt-0.5 truncate">${a.service_name || '—'}</p>
                </div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
                <div class="text-right">
                    <p class="text-[11px] font-black text-white">${fmtTime(a.appointment_time)}</p>
                    <p class="text-[9px] text-zinc-600 mt-0.5">₴${(a.price || 0).toLocaleString()}</p>
                </div>
                ${!isDone && !isCancelled ? `
                <button onclick="openActionSheet('${a.id}','${(a.clients?.full_name||'').replace(/'/g,"\\'")}','${a.service_name||''}','${a.appointment_time||''}','${a.client_id||''}')"
                    class="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-zinc-500 hover:text-white transition">
                    <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                </button>` : `<div class="w-8"></div>`}
            </div>
        </div>`;
    }).join('');
}

// ── Upcoming (next 7 days excl. today) ───────────────
async function loadUpcoming() {
    const now   = new Date();
    const today = localDate(now);
    const plus7 = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

    const { data: appts } = await window.db
        .from('appointments')
        .select('appointment_date, appointment_time, service_name, price, client_id, clients(full_name)')
        .eq('master_id', masterId)
        .gt('appointment_date', today)
        .lte('appointment_date', plus7)
        .neq('status', 'cancelled')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

    _upcomingData = appts || [];

    const list = document.getElementById('upcoming-list');
    if (!_upcomingData.length) {
        list.innerHTML = `<p class="py-8 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Немає найближчих записів</p>`;
        return;
    }

    list.innerHTML = _upcomingData.map(a => {
        const d = new Date(a.appointment_date);
        return `
        <div class="appt-row py-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-9 h-9 rounded-xl flex-shrink-0 flex flex-col items-center justify-center" style="background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.15)">
                    <span class="text-[8px] font-black text-rose-500 uppercase">${DAY_UA[d.getDay()]}</span>
                    <span class="text-[13px] font-black text-white leading-none">${d.getDate()}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-bold text-white truncate">${a.clients?.full_name || 'Гість'}</p>
                    <p class="text-[9px] text-zinc-500 mt-0.5 truncate">${a.service_name || '—'}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <div class="text-right">
                    <p class="text-[11px] font-black text-white">${fmtTime(a.appointment_time)}</p>
                    <p class="text-[9px] text-zinc-600">₴${(a.price || 0).toLocaleString()}</p>
                </div>
                <button onclick="openNotesSheet('${a.client_id||''}','${(a.clients?.full_name||'').replace(/'/g,"\\'")}')" class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition flex-shrink-0">
                    <i class="fa-solid fa-note-sticky text-[9px]"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

function renderUpcomingCal(appts) {
    const cal = document.getElementById('upcoming-cal');
    if (!cal) return;

    const now = new Date();
    // Start from tomorrow + week offset
    const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 + _calWeekOffset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i);
        days.push(d);
    }

    const fmt = d => `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`;
    const weekLabel = `${fmt(days[0])} – ${fmt(days[6])}`;

    const header = days.map(d =>
        `<div class="cal-col-header">
            <div class="text-[8px] font-black uppercase" style="color:${localDate(d) === localDate(now) ? '#f43f5e' : '#52525b'}">${DAY_UA[d.getDay()]}</div>
            <div class="text-sm font-black mt-0.5" style="color:${localDate(d) === localDate(now) ? '#f43f5e' : '#a1a1aa'}">${d.getDate()}</div>
        </div>`
    ).join('');

    const cells = days.map(d => {
        const ds = localDate(d);
        const dayAppts = appts.filter(a => a.appointment_date === ds);
        const chips = dayAppts.map(a => {
            const safeClient = (a.clients?.full_name||'Гість').replace(/'/g,"\\'").replace(/"/g,'&quot;');
            const safeService = (a.service_name||'—').replace(/'/g,"\\'").replace(/"/g,'&quot;');
            const safeTime = fmtTime(a.appointment_time);
            const safePrice = (a.price||0).toLocaleString();
            return `<div class="cal-appt-chip" onclick="showCalApptInfo('${safeClient}','${safeService}','${safeTime}','${safePrice}','${a.client_id||''}')">
                <span class="text-[7px] font-black block">${safeTime}</span>
                <span class="truncate block text-[7px]">${a.clients?.full_name?.split(' ')[0]||''}</span>
            </div>`;
        }).join('');
        return `<div class="cal-day-cell">${chips}</div>`;
    }).join('');

    cal.innerHTML = `
        <div class="flex items-center justify-between mb-3 px-1">
            <button onclick="calWeekPrev()" class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition">
                <i class="fa-solid fa-chevron-left text-[9px]"></i>
            </button>
            <span class="text-[9px] font-black text-zinc-400 uppercase tracking-widest">${weekLabel}</span>
            <button onclick="calWeekNext()" class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition">
                <i class="fa-solid fa-chevron-right text-[9px]"></i>
            </button>
        </div>
        <div class="cal-grid mb-1">${header}</div>
        <div class="cal-grid">${cells}</div>`;
}

// ── Month stats (KPIs) ────────────────────────────────
async function loadMonthStats() {
    const now   = new Date();
    const mStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const mEnd   = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const [{ data: histAppts }, { data: activeAppts }, { data: reviews }] = await Promise.all([
        window.db.from('appointment_history').select('price, visit_date, master_id').eq('master_id', masterId).gte('visit_date', mStart).lte('visit_date', mEnd),
        window.db.from('appointments').select('price, appointment_date, status').eq('master_id', masterId).gte('appointment_date', mStart).lte('appointment_date', mEnd).neq('status','cancelled'),
        window.db.from('reviews').select('rating').eq('staff_id', masterId),
    ]);

    const allAppts = [...(histAppts||[]).map(a => ({price: a.price, date: a.visit_date})),
                      ...(activeAppts||[]).map(a => ({price: a.price, date: a.appointment_date}))];
    const doneMonthCount = (histAppts||[]).length + (activeAppts||[]).filter(a => a.status === 'done' || a.status === 'completed').length;

    const totalRev  = allAppts.reduce((s,a) => s + (a.price||0), 0);
    const staffData = await window.db.from('staff').select('commission_rate').eq('id', masterId).single();
    const rate      = staffData.data?.commission_rate || 40;
    const earned    = Math.round(totalRev * rate / 100);

    document.getElementById('kpi-month').textContent  = `${doneMonthCount}/${allAppts.length}`;
    document.getElementById('kpi-earned').textContent = `₴${fmtShort(earned)}`;

    // Projected income: extrapolate to end of month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const dayOfMonth = now.getDate();
    const projected = dayOfMonth > 0 ? Math.round(earned / dayOfMonth * daysInMonth) : 0;
    const kpiEarnedSub = document.getElementById('kpi-earned-sub');
    if (kpiEarnedSub) kpiEarnedSub.textContent = `~₴${fmtShort(projected)} прогноз`;

    const kpiMonthSub = document.getElementById('kpi-month-sub');
    if (kpiMonthSub) kpiMonthSub.textContent = `виконано`;

    if (reviews?.length) {
        const avg = reviews.reduce((s,r) => s + parseFloat(r.rating), 0) / reviews.length;
        document.getElementById('kpi-rating').textContent = `${avg.toFixed(1)} ★`;
    } else {
        document.getElementById('kpi-rating').textContent = '—';
    }
}

// ── Action sheet ──────────────────────────────────────
let _actionApptId = null;
let _actionClientId = null;

window.openActionSheet = async function(id, client, service, time, clientId) {
    _actionApptId  = id;
    _actionClientId = clientId || null;
    const actionBtns = document.getElementById('sheet-action-btns');
    if (actionBtns) actionBtns.style.display = '';
    document.getElementById('sheet-title').textContent = client || 'Клієнт';
    document.getElementById('sheet-sub').textContent   = `${service} · ${fmtTime(time)}`;

    // Clear note fields
    ['note-allergies','note-preferences','note-formula','note-general'].forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = '';
    });

    // Show sheet
    document.getElementById('appt-overlay').classList.remove('hidden');
    document.getElementById('appt-action-sheet').classList.add('open');

    // Load client notes if client exists
    if (clientId) {
        const { data: cl } = await window.db
            .from('clients')
            .select('notes_allergies, preferences, color_formula, notes')
            .eq('id', clientId)
            .single();
        if (cl) {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            set('note-allergies',   cl.notes_allergies);
            set('note-preferences', cl.preferences);
            set('note-formula',     cl.color_formula);
            set('note-general',     cl.notes);
        }
    }

    const noteSec = document.getElementById('sheet-notes-section');
    if (noteSec) noteSec.style.display = clientId ? '' : 'none';
};

window.openNotesSheet = async function(clientId, clientName) {
    _actionApptId  = null;
    _actionClientId = clientId || null;
    document.getElementById('sheet-title').textContent = clientName || 'Клієнт';
    document.getElementById('sheet-sub').textContent   = 'Нотатки клієнта';

    // Hide action buttons, show only notes
    const actionBtns = document.getElementById('sheet-action-btns');
    if (actionBtns) actionBtns.style.display = 'none';

    ['note-allergies','note-preferences','note-formula','note-general'].forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = '';
    });

    document.getElementById('appt-overlay').classList.remove('hidden');
    document.getElementById('appt-action-sheet').classList.add('open');

    if (clientId) {
        const { data: cl } = await window.db
            .from('clients')
            .select('notes_allergies, preferences, color_formula, notes')
            .eq('id', clientId)
            .single();
        if (cl) {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            set('note-allergies',   cl.notes_allergies);
            set('note-preferences', cl.preferences);
            set('note-formula',     cl.color_formula);
            set('note-general',     cl.notes);
        }
    }

    const noteSec = document.getElementById('sheet-notes-section');
    if (noteSec) noteSec.style.display = '';
};

window.closeActionSheet = function() {
    document.getElementById('appt-overlay').classList.add('hidden');
    document.getElementById('appt-action-sheet').classList.remove('open');
    _actionApptId   = null;
    _actionClientId = null;
};

window.markStatus = async function(status) {
    if (!_actionApptId) return;
    await window.db.from('appointments').update({ status }).eq('id', _actionApptId);
    closeActionSheet();
    await loadTodaySchedule();
};

window.saveClientNotes = async function() {
    if (!_actionClientId) return;
    const btn = document.getElementById('save-notes-btn');
    if (btn) { btn.textContent = 'Збереження...'; btn.disabled = true; }

    const payload = {
        notes_allergies: document.getElementById('note-allergies').value.trim() || null,
        preferences:     document.getElementById('note-preferences').value.trim() || null,
        color_formula:   document.getElementById('note-formula').value.trim() || null,
        notes:           document.getElementById('note-general').value.trim() || null,
    };

    const { error } = await window.db.from('clients').update(payload).eq('id', _actionClientId);

    if (btn) {
        if (error) {
            btn.textContent = 'Помилка збереження';
            btn.style.background = '#ef4444';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Збережено';
        }
        btn.disabled = false;
        setTimeout(() => {
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Зберегти нотатки';
            btn.style.background = '';
        }, 2000);
    }
};

// ── Calendar appointment info popup ──────────────────
window.showCalApptInfo = function(clientName, serviceName, time, price, clientId) {
    document.getElementById('sheet-title').textContent = clientName;
    document.getElementById('sheet-sub').textContent   = `${serviceName} · ${time} · ₴${price}`;

    // Hide action buttons, show only notes
    const actionBtns = document.getElementById('sheet-action-btns');
    if (actionBtns) actionBtns.style.display = 'none';

    _actionApptId   = null;
    _actionClientId = clientId || null;

    // Clear note fields
    ['note-allergies','note-preferences','note-formula','note-general'].forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = '';
    });

    document.getElementById('appt-overlay').classList.remove('hidden');
    document.getElementById('appt-action-sheet').classList.add('open');

    const noteSec = document.getElementById('sheet-notes-section');

    if (clientId) {
        if (noteSec) noteSec.style.display = '';
        window.db.from('clients')
            .select('notes_allergies, preferences, color_formula, notes')
            .eq('id', clientId)
            .single()
            .then(({ data: cl }) => {
                if (!cl) return;
                const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
                set('note-allergies',   cl.notes_allergies);
                set('note-preferences', cl.preferences);
                set('note-formula',     cl.color_formula);
                set('note-general',     cl.notes);
            });
    } else {
        if (noteSec) noteSec.style.display = 'none';
    }
};
