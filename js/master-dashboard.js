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
const MONTH_UA = ['Січня','Лютого','Березня','Квітня','Травня','Червня','Липня','Серпня','Вересня','Жовтня','Листопада','Грудня'];

window.doLogout = function() {
    ['wella_staff_id','wella_staff_role','wella_staff_name','wella_proc_list'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'staff-login.html';
};

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

    await Promise.all([loadTodaySchedule(), loadUpcoming(), loadMonthStats(), loadMyClients()]);
});

// ── Today's schedule ──────────────────────────────────
async function loadTodaySchedule() {
    const today = localDate(new Date());
    const { data: appts } = await window.db
        .from('appointments')
        .select('*, clients(full_name, phone)')
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
                <button onclick="openActionSheet('${a.id}','${(a.clients?.full_name||'').replace(/'/g,"\\'")}','${a.service_name||''}','${a.appointment_time||''}')"
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
        .select('appointment_date, appointment_time, service_name, price, clients(full_name)')
        .eq('master_id', masterId)
        .gt('appointment_date', today)
        .lte('appointment_date', plus7)
        .neq('status', 'cancelled')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

    const list = document.getElementById('upcoming-list');
    if (!appts || appts.length === 0) {
        list.innerHTML = `<p class="py-8 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Немає найближчих записів</p>`;
        return;
    }

    list.innerHTML = appts.map(a => {
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
            <div class="text-right flex-shrink-0">
                <p class="text-[11px] font-black text-white">${fmtTime(a.appointment_time)}</p>
                <p class="text-[9px] text-zinc-600">₴${(a.price || 0).toLocaleString()}</p>
            </div>
        </div>`;
    }).join('');
}

// ── Month stats (KPIs + week bars) ───────────────────
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

    const totalRev  = allAppts.reduce((s,a) => s + (a.price||0), 0);
    const staffData = await window.db.from('staff').select('commission_rate').eq('id', masterId).single();
    const rate      = staffData.data?.commission_rate || 40;
    const earned    = Math.round(totalRev * rate / 100);

    document.getElementById('kpi-month').textContent  = allAppts.length;
    document.getElementById('kpi-earned').textContent = `₴${earned.toLocaleString()}`;

    if (reviews?.length) {
        const avg = reviews.reduce((s,r) => s + parseFloat(r.rating), 0) / reviews.length;
        document.getElementById('kpi-rating').textContent = `${avg.toFixed(1)} ★`;
    } else {
        document.getElementById('kpi-rating').textContent = '—';
    }

    // Week bars
    renderWeekBars(allAppts, now);
}

function renderWeekBars(appts, now) {
    const container = document.getElementById('week-bars');
    if (!container) return;
    const year = now.getFullYear(), month = now.getMonth();
    const weeks = [];
    let d = new Date(year, month, 1);
    while (d.getMonth() === month) {
        const wStart = localDate(d);
        const wEnd   = localDate(new Date(Math.min(new Date(year, month + 1, 0), new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6))));
        weeks.push({ label: `${d.getDate()}–${Math.min(new Date(year, month + 1, 0).getDate(), d.getDate() + 6)} ${MONTH_UA[month].toLowerCase()}`, start: wStart, end: wEnd });
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    }

    const weekCounts = weeks.map(w => appts.filter(a => a.date >= w.start && a.date <= w.end).length);
    const maxCount   = Math.max(...weekCounts, 1);

    container.innerHTML = weeks.map((w, i) => {
        const pct = Math.round((weekCounts[i] / maxCount) * 100);
        const isCurrentWeek = w.start <= localDate(now) && w.end >= localDate(now);
        return `
        <div class="space-y-1">
            <div class="flex justify-between text-[9px] font-black uppercase tracking-widest">
                <span class="${isCurrentWeek ? 'text-rose-400' : 'text-zinc-500'}">${w.label}</span>
                <span class="text-white">${weekCounts[i]} зап.</span>
            </div>
            <div class="h-1.5 w-full rounded-full" style="background:rgba(255,255,255,.05)">
                <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${isCurrentWeek?'#f43f5e':'rgba(255,255,255,.2)'}"></div>
            </div>
        </div>`;
    }).join('');
}

// ── My clients (unique clients this month) ────────────
async function loadMyClients() {
    const { data: appts } = await window.db
        .from('appointments')
        .select('client_id, clients(full_name, phone, instagram), service_name, appointment_date, appointment_time, price')
        .eq('master_id', masterId)
        .order('appointment_date', { ascending: false })
        .limit(50);

    const seen  = new Set();
    const unique = [];
    (appts || []).forEach(a => {
        if (!a.client_id || seen.has(a.client_id)) return;
        seen.add(a.client_id);
        unique.push(a);
    });

    document.getElementById('my-clients-count').textContent = `${seen.size} клієнтів`;

    const list = document.getElementById('my-clients-list');
    if (!unique.length) {
        list.innerHTML = `<p class="py-8 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Немає клієнтів</p>`;
        return;
    }

    list.innerHTML = unique.slice(0, 15).map(a => {
        const initials = (a.clients?.full_name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
        return `
        <div class="appt-row py-3 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-black text-xs text-white neo-gradient">${initials}</div>
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${a.clients?.full_name || '—'}</p>
                <p class="text-[9px] text-zinc-500 mt-0.5 truncate">${a.service_name || '—'} · ${fmtDate(a.appointment_date)}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                ${a.clients?.phone ? `<a href="tel:${a.clients.phone}" onclick="event.stopPropagation()"
                    class="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition">
                    <i class="fa-solid fa-phone text-[9px]"></i></a>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Action sheet ──────────────────────────────────────
let _actionApptId = null;

window.openActionSheet = function(id, client, service, time) {
    _actionApptId = id;
    document.getElementById('sheet-title').textContent = client || 'Клієнт';
    document.getElementById('sheet-sub').textContent   = `${service} · ${fmtTime(time)}`;
    document.getElementById('appt-overlay').classList.remove('hidden');
    document.getElementById('appt-action-sheet').classList.add('open');
};

window.closeActionSheet = function() {
    document.getElementById('appt-overlay').classList.add('hidden');
    document.getElementById('appt-action-sheet').classList.remove('open');
    _actionApptId = null;
};

window.markStatus = async function(status) {
    if (!_actionApptId) return;
    await window.db.from('appointments').update({ status }).eq('id', _actionApptId);
    closeActionSheet();
    await loadTodaySchedule();
};
