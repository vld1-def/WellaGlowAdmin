// js/owner-dashboard.js
const staffId = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

// ── Month Selector (sidebar) ──────────────────────────
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

// ── Profile ───────────────────────────────────────────
function initSidebarProfile(){
    const name=localStorage.getItem('wella_staff_name')||'';
    const role=localStorage.getItem('wella_staff_role')||'';
    const av=document.getElementById('sidebar-avatar');
    const un=document.getElementById('sidebar-uname');
    const ur=document.getElementById('sidebar-urole');
    if(av)av.textContent=name.charAt(0).toUpperCase()||'A';
    if(un)un.textContent=name||'—';
    if(ur)ur.textContent=role;
}

window.doLogout=function(){
    ['wella_staff_id','wella_staff_role','wella_staff_name','wella_proc_list'].forEach(k=>localStorage.removeItem(k));
    window.location.href='staff-login.html';
};

window.addEventListener('monthchange', async ()=>{ await loadDashboardStats(); });

document.addEventListener('DOMContentLoaded', async () => {
    initSidebarMonth();
    initSidebarProfile();
    initDashSettings();
    await loadDashboardStats();
    await loadTodayTimeline();
    await loadStaffEfficiency();
    await loadStockStatus();
});

// ── Dashboard Stats ───────────────────────────────────
async function loadDashboardStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [historyRes, clientsRes, allHistoryRes] = await Promise.all([
        window.db.from('appointment_history').select('price, client_id').gte('visit_date', monthStart).lte('visit_date', monthEnd),
        window.db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        window.db.from('appointment_history').select('client_id')
    ]);

    if (historyRes.data) {
        const totalProfit = historyRes.data.reduce((sum, h) => sum + (parseFloat(h.price)||0), 0);
        const totalVisits = historyRes.data.length;

        document.getElementById('kpi-profit').innerText = `₴${totalProfit.toLocaleString('uk-UA')}`;
        // Progress bar: target ₴215,000/month
        const pct = Math.min(Math.round((totalProfit / 215000) * 100), 100);
        document.getElementById('kpi-profit-bar').style.width = `${pct}%`;
        const pctEl = document.getElementById('kpi-profit-pct');
        if (pctEl) pctEl.textContent = `${pct}%`;

        document.getElementById('kpi-total-bookings').innerText = totalVisits;
        const bars = document.querySelectorAll('#kpi-bookings-bars div');
        bars.forEach((bar, i) => { bar.classList.toggle('bg-rose-500', (totalVisits/500)*100 > i*25); });

        const avgBill = totalVisits > 0 ? Math.round(totalProfit / totalVisits) : 0;
        document.getElementById('kpi-avg-bill').innerText = `₴${avgBill.toLocaleString('uk-UA')}`;
    }

    if (allHistoryRes.data) {
        const clientVisits = {};
        allHistoryRes.data.forEach(h => { clientVisits[h.client_id] = (clientVisits[h.client_id] || 0) + 1; });
        const returning = Object.values(clientVisits).filter(v => v > 1).length;
        const totalUnique = Object.keys(clientVisits).length;
        const rate = totalUnique > 0 ? Math.round((returning / totalUnique) * 100) : 0;
        document.getElementById('kpi-retention').innerText = `${rate}%`;
    }

    document.getElementById('kpi-new-clients').innerText = clientsRes.count || 0;
    initProfitChart();
}

// ── Today Timeline (+ tomorrow if < 3 today) ─────────
async function loadTodayTimeline() {
    const ld = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const today    = ld(new Date());
    const tomorrow = ld(new Date(Date.now() + 86400000));

    const { data: todayApps } = await window.db
        .from('appointments')
        .select('*, clients(full_name), staff(name)')
        .eq('appointment_date', today)
        .neq('status', 'cancelled')
        .order('appointment_time', { ascending: true })
        .limit(5);

    const container = document.getElementById('today-timeline');
    if (!container) return;

    let apps = todayApps || [];
    let tomorrowApps = [];

    if (apps.length < 3) {
        const { data: tmr } = await window.db
            .from('appointments')
            .select('*, clients(full_name), staff(name)')
            .eq('appointment_date', tomorrow)
            .neq('status', 'cancelled')
            .order('appointment_time', { ascending: true })
            .limit(4 - apps.length);
        tomorrowApps = tmr || [];
    }

    if (!apps.length && !tomorrowApps.length) {
        container.innerHTML = '<p class="text-zinc-700 text-[10px] text-center font-bold py-10 uppercase">Немає візитів</p>';
        return;
    }

    const renderAppt = (app) => `
        <div class="relative flex justify-between items-start">
            <div class="flex gap-4">
                <div class="mt-1.5 shrink-0">
                    <div class="w-2.5 h-2.5 rounded-full ${app.status==='confirmed'?'bg-pink-500 shadow-[0_0_8px_2px_rgba(236,72,153,.5)]':'bg-zinc-700'}"></div>
                </div>
                <div>
                    <p class="text-[12px] font-extrabold text-white leading-none">${app.clients?.full_name||'Гість'}</p>
                    <p class="text-[9px] text-zinc-500 mt-1.5">${app.service_name||''}</p>
                    <p class="text-[8px] font-black text-rose-500 uppercase mt-2 tracking-widest">${app.staff?.name||'---'}</p>
                </div>
            </div>
            <span class="text-[9px] font-bold text-zinc-600 flex-shrink-0">${(app.appointment_time||'').substring(0,5)}</span>
        </div>`;

    let html = apps.map(renderAppt).join('');

    if (tomorrowApps.length) {
        html += `
        <div class="flex items-center gap-2 py-1">
            <div class="h-px flex-1" style="background:rgba(255,255,255,.06)"></div>
            <span class="text-[8px] font-black text-amber-500 uppercase tracking-widest px-1">Завтра</span>
            <div class="h-px flex-1" style="background:rgba(255,255,255,.06)"></div>
        </div>`;
        html += tomorrowApps.map(renderAppt).join('');
    }

    container.innerHTML = `<div class="space-y-8">${html}</div>`;
}

// ── Staff Efficiency (real computed data) ─────────────
async function loadStaffEfficiency() {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const monthEnd   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];

    const [{ data: masters }, { data: histAppts }, { data: activeAppts }] = await Promise.all([
        window.db.from('staff').select('id,name,commission_rate').eq('role','master'),
        window.db.from('appointment_history').select('master_id,price').gte('visit_date',monthStart).lte('visit_date',monthEnd),
        window.db.from('appointments').select('master_id,price').gte('appointment_date',monthStart).lte('appointment_date',monthEnd).in('status',['done','completed']),
    ]);

    const map = {};
    [...(histAppts||[]), ...(activeAppts||[])].forEach(a => {
        if (!a.master_id) return;
        if (!map[a.master_id]) map[a.master_id] = { count:0, revenue:0 };
        map[a.master_id].count++;
        map[a.master_id].revenue += parseFloat(a.price||0);
    });

    const tbody = document.getElementById('staff-efficiency-body');
    if (!masters || !tbody) return;

    const sorted = [...masters].sort((a,b) => (map[b.id]?.revenue||0) - (map[a.id]?.revenue||0));

    if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">Немає даних</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map(m => {
        const stats = map[m.id] || { count:0, revenue:0 };
        const rate  = m.commission_rate || 40;
        const earned = Math.round(stats.revenue * rate / 100);
        return `<tr class="group hover:bg-white/5 transition">
            <td class="py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center font-black text-[10px] text-rose-500 border border-white/5">${(m.name||'?').substring(0,2).toUpperCase()}</div>
                <span class="text-xs font-bold text-zinc-200">${m.name}</span>
            </td>
            <td class="py-3 text-center text-xs font-black text-zinc-400">${stats.count}</td>
            <td class="py-3 text-center text-xs font-black text-white">₴${stats.revenue.toLocaleString('uk-UA')}</td>
            <td class="py-3 text-right text-xs font-black text-emerald-400">₴${earned.toLocaleString('uk-UA')}</td>
        </tr>`;
    }).join('');
}

// ── Stock Status ──────────────────────────────────────
async function loadStockStatus() {
    const { data: items } = await window.db.from('inventory').select('*').order('current_stock', { ascending: true }).limit(5);
    const container = document.getElementById('stock-status-list');
    if (!items || !container) return;
    if (!items.length) { container.innerHTML = '<p class="text-zinc-700 text-[10px] text-center py-4 font-bold uppercase">Склад порожній</p>'; return; }
    container.innerHTML = items.map(item => {
        const pct = item.max_stock > 0 ? Math.round((item.current_stock / item.max_stock) * 100) : 0;
        let color = 'bg-emerald-500';
        if (pct <= 20) color = 'bg-rose-500 animate-pulse';
        else if (pct <= 50) color = 'bg-amber-500';
        return `<div class="space-y-1.5">
            <div class="flex justify-between text-[9px] font-black uppercase text-zinc-400"><span>${item.name}</span><span class="text-white">${pct}%</span></div>
            <div class="h-1 w-full bg-zinc-900 rounded-full overflow-hidden"><div class="h-full ${color}" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

// ── Dashboard Settings ────────────────────────────────
const DASH_BLOCKS = [
    { id:'analytics-block',  label:'Аналітика доходів', icon:'fa-chart-line' },
    { id:'today-block',      label:'Візити сьогодні',   icon:'fa-calendar-day' },
    { id:'efficiency-block', label:'Ефективність майстрів', icon:'fa-users' },
    { id:'stock-block',      label:'Стан складу',       icon:'fa-boxes-stacked' },
];

function initDashSettings() {
    const saved = JSON.parse(localStorage.getItem('wella_dash_blocks') || '{}');
    const container = document.getElementById('dash-block-toggles');
    if (!container) return;

    container.innerHTML = DASH_BLOCKS.map(b => {
        const isOn = b.id in saved ? saved[b.id] : true;
        return `<div class="dash-toggle">
            <div class="flex items-center gap-3">
                <i class="fa-solid ${b.icon} text-rose-500 text-xs w-4"></i>
                <span class="text-[11px] font-bold text-white">${b.label}</span>
            </div>
            <label class="toggle-sw">
                <input type="checkbox" id="dash-toggle-${b.id}" ${isOn?'checked':''} onchange="saveDashBlock('${b.id}',this.checked)">
                <span class="slider"></span>
            </label>
        </div>`;
    }).join('');

    // Apply visibility
    DASH_BLOCKS.forEach(b => {
        const isOn = b.id in saved ? saved[b.id] : true;
        const el = document.getElementById(b.id);
        if (el) el.classList.toggle('hidden', !isOn);
    });
}

window.saveDashBlock = function(id, visible) {
    const saved = JSON.parse(localStorage.getItem('wella_dash_blocks') || '{}');
    saved[id] = visible;
    localStorage.setItem('wella_dash_blocks', JSON.stringify(saved));
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
};

window.openDashSettings = function() {
    document.getElementById('dash-settings-overlay').classList.remove('hidden');
    document.getElementById('dash-settings-drawer').classList.remove('translate-x-full');
};

window.closeDashSettings = function() {
    document.getElementById('dash-settings-overlay').classList.add('hidden');
    document.getElementById('dash-settings-drawer').classList.add('translate-x-full');
};

// ── Profit Chart ──────────────────────────────────────
function initProfitChart() {
    const canvas = document.getElementById('profitChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');
    if (window._profitChartInst) { window._profitChartInst.destroy(); }
    window._profitChartInst = new Chart(ctx, {
        type: 'line',
        data: { labels: ['01', '05', '10', '15', '20', '25', '30'], datasets: [{ data: [15000, 22000, 18000, 31000, 28000, 42000, 38000], borderColor: '#f43f5e', borderWidth: 3, fill: true, backgroundColor: gradient, tension: 0.4, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#52525b', font: { size: 9 } } }, x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 9 } } } } }
    });
}
