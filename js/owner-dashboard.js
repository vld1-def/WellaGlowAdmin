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
    await Promise.all([
        loadDashboardStats(),
        loadTodayTimeline(),
        loadStaffEfficiency(),
        loadStockStatus(),
        loadTopServices(),
        loadRecentReviews(),
    ]);
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

    const dotClass = (status) => {
        if (status === 'confirmed') return 'bg-pink-500 shadow-[0_0_8px_2px_rgba(236,72,153,.5)]';
        if (status === 'done' || status === 'completed') return 'bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,.4)]';
        return 'bg-zinc-700';
    };

    const renderAppt = (app) => `
        <div class="relative flex justify-between items-start pl-5 mb-6">
            <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full z-10 ${dotClass(app.status)}" style="border:2px solid #0d0d0f"></div>
            <div class="flex-1 min-w-0">
                <p class="text-[12px] font-extrabold text-white leading-none truncate">${app.clients?.full_name||'Гість'}</p>
                <p class="text-[9px] text-zinc-500 mt-1 truncate">${app.service_name||''}</p>
                <p class="text-[8px] font-black text-rose-500 uppercase mt-1 tracking-widest">${app.staff?.name||'---'}</p>
            </div>
            <span class="text-[9px] font-bold text-zinc-600 flex-shrink-0 ml-2">${(app.appointment_time||'').substring(0,5)}</span>
        </div>`;

    let innerHtml = apps.map(renderAppt).join('');

    if (tomorrowApps.length) {
        innerHtml += `
        <div class="flex items-center gap-2 mb-4 pl-5">
            <span class="text-[8px] font-black text-amber-500 uppercase tracking-widest">— Завтра</span>
        </div>`;
        innerHtml += tomorrowApps.map(renderAppt).join('');
    }

    // Vertical timeline line + appointments in one relative wrapper
    container.innerHTML = `
        <div class="relative">
            <div class="absolute left-[4px] top-0 bottom-0 w-px" style="background:rgba(255,255,255,.06)"></div>
            ${innerHtml}
        </div>`;
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
    const { data: rawItems, error } = await window.db.from('inventory').select('*');
    const container = document.getElementById('stock-status-list');
    if (!container) return;
    if (error || !rawItems?.length) { container.innerHTML = '<p class="text-zinc-700 text-[10px] text-center py-4 font-bold uppercase">Склад порожній</p>'; return; }
    // Sort by stock level ascending (lowest first) in JS to avoid column-name mismatch
    const items = [...rawItems].sort((a,b) => {
        const aS = parseFloat(a.current_stock ?? a.quantity ?? a.stock ?? 0);
        const bS = parseFloat(b.current_stock ?? b.quantity ?? b.stock ?? 0);
        return aS - bS;
    }).slice(0, 5);
    container.innerHTML = items.map(item => {
        const itemName = item.name || item.item_name || item.title || 'Без назви';
        const current = parseFloat(item.current_stock ?? item.quantity ?? item.stock ?? 0);
        const max     = parseFloat(item.max_stock ?? item.max_quantity ?? item.capacity ?? 100);
        const pct = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0;
        let color = 'bg-emerald-500';
        if (pct <= 20) color = 'bg-rose-500 animate-pulse';
        else if (pct <= 50) color = 'bg-amber-500';
        return `<div class="space-y-1.5">
            <div class="flex justify-between text-[9px] font-black uppercase text-zinc-400"><span class="truncate">${itemName}</span><span class="text-white ml-2 flex-shrink-0">${pct}%</span></div>
            <div class="h-1 w-full bg-zinc-900 rounded-full overflow-hidden"><div class="h-full ${color}" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

// ── Dashboard Settings ────────────────────────────────
const DASH_BLOCKS = [
    { id:'analytics-block',      label:'Аналітика доходів',    icon:'fa-chart-line' },
    { id:'today-block',          label:'Візити сьогодні',      icon:'fa-calendar-day' },
    { id:'efficiency-block',     label:'Ефективність майстрів',icon:'fa-users' },
    { id:'stock-block',          label:'Стан складу',          icon:'fa-boxes-stacked' },
    { id:'top-services-block',   label:'Топ-послуги місяця',   icon:'fa-fire' },
    { id:'recent-reviews-block', label:'Останні відгуки',      icon:'fa-star' },
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

// ── Top Services ──────────────────────────────────────
async function loadTopServices() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];

    const { data } = await window.db
        .from('appointment_history')
        .select('service_name, price')
        .gte('visit_date', monthStart)
        .lte('visit_date', monthEnd);

    const container = document.getElementById('top-services-list');
    if (!container) return;

    if (!data?.length) {
        container.innerHTML = '<p class="text-zinc-700 text-[10px] text-center py-4 font-bold uppercase">Немає даних</p>';
        return;
    }

    const map = {};
    data.forEach(a => {
        const k = a.service_name || 'Без назви';
        if (!map[k]) map[k] = { count:0, revenue:0 };
        map[k].count++;
        map[k].revenue += parseFloat(a.price||0);
    });

    const sorted = Object.entries(map).sort((a,b) => b[1].count - a[1].count).slice(0, 5);
    const maxCount = sorted[0]?.[1]?.count || 1;

    container.innerHTML = sorted.map(([name, stats]) => `
        <div class="space-y-1">
            <div class="flex justify-between text-[10px]">
                <span class="font-bold text-white truncate">${name}</span>
                <span class="text-zinc-500 flex-shrink-0 ml-2">${stats.count} · ₴${stats.revenue.toLocaleString('uk-UA')}</span>
            </div>
            <div class="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                <div class="h-full bg-rose-500/60 rounded-full" style="width:${Math.round(stats.count/maxCount*100)}%"></div>
            </div>
        </div>`).join('');
}

// ── Recent Reviews ────────────────────────────────────
async function loadRecentReviews() {
    const { data } = await window.db
        .from('reviews')
        .select('rating, comment, created_at, clients(full_name), staff(name)')
        .order('created_at', { ascending: false })
        .limit(5);

    const container = document.getElementById('recent-reviews-list');
    if (!container) return;

    if (!data?.length) {
        container.innerHTML = '<p class="text-zinc-700 text-[10px] text-center py-4 font-bold uppercase">Немає відгуків</p>';
        return;
    }

    const stars = n => Array.from({length:5},(_,i) =>
        `<i class="fa-solid fa-star text-[8px] ${i < Math.round(n) ? 'text-amber-400' : 'text-zinc-700'}"></i>`
    ).join('');

    const fmtD = s => { const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`; };

    container.innerHTML = data.map(r => `
        <div class="py-2 border-b border-white/5 last:border-0">
            <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] font-bold text-white truncate">${r.clients?.full_name||'Клієнт'}</p>
                <div class="flex items-center gap-0.5 flex-shrink-0">${stars(r.rating)}</div>
            </div>
            <div class="flex justify-between mt-0.5">
                <p class="text-[9px] text-zinc-600">${r.staff?.name||'—'}</p>
                <p class="text-[9px] text-zinc-700">${fmtD(r.created_at)}</p>
            </div>
            ${r.comment ? `<p class="text-[9px] text-zinc-500 mt-1 line-clamp-1">${r.comment}</p>` : ''}
        </div>`).join('');
}

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
