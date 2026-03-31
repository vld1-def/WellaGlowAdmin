// js/owner-dashboard.js

const staffId = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Встановлення вітання
    const elAdminName = document.getElementById('admin-name');
    if (elAdminName) elAdminName.innerText = localStorage.getItem('wella_staff_name') || 'Власник';

    // Завантаження всіх блоків
    await loadDashboardStats();
    await loadTodayTimeline();
    await loadStaffEfficiency();
    await loadStockStatus();
});

// --- 1. АНАЛІТИКА KPI ТА RETENTION ---
async function loadDashboardStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // 1. Отримуємо дані
    const [historyRes, clientsRes, allClientsCountRes] = await Promise.all([
        window.db.from('appointment_history').select('price, client_id').gte('visit_date', monthStart),
        window.db.from('clients').select('id, created_at'),
        window.db.from('clients').select('*', { count: 'exact', head: true })
    ]);

    const history = historyRes.data || [];
    const allClients = clientsRes.data || [];
    const totalClientsCount = allClientsCountRes.count || 0;

    // --- РОЗРАХУНОК RETENTION RATE ---
    // Повернення = (клієнти з понад 1 записом в історії) / (загальна база)
    const { data: globalHistory } = await window.db.from('appointment_history').select('client_id');
    const clientVisitCounts = {};
    globalHistory.forEach(h => {
        clientVisitCounts[h.client_id] = (clientVisitCounts[h.client_id] || 0) + 1;
    });
    const returningClients = Object.values(clientVisitCounts).filter(count => count > 1).length;
    const retentionRate = totalClientsCount > 0 ? Math.round((returningClients / totalClientsCount) * 100) : 0;
    
    document.getElementById('kpi-retention').innerText = `${retentionRate}%`;

    // --- ПРИБУТОК ТА ПРОГРЕС ЗАПИСІВ ---
    const totalProfit = history.reduce((sum, h) => sum + h.price, 0);
    document.getElementById('kpi-profit').innerText = `₴${totalProfit.toLocaleString()}`;
    document.getElementById('kpi-profit-bar').style.width = `${Math.min((totalProfit / 215000) * 100, 100)}%`;
    
    document.getElementById('kpi-total-bookings').innerText = history.length;
    
    // Нові клієнти (поточний міс)
    const newClientsThisMonth = allClients.filter(c => c.created_at >= monthStart).length;
    document.getElementById('kpi-new-clients').innerText = newClientsThisMonth;

    // Сегменти записів
    const bars = document.querySelectorAll('#kpi-bookings-bars div');
    const bookingPercent = (history.length / 500) * 100;
    bars.forEach((bar, index) => {
        if (bookingPercent > (index * 25)) {
            bar.classList.replace('bg-zinc-800', 'bg-rose-500');
        }
    });

    initProfitChart();
}

// --- 2. ЕФЕКТИВНІСТЬ МАЙСТРІВ ---
async function loadStaffEfficiency() {
    const { data: masters } = await window.db
        .from('staff')
        .select('*')
        .eq('role', 'master')
        .eq('is_active', true)
        .order('revenue', { ascending: false });

    const tbody = document.getElementById('staff-efficiency-body');
    if (masters && tbody) {
        tbody.innerHTML = masters.map(m => `
            <tr class="group hover:bg-white/5 transition">
                <td class="py-4 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center font-black text-[10px] text-rose-500 border border-white/5">
                        ${m.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span class="text-xs font-bold text-zinc-200">${m.name}</span>
                </td>
                <td class="py-4 text-center text-xs font-black text-emerald-400 italic-none">${m.appointments_count || 0} візитів</td>
                <td class="py-4 text-center text-xs font-black text-white italic-none">₴${(m.revenue || 0).toLocaleString()}</td>
                <td class="py-4 text-right">
                    <span class="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded-md text-[8px] font-black uppercase tracking-widest">Активний</span>
                </td>
            </tr>
        `).join('');
    }
}

// --- 3. СТАН СКЛАДУ (З КОЛЬОРАМИ) ---
async function loadStockStatus() {
    const { data: items } = await window.db.from('inventory').select('*').order('current_stock', { ascending: true }).limit(4);
    const container = document.getElementById('stock-status-list');
    
    if (items && container) {
        container.innerHTML = items.map(item => {
            const percent = Math.round((item.current_stock / item.max_stock) * 100);
            let colorClass = 'bg-emerald-500';
            let textStatus = 'В нормі';
            
            if (percent <= 15) { colorClass = 'bg-rose-500 animate-pulse'; textStatus = 'Критично'; }
            else if (percent <= 40) { colorClass = 'bg-amber-500'; textStatus = 'Мало'; }

            return `
                <div class="space-y-2">
                    <div class="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                        <span class="text-zinc-400">${item.name}</span>
                        <span class="${percent <= 15 ? 'text-rose-500' : 'text-zinc-500'}">${textStatus}</span>
                    </div>
                    <div class="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                        <div class="h-full ${colorClass} transition-all duration-1000" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// --- 4. ТАЙМЛАЙН ЗАПИСІВ ---
async function loadTodayTimeline() {
    const today = new Date().toISOString().split('T')[0];
    const { data: apps } = await window.db
        .from('appointments')
        .select('*, clients(full_name), staff(name)')
        .eq('appointment_date', today)
        .order('appointment_time', { ascending: true })
        .limit(4);

    const container = document.getElementById('today-timeline');
    if (container) {
        if (!apps || apps.length === 0) {
            container.innerHTML = '<p class="text-zinc-600 text-[10px] uppercase font-bold text-center py-10">Записів немає</p>';
            return;
        }

        container.innerHTML = '<div class="timeline-line" style="left: 6px; top: 5px; bottom: 5px; width: 1px; background: rgba(255,255,255,0.08); position: absolute;"></div>' + 
        apps.map((app, index) => `
            <div class="relative flex justify-between items-start transition hover:translate-x-1" style="opacity: ${1 - index * 0.2}">
                <div class="flex gap-5">
                    <div class="mt-1.5 shrink-0">
                        <div class="status-dot ${app.status === 'confirmed' ? 'active' : 'waiting'} w-2.5 h-2.5 rounded-full"></div>
                    </div>
                    <div>
                        <p class="text-[13px] font-extrabold text-white leading-none">${app.clients?.full_name || 'Гість'}</p>
                        <p class="text-[10px] text-zinc-500 mt-2 font-medium tracking-tight">${app.service_name}</p>
                        <p class="text-[9px] font-bold ${app.status === 'confirmed' ? 'text-rose-500' : 'text-zinc-600'} mt-2 tracking-widest uppercase italic-none">
                            ${app.appointment_time.substring(0, 5)}
                        </p>
                    </div>
                </div>
                <span class="master-badge px-2 py-1 bg-white/5 text-zinc-500 text-[8px] font-black uppercase rounded-md">
                    ${app.staff?.name || '---'}
                </span>
            </div>
        `).join('');
    }
}

// ГРАФІК
function initProfitChart() {
    const ctx = document.getElementById('profitChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
            datasets: [{
                data: [18000, 24000, 19000, 28000, 35000, 48000, 41000],
                borderColor: '#f43f5e',
                borderWidth: 3,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false }, ticks: { color: '#52525b', font: { size: 9 } } }, x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 9 } } } } }
    });
}

window.logoutStaff = () => { localStorage.clear(); window.location.href = 'staff-login.html'; };
