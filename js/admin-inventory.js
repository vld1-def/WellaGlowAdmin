// js/admin-inventory.js — Wella Glow Inventory
// ═══════════════════════════════════════════════════════

const _sId   = localStorage.getItem('wella_staff_id');
const _sRole = localStorage.getItem('wella_staff_role');
if (!_sId || !['owner','admin'].includes(_sRole)) location.href = 'staff-login.html';

// ══ Categories ═══════════════════════════════════════
const CATS = {
    'Манікюр':    ['Лак','База','Топ','Праймер','Гель-лак','Акрил','Засоби для шкіри'],
    'Макіяж':     ['Тіні','Помада','Пудра','Тональний','Туш','Олівець','Консилер'],
    'Колористика':['Фарба','Окислювач','Маска','Шампунь','Бальзам','Знебарвлювач'],
    'Розхідники': ['Фольга','Рукавички','Пеньюари','Серветки','Кисті','Шапочки'],
};

// ══ State ════════════════════════════════════════════
let items      = [];
let filtered   = [];
let curCat     = '';
let curSubcat  = '';
let curPage    = 1;
const PAGE_SZ  = 15;
let editingId  = null;
let orderItemId= null;
let procList   = JSON.parse(localStorage.getItem('wella_proc_list') || '[]');

// ══ Boot ═════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await loadItems();
    autoAddToProc();
    renderKPIs();
    renderTable();
    renderProcList();
    // Init subcategory on modal open
    onModalCatChange();
});

// ══ Load ═════════════════════════════════════════════
async function loadItems() {
    const { data, error } = await window.db
        .from('inventory_items').select('*').order('name');
    if (error) { console.error(error); return; }
    items = data || [];
}

// ══ KPIs ═════════════════════════════════════════════
function renderKPIs() {
    const total      = items.reduce((s,i)=>s+(parseFloat(i.cost_per_unit||0)*parseInt(i.quantity||0)),0);
    const attention  = items.filter(i=>itemStatus(i)!=='ok').length;
    const critical   = items.filter(i=>itemStatus(i)==='critical').length;
    document.getElementById('kpi-total').textContent     = '₴'+total.toLocaleString('uk-UA');
    document.getElementById('kpi-count').textContent     = items.length;
    document.getElementById('kpi-attention').textContent = attention+' позицій';
    document.getElementById('kpi-critical').textContent  = critical+' позицій';
}

function itemStatus(item) {
    const qty=parseInt(item.quantity||0), min=parseInt(item.min_quantity||0);
    if(qty<=0||(min>0&&qty<=min*0.5)) return 'critical';
    if(min>0&&qty<=min) return 'low';
    return 'ok';
}
function statusBadge(item){
    const s=itemStatus(item);
    if(s==='critical') return '<span class="badge-critical text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Критично</span>';
    if(s==='low')      return '<span class="badge-low text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Мало</span>';
    return '<span class="badge-ok text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">В нормі</span>';
}
function stockBarColor(item){const s=itemStatus(item);return s==='critical'?'#f43f5e':s==='low'?'#fbbf24':'#34d399';}
function stockBarPct(item){const qty=parseInt(item.quantity||0),min=parseInt(item.min_quantity||0);if(!min)return qty>0?100:0;return Math.min(100,Math.round(qty/(min*2)*100));}

// ══ Category / Subcategory filter ════════════════════
window.setCat = function(btn, cat) {
    document.querySelectorAll('.cat-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    curCat=cat; curSubcat=''; curPage=1;
    renderSubcatRow();
    renderTable();
};

function renderSubcatRow(){
    const wrap=document.getElementById('subcat-tabs');
    if(!curCat||!CATS[curCat]){wrap.classList.add('hidden');wrap.innerHTML='';return;}
    wrap.classList.remove('hidden');
    wrap.style.display='flex';
    wrap.innerHTML=`<button class="cat-tab active" onclick="setSubcat(this,'')">Всі</button>`
        +CATS[curCat].map(s=>`<button class="cat-tab" onclick="setSubcat(this,'${s}')">${s}</button>`).join('');
}

window.setSubcat = function(btn,sub){
    document.querySelectorAll('#subcat-tabs .cat-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    curSubcat=sub; curPage=1; renderTable();
};

// ══ Table ════════════════════════════════════════════
function applyFilters(){
    const q=(document.getElementById('inv-search')?.value||'').toLowerCase().trim();
    return items.filter(i=>{
        const catOk    = !curCat    || i.category===curCat;
        const subcatOk = !curSubcat || i.subcategory===curSubcat;
        const qOk      = !q||(i.name||'').toLowerCase().includes(q)||(i.sku||'').toLowerCase().includes(q);
        return catOk&&subcatOk&&qOk;
    });
}

function renderTable(){
    filtered=applyFilters();
    const total=filtered.length, start=(curPage-1)*PAGE_SZ;
    const page=filtered.slice(start,start+PAGE_SZ);
    const tbody=document.getElementById('inv-tbody');
    if(!page.length){
        tbody.innerHTML=`<tr><td colspan="8" class="text-center text-zinc-600 text-xs py-8">Нічого не знайдено</td></tr>`;
    } else {
        const catColor={'Манікюр':'#f43f5e','Макіяж':'#c084fc','Колористика':'#22d3ee','Розхідники':'#fb923c'};
        tbody.innerHTML=page.map(item=>{
            const color=catColor[item.category]||'#818cf8';
            const totalSum=parseFloat(item.cost_per_unit||0)*parseInt(item.quantity||0);
            const pct=stockBarPct(item), barColor=stockBarColor(item);
            const costStr=item.unit==='мл.'||item.unit==='г.'||item.unit==='л.'
                ?`₴${parseFloat(item.cost_per_unit||0).toFixed(2)} / ${item.unit}`
                :`₴${parseFloat(item.cost_per_unit||0).toLocaleString('uk-UA')}`;
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
                <td>
                    <p class="text-[10px] font-black uppercase tracking-widest" style="color:${color}">${item.category||'—'}</p>
                    ${item.subcategory?`<p class="text-[9px] text-zinc-600 font-semibold">${item.subcategory}</p>`:''}
                </td>
                <td>
                    <p class="font-black text-sm" style="color:${barColor}">${parseInt(item.quantity||0)} ${item.unit||'шт.'}</p>
                    <div class="stock-bar w-20"><div class="stock-fill" style="width:${pct}%;background:${barColor}"></div></div>
                </td>
                <td>${statusBadge(item)}</td>
                <td><span class="text-zinc-400 font-semibold text-xs">${item.unit||'шт.'}</span></td>
                <td><span class="text-zinc-300 font-bold text-xs">${costStr}</span></td>
                <td><span class="font-black text-white text-xs">₴${totalSum.toLocaleString('uk-UA')}</span></td>
                <td style="position:relative">
                    <button onclick="toggleDot(event,'dot-${item.id}')" class="w-7 h-7 rounded-lg text-zinc-600 hover:text-white hover:bg-white/5 transition flex items-center justify-center text-sm">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                    <div id="dot-${item.id}" class="dot-dropdown">
                        <div class="dot-item" onclick="openEditItem('${item.id}')"><i class="fa-solid fa-pen text-xs text-zinc-500"></i>Редагувати</div>
                        <div class="dot-item" onclick="openOrderModal('${item.id}')"><i class="fa-solid fa-cart-plus text-xs text-zinc-500"></i>Замовити</div>
                        <div class="dot-item danger" onclick="deleteItem('${item.id}')"><i class="fa-solid fa-trash text-xs"></i>Видалити</div>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }
    document.getElementById('inv-footer').textContent=
        `Всього товарів: ${total} · Показано: ${start+1} – ${Math.min(start+PAGE_SZ,total)}`;
}

window.changePage=function(dir){
    const pages=Math.ceil(filtered.length/PAGE_SZ);
    curPage=Math.max(1,Math.min(pages,curPage+dir));
    renderTable();
};

// ══ 3-dot menu (position:fixed to escape overflow) ═══
window.toggleDot=function(e,id){
    e.stopPropagation();
    const dd=document.getElementById(id);
    const isOpen=dd.classList.contains('open');
    document.querySelectorAll('.dot-dropdown.open').forEach(d=>{d.classList.remove('open');d.style.cssText='';});
    if(!isOpen){
        const btn=e.currentTarget, rect=btn.getBoundingClientRect();
        dd.style.position='fixed';
        dd.style.top=(rect.bottom+4)+'px';
        dd.style.right=(window.innerWidth-rect.right)+'px';
        dd.style.left='auto';
        dd.classList.add('open');
    }
};
document.addEventListener('click',()=>{
    document.querySelectorAll('.dot-dropdown.open').forEach(d=>{d.classList.remove('open');d.style.cssText='';});
});

// ══ Modal category → subcategory ═════════════════════
window.onModalCatChange=function(){
    const cat=document.getElementById('f-category')?.value;
    const sel=document.getElementById('f-subcategory');
    if(!sel) return;
    const subs=CATS[cat]||[];
    sel.innerHTML=`<option value="">— без підкатегорії —</option>`
        +subs.map(s=>`<option value="${s}">${s}</option>`).join('');
};

// ══ Add / Edit ════════════════════════════════════════
window.openAddItem=function(){
    editingId=null;
    document.getElementById('item-modal-title').textContent='Новий товар';
    ['f-name','f-sku','f-supplier'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    ['f-qty','f-min-qty','f-cost'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('f-category').value='Манікюр';
    document.getElementById('f-unit').value='шт.';
    onModalCatChange();
    document.getElementById('item-modal').classList.add('open');
};

window.openEditItem=function(id){
    document.querySelectorAll('.dot-dropdown.open').forEach(d=>{d.classList.remove('open');d.style.cssText='';});
    const item=items.find(i=>i.id===id); if(!item) return;
    editingId=id;
    document.getElementById('item-modal-title').textContent='Редагувати товар';
    document.getElementById('f-name').value      = item.name||'';
    document.getElementById('f-sku').value       = item.sku||'';
    document.getElementById('f-category').value  = item.category||'Манікюр';
    document.getElementById('f-unit').value      = item.unit||'шт.';
    document.getElementById('f-qty').value       = item.quantity||0;
    document.getElementById('f-min-qty').value   = item.min_quantity||0;
    document.getElementById('f-cost').value      = item.cost_per_unit||0;
    const supEl=document.getElementById('f-supplier'); if(supEl) supEl.value=item.supplier||'';
    onModalCatChange();
    // Set subcategory after options are built
    setTimeout(()=>{ const s=document.getElementById('f-subcategory'); if(s&&item.subcategory) s.value=item.subcategory; },0);
    document.getElementById('item-modal').classList.add('open');
};

window.closeItemModal=function(){
    document.getElementById('item-modal').classList.remove('open');
    editingId=null;
};

window.saveItem=async function(){
    const name=document.getElementById('f-name').value.trim();
    if(!name){alert('Введіть назву товару');return;}
    const payload={
        name,
        sku:           document.getElementById('f-sku').value.trim()||null,
        category:      document.getElementById('f-category').value,
        subcategory:   document.getElementById('f-subcategory').value||null,
        unit:          document.getElementById('f-unit').value,
        quantity:      parseInt(document.getElementById('f-qty').value)||0,
        min_quantity:  parseInt(document.getElementById('f-min-qty').value)||0,
        cost_per_unit: parseFloat(document.getElementById('f-cost').value)||0,
        supplier:      document.getElementById('f-supplier')?.value.trim()||null,
    };
    let error;
    if(editingId){({error}=await window.db.from('inventory_items').update(payload).eq('id',editingId));}
    else         {({error}=await window.db.from('inventory_items').insert([payload]));}
    if(error){alert('Помилка: '+error.message);return;}
    closeItemModal();
    await loadItems(); autoAddToProc(); renderKPIs(); renderTable(); renderProcList();
};

// ══ Delete ═══════════════════════════════════════════
window.deleteItem=async function(id){
    document.querySelectorAll('.dot-dropdown.open').forEach(d=>{d.classList.remove('open');d.style.cssText='';});
    const item=items.find(i=>i.id===id); if(!item) return;
    if(!confirm(`Видалити "${item.name}"?`)) return;
    const{error}=await window.db.from('inventory_items').delete().eq('id',id);
    if(error){alert(error.message);return;}
    await loadItems(); autoAddToProc(); renderKPIs(); renderTable(); renderProcList();
};

// ══ Order modal ═══════════════════════════════════════
window.openOrderModal=function(id){
    document.querySelectorAll('.dot-dropdown.open').forEach(d=>{d.classList.remove('open');d.style.cssText='';});
    const item=items.find(i=>i.id===id); if(!item) return;
    orderItemId=id;
    document.getElementById('order-body').innerHTML=`
        <div class="p-3 rounded-xl" style="background:rgba(255,255,255,.04)">
            <p class="text-xs font-bold text-white">${item.name}</p>
            <p class="text-[10px] text-zinc-500 mt-1">Залишок: ${item.quantity||0} ${item.unit||'шт.'} · Мін: ${item.min_quantity||0}</p>
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
window.closeOrderModal=function(){
    document.getElementById('order-modal').classList.remove('open'); orderItemId=null;
};
window.addToProc=function(){
    const item=items.find(i=>i.id===orderItemId); if(!item) return;
    const qty=parseInt(document.getElementById('order-qty').value)||1;
    const note=document.getElementById('order-note').value.trim();
    procList=procList.filter(p=>p.id!==item.id);
    procList.push({id:item.id,name:item.name,sku:item.sku||'',category:item.category||'',qty,unit:item.unit||'шт.',note,manual:true});
    saveProcList(); closeOrderModal(); renderProcList();
};

// ══ Procurement list ══════════════════════════════════
function autoAddToProc(){
    // Critical → checked automatically
    items.filter(i=>itemStatus(i)==='critical'&&!procList.find(p=>p.id===i.id)).forEach(i=>{
        const need=Math.max(1,(i.min_quantity||1)*2-(i.quantity||0));
        procList.push({id:i.id,name:i.name,sku:i.sku||'',category:i.category||'',qty:need,unit:i.unit||'шт.',urgent:true,checked:true});
    });
    // Low → unchecked
    items.filter(i=>itemStatus(i)==='low'&&!procList.find(p=>p.id===i.id)).forEach(i=>{
        const need=Math.max(1,(i.min_quantity||0)-(i.quantity||0));
        procList.push({id:i.id,name:i.name,sku:i.sku||'',category:i.category||'',qty:Math.max(1,need),unit:i.unit||'шт.',low:true,checked:false});
    });
    saveProcList();
}

function saveProcList(){
    localStorage.setItem('wella_proc_list',JSON.stringify(procList));
}

function renderProcList(){
    const el=document.getElementById('proc-list');
    if(!procList.length){
        el.innerHTML='<p class="text-xs text-zinc-600 py-2">Список порожній</p>'; return;
    }
    el.innerHTML=procList.map((p,idx)=>`
        <div class="proc-item">
            <input type="checkbox" class="proc-check" id="pc-${p.id}" ${p.checked!==false?'checked':''}
                onchange="toggleProcCheck('${p.id}',this.checked)">
            <div class="flex-1 min-w-0">
                <label for="pc-${p.id}" class="cursor-pointer block text-xs font-bold text-white truncate">${p.name}</label>
                <div class="flex items-center gap-1.5 mt-0.5">
                    <input type="number" min="1" value="${p.qty}"
                        onchange="updateProcQty('${p.id}',this.value)"
                        class="w-14 text-[10px] font-bold text-zinc-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none">
                    <span class="text-[9px] text-zinc-600">${p.unit}</span>
                </div>
            </div>
            ${p.urgent?'<span class="text-[8px] font-black uppercase text-rose-400 flex-shrink-0">Терміново</span>':p.low?'<span class="text-[8px] font-black uppercase text-amber-500 flex-shrink-0">Мало</span>':''}
            <button onclick="removeFromProc('${p.id}')" class="text-zinc-700 hover:text-rose-400 transition ml-1 flex-shrink-0">
                <i class="fa-solid fa-xmark text-xs"></i>
            </button>
        </div>`).join('');
}

window.toggleProcCheck=function(id,checked){
    const p=procList.find(x=>x.id===id); if(p) p.checked=checked; saveProcList();
};
window.updateProcQty=function(id,val){
    const p=procList.find(x=>x.id===id); if(p){p.qty=Math.max(1,parseInt(val)||1);} saveProcList();
};
window.removeFromProc=function(id){
    procList=procList.filter(p=>p.id!==id); saveProcList(); renderProcList();
};

// ══ PDF ═══════════════════════════════════════════════
window.generatePDF=function(){
    const toOrder=procList.filter(p=>{
        const el=document.getElementById('pc-'+p.id); return el?el.checked:(p.checked!==false);
    });
    if(!toOrder.length){alert('Виберіть хоча б один товар');return;}

    // Group by category
    const groups={};
    toOrder.forEach(p=>{
        const cat=p.category||'Інше';
        if(!groups[cat]) groups[cat]=[];
        groups[cat].push(p);
    });

    const date=new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'long',year:'numeric'});
    let n=0;
    const rows=Object.entries(groups).map(([cat,list])=>{
        const header=`<tr><td colspan="4" style="padding:12px 4px 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#888;border-bottom:2px solid #eee">${cat}</td></tr>`;
        const items=list.map(p=>`<tr style="border-bottom:1px solid #eee">
            <td style="padding:8px 4px;font-size:12px">${++n}</td>
            <td style="padding:8px 4px;font-size:12px;font-weight:600">${p.name}</td>
            <td style="padding:8px 4px;font-size:11px;color:#888">${p.sku||'—'}</td>
            <td style="padding:8px 4px;font-size:12px">${p.qty} ${p.unit}</td>
        </tr>`).join('');
        return header+items;
    }).join('');

    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Замовлення постачальнику</title>
        <style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{font-size:22px;margin-bottom:4px}p.sub{color:#666;font-size:13px;margin:0 0 24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;border-bottom:2px solid #eee}@media print{body{padding:20px}}</style></head>
        <body>
            <h1>Wella Glow — Замовлення постачальнику</h1>
            <p class="sub">Дата: ${date}</p>
            <table><thead><tr><th>#</th><th>Товар</th><th>Артикул</th><th>Кількість</th></tr></thead>
            <tbody>${rows}</tbody></table>
        </body></html>`;

    const win=window.open('','_blank');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(()=>win.print(),400);
};
