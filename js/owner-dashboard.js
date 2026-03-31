// js/owner-dashboard.js

const staffId = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

// 1. ПЕРЕВІРКА ДОСТУПУ (Тільки owner)
if (!staffId || staffRole !== 'owner') {
    window.location.href = 'staff-login.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Встановлюємо ім'я та дату
    document.getElementById('owner-name').innerText = `Вітаємо, ${localStorage.getItem('wella_staff_name')}`;
    document.getElementById('today-date').innerText = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });

    await loadOwnerStats();
    await initOwnerChart();
    await loadTopStaff();
});

// 2. ЗАВАНТАЖЕННЯ KPI
async function loadOwnerStats() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Отримуємо історію візитів за цей місяць
    const { data: monthData, error } = await window.db
        .from('appointment_history')
        .select('price, visit_date')
        .gte('visit_date', firstDay);

    // Отримуємо загальну кількість клієнтів
    const { count: totalClients } = await window.db.from('clients').select('*', { count: 'exact', head: true });
    
    // Отримуємо нових клієнтів за цей місяць
    const { count: newClients } = await window.db.from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', firstDay);

    if (monthData) {
        const revenue = monthData.reduce((sum, item) => sum + item.price, 0);
        const visits = monthData.length;
        const avg = visits > 0 ? Math.round(revenue / visits) : 0;

        document.getElementById('stat-revenue').innerText = `₴${revenue.toLocaleString()}`;
        document.getElementById('stat-visits').innerText = visits;
        document.getElementById('stat-avg-bill').innerText = `₴${avg.toLocaleString()}`;
        document.getElementById('stat-new-clients').innerText = newClients;

        // Прогрес бару (ціль 300к для прикладу)
        const progress = Math.min((revenue / 300000) * 100, 100);
        document.getElementById('revenue-progress').style.width = `${progress}%`;
    }
}

// 3. ТОП МАЙСТРІВ
async function loadTopStaff() {
    const { data: staff, error } = await window.db
        .from('staff')
        .select('*')
        .eq('role', 'master')
        .order('revenue', { ascending: false })
        .limit(4);

    const container = document.getElementById('top-staff-list');
    if (staff) {
        container.innerHTML = staff.map(m => `
            <div class="flex items-center justify-between group cursor-pointer">
                <div class="flex items-center gap-4">
                    <img src="https://ui-avatars.com/api/?name=${m.name.replace(' ','+')}&background=111113&color=f43f5e" class="w-10 h-10 rounded-xl border border-white/5">
                    <div>
                        <p class="text-xs font-bold text-white group-hover:text-rose-500 transition">${m.name}</p>
                        <p class="text-[9px] text-zinc-600 uppercase font-bold mt-1">${m.role || 'Майстер'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-black text-white">₴${(m.revenue || 0).toLocaleString()}</p>
                    <p class="text-[8px] text-emerald-500 font-bold uppercase">${m.appointments_count || 0} візитів</p>
                </div>
            </div>
        `).join('');
    }
}

// 4. ГОЛОВНИЙ ГРАФІК
async function initOwnerChart() {
    const ctx = document.getElementById('ownerMainChart').getContext('2d');
    
    // Для демо - генеруємо 30 днів
    const labels = Array.from({length: 30}, (_, i) => i + 1);
    const dataPoints = Array.from({length: 30}, () => Math.floor(Math.random() * 15000) + 5000);

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                borderColor: '#f43f5e',
                borderWidth: 3,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6
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
