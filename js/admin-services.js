// ── State ─────────────────────────────────────────────────────────────────────
let allServices = [];
let allStaff = [];
let staffServices = []; // [{staff_id, service_id}]
let selectedCategory = ''; // '' = all
let editingServiceId = null;
let staffFilterId = new URLSearchParams(window.location.search).get('staff') || '';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderStaffFilterBanner();
    render();
    // show export button for owner
    if (localStorage.getItem('wella_staff_role') === 'owner') {
        document.getElementById('export-svc-btn')?.classList.remove('hidden');
    }
});

function renderStaffFilterBanner() {
    if (!staffFilterId) return;
    const s = allStaff.find(x => x.id === staffFilterId);
    if (!s) return;
    const banner = document.getElementById('staff-filter-banner');
    if (!banner) return;
    banner.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl mb-4" style="background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.2)">
            <i class="fa-solid fa-user text-rose-400 text-xs"></i>
            <span class="text-[11px] font-bold text-zinc-300">Послуги майстра: <span class="text-white">${s.name}</span></span>
            <button onclick="clearStaffFilter()" class="ml-auto text-zinc-500 hover:text-rose-400 transition"><i class="fa-solid fa-xmark text-xs"></i></button>
        </div>`;
    banner.classList.remove('hidden');
}

window.clearStaffFilter = function() {
    staffFilterId = '';
    history.replaceState({}, '', 'admin-services.html');
    document.getElementById('staff-filter-banner')?.classList.add('hidden');
    render();
};

async function loadData() {
    const [r1, r2, r3] = await Promise.all([
        window.db.from('services').select('*').order('category').order('name'),
        window.db.from('staff').select('id,name,role,position,avatar_url').eq('is_active', true).neq('role', 'owner').order('name'),
        window.db.from('staff_services').select('staff_id,service_id'),
    ]);
    allServices = r1.data || [];
    allStaff = r2.data || [];
    staffServices = r3.data || [];

    // Update header count
    const countEl = document.getElementById('svc-total-count');
    if (countEl) countEl.textContent = allServices.length;
}

function getCategories() {
    return [...new Set(allServices.map(s => s.category).filter(Boolean))].sort();
}

function getFiltered() {
    let list = allServices;
    if (staffFilterId) {
        const assigned = new Set(staffServices.filter(x => x.staff_id === staffFilterId).map(x => x.service_id));
        list = list.filter(s => assigned.has(s.id));
    }
    if (selectedCategory) list = list.filter(s => s.category === selectedCategory);
    return list;
}

function render() {
    renderCategories();
    renderServices();
    // Update header count
    const countEl = document.getElementById('svc-total-count');
    if (countEl) countEl.textContent = allServices.length;
}

function renderCategories() {
    const cats = getCategories();
    const el = document.getElementById('cat-list');
    el.innerHTML = `
        <button onclick="setCategory('')" class="cat-btn ${!selectedCategory ? 'active' : ''}">
            <i class="fa-solid fa-grid-2 text-xs mr-2"></i>Всі послуги
            <span class="ml-auto text-[9px] opacity-60">${allServices.length}</span>
        </button>
        ${cats.map(c => {
            const cnt = allServices.filter(s => s.category === c).length;
            return `<button onclick="setCategory('${c.replace(/'/g, "\\'")}')" class="cat-btn ${selectedCategory === c ? 'active' : ''}">
                <i class="fa-solid fa-tag text-xs mr-2 opacity-50"></i>${c}
                <span class="ml-auto text-[9px] opacity-60">${cnt}</span>
            </button>`;
        }).join('')}
    `;
}

function renderServices() {
    const list = getFiltered();
    const el = document.getElementById('svc-list');
    if (!list.length) {
        el.innerHTML = `<div class="text-center py-12 text-zinc-600 text-[11px] font-bold uppercase tracking-widest">Послуг немає</div>`;
        return;
    }
    el.innerHTML = list.map(s => {
        const staffCount = staffServices.filter(x => x.service_id === s.id).length;
        return `
        <div class="glass-panel rounded-2xl p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(244,63,94,.12)">
                <i class="fa-solid fa-scissors text-rose-400 text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-black text-white truncate">${s.name}</p>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                    ${s.category ? `<span class="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style="background:rgba(99,102,241,.15);color:#818cf8">${s.category}</span>` : ''}
                    ${s.price ? `<span class="text-[10px] font-bold text-emerald-400">₴${s.price}</span>` : ''}
                    ${s.duration ? `<span class="text-[10px] font-bold text-zinc-500">${s.duration} хв</span>` : ''}
                    ${s.allow_quantity ? `<span class="text-[9px] font-black px-2 py-0.5 rounded-full" style="background:rgba(99,102,241,.1);color:#818cf8"><i class="fa-solid fa-hashtag text-[8px] mr-1"></i>× кількість</span>` : ''}
                    <span class="text-[10px] font-bold text-zinc-600"><i class="fa-solid fa-user text-[8px] mr-1"></i>${staffCount} майстрів</span>
                </div>
                ${s.description ? `<p class="text-[10px] text-zinc-600 mt-1 truncate">${s.description}</p>` : ''}
            </div>
            <div class="flex gap-1 flex-shrink-0">
                <button onclick="openEdit('${s.id}')" class="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/5 transition"><i class="fa-solid fa-pen text-xs"></i></button>
                <button onclick="deleteService('${s.id}')" class="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        </div>`;
    }).join('');
}

window.setCategory = function(cat) {
    selectedCategory = cat;
    render();
};

// ── Category add ──────────────────────────────────────────────────────────────
window.showAddCategory = function() {
    const row = document.getElementById('new-cat-row');
    row.classList.remove('hidden');
    document.getElementById('new-cat-input').focus();
};

window.hideAddCategory = function() {
    const row = document.getElementById('new-cat-row');
    row.classList.add('hidden');
    document.getElementById('new-cat-input').value = '';
};

window.addCategory = function() {
    const val = document.getElementById('new-cat-input').value.trim();
    if (!val) { hideAddCategory(); return; }
    // Set as selected category filter (actual DB row gets created when a service is saved with this category)
    selectedCategory = val;
    hideAddCategory();
    renderCategories();
    renderServices();
};

// ── Drawer ────────────────────────────────────────────────────────────────────
window.openNew = function() {
    editingServiceId = null;
    document.getElementById('svc-drawer-title').textContent = 'Нова послуга';
    document.getElementById('svc-name').value = '';
    document.getElementById('svc-category').value = selectedCategory || '';
    document.getElementById('svc-price').value = '';
    document.getElementById('svc-duration').value = '';
    document.getElementById('svc-desc').value = '';
    document.getElementById('svc-allow-qty').checked = false;
    renderStaffAssign([]);
    openDrawer();
};

window.openEdit = function(id) {
    editingServiceId = id;
    const s = allServices.find(x => x.id == id);
    if (!s) return;
    document.getElementById('svc-drawer-title').textContent = 'Редагування послуги';
    document.getElementById('svc-name').value = s.name || '';
    document.getElementById('svc-category').value = s.category || '';
    document.getElementById('svc-price').value = s.price || '';
    document.getElementById('svc-duration').value = s.duration || '';
    document.getElementById('svc-desc').value = s.description || '';
    document.getElementById('svc-allow-qty').checked = !!s.allow_quantity;
    const assigned = staffServices.filter(x => x.service_id == id).map(x => x.staff_id);
    renderStaffAssign(assigned);
    openDrawer();
};

function renderStaffAssign(assigned) {
    const el = document.getElementById('staff-assign-list');
    if (!allStaff.length) {
        el.innerHTML = '<p class="text-[10px] text-zinc-600 text-center py-3">Немає активних майстрів</p>';
        return;
    }
    el.innerHTML = allStaff.map(s => {
        const checked = assigned.includes(s.id);
        const initials = s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return `
        <label class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] cursor-pointer transition">
            <input type="checkbox" value="${s.id}" ${checked ? 'checked' : ''} class="accent-rose-500 w-3.5 h-3.5 flex-shrink-0">
            ${s.avatar_url
                ? `<img src="${s.avatar_url}" class="w-7 h-7 rounded-full object-cover flex-shrink-0">`
                : `<div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style="background:rgba(244,63,94,.3)">${initials}</div>`
            }
            <div class="min-w-0">
                <p class="text-[11px] font-bold text-white truncate">${s.name}</p>
                <p class="text-[9px] text-zinc-500 truncate">${s.position || s.role}</p>
            </div>
        </label>`;
    }).join('');
}

function openDrawer() {
    // Populate category datalist
    const cats = getCategories();
    document.getElementById('cat-datalist').innerHTML = cats.map(c => `<option value="${c}">`).join('');
    document.getElementById('svc-drawer').classList.add('open');
    document.getElementById('svc-overlay').classList.add('open');
}

window.closeDrawer = function() {
    document.getElementById('svc-drawer').classList.remove('open');
    document.getElementById('svc-overlay').classList.remove('open');
    editingServiceId = null;
};

window.saveService = async function() {
    const name = document.getElementById('svc-name').value.trim();
    if (!name) { alert('Введіть назву послуги'); return; }
    const payload = {
        name,
        category: document.getElementById('svc-category').value.trim() || null,
        price: parseFloat(document.getElementById('svc-price').value) || null,
        duration: parseInt(document.getElementById('svc-duration').value) || null,
        description: document.getElementById('svc-desc').value.trim() || null,
        allow_quantity: document.getElementById('svc-allow-qty').checked,
    };

    let serviceId = editingServiceId;
    if (editingServiceId) {
        const { error } = await window.db.from('services').update(payload).eq('id', editingServiceId);
        if (error) { alert('Помилка: ' + error.message); return; }
    } else {
        const { data, error } = await window.db.from('services').insert([payload]).select().single();
        if (error) { alert('Помилка: ' + error.message); return; }
        serviceId = data.id;
    }

    // Save staff assignments
    const checked = [...document.querySelectorAll('#staff-assign-list input:checked')].map(el => el.value);
    await window.db.from('staff_services').delete().eq('service_id', serviceId);
    if (checked.length) {
        await window.db.from('staff_services').insert(checked.map(sid => ({ staff_id: sid, service_id: serviceId })));
    }

    closeDrawer();
    await loadData();
    render();
};

window.deleteService = async function(id) {
    if (!confirm('Видалити послугу?')) return;
    await window.db.from('staff_services').delete().eq('service_id', id);
    const { error } = await window.db.from('services').delete().eq('id', id);
    if (error) { alert('Помилка: ' + error.message); return; }
    await loadData();
    render();
};
