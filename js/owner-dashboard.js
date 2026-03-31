// js/owner-dashboard.js

const staffId = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

// 1. ПЕРЕВІРКА ДОСТУПУ (Тільки owner або admin)
if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('admin-name').innerText = localStorage.getItem('wella_staff_name') || 'Адмін';
    
    await loadDashboardStats();
    await loadTodayTimeline();
    await loadStaffEfficiency();
    await loadStockStatus();
});

// 2. ЗАВАНТАЖЕННЯ KPI ТА ГРАФІКА
async function loadDashboardStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // Отримуємо історію візитів за цей місяць
    const { data: history } = await window.db.from('appointment_history').select('price').gte('visit_date', monthStart);
    
    // Нові клієнти (поточний місяць vs минулий)
    const { count: currentNewClients } = await window.db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', monthStart);
    const { count: prevNewClients } = await window.db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', prevMonthStart).lt('created_at', monthStart);

    if (history) {
        const totalProfit = history.reduce((sum, h) => sum + h.price, 0);
        const profitGoal = 215000;
        const progress = (totalProfit / profitGoal) * 100;

        document.getElementById('kpi-profit').innerText = `₴${totalProfit.toLocaleString()}`;
        document.getElementById('kpi-profit-bar').style.width = `${Math.min(progress, 100)}%`;
        
        document.getElementById('kpi-total-bookings').innerText = history.length;
        
        const avgBill = history.length > 0 ? Math.round(totalProfit / history.length) : 0;
        document.getElementById('kpi-avg-bill').innerText = `₴${avgBill.toLocaleString()}`;
    }

    const goal = 500;
    const current = history ? history.length : 0; // кількість записів з бази
    
    // Оновлюємо цифру
    document.getElementById('kpi-total-bookings').innerText = current;

    // ЛОГІКА СЕГМЕНТІВ (4 бари)
    const bars = document.querySelectorAll('#kpi-bookings-bars div');
    const percent = (current / goal) * 100;

    bars.forEach((bar, index) => {
        // Кожен бар відповідає за 25% прогресу
        // 1-й: 0-25%, 2-й: 26-50%, 3-й: 51-75%, 4-й: 76-100%
        if (percent > (index * 25)) {
            bar.classList.remove('bg-zinc-800');
            bar.classList.add('bg-rose-500');
        } else {
            bar.classList.add('bg-zinc-800');
            bar.classList.remove('bg-rose-500');
        }
    });

    // Тренд клієнтів
    document.getElementById('kpi-new-clients').innerText = currentNewClients || 0;
    if (prevNewClients > 0) {
        const trend = Math.round(((currentNewClients - prevNewClients) / prevNewClients) * 100);
        document.getElementById('kpi-clients-trend').innerText = (trend >= 0 ? '+' : '') + trend + '%';
    }

    // МАЛЮЄМО ГРАФІК (Останні 7 днів)
    initProfitChart();
}

// 3. ТАЙМЛАЙН ЗАПИСІВ НА СЬОГОДНІ
async function loadTodayTimeline() {
    const today = new Date().toISOString().split('T')[0];
    
    // Отримуємо записи з іменами клієнтів та майстрів
    const { data: apps, error } = await window.db
        .from('appointments')
        .select('*, clients(full_name), staff(name)')
        .eq('appointment_date', today)
        .order('appointment_time', { ascending: true })
        .limit(4);

    const container = document.getElementById('today-timeline');
    if (!apps || apps.length === 0) {
        container.innerHTML = '<p class="text-zinc-600 text-[10px] uppercase font-bold text-center py-10">Записів немає</p>';
        return;
    }

    container.innerHTML = '<div class="timeline-line" style="left: 6px; top: 5px; bottom: 5px; width: 1px; background: rgba(255,255,255,0.08); position: absolute;"></div>' + 
    apps.map((app, index) => {
        const isConfirmed = app.status === 'confirmed';
        const clientName = app.clients?.full_name || 'Гість';
        
        return `
        <div class="relative flex justify-between items-start transition hover:translate-x-1" style="opacity: ${1 - index * 0.2}">
            <div class="flex gap-5">
                <!-- Точка зі світінням -->
                <div class="mt-1.5 shrink-0">
                    <div class="status-dot ${isConfirmed ? 'active' : 'waiting'} w-3 h-3 rounded-full"></div>
                </div>
                <div>
                    <!-- Ім'я клієнта над послугою -->
                    <p class="text-[13px] font-extrabold text-white leading-none">${clientName}</p>
                    <p class="text-[10px] text-zinc-500 mt-2 font-medium tracking-tight">${app.service_name}</p>
                    <p class="text-[9px] font-bold ${isConfirmed ? 'text-rose-500' : 'text-zinc-600'} mt-2 tracking-widest uppercase italic-none">
                        ${app.appointment_time.substring(0, 5)}
                    </p>
                </div>
            </div>
            <span class="master-badge px-3 py-1 bg-white/5 text-zinc-500 text-[8px] font-black uppercase rounded-lg">
                ${app.staff?.name || '---'}
            </span>
        </div>
        `;
    }).join('');
}

// 4. ЕФЕКТИВНІСТЬ МАЙСТРІВ
async function loadStaffEfficiency() {
    const { data: staff } = await window.db
        .from('staff')
        .select('*')
        .eq('is_active', true)
        .eq('role', 'master');

    const container = document.getElementById('staff-efficiency-body');
    if (staff) {
        container.innerHTML = staff.map(m => `
            <tr class="group hover:bg-white/5 transition">
                <td class="py-3 flex items-center gap-3">
                    <div class="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-[9px] uppercase">
                        ${m.name.substring(0, 2)}
                    </div>
                    <span class="text-xs font-bold text-zinc-300">${m.name}</span>
                </td>
                <td class="py-3 font-bold text-xs text-emerald-400 text-center">${m.appointments_count || 0} візитів</td>
                <td class="py-3 text-xs font-bold text-white text-center">₴${(m.revenue || 0).toLocaleString()}</td>
                <td class="py-3 text-right">
                    <span class="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-md text-[8px] font-black uppercase">Активний</span>
                </td>
            </tr>
        `).join('');
    }
}

// 5. СТАН СКЛАДУ
async function loadStockStatus() {
    const { data: items } = await window.db.from('inventory').select('*').limit(3);
    const container = document.getElementById('stock-status-list');
    
    if (items) {
        container.innerHTML = items.map(item => {
            const percent = (item.current_stock / item.max_stock) * 100;
            const color = percent < 20 ? 'bg-rose-500 animate-pulse' : (percent < 50 ? 'bg-amber-500' : 'bg-emerald-500');
            return `
                <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-zinc-300 tracking-tight">${item.name}</span>
                    <div class="h-1 w-16 bg-zinc-900 rounded-full overflow-hidden">
                        <div class="h-full ${color}" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
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
        data: {
            labels: ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
            datasets: [{
                data: [12000, 18500, 14000, 21000, 28000, 45000, 39000],
                borderColor: '#f43f5e',
                borderWidth: 3,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false }, ticks: { color: '#52525b', font: { size: 9 } } },
                x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 9 } } }
            }
        }
    });
}

window.logoutStaff = () => {
    localStorage.clear();
    window.location.href = 'staff-login.html';
};
