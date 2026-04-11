// js/admin-inventory.js — Wella Glow Inventory
// ═══════════════════════════════════════════════════════

const _sId   = localStorage.getItem('wella_staff_id');
const _sRole = localStorage.getItem('wella_staff_role');
if (!_sId || !['owner','admin'].includes(_sRole)) location.href = 'staff-login.html';

// ══ State ════════════════════════════════════════════
let items      = [];
let filtered   = [];
let curCat     = '';
let curPage    = 1;
const PAGE_SZ  = 15;
let editingId  = null;
let orderItemId= null;
// Procurement checklist stored in localStorage
let procList   = JSON.parse(localStorage.getItem('wella_proc_list') || '[]');
// [{id, name, qty, unit, supplier}]

// ══ Boot ═════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await loadItems();
    renderKPIs();
    renderTable();
    renderProcList();
});

// ══ Load ═════════════════════════════════════════════
async function loadItems() {
    const { data, error } = await window.db
        .from('inventory_items')
        .select('*')
        .order('name');
    if (error) { console.error(error); return; }
    items = data || [];
}

// ══ KPIs ═════════════════════════════════════════════
function renderKPIs() {
    const total = items.reduce((s, i) => s + (parseFloat(i.cost_per_unit || 0) * parseInt(i.quantity || 0)), 0);
    const attention = items.filter(i => itemStatus(i) !== 'ok').length;
    const critical  = items.filter(i => itemStatus(i) === 'critical').length;
    document.getElementById('kpi-total').textContent = '₴' + total.toLocaleString('uk-UA');
    document.getElementById('kpi-count').textContent = items.length;
    document.getElementById('kpi-attention').textContent = attention + ' позицій';
    document.getElementById('kpi-critical').textContent = critical + ' позицій';
}

function itemStatus(item) {
    const qty = parseInt(item.quantity || 0);
    const min = parseInt(item.min_quantity || 0);
    if (qty <= 0 || (min > 0 && qty <= min * 0.5)) return 'critical';
    if (min > 0 && qty <= min) return 'low';
    return 'ok';
}

function statusBadge(item) {
    const s = itemStatus(item);
    if (s === 'critical') return '<span class="badge-critical text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Критично</span>';
    if (s === 'low')      return '<span class="badge-low text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Мало</span>';
    return '<span class="badge-ok text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">В нормі</span>';
}

function stockBarColor(item) {
    const s = itemStatus(item);
    return s === 'critical' ? '#f43f5e' : s === 'low' ? '#fbbf24' : '#34d399';
}

function stockBarPct(item) {
    const qty = parseInt(item.quantity || 0);
    const min = parseInt(item.min_quantity || 0);
    if (!min) return qty > 0 ? 100 : 0;
    return Math.min(100, Math.round(qty / (min * 2) * 100));
}

// ══ Category filter ═══════════════════════════════════
window.setCat = function(btn, cat) {
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    curCat = cat;
    curPage = 1;
    renderTable();
};

// ══ Table ════════════════════════════════════════════
function applyFilters() {
    const q = (document.getElementById('inv-search')?.value || '').toLowerCase().trim();
    return items.filter(i => {
        const catOk = !curCat || i.category === curCat;
        const qOk   = !q || (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q);
        return catOk && qOk;
    });
}

function renderTable() {
    filtered = applyFilters();
    const total = filtered.length;
    const start = (curPage - 1) * PAGE_SZ;
    const page  = filtered.slice(start, start + PAGE_SZ);

    const tbody = document.getElementById('inv-tbody');

    if (!page.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-zinc-600 text-xs py-8">Нічого не знайдено</td></tr>`;
    } else {
        // Category avatar letter color
        const catColor = { 'Фарби':'#f43f5e','Догляд':'#34d399','Технічні':'#22d3ee','Розхідники':'#fb923c' };
        tbody.innerHTML = page.map(item => {
            const color = catColor[item.category] || '#818cf8';
            const totalSum = parseFloat(item.cost_per_unit || 0) * parseInt(item.quantity || 0);
            const pct = stockBarPct(item);
            const barColor = stockBarColor(item);
            const costStr = item.unit === 'мл.' || item.unit === 'г.' || item.unit === 'л.'
                ? `₴${parseFloat(item.cost_per_unit||0).toFixed(2)} / ${item.unit}`
                : `₴${parseFloat(item.cost_per_unit||0).toLocaleString('uk-UA')}`;

            return `<tr>
                <td>
                    <div class="flex items-center gap-3">
                        <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-xs" style="background:${color}18;color:${color}">${(item.name||'?').charAt(0).toUpperCase()}</div>
                        <div>
                            <p class="font-bold text-white text-xs">${item.name||'—'}</p>
                            <p class="text-[9px] text-zinc-600 font-semibold">${item.sku||''}</p>
                        </div>
                    </div>
                </td>
                <td><span class="text-[10px] font-black uppercase tracking-widest" style="color:${color}">${item.category||'—'}</span></td>
                <td>
                    <p class="font-black text-sm" style="color:${barColor}">${parseInt(item.quantity||0)} ${item.unit||'шт.'}</p>
                    <div class="stock-bar w-20"><div class="stock-fill" style="width:${pct}%;background:${barColor}"></div></div>
                </td>
                <td>${statusBadge(item)}</td>
                <td><span class="text-zinc-400 font-semibold text-xs">${item.unit||'шт.'}</span></td>
                <td><span class="text-zinc-300 font-bold text-xs">${costStr}</span></td>
                <td><span class="font-black text-white text-xs">₴${totalSum.toLocaleString('uk-UA')}</span></td>
                <td>
                    <div class="dot-menu">
                        <button onclick="toggleDot(event,'dot-${item.id}')" class="w-7 h-7 rounded-lg text-zinc-600 hover:text-white hover:bg-white/5 transition flex items-center justify-center text-sm">
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                        <div id="dot-${item.id}" class="dot-dropdown">
                            <div class="dot-item" onclick="openEditItem('${item.id}')"><i class="fa-solid fa-pen text-xs text-zinc-500"></i>Редагувати</div>
                            <div class="dot-item" onclick="openOrderModal('${item.id}')"><i class="fa-solid fa-cart-plus text-xs text-zinc-500"></i>Замовити</div>
                            <div class="dot-item danger" onclick="deleteItem('${item.id}')"><i class="fa-solid fa-trash text-xs"></i>Видалити</div>
                        </div>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('inv-footer').textContent =
        `Всього товарів: ${total} · Показано: ${start+1} – ${Math.min(start+PAGE_SZ, total)}`;
}

window.changePage = function(dir) {
    const pages = Math.ceil(filtered.length / PAGE_SZ);
    curPage = Math.max(1, Math.min(pages, curPage + dir));
    renderTable();
};

// ══ 3-dot menu ═══════════════════════════════════════
window.toggleDot = function(e, id) {
    e.stopPropagation();
    const dd = document.getElementById(id);
    const isOpen = dd.classList.contains('open');
    document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) dd.classList.add('open');
};
document.addEventListener('click', () => {
    document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
});

// ══ Add / Edit Item Modal ═════════════════════════════
window.openAddItem = function() {
    editingId = null;
    document.getElementById('item-modal-title').textContent = 'Новий товар';
    ['f-name','f-sku','f-supplier'].forEach(id => document.getElementById(id).value = '');
    ['f-qty','f-min-qty','f-cost'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-category').value = 'Фарби';
    document.getElementById('f-unit').value = 'шт.';
    document.getElementById('item-modal').classList.add('open');
};

window.openEditItem = function(id) {
    document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
    const item = items.find(i => i.id === id);
    if (!item) return;
    editingId = id;
    document.getElementById('item-modal-title').textContent = 'Редагувати товар';
    document.getElementById('f-name').value     = item.name || '';
    document.getElementById('f-sku').value      = item.sku || '';
    document.getElementById('f-category').value = item.category || 'Фарби';
    document.getElementById('f-unit').value     = item.unit || 'шт.';
    document.getElementById('f-qty').value      = item.quantity || 0;
    document.getElementById('f-min-qty').value  = item.min_quantity || 0;
    document.getElementById('f-cost').value     = item.cost_per_unit || 0;
    document.getElementById('f-supplier').value = item.supplier || '';
    document.getElementById('item-modal').classList.add('open');
};

window.closeItemModal = function() {
    document.getElementById('item-modal').classList.remove('open');
    editingId = null;
};

window.saveItem = async function() {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('Введіть назву товару'); return; }

    const payload = {
        name,
        sku:          document.getElementById('f-sku').value.trim() || null,
        category:     document.getElementById('f-category').value,
        unit:         document.getElementById('f-unit').value,
        quantity:     parseInt(document.getElementById('f-qty').value) || 0,
        min_quantity: parseInt(document.getElementById('f-min-qty').value) || 0,
        cost_per_unit:parseFloat(document.getElementById('f-cost').value) || 0,
        supplier:     document.getElementById('f-supplier').value.trim() || null,
    };

    let error;
    if (editingId) {
        ({ error } = await window.db.from('inventory_items').update(payload).eq('id', editingId));
    } else {
        ({ error } = await window.db.from('inventory_items').insert([payload]));
    }
    if (error) { alert('Помилка: ' + error.message); return; }
    closeItemModal();
    await loadItems();
    renderKPIs();
    renderTable();
    renderProcList();
};

// ══ Delete ═══════════════════════════════════════════
window.deleteItem = async function(id) {
    document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
    const item = items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Видалити "${item.name}"?`)) return;
    const { error } = await window.db.from('inventory_items').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    await loadItems();
    renderKPIs();
    renderTable();
    renderProcList();
};

// ══ Order modal ═══════════════════════════════════════
window.openOrderModal = function(id) {
    document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
    const item = items.find(i => i.id === id);
    if (!item) return;
    orderItemId = id;
    document.getElementById('order-body').innerHTML = `
        <div class="p-3 rounded-xl" style="background:rgba(255,255,255,.04)">
            <p class="text-xs font-bold text-white">${item.name}</p>
            <p class="text-[10px] text-zinc-500 mt-1">Поточний залишок: ${item.quantity||0} ${item.unit||'шт.'}</p>
        </div>
        <div>
            <label class="text-[9px] text-zinc-500 font-black uppercase tracking-widest block mb-1.5">Кількість до замовлення</label>
            <input id="order-qty" type="number" min="1" value="${Math.max(1,(item.min_quantity||0)-(item.quantity||0))}" class="inv-input">
        </div>
        <div>
            <label class="text-[9px] text-zinc-500 font-black uppercase tracking-widest block mb-1.5">Примітка</label>
            <input id="order-note" type="text" placeholder="Необов'язково…" class="inv-input">
        </div>`;
    document.getElementById('order-modal').classList.add('open');
};
window.closeOrderModal = function() {
    document.getElementById('order-modal').classList.remove('open');
    orderItemId = null;
};
window.addToProc = function() {
    const item = items.find(i => i.id === orderItemId);
    if (!item) return;
    const qty  = parseInt(document.getElementById('order-qty').value) || 1;
    const note = document.getElementById('order-note').value.trim();
    // avoid duplicates
    procList = procList.filter(p => p.id !== item.id);
    procList.push({ id: item.id, name: item.name, qty, unit: item.unit||'шт.', supplier: item.supplier||'', note });
    localStorage.setItem('wella_proc_list', JSON.stringify(procList));
    closeOrderModal();
    renderProcList();
};

// ══ Procurement list ══════════════════════════════════
function renderProcList() {
    // Also auto-add critical items not yet in list
    items.filter(i => itemStatus(i) === 'critical' && !procList.find(p => p.id === i.id)).forEach(i => {
        const need = Math.max(1, (i.min_quantity||1) * 2 - (i.quantity||0));
        procList.push({ id: i.id, name: i.name, qty: need, unit: i.unit||'шт.', supplier: i.supplier||'', note: 'Авто', urgent: true });
    });
    localStorage.setItem('wella_proc_list', JSON.stringify(procList));

    const el = document.getElementById('proc-list');
    if (!procList.length) {
        el.innerHTML = '<p class="text-xs text-zinc-600 py-2">Список порожній</p>';
        return;
    }
    el.innerHTML = procList.map((p, idx) => `
        <div class="proc-item">
            <input type="checkbox" class="proc-check" id="pc-${idx}" ${p.urgent?'checked':''}>
            <label for="pc-${idx}" class="flex-1 cursor-pointer">
                <p class="text-xs font-bold text-white">${p.name}</p>
                <p class="text-[9px] text-zinc-500">${p.qty} ${p.unit}${p.supplier?' · '+p.supplier:''}</p>
            </label>
            ${p.urgent?'<span class="text-[8px] font-black uppercase text-rose-400">Терміново</span>':'<span class="text-[8px] font-black uppercase text-zinc-600">Планово</span>'}
            <button onclick="removeFromProc(${idx})" class="text-zinc-700 hover:text-rose-400 transition ml-1"><i class="fa-solid fa-xmark text-xs"></i></button>
        </div>`).join('');
}

window.removeFromProc = function(idx) {
    procList.splice(idx, 1);
    localStorage.setItem('wella_proc_list', JSON.stringify(procList));
    renderProcList();
};

// ══ PDF generation ═══════════════════════════════════
window.generatePDF = function() {
    const checked = procList.filter((_, i) => {
        const el = document.getElementById('pc-' + i);
        return el ? el.checked : true;
    });
    if (!checked.length) { alert('Виберіть хоча б один товар'); return; }

    const date = new Date().toLocaleDateString('uk-UA', { day:'2-digit', month:'long', year:'numeric' });
    const rows = checked.map((p, i) =>
        `<tr style="border-bottom:1px solid #eee">
            <td style="padding:8px 4px;font-size:12px">${i+1}</td>
            <td style="padding:8px 4px;font-size:12px;font-weight:600">${p.name}</td>
            <td style="padding:8px 4px;font-size:12px">${p.qty} ${p.unit}</td>
            <td style="padding:8px 4px;font-size:12px;color:${p.urgent?'#e11d48':'#555'}">${p.urgent?'ТЕРМІНОВО':'Планово'}</td>
            <td style="padding:8px 4px;font-size:12px;color:#888">${p.supplier||'—'}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Замовлення постачальнику</title>
        <style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{font-size:22px;margin-bottom:4px}p{color:#666;font-size:13px;margin:0 0 24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;border-bottom:2px solid #eee}@media print{body{padding:20px}}</style></head>
        <body>
            <h1>Wella Glow — Замовлення постачальнику</h1>
            <p>Дата: ${date}</p>
            <table><thead><tr><th>#</th><th>Товар</th><th>Кількість</th><th>Пріоритет</th><th>Постачальник</th></tr></thead>
            <tbody>${rows}</tbody></table>
        </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
};
