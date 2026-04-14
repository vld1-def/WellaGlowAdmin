// js/admin-finance.js
const staffId   = localStorage.getItem('wella_staff_id');
const staffRole = localStorage.getItem('wella_staff_role');

if (!staffId || (staffRole !== 'owner' && staffRole !== 'admin')) {
    window.location.href = 'staff-login.html';
}

// ─── стан ────────────────────────────────────────────────────────────────────
let flowChart    = null;
let donutChart   = null;
let txOffset     = 0;
const TX_LIMIT   = 10;
let allTxData    = [];
let allModalData = [];
let modalFiltered = [];

let drawerType    = 'expense';
let drawerMethod  = 'cash';
let editingTxId   = null;   // null = нова, string = редагування

let monthlyPlan   = 0;      // завантажується з cash_register

// ── Month Selector (sidebar) ─────────────────────────
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

// ─── ініціалізація ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initSidebarMonth();
    setPeriodLabel();
    setDefaultDate();
    await Promise.all([
        loadSettings(),
        loadKPIs(),
        loadStaffList(),
    ]);
    await loadTransactions(false);
});

// Reload when month selector changes
window.addEventListener('monthchange', async () => {
    setPeriodLabel();
    await Promise.all([loadKPIs()]);
    await loadTransactions(false);
});

// ─── період ───────────────────────────────────────────────────────────────────
function getSelectedYM() {
    const ym = localStorage.getItem('wella_current_month');
    if(ym) { const [y,m]=ym.split('-').map(Number); return {y,m}; }
    const n=new Date(); return {y:n.getFullYear(), m:n.getMonth()+1};
}

function getPeriodRange() {
    const {y,m} = getSelectedYM();
    const start = new Date(y, m-1, 1);
    const end   = new Date(y, m, 0);
    return {
        start: start.toISOString().split('T')[0],
        end:   end.toISOString().split('T')[0],
        days:  end.getDate()
    };
}

function setPeriodLabel() {
    const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                    'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
    const {y,m} = getSelectedYM();
    document.getElementById('period-label').textContent = `${months[m-1]} ${y}`;
}

function setDefaultDate() {
    document.getElementById('fin-date').value = new Date().toISOString().split('T')[0];
}

// ─── налаштування + залишки ───────────────────────────────────────────────────
async function loadSettings() {
    const { data } = await window.db.from('cash_register').select('*').single();
    if (!data) return;

    monthlyPlan = data.monthly_plan || 0;

    document.getElementById('cash-amount').textContent = `₴${fmt(data.cash_amount)}`;
    document.getElementById('bank-amount').textContent = `₴${fmt(data.bank_amount)}`;

    // Prefill settings drawer fields
    document.getElementById('set-cash').value         = data.cash_amount  || 0;
    document.getElementById('set-bank').value         = data.bank_amount  || 0;
    document.getElementById('set-monthly-plan').value = data.monthly_plan || 0;
}

// ─── KPI + графіки ────────────────────────────────────────────────────────────
async function loadKPIs() {
    const { start, end } = getPeriodRange();

    const [incomeRes, expensesRes, manualIncomeRes, bonusRes] = await Promise.all([
        window.db.from('appointment_history')
            .select('price, visit_date')
            .gte('visit_date', start)
            .lte('visit_date', end),
        window.db.from('transactions')
            .select('*')
            .eq('type', 'expense')
            .gte('date', start)
            .lte('date', end),
        window.db.from('transactions')
            .select('amount, date')
            .eq('type', 'income')
            .gte('date', start)
            .lte('date', end),
        window.db.from('clients')
            .select('bonus_balance')
    ]);

    const incomeRows       = incomeRes.data       || [];
    const expenseRows      = expensesRes.data      || [];
    const manualIncomeRows = manualIncomeRes.data  || [];

    const totalRevenue  =
        incomeRows.reduce((s, r) => s + (r.price || 0), 0) +
        manualIncomeRows.reduce((s, r) => s + (r.amount || 0), 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + Math.abs(r.amount || 0), 0);
    const netProfit     = totalRevenue - totalExpenses;
    const margin        = totalRevenue > 0
        ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    // Виручка vs план
    let revSub = 'Немає даних';
    if (totalRevenue > 0 && monthlyPlan > 0) {
        const planPct = Math.round((totalRevenue / monthlyPlan) * 100);
        const diff    = planPct - 100;
        revSub = diff >= 0
            ? `+${diff}% до плану`
            : `${diff}% від плану`;
        document.getElementById('kpi-revenue-sub').className =
            diff >= 0
                ? 'text-emerald-400 text-[9px] font-black mt-2 uppercase tracking-wide'
                : 'text-rose-400 text-[9px] font-black mt-2 uppercase tracking-wide';
    } else if (totalRevenue > 0) {
        revSub = 'План не встановлено';
        document.getElementById('kpi-revenue-sub').className =
            'text-zinc-600 text-[9px] font-black mt-2 uppercase tracking-wide';
    }

    document.getElementById('kpi-revenue').textContent      = `₴${fmt(totalRevenue)}`;
    document.getElementById('kpi-revenue-sub').textContent  = revSub;
    document.getElementById('kpi-expenses').textContent     = `₴${fmt(totalExpenses)}`;
    document.getElementById('kpi-expenses-sub').textContent = topCategory(expenseRows) || 'Немає витрат';
    document.getElementById('kpi-profit').textContent       = `₴${fmt(netProfit)}`;
    document.getElementById('kpi-margin').textContent       = `${margin}%`;
    document.getElementById('kpi-margin-bar').style.width   = `${Math.min(margin, 100)}%`;

    // Бонуси
    const totalBonuses = (bonusRes.data || []).reduce((s, c) => s + (c.bonus_balance || 0), 0);
    document.getElementById('kpi-bonuses').textContent = fmt(totalBonuses);

    buildFlowChart(incomeRows, expenseRows, manualIncomeRows);
    buildDonutChart(expenseRows);
}

// ─── лінійний графік ──────────────────────────────────────────────────────────
function buildFlowChart(incomeRows, expenseRows, manualIncomeRows = []) {
    const { days } = getPeriodRange();
    const labels   = Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, '0'));
    const incomeByDay  = new Array(days).fill(0);
    const expenseByDay = new Array(days).fill(0);

    incomeRows.forEach(r => {
        const d = new Date(r.visit_date).getDate() - 1;
        if (d >= 0 && d < days) incomeByDay[d] += r.price || 0;
    });
    manualIncomeRows.forEach(r => {
        const d = new Date(r.date).getDate() - 1;
        if (d >= 0 && d < days) incomeByDay[d] += r.amount || 0;
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
                { label: 'Дохід', data: incomeByDay, borderColor: '#f43f5e', borderWidth: 2.5, fill: false, tension: 0.45, pointRadius: 0, pointHoverRadius: 4 },
                { label: 'Витрати', data: expenseByDay, borderColor: 'rgba(255,255,255,0.18)', borderWidth: 1.5, borderDash: [5,5], fill: false, tension: 0.45, pointRadius: 0, pointHoverRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,10,12,0.9)', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1,
                    titleColor: '#71717a', bodyColor: '#e2e8f0',
                    titleFont: { size: 10, weight: '800' }, bodyFont: { size: 12, weight: '800' }, padding: 12,
                    callbacks: { label: ctx => ` ${ctx.dataset.label}: ₴${fmt(ctx.parsed.y)}` }
                }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#52525b', font: { size: 10 }, callback: v => `₴${(v/1000).toFixed(0)}к` } },
                x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 10 }, maxTicksLimit: 10 } }
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
    const pct   = k => Math.round((cats[k] / total) * 100);
    const sp = pct('salary'), rp = pct('rent_utilities'), mp = pct('materials');
    const op = Math.max(100 - sp - rp - mp, 0);

    document.getElementById('pct-salary').textContent    = `${sp}%`;
    document.getElementById('pct-rent').textContent      = `${rp}%`;
    document.getElementById('pct-materials').textContent = `${mp}%`;
    document.getElementById('pct-other').textContent     = `${op}%`;

    const ctx = document.getElementById('donutChart').getContext('2d');
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Зарплати','Оренда/Комунальні','Матеріали','Інше'],
            datasets: [{ data: [sp, rp, mp, op], backgroundColor: ['#f43f5e','#3b82f6','#f59e0b','#27272a'], borderWidth: 0, hoverOffset: 12 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,10,12,0.9)', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1,
                    titleColor: '#71717a', bodyColor: '#e2e8f0',
                    titleFont: { size: 10, weight: '800' }, bodyFont: { size: 12, weight: '800' }, padding: 12,
                    callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
                }
            }
        }
    });
}

// ─── реєстр транзакцій ────────────────────────────────────────────────────────
async function loadTransactions(append = false) {
    const { start } = getPeriodRange();
    const { data, count } = await window.db
        .from('transactions')
        .select('*, creator:staff!created_by_id(name)', { count: 'exact' })
        .gte('date', start)
        .order('created_at', { ascending: false })
        .range(txOffset, txOffset + TX_LIMIT - 1);

    if (!append) allTxData = [];
    if (data) allTxData = allTxData.concat(data);
    renderTransactions(data || [], append);
    document.getElementById('load-more-wrap').classList.toggle('hidden', (txOffset + TX_LIMIT) >= (count || 0));
}

function renderTransactions(rows, append) {
    const tbody = document.getElementById('transactions-body');
    if (!append && rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-zinc-600 text-sm font-black uppercase tracking-widest">Немає транзакцій за поточний місяць</td></tr>`;
        return;
    }
    const html = rows.map(t => txRow(t, false)).join('');
    append ? tbody.insertAdjacentHTML('beforeend', html) : (tbody.innerHTML = html);
}

window.loadMoreTransactions = async function () {
    txOffset += TX_LIMIT;
    await loadTransactions(true);
};

// ─── модалка "Всі транзакції" ─────────────────────────────────────────────────
window.showAllTransactions = async function () {
    document.getElementById('all-tx-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await loadModalTransactions();
};

window.closeAllTxModal = function () {
    document.getElementById('all-tx-modal').classList.add('hidden');
    document.body.style.overflow = '';
};

async function loadModalTransactions() {
    const { start } = getPeriodRange();
    document.getElementById('all-tx-tbody').innerHTML =
        `<tr><td colspan="8" class="py-10 text-center text-zinc-600 text-[10px] font-black uppercase tracking-widest">Завантаження…</td></tr>`;

    const { data } = await window.db
        .from('transactions')
        .select('*, creator:staff!created_by_id(name)')
        .gte('date', start)
        .order('created_at', { ascending: false });

    allModalData  = data || [];
    modalFiltered = [...allModalData];
    renderModalTable(modalFiltered);
    updateModalCounter(modalFiltered.length, allModalData.length);
}

function renderModalTable(rows) {
    const tbody = document.getElementById('all-tx-tbody');
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-zinc-600 text-[10px] font-black uppercase tracking-widest">Нічого не знайдено</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(t => txRow(t, true)).join('');
}

// ─── спільний рендер рядка транзакції ─────────────────────────────────────────
function txRow(t, isModal) {
    const cat     = CATEGORY_META[t.category] || CATEGORY_META.other;
    const method  = METHOD_LABELS[t.payment_method] || (t.payment_method || '—').toUpperCase();
    const isExp   = t.type === 'expense';
    const sign    = isExp ? '-' : '+';
    const color   = isExp ? 'text-rose-400' : 'text-emerald-400';
    const creator = t.creator?.name || '—';
    const createdAt = t.created_at
        ? new Date(t.created_at).toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    const dateCell = isModal
        ? `<td class="py-3 pr-4 whitespace-nowrap">
               <p class="text-[11px] text-zinc-300 font-bold">${fmtDate(t.date)}</p>
               <p class="text-[9px] text-zinc-600 mt-0.5">${createdAt}</p>
           </td>`
        : `<td class="py-4 pr-4 text-[11px] text-zinc-400 font-bold whitespace-nowrap">${fmtDate(t.date)}</td>`;

    const py = isModal ? 'py-3' : 'py-4';

    const subcatLabel = t.subcategory || '—';

    return `<tr class="border-b border-white/5 hover:bg-white/[0.03] transition group">
        ${dateCell}
        <td class="${py} pr-4">
            <span class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide ${cat.cls}">${cat.label}</span>
        </td>
        <td class="${py} pr-4 text-[10px] font-bold text-zinc-500 whitespace-nowrap">${subcatLabel}</td>
        <td class="${py} pr-4 text-[11px] text-zinc-300 max-w-[220px] truncate">${t.comment || '—'}</td>
        <td class="${py} pr-4 text-[10px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap">${method}</td>
        <td class="${py} pr-4 text-[11px] font-bold text-zinc-400 whitespace-nowrap">${creator}</td>
        <td class="${py} text-right text-sm font-black ${color} whitespace-nowrap">${sign}₴${fmt(Math.abs(t.amount || 0))}</td>
        <td class="${py} pl-2 text-right whitespace-nowrap">
            <button onclick="editTransaction('${t.id}')" class="edit-tx-btn w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-600 hover:text-white flex items-center justify-center transition ml-auto" title="Редагувати">
                <i class="fa-solid fa-pen text-[10px]"></i>
            </button>
        </td>
    </tr>`;
}

function updateModalCounter(filtered, total) {
    document.getElementById('modal-counter').textContent =
        filtered === total ? `${total} записів` : `${filtered} з ${total}`;
}

window.applyModalFilters = function () {
    const q      = (document.getElementById('modal-search').value || '').toLowerCase().trim();
    const type   = document.getElementById('modal-filter-type').value;
    const cat    = document.getElementById('modal-filter-cat').value;
    const method = document.getElementById('modal-filter-method').value;

    modalFiltered = allModalData.filter(t => {
        if (type   && t.type           !== type)   return false;
        if (cat    && t.category       !== cat)    return false;
        if (method && t.payment_method !== method) return false;
        if (q) {
            const hay = [fmtDate(t.date), t.category, CATEGORY_META[t.category]?.label||'',
                         t.comment||'', t.payment_method, METHOD_LABELS[t.payment_method]||'',
                         String(t.amount||''), t.creator?.name||''].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderModalTable(modalFiltered);
    updateModalCounter(modalFiltered.length, allModalData.length);
};

window.clearModalFilters = function () {
    document.getElementById('modal-search').value         = '';
    document.getElementById('modal-filter-type').value   = '';
    document.getElementById('modal-filter-cat').value    = '';
    document.getElementById('modal-filter-method').value = '';
    modalFiltered = [...allModalData];
    renderModalTable(modalFiltered);
    updateModalCounter(modalFiltered.length, allModalData.length);
};

// ─── drawer: відкрити / закрити ───────────────────────────────────────────────
function showOverlay()  { document.getElementById('drawer-overlay').classList.add('open');    document.body.style.overflow = 'hidden'; }
function hideOverlay()  { document.getElementById('drawer-overlay').classList.remove('open'); document.body.style.overflow = ''; }

window.closeAllDrawers = function () { closeDrawer(); closeSettings(); };

window.openDrawer = function () {
    // Режим нової транзакції
    editingTxId = null;
    document.getElementById('drawer-title').textContent = 'Внести операцію';
    setType('expense');
    setMethod('cash');
    setDefaultDate();
    document.getElementById('fin-amount').value  = '';
    document.getElementById('fin-comment').value = '';
    document.getElementById('fin-staff').value   = '';
    document.getElementById('finance-drawer').classList.add('open');
    showOverlay();
};

window.closeDrawer = function () {
    document.getElementById('finance-drawer').classList.remove('open');
    hideOverlay();
};

// ─── редагування транзакції ───────────────────────────────────────────────────
window.editTransaction = async function (id) {
    // Закриваємо модалку якщо відкрита
    document.getElementById('all-tx-modal').classList.add('hidden');

    // Шукаємо у вже завантажених даних
    const t = [...allTxData, ...allModalData].find(x => x.id === id);
    if (!t) return;

    editingTxId = id;
    document.getElementById('drawer-title').textContent = 'Редагувати операцію';

    // Заповнюємо форму
    setType(t.type);
    setMethod(t.payment_method || 'cash');
    document.getElementById('fin-date').value    = t.date || '';
    document.getElementById('fin-amount').value  = t.amount || '';
    document.getElementById('fin-comment').value = t.comment || '';

    // Категорія (setType вже перебудував select, тепер вибираємо)
    const catSelect = document.getElementById('fin-category');
    const opt = catSelect.querySelector(`option[value="${t.category}"]`);
    if (opt) catSelect.value = t.category;

    // Підкатегорія матеріалів
    onFinCatChange();
    if (t.category === 'materials' && t.subcategory) {
        document.getElementById('fin-subcategory').value = t.subcategory;
    }

    // Майстер
    document.getElementById('fin-staff').value = t.staff_id || '';

    document.getElementById('finance-drawer').classList.add('open');
    showOverlay();
};

// ─── список майстрів ──────────────────────────────────────────────────────────
async function loadStaffList() {
    const { data } = await window.db.from('staff').select('id, name').eq('role', 'master').order('name');
    const select = document.getElementById('fin-staff');
    if (data) {
        data.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            select.appendChild(opt);
        });
    }
}

// ─── form: тип / метод ────────────────────────────────────────────────────────
window.onFinCatChange = function () {
    const val = document.getElementById('fin-category').value;
    const row = document.getElementById('fin-subcategory-row');
    if (val === 'materials') {
        row.classList.remove('hidden');
    } else {
        row.classList.add('hidden');
        document.getElementById('fin-subcategory').value = '';
    }
};

window.setType = function (type) {
    drawerType = type;
    document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-income').classList.toggle('active', type === 'income');

    const select = document.getElementById('fin-category');
    if (type === 'income') {
        select.innerHTML = `<option value="income">Оплата за послугу</option>
                            <option value="other">Інший дохід</option>`;
        document.getElementById('fin-subcategory-row').classList.add('hidden');
    } else {
        select.innerHTML = `<option value="salary">Виплата ЗП</option>
                            <option value="rent_utilities">Оренда / Комунальні</option>
                            <option value="materials">Матеріали</option>
                            <option value="other">Інше</option>`;
    }
};

window.setMethod = function (method) {
    drawerMethod = method;
    ['cash','card','transfer'].forEach(m => {
        const btn = document.getElementById(`pay-${m}`);
        btn.className = m === method
            ? 'pay-btn active py-3 rounded-xl border text-xs font-black uppercase tracking-wide transition bg-rose-500/10 border-rose-500/30 text-rose-400'
            : 'pay-btn py-3 rounded-xl border text-xs font-black uppercase tracking-wide transition bg-white/5 border-white/10 text-zinc-500';
    });
};

// ─── збереження транзакції (insert або update) ────────────────────────────────
window.submitTransaction = async function () {
    const date     = document.getElementById('fin-date').value;
    const category = document.getElementById('fin-category').value;
    const amount   = parseFloat(document.getElementById('fin-amount').value);
    const comment  = document.getElementById('fin-comment').value.trim();
    const staffSel = document.getElementById('fin-staff').value;

    if (!date)               return showFormError('Вкажіть дату');
    if (!amount || amount <= 0) return showFormError('Введіть суму більше нуля');

    const btn = document.getElementById('submit-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled  = true;

    const subcatEl = document.getElementById('fin-subcategory');
    const subcategory = (category === 'materials' && subcatEl.value) ? subcatEl.value : null;

    const payload = {
        date, type: drawerType, category, amount,
        payment_method: drawerMethod,
        comment:  comment  || null,
        staff_id: staffSel || null,
        subcategory,
    };

    let error;
    if (editingTxId) {
        // Оновлення існуючої
        ({ error } = await window.db.from('transactions').update(payload).eq('id', editingTxId));
    } else {
        // Нова транзакція
        payload.created_by_id = staffId;
        ({ error } = await window.db.from('transactions').insert([payload]));
    }

    btn.innerHTML = '<i class="fa-solid fa-check"></i> Зберегти';
    btn.disabled  = false;

    if (error) { showFormError('Помилка збереження.'); console.error(error); return; }

    editingTxId = null;
    closeDrawer();
    txOffset = 0;
    await Promise.all([loadKPIs(), loadTransactions(false)]);
};

function showFormError(msg) {
    const btn  = document.getElementById('submit-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
    btn.classList.add('bg-rose-700');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('bg-rose-700'); }, 2500);
}

// ─── drawer: налаштування ─────────────────────────────────────────────────────
window.openSettings = function () {
    document.getElementById('settings-drawer').classList.add('open');
    showOverlay();
};

window.closeSettings = function () {
    document.getElementById('settings-drawer').classList.remove('open');
    hideOverlay();
};

window.saveSettings = async function () {
    const cash  = parseFloat(document.getElementById('set-cash').value)         || 0;
    const bank  = parseFloat(document.getElementById('set-bank').value)          || 0;
    const plan  = parseFloat(document.getElementById('set-monthly-plan').value) || 0;

    const btn = document.getElementById('settings-save-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled  = true;

    const { error } = await window.db.from('cash_register')
        .update({ cash_amount: cash, bank_amount: bank, monthly_plan: plan, updated_at: new Date().toISOString() })
        .gte('id', 0);   // update single row (singleton)

    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Зберегти';
    btn.disabled  = false;

    if (error) { alert('Помилка збереження налаштувань'); console.error(error); return; }

    monthlyPlan = plan;
    document.getElementById('cash-amount').textContent = `₴${fmt(cash)}`;
    document.getElementById('bank-amount').textContent = `₴${fmt(bank)}`;

    closeSettings();
    await loadKPIs();   // оновити % до плану
};

// ─── CSV-експорт ──────────────────────────────────────────────────────────────
window.exportCSV = function () {
    if (!allTxData.length) { alert('Немає даних для експорту'); return; }
    const headers = ['Дата','Тип','Категорія','Коментар','Метод оплати','Сума (₴)'];
    const rows = allTxData.map(t => [
        fmtDate(t.date),
        t.type === 'expense' ? 'Витрата' : 'Дохід',
        CATEGORY_META[t.category]?.label || t.category,
        (t.comment || '').replace(/,/g, ';'),
        METHOD_LABELS[t.payment_method] || t.payment_method,
        t.type === 'expense' ? -Math.abs(t.amount) : t.amount
    ]);
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now  = new Date();
    link.href     = url;
    link.download = `wella-glow-finance-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

// ─── довідники ────────────────────────────────────────────────────────────────
const CATEGORY_META = {
    salary:         { label: 'Виплата ЗП',        cls: 'bg-rose-500/20 text-rose-400' },
    rent_utilities: { label: 'Оренда/Комунальні', cls: 'bg-blue-500/20 text-blue-400' },
    materials:      { label: 'Матеріали',          cls: 'bg-amber-500/20 text-amber-400' },
    income:         { label: 'Дохід',              cls: 'bg-emerald-500/20 text-emerald-400' },
    other:          { label: 'Інше',               cls: 'bg-zinc-700/50 text-zinc-400' }
};

const METHOD_LABELS = {
    cash: 'Готівка', card: 'Картка', transfer: 'Переказ'
};

// ─── хелпери ──────────────────────────────────────────────────────────────────
function fmt(n) { return Number(n || 0).toLocaleString('uk-UA'); }

function topCategory(expenses) {
    const cats = {};
    expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + Math.abs(e.amount || 0); });
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const total = expenses.reduce((s, r) => s + Math.abs(r.amount || 0), 0);
    const pct   = Math.round((top[1] / total) * 100);
    return `${pct}% — ${CATEGORY_META[top[0]]?.label || top[0]}`;
}

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric' });
}
