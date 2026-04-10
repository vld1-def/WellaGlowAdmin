// js/admin-calendar.js — Wella Glow Calendar
// ══════════════════════════════════════════

const _sId   = localStorage.getItem('wella_staff_id');
const _sRole = localStorage.getItem('wella_staff_role');
if (!_sId || !['owner','admin'].includes(_sRole)) location.href = 'staff-login.html';

// ── State ──────────────────────────────────────────────
let view           = 'week';
let curDate        = new Date();
let appts          = [];          // cached appointments
let masters        = [];          // staff (masters only, no owner)
let clients        = [];
let services       = [];
let staffServices  = [];          // [{staff_id, service_id}]
let filterMId      = '';          // '' = all masters
let editingId      = null;
let selectedTime   = '';          // HH:MM chosen in drawer

// Work hours: 09:00 – 20:00 every 60 min
const WORK_HOURS = Array.from({length:12}, (_,i) => {
    const h = i + 9;
    return `${String(h).padStart(2,'0')}:00`;
});

// Deterministic color per master
const PALETTE = ['#f43f5e','#fb923c','#facc15','#34d399','#22d3ee','#818cf8','#c084fc','#f472b6'];
function mColor(id) {
    const h = (id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    return PALETTE[h % PALETTE.length];
}

function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseLD(s){ if(!s)return null; const[y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }

// ── Boot ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadMasters(), loadClients(), loadServices(), loadStaffServices()]);
    buildMasterPills();
    populateDrawer();
    await refreshAppts();
    render();
    renderKPIs();
    document.getElementById('a-date').value = localDate(new Date());
});

// ══════════════════════════════════════════════════════
//  LOADERS
// ══════════════════════════════════════════════════════

async function loadMasters() {
    const {data} = await window.db.from('staff')
        .select('id,name,role,commission_rate,position,is_active')
        .eq('is_active', true)
        .neq('role', 'owner')   // ← exclude owner
        .order('name');
    masters = data || [];
}

async function loadClients() {
    const {data} = await window.db.from('clients').select('id,full_name,phone').order('full_name');
    clients = data || [];
}

async function loadServices() {
    const {data} = await window.db.from('services').select('*').order('name');
    services = data || [];
}

async function loadStaffServices() {
    const {data} = await window.db.from('staff_services').select('staff_id,service_id');
    staffServices = data || [];
}

async function refreshAppts() {
    const ws  = weekStart(curDate);
    const from = localDate(new Date(ws.getTime() - 14*86400000));
    const to   = localDate(new Date(ws.getTime() + 21*86400000));
    const {data,error} = await window.db.from('appointment_history')
        .select('*')
        .gte('visit_date', from)
        .lte('visit_date', to)
        .order('visit_date').order('start_time');
    if(error){console.error(error);return;}
    appts = data||[];
}

// ══════════════════════════════════════════════════════
//  MASTER FILTER PILLS
// ══════════════════════════════════════════════════════

function buildMasterPills() {
    const wrap = document.getElementById('master-filters');
    wrap.innerHTML = '';
    // "All" pill
    const all = makePill('Всі', '', '#f43f5e', true);
    wrap.appendChild(all);
    masters.forEach(s => {
        wrap.appendChild(makePill(s.name.split(' ')[0], s.id, mColor(s.id), false));
    });
}

function makePill(label, id, color, active) {
    const btn = document.createElement('button');
    btn.className = 'master-pill' + (active ? ' active' : '');
    btn.dataset.id = id;
    btn.textContent = label;
    if(active) applyPillActive(btn, color);
    btn.onclick = () => setMasterFilter(id);
    return btn;
}

function applyPillActive(btn, color) {
    btn.style.background   = color + '22';
    btn.style.borderColor  = color + '55';
    btn.style.color        = color;
}

window.setMasterFilter = function(id) {
    filterMId = id;
    document.querySelectorAll('.master-pill').forEach(btn => {
        const isThis = btn.dataset.id === id;
        btn.classList.toggle('active', isThis);
        if(isThis) applyPillActive(btn, id ? mColor(id) : '#f43f5e');
        else { btn.style.background=''; btn.style.borderColor=''; btn.style.color=''; }
    });
    render();
    renderKPIs();
};

// ══════════════════════════════════════════════════════
//  FILTERED DATA
// ══════════════════════════════════════════════════════

function filteredAppts() {
    return filterMId ? appts.filter(a=>a.master_id===filterMId) : appts;
}

function apptsOn(dateStr) {
    return filteredAppts().filter(a=>a.visit_date===dateStr);
}

// ══════════════════════════════════════════════════════
//  VIEW CONTROLS
// ══════════════════════════════════════════════════════

window.setView = function(v) {
    view = v;
    document.getElementById('week-view').classList.toggle('hidden', v!=='week');
    document.getElementById('month-view').classList.toggle('hidden', v!=='month');
    document.getElementById('btn-week').classList.toggle('active', v==='week');
    document.getElementById('btn-month').classList.toggle('active', v==='month');
    render();
};

window.navPrev = function() {
    if(view==='week') curDate = new Date(curDate.getTime()-7*86400000);
    else curDate = new Date(curDate.getFullYear(), curDate.getMonth()-1, 1);
    refreshAppts().then(()=>{render();renderKPIs();});
};
window.navNext = function() {
    if(view==='week') curDate = new Date(curDate.getTime()+7*86400000);
    else curDate = new Date(curDate.getFullYear(), curDate.getMonth()+1, 1);
    refreshAppts().then(()=>{render();renderKPIs();});
};
window.goToday = function() {
    curDate = new Date();
    refreshAppts().then(()=>{render();renderKPIs();});
};

function render() { view==='week' ? renderWeek() : renderMonth(); }

// ══════════════════════════════════════════════════════
//  WEEK VIEW — two modes
//  Single master → vertical time-axis (timeline)
//  All masters   → master-lane rows (Fresha-style)
// ══════════════════════════════════════════════════════

function weekStart(d) {
    const dow = d.getDay()||7; // Mon=1…Sun=7
    const s = new Date(d); s.setDate(d.getDate()-(dow-1)); s.setHours(0,0,0,0); return s;
}

function renderWeek() {
    const ws    = weekStart(curDate);
    const today = localDate(new Date());
    const days  = Array.from({length:7}, (_,i)=>{
        const d = new Date(ws.getTime()+i*86400000);
        return {d, str:localDate(d)};
    });

    // Period label
    const DAY_UA = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
    const MON_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
    document.getElementById('period-label').textContent =
        days[0].d.toLocaleDateString('uk-UA',{day:'numeric',month:'long'})+' — '+
        days[6].d.toLocaleDateString('uk-UA',{day:'numeric',month:'long',year:'numeric'});

    if(filterMId) renderTimelineWeek(days, today, DAY_UA);
    else          renderMultiMasterWeek(days, today, DAY_UA);
}

// ── A) Single master: time-axis ───────────────────────
function renderTimelineWeek(days, today, DAY_UA) {
    // Header
    const hdr = document.getElementById('week-day-headers');
    hdr.innerHTML = `<div class="grid gap-0" style="grid-template-columns:44px repeat(7,1fr)">
        <div></div>
        ${days.map(({d,str},i)=>`
            <div class="text-center pb-2 ${str===today?'text-rose-500':'text-zinc-600'}">
                <div class="text-[8px] font-black uppercase tracking-widest">${DAY_UA[i]}</div>
                <div class="text-lg font-extrabold leading-tight">${d.getDate()}</div>
                ${apptsOn(str).length ? `<div class="text-[8px] font-bold opacity-60">${apptsOn(str).length}з</div>` : ''}
            </div>`).join('')}
    </div>`;

    // Timeline
    const content = document.getElementById('week-content');
    const rows = WORK_HOURS.map(hour=>{
        const cells = days.map(({str})=>{
            const a = appts.filter(x=>x.visit_date===str && x.master_id===filterMId && x.start_time && x.start_time.startsWith(hour));
            return `<div class="tl-day-cell" ondblclick="openApptDrawer('${str}','${hour}')">${
                a.map(x=>apptCardHTML(x,'sm')).join('')
            }</div>`;
        }).join('');
        return `<div class="tl-hour">
            <div class="tl-hour-label">${hour}</div>
            <div class="grid gap-0" style="grid-template-columns:repeat(7,1fr)">${cells}</div>
        </div>`;
    }).join('');

    content.innerHTML = `<div class="tl-grid">${rows}</div>`;
}

// ── B) All masters: lane rows ─────────────────────────
function renderMultiMasterWeek(days, today, DAY_UA) {
    const hdr = document.getElementById('week-day-headers');

    // Column headers (days)
    hdr.innerHTML = `<div class="grid gap-[2px] mb-2" style="grid-template-columns:80px repeat(7,1fr)">
        <div></div>
        ${days.map(({d,str},i)=>`
            <div class="text-center py-1 rounded-lg ${str===today?'bg-rose-500/8 text-rose-400':'text-zinc-600'}">
                <div class="text-[8px] font-black uppercase tracking-widest">${DAY_UA[i]}</div>
                <div class="text-base font-extrabold leading-tight">${d.getDate()}</div>
            </div>`).join('')}
    </div>`;

    // Each master = one row
    const rows = masters.map(s=>{
        const color = mColor(s.id);
        const cells = days.map(({str})=>{
            const da = appts.filter(a=>a.visit_date===str && a.master_id===s.id);
            return `<div class="multi-day-cell" ondblclick="openApptDrawer('${str}','','${s.id}')">
                ${da.map(a=>apptCardHTML(a,'xs')).join('')}
                ${!da.length ? `<div class="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition">
                    <span class="text-[8px] text-zinc-700 font-bold">+</span></div>` : ''}
            </div>`;
        }).join('');
        return `<div class="grid gap-[2px] mb-1 items-start" style="grid-template-columns:80px repeat(7,1fr)">
            <!-- Master label -->
            <div class="flex items-center gap-2 pr-2 py-1">
                <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></div>
                <span class="text-[9px] font-black text-zinc-400 truncate leading-tight">${s.name.split(' ')[0]}</span>
            </div>
            ${cells}
        </div>`;
    }).join('');

    document.getElementById('week-content').innerHTML =
        `<div>${rows}</div>`;
}

// ── Appointment card HTML ─────────────────────────────
function apptCardHTML(a, size='sm') {
    const client  = clients.find(c=>c.id===a.client_id);
    const service = services.find(s=>s.id===a.service_id);
    const color   = mColor(a.master_id);
    const si      = statusInfo(a.status);
    const timeStr = a.start_time ? a.start_time.slice(0,5)+' ' : '';

    if(size==='xs') return `
        <div class="appt-card mb-1" style="background:${color}15;border-left-color:${color}"
             onclick="event.stopPropagation();openDetail('${a.id}')">
            <p class="text-[9px] font-bold text-white truncate">${timeStr}${client?.full_name?.split(' ')[0]||'—'}</p>
            <p class="text-[8px] truncate mt-0.5" style="color:${color}aa">${service?.name||'—'}</p>
        </div>`;

    return `
        <div class="appt-card mb-1.5" style="background:${color}18;border-left-color:${color}"
             onclick="event.stopPropagation();openDetail('${a.id}')">
            <div class="flex items-start justify-between gap-1">
                <p class="text-[10px] font-bold text-white truncate">${timeStr}${client?.full_name||'—'}</p>
                <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${si.cls}">${si.label}</span>
            </div>
            <p class="text-[9px] truncate mt-0.5" style="color:${color}bb">${service?.name||'—'}</p>
            <p class="text-[9px] font-bold text-white/60 mt-1">₴${parseFloat(a.price||0).toLocaleString('uk-UA')}</p>
        </div>`;
}

// ══════════════════════════════════════════════════════
//  MONTH VIEW
// ══════════════════════════════════════════════════════

function renderMonth() {
    const y = curDate.getFullYear(), m = curDate.getMonth();
    const today = localDate(new Date());
    document.getElementById('period-label').textContent =
        new Date(y,m,1).toLocaleDateString('uk-UA',{month:'long',year:'numeric'});

    const first = new Date(y,m,1), last = new Date(y,m+1,0);
    let dow = first.getDay()||7; // Mon=1
    const offset = dow-1;
    const cells = Math.ceil((offset+last.getDate())/7)*7;

    const grid = document.getElementById('month-grid');
    grid.innerHTML = '';
    for(let i=0;i<cells;i++){
        const diff     = i-offset;
        const cellDate = new Date(y,m,diff+1);
        const dStr     = localDate(cellDate);
        const inMonth  = diff>=0 && diff<last.getDate();
        const isToday  = dStr===today;
        const da       = apptsOn(dStr);

        const cell = document.createElement('div');
        cell.className = 'month-day'+(isToday?' today':'')+((!inMonth)?' other-month':'')+(da.length?' has-appts':'');
        if(da.length) cell.onclick = ()=>showDayList(dStr, da);
        cell.ondblclick = e=>{e.stopPropagation(); openApptDrawer(dStr);};

        const num = document.createElement('div');
        num.className='month-day-num';
        num.textContent = cellDate.getDate();
        cell.appendChild(num);

        da.slice(0,4).forEach(a=>{
            const dot=document.createElement('div');
            dot.className='month-dot';
            dot.style.background=mColor(a.master_id)+'bb';
            cell.appendChild(dot);
        });
        if(da.length>4){
            const more=document.createElement('div');
            more.className='text-[8px] text-zinc-600 font-black';
            more.textContent=`+${da.length-4} ще`;
            cell.appendChild(more);
        }
        grid.appendChild(cell);
    }
}

// ══════════════════════════════════════════════════════
//  KPI STRIP
// ══════════════════════════════════════════════════════

function renderKPIs() {
    const todayStr = localDate(new Date());
    const ws  = weekStart(curDate);
    const we  = localDate(new Date(ws.getTime()+6*86400000));
    const wss = localDate(ws);
    const fa  = filteredAppts();
    const todayA = fa.filter(a=>a.visit_date===todayStr);
    const weekA  = fa.filter(a=>a.visit_date>=wss&&a.visit_date<=we);
    document.getElementById('kpi-today').textContent   = todayA.length+' записів';
    document.getElementById('kpi-revenue').textContent = '₴'+weekA.reduce((s,a)=>s+parseFloat(a.price||0),0).toLocaleString('uk-UA');
    document.getElementById('kpi-done').textContent    = weekA.filter(a=>a.status==='Виконано').length+'/'+weekA.length;
    document.getElementById('kpi-total').textContent   = weekA.length+' записів';
}

// ══════════════════════════════════════════════════════
//  STATUS HELPER
// ══════════════════════════════════════════════════════

function statusInfo(s) {
    return {
        'Виконано':    {cls:'s-done',    label:'Виконано'    },
        'Підтверджено':{cls:'s-pending', label:'Підтверджено'},
        'Скасовано':   {cls:'s-cancel',  label:'Скасовано'   },
        'Новий':       {cls:'s-new',     label:'Новий'       },
    }[s]||{cls:'s-new',label:s||'Новий'};
}

// ══════════════════════════════════════════════════════
//  DRAWER — ADD / EDIT
// ══════════════════════════════════════════════════════

function populateDrawer() {
    // Clients
    const cs = document.getElementById('a-client');
    clients.forEach(c=>{
        const o=document.createElement('option');
        o.value=c.id;
        o.textContent=c.full_name+(c.phone?` (${c.phone})`:'');
        cs.appendChild(o);
    });
    // Services
    const ss = document.getElementById('a-service');
    services.forEach(s=>{
        const o=document.createElement('option');
        o.value=s.id; o.dataset.price=s.price||0; o.dataset.dur=s.duration||60;
        o.textContent=s.name+(s.category?' — '+s.category:'');
        ss.appendChild(o);
    });
    // Masters — populated dynamically via onServiceChange
    populateMasterSelect('');
}

function populateMasterSelect(serviceId) {
    const sel = document.getElementById('a-master');
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Оберіть майстра —</option>';

    let list = masters; // only non-owner by loadMasters()
    if(serviceId) {
        const allowed = new Set(staffServices.filter(x=>x.service_id===serviceId).map(x=>x.staff_id));
        list = masters.filter(s=>allowed.has(s.id));
    }

    list.forEach(s=>{
        const o=document.createElement('option');
        o.value=s.id;
        o.textContent=s.name+(s.position?' ('+s.position+')':'');
        sel.appendChild(o);
    });

    const hint = document.getElementById('master-hint');
    if(serviceId && list.length===0){
        hint.textContent='⚠ Жоден майстер не надає цю послугу';
        hint.classList.remove('hidden');
    } else if(!serviceId){
        hint.textContent='Оберіть послугу — покажемо відповідних майстрів';
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }

    // Restore prev if still in list
    if(prev && list.find(s=>s.id===prev)) sel.value = prev;
    // If filtered by global master pill — prefill
    else if(filterMId && list.find(s=>s.id===filterMId)) sel.value = filterMId;

    // Re-trigger slot loading if date already filled
    if(sel.value && document.getElementById('a-date').value) onMasterOrDateChange();
}

window.openApptDrawer = function(prefillDate='', prefillTime='', prefillMaster='') {
    editingId   = null;
    selectedTime = prefillTime;
    document.getElementById('drawer-title').textContent = 'Новий запис';
    document.getElementById('a-client').value  = '';
    document.getElementById('a-service').value = '';
    document.getElementById('a-status').value  = 'Новий';
    document.getElementById('a-price').value   = '';
    document.getElementById('a-date').value    = prefillDate || localDate(new Date());
    document.getElementById('master-hint').classList.remove('hidden');
    populateMasterSelect('');
    if(prefillMaster) document.getElementById('a-master').value = prefillMaster;
    else if(filterMId) document.getElementById('a-master').value = filterMId;

    renderTimeSlots([], prefillTime);
    document.getElementById('slots-legend').classList.remove('hidden');

    document.getElementById('appt-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');

    if(document.getElementById('a-master').value && document.getElementById('a-date').value)
        onMasterOrDateChange();
};

window.onServiceChange = function() {
    const sel  = document.getElementById('a-service');
    const opt  = sel.options[sel.selectedIndex];
    const sid  = sel.value;
    if(opt?.dataset?.price) document.getElementById('a-price').value = opt.dataset.price;
    populateMasterSelect(sid);
};

window.onMasterOrDateChange = async function() {
    const masterId = document.getElementById('a-master').value;
    const date     = document.getElementById('a-date').value;
    if(!masterId || !date) {
        renderTimeSlots([], selectedTime);
        return;
    }
    document.getElementById('slots-loading').classList.remove('hidden');

    // Fetch booked slots for this master+date
    const {data} = await window.db.from('appointment_history')
        .select('start_time, service_id')
        .eq('master_id', masterId)
        .eq('visit_date', date)
        .neq('status', 'Скасовано');

    const booked = new Set((data||[]).map(a=>a.start_time?.slice(0,5)).filter(Boolean));
    document.getElementById('slots-loading').classList.add('hidden');
    renderTimeSlots(booked, selectedTime, date);
};

function renderTimeSlots(bookedSet, activeTime, dateStr='') {
    const grid = document.getElementById('time-slots-grid');
    const now  = new Date();
    const todayStr = localDate(now);
    const nowH = now.getHours(), nowM = now.getMinutes();

    grid.innerHTML = WORK_HOURS.map(t=>{
        const [hh,mm] = t.split(':').map(Number);
        const isPast   = dateStr===todayStr && (hh<nowH || (hh===nowH && mm<=nowM));
        const isBooked = bookedSet.has ? bookedSet.has(t) : false;
        const isActive = t===activeTime;
        let cls = 'time-slot';
        if(isActive)       cls+=' selected';
        else if(isBooked)  cls+=' booked';
        else if(isPast)    cls+=' past';
        const disabled = (isBooked||isPast) ? 'disabled' : '';
        return `<button class="${cls}" ${disabled} onclick="selectTime('${t}')">${t}</button>`;
    }).join('');
}

window.selectTime = function(t) {
    selectedTime = t;
    // Re-render keeping booked state — cheaply just toggle classes
    document.querySelectorAll('.time-slot').forEach(btn=>{
        if(btn.textContent===t) btn.classList.add('selected');
        else if(!btn.classList.contains('booked')&&!btn.classList.contains('past'))
            btn.classList.remove('selected');
    });
};

window.saveAppt = async function() {
    const clientId  = document.getElementById('a-client').value;
    const serviceId = document.getElementById('a-service').value;
    const masterId  = document.getElementById('a-master').value;
    const date      = document.getElementById('a-date').value;
    const price     = parseFloat(document.getElementById('a-price').value)||0;
    const status    = document.getElementById('a-status').value;

    if(!clientId||!masterId||!date){
        alert('Заповніть: клієнт, майстер, дата.'); return;
    }
    if(!selectedTime){
        alert('Оберіть час запису.'); return;
    }

    const payload = {
        client_id:  clientId,
        service_id: serviceId||null,
        master_id:  masterId,
        visit_date: date,
        start_time: selectedTime+':00',
        price,
        status,
    };

    let error;
    if(editingId) ({ error } = await window.db.from('appointment_history').update(payload).eq('id',editingId));
    else          ({ error } = await window.db.from('appointment_history').insert([payload]));
    if(error){ alert('Помилка: '+error.message); return; }

    closeAllDrawers();
    await refreshAppts();
    render(); renderKPIs();
};

// ══════════════════════════════════════════════════════
//  DETAIL DRAWER
// ══════════════════════════════════════════════════════

window.openDetail = function(id) {
    const a = appts.find(x=>x.id===id); if(!a) return;
    const master  = masters.find(s=>s.id===a.master_id);
    const service = services.find(s=>s.id===a.service_id);
    const client  = clients.find(c=>c.id===a.client_id);
    const color   = mColor(a.master_id);
    const si      = statusInfo(a.status);
    const dateStr = a.visit_date ? parseLD(a.visit_date)?.toLocaleDateString('uk-UA',{day:'2-digit',month:'long',year:'numeric'}) : '—';
    const timeStr = a.start_time ? a.start_time.slice(0,5) : '';

    document.getElementById('detail-body').innerHTML=`
        <div class="p-3 rounded-xl flex items-center justify-between" style="background:${color}15;border:1px solid ${color}33">
            <div>
                <p class="text-[9px] font-black uppercase tracking-widest" style="color:${color}">Запис</p>
                <p class="text-xs font-bold text-white mt-0.5">${dateStr}${timeStr?' о '+timeStr:''}</p>
            </div>
            <span class="text-[9px] font-black px-2 py-1 rounded-full ${si.cls}">${si.label}</span>
        </div>
        <div class="space-y-2 mt-1">
            ${detailRow('fa-user','Клієнт',client?.full_name||'—',client?.phone||'')}
            ${detailRow('fa-scissors','Послуга',service?.name||'—',service?.category||'')}
            ${detailRow('fa-circle','Майстер',master?.name||'—',master?.position||'','color:'+color)}
            ${detailRow('fa-hryvnia-sign','Сума','₴'+parseFloat(a.price||0).toLocaleString('uk-UA'),'','class="text-rose-400 text-base font-extrabold"')}
        </div>`;

    document.getElementById('d-edit').onclick   = ()=>{ closeAllDrawers(); openEditDrawer(a); };
    document.getElementById('d-done').onclick   = ()=>updateStatus(id,'Виконано');
    document.getElementById('d-cancel').onclick = ()=>{ if(confirm('Скасувати запис?')) updateStatus(id,'Скасовано'); };
    document.getElementById('d-done').style.display = a.status==='Виконано'?'none':'';

    document.getElementById('detail-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
};

function detailRow(icon,label,main,sub,extraStyle='') {
    return `<div class="glass-panel rounded-xl p-3 flex items-center gap-3">
        <i class="fa-solid ${icon} w-4 text-zinc-600 text-xs"></i>
        <div>
            <p class="text-[8px] text-zinc-600 uppercase font-black tracking-widest">${label}</p>
            <p ${extraStyle} class="text-[12px] font-bold text-white">${main}</p>
            ${sub?`<p class="text-[10px] text-zinc-500">${sub}</p>`:''}
        </div>
    </div>`;
}

function openEditDrawer(a) {
    editingId    = a.id;
    selectedTime = a.start_time?.slice(0,5)||'';
    document.getElementById('drawer-title').textContent = 'Редагувати запис';
    document.getElementById('a-client').value  = a.client_id||'';
    document.getElementById('a-date').value    = a.visit_date||'';
    document.getElementById('a-price').value   = a.price||'';
    document.getElementById('a-status').value  = a.status||'Новий';

    populateMasterSelect(a.service_id||'');
    document.getElementById('a-service').value = a.service_id||'';
    document.getElementById('a-master').value  = a.master_id||'';
    document.getElementById('slots-legend').classList.remove('hidden');

    document.getElementById('appt-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    onMasterOrDateChange();
}

async function updateStatus(id, status) {
    const {error} = await window.db.from('appointment_history').update({status}).eq('id',id);
    if(error){alert(error.message);return;}
    closeAllDrawers();
    await refreshAppts(); render(); renderKPIs();
}

// ══════════════════════════════════════════════════════
//  DAY LIST (month view click)
// ══════════════════════════════════════════════════════

function showDayList(dStr, da) {
    const date = parseLD(dStr)?.toLocaleDateString('uk-UA',{day:'numeric',month:'long'});
    document.getElementById('detail-body').innerHTML=`
        <p class="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3">${date}</p>
        <div class="space-y-2">
            ${da.map(a=>{
                const cl=clients.find(c=>c.id===a.client_id);
                const sv=services.find(s=>s.id===a.service_id);
                const co=mColor(a.master_id), si=statusInfo(a.status);
                const t=a.start_time?a.start_time.slice(0,5)+' ':'';
                return `<div class="p-3 rounded-xl cursor-pointer hover:bg-white/3 transition"
                    style="background:${co}10;border-left:3px solid ${co}66"
                    onclick="openDetail('${a.id}')">
                    <div class="flex items-center justify-between">
                        <p class="text-[11px] font-bold text-white">${t}${cl?.full_name||'—'}</p>
                        <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full ${si.cls}">${si.label}</span>
                    </div>
                    <p class="text-[10px] mt-0.5 font-semibold" style="color:${co}99">${sv?.name||'—'}</p>
                    <p class="text-[10px] font-bold text-white/50 mt-0.5">₴${parseFloat(a.price||0).toLocaleString('uk-UA')}</p>
                </div>`;
            }).join('')}
        </div>
        <button onclick="openApptDrawer('${dStr}')" class="w-full mt-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/8 text-zinc-500 hover:text-white hover:border-white/20 transition flex items-center justify-center gap-2">
            <i class="fa-solid fa-plus text-xs"></i> Додати запис
        </button>`;

    ['d-edit','d-done','d-cancel'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.style.display='none';
    });
    document.getElementById('detail-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
}

// ══════════════════════════════════════════════════════
//  CLOSE
// ══════════════════════════════════════════════════════

function closeAllDrawers() {
    ['appt-drawer','detail-drawer'].forEach(id=>document.getElementById(id).classList.remove('open'));
    document.getElementById('drawer-overlay').classList.remove('open');
    ['d-edit','d-done','d-cancel'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.style.display='';
    });
    editingId=null;
}
