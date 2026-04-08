// js/admin-finance.js
const staffId   = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

// ─── стан ───────────────────────────────────────────────────────────────────
let flowChart    = null;
let donutChart   = null;
let txOffset     = 0;
const TX_LIMIT   = 20;
let allTxData    = []; // кешуємо для CSV-експорту

// ─── ініціалізація ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setPeriodLabel();
    await Promise.all([
        loadCashBalance(),
        loadKPIs(),
    ]);
    await loadTransactions(false);
});

// ─── поточний місяць ─────────────────────────────────────────────────────────
function getPeriodRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        start: start.toISOString().split('T')[0],
        end:   end.toISOString().split('T')[0],
        days:  end.getDate()
    };
}

function setPeriodLabel() {
    const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                    'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
    const now = new Date();
    document.getElementById('period-label').textContent =
        `${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ─── готівка / рахунок ───────────────────────────────────────────────────────
async function loadCashBalance() {
    const { data } = await window.db.from('cash_register').select('*').single();
    if (!data) return;
    document.getElementById('cash-amount').textContent  = `₴${fmt(data.cash_amount)}`;
    document.getElementById('bank-amount').textContent  = `₴${fmt(data.bank_amount)}`;
}

// ─── KPI + графіки ───────────────────────────────────────────────────────────
async function loadKPIs() {
    const { start, end } = getPeriodRange();

    const [incomeRes, expensesRes] = await Promise.all([
        window.db.from('appointment_history')
            .select('price, visit_date')
            .gte('visit_date', start)
            .lte('visit_date', end),
        window.db.from('transactions')
            .select('*')
            .eq('type', 'expense')
            .gte('date', start)
            .lte('date', end)
    ]);

    const incomeRows   = incomeRes.data   || [];
    const expenseRows  = expensesRes.data || [];

    const totalRevenue  = incomeRows.reduce((s, r) => s + (r.price || 0), 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + Math.abs(r.amount || 0), 0);
    const netProfit     = totalRevenue - totalExpenses;
    const margin        = totalRevenue > 0
        ? ((netProfit / totalRevenue) * 100).toFixed(1)
        : 0;

    // Субтитри KPI
    const biggestCat = topCategory(expenseRows);

    document.getElementById('kpi-revenue').textContent      = `₴${fmt(totalRevenue)}`;
    document.getElementById('kpi-revenue-sub').textContent  = totalRevenue > 0 ? '+12% до плану' : 'Немає даних';
    document.getElementById('kpi-expenses').textContent     = `₴${fmt(totalExpenses)}`;
    document.getElementById('kpi-expenses-sub').textContent = biggestCat || 'Немає витрат';
    document.getElementById('kpi-profit').textContent       = `₴${fmt(netProfit)}`;
    document.getElementById('kpi-margin').textContent       = `${margin}%`;
    document.getElementById('kpi-margin-bar').style.width   = `${Math.min(margin, 100)}%`;

    buildFlowChart(incomeRows, expenseRows);
    buildDonutChart(expenseRows);
}

// ─── лінійний графік ─────────────────────────────────────────────────────────
function buildFlowChart(incomeRows, expenseRows) {
    const { days } = getPeriodRange();
    const labels   = Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, '0'));

    const incomeByDay  = new Array(days).fill(0);
    const expenseByDay = new Array(days).fill(0);

    incomeRows.forEach(r => {
        const d = new Date(r.visit_date).getDate() - 1;
        if (d >= 0 && d < days) incomeByDay[d] += r.price || 0;
    });
    expenseRows.forEach(r => {
        const d = new Date(r.date).getDate() - 1;
        if (d >= 0 && d < days) expenseByDay[d] += Math.abs(r.amount || 0);
    });

    const ctx = document.getElementById('flowChart').getContext('2d');
    if (flowChart) flowChart.destroy();

    flowChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Дохід',
                    data: incomeByDay,
                    borderColor: '#f43f5e',
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.45,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#f43f5e'
                },
                {
                    label: 'Витрати',
                    data: expenseByDay,
                    borderColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.45,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: 'rgba(255,255,255,0.3)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,10,12,0.9)',
                    borderColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    titleColor: '#71717a',
                    bodyColor: '#e2e8f0',
                    titleFont: { size: 9, weight: '800' },
                    bodyFont:  { size: 11, weight: '800' },
                    padding: 10,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ₴${fmt(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    grid:  { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#52525b', font: { size: 9 }, callback: v => `₴${(v/1000).toFixed(0)}к` }
                },
                x: {
                    grid:  { display: false },
                    ticks: { color: '#52525b', font: { size: 9 }, maxTicksLimit: 10 }
                }
            }
        }
    });
}

// ─── донат-графік ─────────────────────────────────────────────────────────────
function buildDonutChart(expenses) {
    const cats = { salary: 0, rent_utilities: 0, materials: 0, other: 0 };

    expenses.forEach(e => {
        const k = cats.hasOwnProperty(e.category) ? e.category : 'other';
        cats[k] += Math.abs(e.amount || 0);
    });

    const total = Object.values(cats).reduce((s, v) => s + v, 0) || 1;

    const pct = k => Math.round((cats[k] / total) * 100);
    const salaryPct = pct('salary');
    const rentPct   = pct('rent_utilities');
    const matPct    = pct('materials');
    const otherPct  = Math.max(100 - salaryPct - rentPct - matPct, 0);

    document.getElementById('pct-salary').textContent    = `${salaryPct}%`;
    document.getElementById('pct-rent').textContent      = `${rentPct}%`;
    document.getElementById('pct-materials').textContent = `${matPct}%`;
    document.getElementById('pct-other').textContent     = `${otherPct}%`;

    const ctx = document.getElementById('donutChart').getContext('2d');
    if (donutChart) donutChart.destroy();

    donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Зарплати', 'Оренда/Комунальні', 'Матеріали', 'Інше'],
            datasets: [{
                data: [salaryPct, rentPct, matPct, otherPct],
                backgroundColor: ['#f43f5e', '#3b82f6', '#f59e0b', '#27272a'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,10,12,0.9)',
                    borderColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    titleColor: '#71717a',
                    bodyColor: '#e2e8f0',
                    titleFont: { size: 9, weight: '800' },
                    bodyFont:  { size: 11, weight: '800' },
                    padding: 10,
                    callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
                }
            }
        }
    });
}

// ─── реєстр транзакцій ───────────────────────────────────────────────────────
async function loadTransactions(append = false) {
    const { start } = getPeriodRange();

    const { data, count } = await window.db
        .from('transactions')
        .select('*', { count: 'exact' })
        .gte('date', start)
        .order('date', { ascending: false })
        .range(txOffset, txOffset + TX_LIMIT - 1);

    if (!append) allTxData = [];
    if (data) allTxData = allTxData.concat(data);

    renderTransactions(data || [], append);

    const hasMore = (txOffset + TX_LIMIT) < (count || 0);
    document.getElementById('load-more-wrap').classList.toggle('hidden', !hasMore);
}

function renderTransactions(rows, append) {
    const tbody = document.getElementById('transactions-body');

    if (!append && rows.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="5" class="py-10 text-center text-zinc-700 text-[10px] font-black uppercase tracking-widest">
                Немає транзакцій за поточний місяць
            </td>
        </tr>`;
        return;
    }

    const html = rows.map(t => {
        const cat    = CATEGORY_META[t.category] || CATEGORY_META.other;
        const method = METHOD_LABELS[t.payment_method] || (t.payment_method || '—').toUpperCase();
        const isExp  = t.type === 'expense';
        const sign   = isExp ? '-' : '+';
        const color  = isExp ? 'text-rose-400' : 'text-emerald-400';
        const date   = fmtDate(t.date);

        return `<tr class="border-b border-white/5 hover:bg-white/[0.03] transition group">
            <td class="py-4 pr-4 text-[11px] text-zinc-500 font-bold whitespace-nowrap">${date}</td>
            <td class="py-4 pr-4">
                <span class="px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider ${cat.cls}">
                    ${cat.label}
                </span>
            </td>
            <td class="py-4 pr-4 text-[11px] text-zinc-300 max-w-xs truncate">${t.comment || '—'}</td>
            <td class="py-4 pr-4 text-[10px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap">${method}</td>
            <td class="py-4 text-right text-sm font-black ${color} whitespace-nowrap">
                ${sign}₴${fmt(Math.abs(t.amount || 0))}
            </td>
        </tr>`;
    }).join('');

    if (append) {
        tbody.insertAdjacentHTML('beforeend', html);
    } else {
        tbody.innerHTML = html;
    }
}

function showAllTransactions() {
    txOffset = 0;
    loadTransactions(false);
}

window.loadMoreTransactions = async function () {
    txOffset += TX_LIMIT;
    await loadTransactions(true);
};

// ─── CSV-експорт ─────────────────────────────────────────────────────────────
window.exportCSV = function () {
    if (!allTxData.length) { alert('Немає даних для експорту'); return; }

    const headers = ['Дата', 'Тип', 'Категорія', 'Коментар', 'Метод оплати', 'Сума (₴)'];
    const rows = allTxData.map(t => [
        fmtDate(t.date),
        t.type === 'expense' ? 'Витрата' : 'Дохід',
        CATEGORY_META[t.category]?.label || t.category,
        (t.comment || '').replace(/,/g, ';'),
        METHOD_LABELS[t.payment_method] || t.payment_method,
        t.type === 'expense' ? -Math.abs(t.amount) : t.amount
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now  = new Date();
    link.href     = url;
    link.download = `wella-glow-finance-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

// ─── довідники ───────────────────────────────────────────────────────────────
const CATEGORY_META = {
    salary:        { label: 'Виплата ЗП',        cls: 'bg-rose-500/20 text-rose-400' },
    rent_utilities:{ label: 'Оренда/Комунальні', cls: 'bg-blue-500/20 text-blue-400' },
    materials:     { label: 'Матеріали',          cls: 'bg-amber-500/20 text-amber-400' },
    income:        { label: 'Дохід',              cls: 'bg-emerald-500/20 text-emerald-400' },
    other:         { label: 'Інше',               cls: 'bg-zinc-700/50 text-zinc-400' }
};

const METHOD_LABELS = {
    cash:     'Готівка',
    card:     'Картка',
    transfer: 'Переказ'
};

// ─── хелпери ─────────────────────────────────────────────────────────────────
function fmt(n) {
    return Number(n || 0).toLocaleString('uk-UA');
}

function topCategory(expenses) {
    const cats = {};
    expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + Math.abs(e.amount || 0); });
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const pct  = Math.round((top[1] / expenses.reduce((s, r) => s + Math.abs(r.amount || 0), 0)) * 100);
    const name = CATEGORY_META[top[0]]?.label || top[0];
    return `${pct}% — ${name}`;
}

function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
