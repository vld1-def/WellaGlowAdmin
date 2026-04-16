// js/master-history.js
const masterId   = localStorage.getItem('wella_staff_id');
const masterName = localStorage.getItem('wella_staff_name') || 'Майстер';

if (!masterId) window.location.href = 'staff-login.html';

window.doLogout = function() {
    ['wella_staff_id','wella_staff_role','wella_staff_name','wella_proc_list'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'staff-login.html';
};

// ── Helpers ───────────────────────────────────────────
function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(str) {
    if (!str) return '—';
    const [y,m,d] = str.split('-');
    return `${d}.${m}.${y}`;
}
function fmtDateTime(str) {
    if (!str) return '—';
    const d = new Date(str);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

// ── State ─────────────────────────────────────────────
let _currentTab   = 'appts';
let _year         = new Date().getFullYear();
let _month        = new Date().getMonth(); // 0-based
let _commissionRate = 40;

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const av = document.getElementById('master-avatar');
    const nm = document.getElementById('master-name');
    if (av) av.textContent = masterName.charAt(0).toUpperCase();
    if (nm) nm.textContent = masterName;

    // Load commission rate
    const { data: st } = await window.db.from('staff').select('commission_rate').eq('id', masterId).single();
    _commissionRate = st?.commission_rate || 40;
    document.getElementById('kpi-rate').textContent = `${_commissionRate}%`;

    updateMonthLabel();
    await loadData();
});

function updateMonthLabel() {
    document.getElementById('month-label').textContent = `${MONTHS_UA[_month]} ${_year}`;
}

window.prevMonth = async function() {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    updateMonthLabel();
    await loadData();
};

window.nextMonth = async function() {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    updateMonthLabel();
    await loadData();
};

window.switchTab = function(tab) {
    _currentTab = tab;
    document.getElementById('tab-appts').classList.toggle('active', tab === 'appts');
    document.getElementById('tab-salary').classList.toggle('active', tab === 'salary');
    document.getElementById('panel-appts').classList.toggle('hidden', tab !== 'appts');
    document.getElementById('panel-salary').classList.toggle('hidden', tab !== 'salary');
};

async function loadData() {
    if (_currentTab === 'appts' || true) {
        // Always reload both panels on month change
        await Promise.all([loadAppts(), loadSalary()]);
    }
}

// ── Appointments history ──────────────────────────────
async function loadAppts() {
    const mStart = `${_year}-${String(_month+1).padStart(2,'0')}-01`;
    const lastDay = new Date(_year, _month+1, 0).getDate();
    const mEnd   = `${_year}-${String(_month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const list = document.getElementById('appts-list');
    list.innerHTML = `<p class="py-6 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest">Завантаження...</p>`;

    // Query both tables
    const [{ data: hist }, { data: active }] = await Promise.all([
        window.db.from('appointment_history')
            .select('id, visit_date, service_name, price, payment_method, clients(full_name)')
            .eq('master_id', masterId)
            .gte('visit_date', mStart)
            .lte('visit_date', mEnd)
            .order('visit_date', { ascending: false }),
        window.db.from('appointments')
            .select('id, appointment_date, appointment_time, service_name, price, status, clients(full_name)')
            .eq('master_id', masterId)
            .gte('appointment_date', mStart)
            .lte('appointment_date', mEnd)
            .in('status', ['done','completed'])
            .order('appointment_date', { ascending: false }),
    ]);

    const combined = [
        ...(hist||[]).map(a => ({ date: a.visit_date, service: a.service_name, price: a.price, client: a.clients?.full_name, source: 'history', payment: a.payment_method })),
        ...(active||[]).map(a => ({ date: a.appointment_date, service: a.service_name, price: a.price, client: a.clients?.full_name, source: 'active' })),
    ].sort((a,b) => b.date.localeCompare(a.date));

    // KPI
    const total = combined.reduce((s,a) => s + (a.price||0), 0);
    const earned = Math.round(total * _commissionRate / 100);
    document.getElementById('kpi-count').textContent  = combined.length;
    document.getElementById('kpi-earned').textContent = `₴${earned.toLocaleString()}`;

    if (!combined.length) {
        list.innerHTML = `<p class="py-8 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Немає записів за цей місяць</p>`;
        return;
    }

    list.innerHTML = combined.map(a => {
        const earnedAppt = Math.round((a.price||0) * _commissionRate / 100);
        const payLabel = a.payment === 'cash' ? 'Готівка' : a.payment === 'card' ? 'Картка' : '';
        return `
        <div class="appt-row py-3 flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${a.client || 'Гість'}</p>
                <p class="text-[9px] text-zinc-500 mt-0.5 truncate">${a.service || '—'} · ${fmtDate(a.date)}</p>
                ${payLabel ? `<p class="text-[8px] text-zinc-700 mt-0.5">${payLabel}</p>` : ''}
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-[11px] font-black text-white">₴${(a.price||0).toLocaleString()}</p>
                <p class="text-[9px] text-emerald-500 mt-0.5">+₴${earnedAppt.toLocaleString()}</p>
            </div>
        </div>`;
    }).join('');
}

// ── Salary payments ───────────────────────────────────
async function loadSalary() {
    const mStart = `${_year}-${String(_month+1).padStart(2,'0')}-01`;
    const lastDay = new Date(_year, _month+1, 0).getDate();
    const mEnd   = `${_year}-${String(_month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const list = document.getElementById('salary-list');
    list.innerHTML = `<p class="py-6 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest">Завантаження...</p>`;

    // Try both 'salary' category and staff_id filter
    const { data: payments } = await window.db
        .from('transactions')
        .select('id, amount, description, created_at, category, type')
        .eq('staff_id', masterId)
        .gte('created_at', mStart + 'T00:00:00')
        .lte('created_at', mEnd + 'T23:59:59')
        .order('created_at', { ascending: false });

    // Also try without date filter if no results (some stores use different columns)
    const salaryTxns = (payments || []).filter(t =>
        t.category === 'salary' || t.category === 'зарплата' || t.type === 'salary' ||
        (t.description || '').toLowerCase().includes('зарплат') ||
        (t.description || '').toLowerCase().includes('виплат')
    );

    const totalPaid = salaryTxns.reduce((s,t) => s + Math.abs(t.amount||0), 0);

    if (!salaryTxns.length) {
        list.innerHTML = `<p class="py-8 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Немає виплат за цей місяць</p>`;
        return;
    }

    list.innerHTML = salaryTxns.map(t => {
        const amt = Math.abs(t.amount || 0);
        return `
        <div class="appt-row py-3 flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${t.description || 'Виплата зарплати'}</p>
                <p class="text-[9px] text-zinc-500 mt-0.5">${fmtDateTime(t.created_at)}</p>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-[13px] font-black text-emerald-400">₴${amt.toLocaleString()}</p>
            </div>
        </div>`;
    }).join('');

    // Append total
    list.innerHTML += `
        <div class="py-3 flex items-center justify-between">
            <p class="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Разом виплачено</p>
            <p class="text-sm font-black text-emerald-400">₴${totalPaid.toLocaleString()}</p>
        </div>`;
}
