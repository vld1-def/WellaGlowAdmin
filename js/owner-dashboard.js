// js/owner-dashboard.js
const staffId = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboardStats();
    await loadTodayTimeline();
    await loadStaffEfficiency();
    await loadStockStatus();
});

async function loadDashboardStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [historyRes, clientsRes, allHistoryRes] = await Promise.all([
        window.db.from('appointment_history').select('price, client_id').gte('visit_date', monthStart),
        window.db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        window.db.from('appointment_history').select('client_id')
    ]);

    if (historyRes.data) {
        const totalProfit = historyRes.data.reduce((sum, h) => sum + h.price, 0);
        const totalVisits = historyRes.data.length;
        
        document.getElementById('kpi-profit').innerText = `₴${totalProfit.toLocaleString()}`;
        document.getElementById('kpi-profit-bar').style.width = `${Math.min((totalProfit / 215000) * 100, 100)}%`;
        document.getElementById('kpi-total-bookings').innerText = totalVisits;
        
        const bars = document.querySelectorAll('#kpi-bookings-bars div');
        bars.forEach((bar, i) => { if ((totalVisits/500)*100 > (i*25)) bar.classList.add('bg-rose-500'); });

        const avgBill = totalVisits > 0 ? Math.round(totalProfit / totalVisits) : 0;
        document.getElementById('kpi-avg-bill').innerText = `₴${avgBill.toLocaleString()}`;
    }

    // RETENTION RATE CALCULATION
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

async function loadTodayTimeline() {
    const today = new Date().toISOString().split('T')[0];
    const { data: apps } = await window.db.from('appointments').select('*, clients(full_name), staff(name)').eq('appointment_date', today).order('appointment_time', { ascending: true }).limit(4);
    
    const container = document.getElementById('today-timeline');
    if (container) {
        if (!apps || apps.length === 0) { container.innerHTML = '<p class="text-zinc-700 text-[10px] text-center font-bold py-10 uppercase">Немає візитів</p>'; return; }
        
        container.innerHTML = '<div class="timeline-line" style="left: 6px; top: 5px; bottom: 5px; width: 1px; background: rgba(255,255,255,0.08); position: absolute;"></div>' + 
        apps.map((app, index) => `
            <div class="relative flex justify-between items-start" style="opacity: ${1 - index * 0.2}">
                <div class="flex gap-4">
                    <div class="mt-1.5 shrink-0"><div class="status-dot ${app.status === 'confirmed' ? 'active' : 'waiting'} w-2.5 h-2.5 rounded-full"></div></div>
                    <div>
                        <p class="text-[12px] font-extrabold text-white leading-none">${app.clients?.full_name || 'Гість'}</p>
                        <p class="text-[9px] text-zinc-500 mt-1.5">${app.service_name}</p>
                        <p class="text-[8px] font-black text-rose-500 uppercase mt-2 tracking-widest">${app.staff?.name || '---'}</p>
                    </div>
                </div>
                <span class="text-[9px] font-bold text-zinc-600">${app.appointment_time.substring(0, 5)}</span>
            </div>`).join('');
    }
}

async function loadStaffEfficiency() {
    const { data: masters } = await window.db.from('staff').select('*').eq('role', 'master').order('revenue', { ascending: false });
    const tbody = document.getElementById('staff-efficiency-body');
    if (masters && tbody) {
        tbody.innerHTML = masters.map(m => `
            <tr class="group hover:bg-white/5 transition">
                <td class="py-4 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center font-black text-[10px] text-rose-500 border border-white/5">${m.name.substring(0, 2).toUpperCase()}</div>
                    <span class="text-xs font-bold text-zinc-200">${m.name}</span>
                </td>
                <td class="py-4 text-center text-xs font-black text-emerald-400">${m.appointments_count || 0} записи</td>
                <td class="py-4 text-center text-xs font-black text-white">₴${(m.revenue || 0).toLocaleString()}</td>
                <td class="py-4 text-right"><span class="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-md text-[8px] font-black uppercase">У зміні</span></td>
            </tr>`).join('');
    }
}

async function loadStockStatus() {
    const { data: items } = await window.db.from('inventory').select('*').order('current_stock', { ascending: true }).limit(5);
    const container = document.getElementById('stock-status-list');
    if (items && container) {
        container.innerHTML = items.map(item => {
            const percent = Math.round((item.current_stock / item.max_stock) * 100);
            let color = 'bg-emerald-500'; if (percent <= 20) color = 'bg-rose-500 animate-pulse'; else if (percent <= 50) color = 'bg-amber-500';
            return `<div class="space-y-1.5">
                <div class="flex justify-between text-[9px] font-black uppercase text-zinc-400"><span>${item.name}</span><span class="text-white">${percent}%</span></div>
                <div class="h-1 w-full bg-zinc-900 rounded-full overflow-hidden"><div class="h-full ${color}" style="width: ${percent}%"></div></div>
            </div>`;
        }).join('');
    }
}

function initProfitChart() {
    const ctx = document.getElementById('profitChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');
    new Chart(ctx, {
        type: 'line',
        data: { labels: ['01', '05', '10', '15', '20', '25', '30'], datasets: [{ data: [15000, 22000, 18000, 31000, 28000, 42000, 38000], borderColor: '#f43f5e', borderWidth: 3, fill: true, backgroundColor: gradient, tension: 0.4, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false }, ticks: { color: '#52525b', font: { size: 9 } } }, x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 9 } } } } }
    });
}
