// js/owner-dashboard.js

const staffId = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

// 1. ПЕРЕВІРКА ДОСТУПУ (Тільки owner або admin)
if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Функція для безпечного встановлення тексту
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    // Встановлюємо ім'я власника та дату
    const savedName = localStorage.getItem('wella_staff_name') || 'Власник';
    setSafeText('owner-name', `Вітаємо, ${savedName}`);
    
    const formattedDate = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
    setSafeText('today-date', formattedDate);

    // Завантажуємо дані
    try {
        await loadDashboardStats();
        await loadTodayTimeline();
    } catch (err) {
        console.error("Помилка при завантаженні даних:", err);
    }
});

// 2. ЗАВАНТАЖЕННЯ KPI ТА ГРАФІКА
async function loadDashboardStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [historyRes, currentClientsRes, prevClientsRes] = await Promise.all([
        window.db.from('appointment_history').select('price').gte('visit_date', monthStart),
        window.db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        window.db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', prevMonthStart).lt('created_at', monthStart)
    ]);

    const history = historyRes.data || [];
    const currentNewClients = currentClientsRes.count || 0;
    const prevNewClients = prevClientsRes.count || 0;

    // Розрахунок прибутку
    const totalProfit = history.reduce((sum, h) => sum + h.price, 0);
    const profitGoal = 215000;
    const progressPercent = (totalProfit / profitGoal) * 100;

    // Вивід цифр
    const setSafeText = (id, text) => { if(document.getElementById(id)) document.getElementById(id).innerText = text; };
    
    setSafeText('kpi-profit', `₴${totalProfit.toLocaleString()}`);
    setSafeText('kpi-total-bookings', history.length);
    setSafeText('kpi-new-clients', currentNewClients);

    const avgBill = history.length > 0 ? Math.round(totalProfit / history.length) : 0;
    setSafeText('kpi-avg-bill', `₴${avgBill.toLocaleString()}`);

    // Оновлення прогрес-бару прибутку
    const profitBar = document.getElementById('kpi-profit-bar');
    if (profitBar) profitBar.style.width = `${Math.min(progressPercent, 100)}%`;

    // Оновлення тренду клієнтів
    const trendEl = document.getElementById('kpi-clients-trend');
    if (trendEl && prevNewClients > 0) {
        const trend = Math.round(((currentNewClients - prevNewClients) / prevNewClients) * 100);
        trendEl.innerText = (trend >= 0 ? '+' : '') + trend + '%';
    }

    // ЛОГІКА СЕГМЕНТОВАНИХ БАРІВ (ЗАПИСИ)
    const bars = document.querySelectorAll('#kpi-bookings-bars div');
    const bookingPercent = (history.length / 500) * 100; // Ціль 500 записів
    bars.forEach((bar, index) => {
        if (bookingPercent > (index * 25)) {
            bar.classList.replace('bg-zinc-800', 'bg-rose-500');
        }
    });

    initProfitChart();
}

// 3. ТАЙМЛАЙН ЗАПИСІВ (СЯЙВО ТА ІМЕНА КЛІЄНТІВ)
async function loadTodayTimeline() {
    const today = new Date().toISOString().split('T')[0];
    const { data: apps } = await window.db
        .from('appointments')
        .select('*, clients(full_name), staff(name)')
        .eq('appointment_date', today)
        .order('appointment_time', { ascending: true })
        .limit(4);

    const container = document.getElementById('today-timeline');
    if (!container) return;

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
                <div class="mt-1.5 shrink-0">
                    <div class="status-dot ${isConfirmed ? 'active' : 'waiting'} w-2.5 h-2.5 rounded-full"></div>
                </div>
                <div>
                    <p class="text-[13px] font-extrabold text-white leading-none">${clientName}</p>
                    <p class="text-[10px] text-zinc-500 mt-2 font-medium tracking-tight">${app.service_name}</p>
                    <p class="text-[9px] font-bold ${isConfirmed ? 'text-rose-500' : 'text-zinc-600'} mt-2 tracking-widest uppercase">
                        ${app.appointment_time.substring(0, 5)}
                    </p>
                </div>
            </div>
            <span class="master-badge px-2 py-1 bg-white/5 text-zinc-500 text-[8px] font-black uppercase rounded-md">
                ${app.staff?.name || '---'}
            </span>
        </div>`;
    }).join('');
}

// 4. ГРАФІК
function initProfitChart() {
    const chartEl = document.getElementById('profitChart');
    if (!chartEl) return;
    
    const ctx = chartEl.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
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
