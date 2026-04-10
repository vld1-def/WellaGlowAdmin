// js/admin-calendar.js — Wella Glow Calendar
// Uses: appointments (active), appointment_history (done)
// ═══════════════════════════════════════════════════════

const _sId   = localStorage.getItem('wella_staff_id');
const _sRole = localStorage.getItem('wella_staff_role');
if (!_sId || !['owner','admin'].includes(_sRole)) location.href = 'staff-login.html';

// ══ State ════════════════════════════════════════════
let view          = 'week';
let curDate       = new Date();
let appts         = [];          // from appointments table
let histAppts     = [];          // from appointment_history (done)
let masters       = [];
let clients       = [];
let services      = [];
let staffSvc      = [];          // staff_services
let filterMId     = '';
let editingId     = null;
let editingTable  = 'appointments'; // which table when editing

// Drag-to-select state
let dragStart     = null;        // { dayStr, hour }
let dragEnd       = null;
let isDragging    = false;

// Selected slots in drawer
let selStartHour  = null;        // 9
let selEndHour    = null;        // 11  (end = 11:00, so slot 9-11 = 2h)

// Autocomplete state
const acState = {
    client:  { query:'', selectedId:'', items:[] },
    service: { query:'', selectedId:'', items:[], acIdx:-1 },
};

// Colors
const PALETTE = ['#f43f5e','#fb923c','#facc15','#34d399','#22d3ee','#818cf8','#c084fc','#f472b6'];
function mColor(id){ const h=(id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0); return PALETTE[h%PALETTE.length]; }

// Date helpers
function localDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseLD(s){ if(!s)return null; const[y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function hhmm(h){ return String(h).padStart(2,'0')+':00'; }

// Work hours 9-20
const HOURS = Array.from({length:12},(_,i)=>i+9); // [9,10,...,20]

// ══ Boot ═════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async ()=>{
    await Promise.all([loadMasters(),loadClients(),loadServices(),loadStaffSvc()]);
    buildMasterPills();
    await refreshAppts();
    render();
    renderKPIs();
    document.getElementById('a-date').value = localDate(new Date());
    // Close dropdowns on outside click
    document.addEventListener('click', e=>{
        if(!e.target.closest('.ac-wrap')) { closeAcAll(); }
    });
});

// ══ Loaders ══════════════════════════════════════════
async function loadMasters(){
    const {data}=await window.db.from('staff').select('id,name,role,position,is_active').eq('is_active',true).neq('role','owner').order('name');
    masters=data||[];
}
async function loadClients(){
    const {data}=await window.db.from('clients').select('id,full_name,phone').order('full_name');
    clients=data||[];
    acState.client.items=clients;
}
async function loadServices(){
    const {data}=await window.db.from('services').select('*').order('name');
    services=data||[];
    acState.service.items=services;
}
async function loadStaffSvc(){
    const {data}=await window.db.from('staff_services').select('staff_id,service_id');
    staffSvc=data||[];
}

async function refreshAppts(){
    const ws=weekStart(curDate);
    const from=localDate(new Date(ws.getTime()-14*86400000));
    const to=localDate(new Date(ws.getTime()+21*86400000));

    const [r1,r2]=await Promise.all([
        window.db.from('appointments').select('*').gte('appointment_date',from).lte('appointment_date',to),
        window.db.from('appointment_history').select('*').gte('visit_date',from).lte('visit_date',to),
    ]);
    appts      = (r1.data||[]).map(a=>({...a, _tbl:'appointments', _date:a.appointment_date, _start:a.appointment_time, _end:a.end_time}));
    histAppts  = (r2.data||[]).map(a=>({...a, _tbl:'appointment_history', _date:a.visit_date, _start:a.start_time, _end:a.end_time}));
}

function allAppts(){ return [...appts,...histAppts]; }

// ══ Master Filter ═════════════════════════════════════
function buildMasterPills(){
    const wrap=document.getElementById('master-filters');
    wrap.innerHTML='';
    wrap.appendChild(makePill('Всі','',true));
    masters.forEach(s=>wrap.appendChild(makePill(s.name.split(' ')[0],s.id,false)));
}
function makePill(label,id,active){
    const btn=document.createElement('button');
    btn.className='master-pill'+(active?' active':'');
    btn.dataset.id=id;
    btn.textContent=label;
    if(active) applyPillStyle(btn, id?mColor(id):'#f43f5e');
    btn.onclick=()=>setMasterFilter(id);
    return btn;
}
function applyPillStyle(btn,color){
    btn.style.background=color+'22'; btn.style.borderColor=color+'55'; btn.style.color=color;
}
window.setMasterFilter=function(id){
    filterMId=id;
    document.querySelectorAll('.master-pill').forEach(btn=>{
        const active=btn.dataset.id===id;
        btn.classList.toggle('active',active);
        if(active) applyPillStyle(btn,id?mColor(id):'#f43f5e');
        else { btn.style.background='';btn.style.borderColor='';btn.style.color=''; }
    });
    render(); renderKPIs();
};

// ══ Filtered data ═════════════════════════════════════
function filteredAll(){ return filterMId ? allAppts().filter(a=>(a.master_id||a._master_id)===filterMId) : allAppts(); }
function apptsOnDay(dStr){ return filteredAll().filter(a=>a._date===dStr); }
function masterApptsOnDay(masterId,dStr){ return allAppts().filter(a=>a.master_id===masterId&&a._date===dStr); }

// ══ View controls ════════════════════════════════════
window.setView=function(v){
    view=v;
    document.getElementById('week-view').classList.toggle('hidden',v!=='week');
    document.getElementById('month-view').classList.toggle('hidden',v!=='month');
    document.getElementById('btn-week').classList.toggle('active',v==='week');
    document.getElementById('btn-month').classList.toggle('active',v==='month');
    render();
};
window.navPrev=function(){ step(-1); };
window.navNext=function(){ step(1);  };
window.goToday=function(){ curDate=new Date(); refreshAppts().then(()=>{render();renderKPIs();}); };
function step(dir){
    if(view==='week') curDate=new Date(curDate.getTime()+dir*7*86400000);
    else curDate=new Date(curDate.getFullYear(),curDate.getMonth()+dir,1);
    refreshAppts().then(()=>{render();renderKPIs();});
}
function render(){ view==='week'?renderWeek():renderMonth(); }

// ══ Period label ══════════════════════════════════════
function weekStart(d){
    const dow=d.getDay()||7;
    const s=new Date(d); s.setDate(d.getDate()-(dow-1)); s.setHours(0,0,0,0); return s;
}
function periodLabel(){
    if(view==='month'){
        return curDate.toLocaleDateString('uk-UA',{month:'long',year:'numeric'});
    }
    const ws=weekStart(curDate);
    const todayWs=weekStart(new Date());
    const diff=Math.round((ws-todayWs)/(7*86400000));
    const we=new Date(ws.getTime()+6*86400000);
    const fmt=d=>d.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'});
    if(diff===0)  return fmt(ws)+' – '+fmt(we); // current week: always show dates
    if(diff===1)  return 'Наступний тиждень · '+fmt(ws)+' – '+fmt(we);
    if(diff===-1) return 'Попередній тиждень · '+fmt(ws)+' – '+fmt(we);
    return fmt(ws)+' – '+fmt(we);
}

// ══ KPIs ════════════════════════════════════════════
function renderKPIs(){
    const todayStr=localDate(new Date());
    const ws=weekStart(curDate), we=localDate(new Date(ws.getTime()+6*86400000)), wss=localDate(ws);
    const fa=filteredAll();
    const todayA=fa.filter(a=>a._date===todayStr);
    const weekA=fa.filter(a=>a._date>=wss&&a._date<=we);
    document.getElementById('kpi-today').textContent=todayA.length+' записів';
    document.getElementById('kpi-revenue').textContent='₴'+weekA.reduce((s,a)=>s+parseFloat(a.price||0),0).toLocaleString('uk-UA');
    document.getElementById('kpi-done').textContent=weekA.filter(a=>a.status==='completed'||a.status==='Виконано').length+'/'+weekA.length;
    document.getElementById('kpi-total').textContent=weekA.length+' записів';
}

// ══ Status helper ════════════════════════════════════
function sBadge(s){
    const m={'completed':'s-done','Виконано':'s-done','done':'s-done',
             'waiting':'s-wait','Новий':'s-wait',
             'confirmed':'s-confirm','Підтверджено':'s-confirm',
             'cancelled':'s-cancel','Скасовано':'s-cancel'};
    const label={'completed':'Виконано','Виконано':'Виконано','waiting':'Новий','Новий':'Новий',
                 'confirmed':'Підтверджено','Підтверджено':'Підтверджено',
                 'cancelled':'Скасовано','Скасовано':'Скасовано'};
    return {cls:m[s]||'s-wait', label:label[s]||s||'Новий'};
}

// ══════════════════════════════════════════════════════
//  WEEK VIEW — Timeline (single master) OR Lanes (all)
// ══════════════════════════════════════════════════════
const DAY_UA=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

function renderWeek(){
    document.getElementById('period-label').textContent=periodLabel();
    const ws=weekStart(curDate);
    const today=localDate(new Date());
    const days=Array.from({length:7},(_,i)=>{
        const d=new Date(ws.getTime()+i*86400000);
        return {d,str:localDate(d)};
    });
    filterMId ? renderTimeline(days,today) : renderLanes(days,today);
}

// ── A) Timeline (single master) ───────────────────────
function renderTimeline(days, today){
    const masterId=filterMId;
    // Headers
    document.getElementById('week-day-headers').innerHTML=`
        <div class="tl-wrap" style="margin-bottom:2px">
            <div></div>
            ${days.map(({d,str},i)=>`
                <div class="tl-col-header ${str===today?'today-hdr':''}">
                    <div>${DAY_UA[i]}</div>
                    <div style="font-size:18px;font-weight:800;color:${str===today?'#f43f5e':'#71717a'};line-height:1">${d.getDate()}</div>
                </div>`).join('')}
        </div>`;

    // Grid rows
    const rows=HOURS.map(h=>{
        const cells=days.map(({str})=>{
            const blockAppts=allAppts().filter(a=>a.master_id===masterId&&a._date===str&&startHour(a)===h);
            return `<div class="tl-cell"
                data-day="${str}" data-hour="${h}"
                onmousedown="dragBegin(event,'${str}',${h})"
                onmouseenter="dragMove(event,'${str}',${h})"
                onmouseup="dragEnd_(event,'${str}',${h})"
            >${blockAppts.map(a=>apptBlockHTML(a)).join('')}</div>`;
        }).join('');
        return `<div class="tl-wrap">
            <div class="tl-hour-label">${hhmm(h)}</div>
            ${cells}
        </div>`;
    }).join('');

    document.getElementById('week-content').innerHTML=`<div onmouseleave="dragCancel()">${rows}</div>`;
}

function startHour(a){
    const t=a._start||a.appointment_time;
    return t ? parseInt(t.split(':')[0]) : null;
}
function endHour(a){
    const t=a._end||a.end_time;
    return t ? parseInt(t.split(':')[0]) : (startHour(a)!==null ? startHour(a)+1 : null);
}

function apptBlockHTML(a){
    const client=clients.find(c=>c.id===a.client_id);
    const svc=services.find(s=>s.id===a.service_id);
    const color=mColor(a.master_id);
    const sh=startHour(a), eh=endHour(a);
    const durH=(eh&&sh) ? eh-sh : 1;
    const pxH=60; // px per hour
    const top=2, height=Math.max(durH*pxH-6,28);
    const si=sBadge(a.status);
    const t=a._start?a._start.slice(0,5):'';
    return `<div class="appt-block" style="top:${top}px;height:${height}px;background:${color}20;border-left-color:${color}"
        onclick="event.stopPropagation();openDetail('${a.id}','${a._tbl}')">
        <p style="font-size:9px;font-weight:800;color:#fff;line-height:1.2" class="truncate">${t} ${client?.full_name?.split(' ')[0]||'—'}</p>
        ${durH>1?`<p style="font-size:8px;color:${color}bb" class="truncate mt-0.5">${svc?.name||''}</p>`:''}
    </div>`;
}

// ── B) Lanes (all masters) ────────────────────────────
function renderLanes(days, today){
    document.getElementById('week-day-headers').innerHTML=`
        <div class="lane-wrap mb-2">
            <div></div>
            ${days.map(({d,str},i)=>`
                <div class="text-center py-1 rounded-lg" style="${str===today?'background:rgba(244,63,94,.08)':''}">
                    <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:${str===today?'#f43f5e':'#52525b'}">${DAY_UA[i]}</div>
                    <div style="font-size:17px;font-weight:800;color:${str===today?'#f43f5e':'#71717a'};line-height:1.1">${d.getDate()}</div>
                </div>`).join('')}
        </div>`;

    const rows=masters.map(s=>{
        const color=mColor(s.id);
        const cells=days.map(({str})=>{
            const da=allAppts().filter(a=>a.master_id===s.id&&a._date===str);
            const cards=da.map(a=>{
                const cl=clients.find(c=>c.id===a.client_id);
                const sv=services.find(x=>x.id===a.service_id);
                const co=mColor(a.master_id);
                const t=a._start?a._start.slice(0,5):'';
                return `<div class="appt-card" style="background:${co}18;border-left-color:${co}"
                    onclick="event.stopPropagation();openDetail('${a.id}','${a._tbl}')">
                    <p style="font-size:9px;font-weight:800;color:#fff;line-height:1.2" class="truncate">${t} ${cl?.full_name?.split(' ')[0]||'—'}</p>
                    <p style="font-size:8px;color:${co}aa" class="truncate">${sv?.name||''}</p>
                </div>`;
            }).join('');
            return `<div class="lane-cell" ondblclick="openApptDrawer('${str}','','${s.id}')">${cards}</div>`;
        }).join('');
        return `<div class="lane-wrap">
            <div class="lane-master-label">
                <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
                <span style="font-size:9px;font-weight:800;color:#71717a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name.split(' ')[0]}</span>
            </div>
            ${cells}
        </div>`;
    }).join('');

    document.getElementById('week-content').innerHTML=`<div>${rows}</div>`;
}

// ══ Drag-to-select (timeline cells) ══════════════════
window.dragBegin=function(e,dayStr,h){
    e.preventDefault();
    isDragging=true;
    dragStart={dayStr,h}; dragEnd={dayStr,h};
    highlightDrag();
    document.getElementById('drag-hint').classList.add('show');
};
window.dragMove=function(e,dayStr,h){
    if(!isDragging||dragStart?.dayStr!==dayStr) return;
    dragEnd={dayStr,h};
    highlightDrag();
};
window.dragEnd_=function(e,dayStr,h){
    if(!isDragging) return;
    isDragging=false;
    document.getElementById('drag-hint').classList.remove('show');
    if(dragStart?.dayStr===dayStr){
        const sh=Math.min(dragStart.h,h);
        const eh=Math.max(dragStart.h,h)+1;
        openApptDrawer(dayStr,'','',sh,eh);
    }
    dragStart=null; dragEnd=null;
    clearDragHighlight();
};
window.dragCancel=function(){
    if(!isDragging) return;
    isDragging=false;
    document.getElementById('drag-hint').classList.remove('show');
    clearDragHighlight();
    dragStart=null; dragEnd=null;
};
function highlightDrag(){
    clearDragHighlight();
    if(!dragStart||!dragEnd) return;
    const sh=Math.min(dragStart.h,dragEnd.h), eh=Math.max(dragStart.h,dragEnd.h);
    document.querySelectorAll('.tl-cell').forEach(cell=>{
        const ch=parseInt(cell.dataset.hour);
        if(cell.dataset.day===dragStart.dayStr && ch>=sh && ch<=eh)
            cell.classList.add('selecting');
    });
}
function clearDragHighlight(){
    document.querySelectorAll('.tl-cell.selecting').forEach(c=>c.classList.remove('selecting'));
}

// ══ Month View ════════════════════════════════════════
function renderMonth(){
    document.getElementById('period-label').textContent=periodLabel();
    const y=curDate.getFullYear(),m=curDate.getMonth();
    const today=localDate(new Date());
    const first=new Date(y,m,1),last=new Date(y,m+1,0);
    let dow=first.getDay()||7; const offset=dow-1;
    const cells=Math.ceil((offset+last.getDate())/7)*7;
    const grid=document.getElementById('month-grid');
    grid.innerHTML='';
    for(let i=0;i<cells;i++){
        const diff=i-offset, cd=new Date(y,m,diff+1), dStr=localDate(cd);
        const inM=diff>=0&&diff<last.getDate(), isToday=dStr===today;
        const da=apptsOnDay(dStr);
        const cell=document.createElement('div');
        cell.className='month-day'+(isToday?' today':'')+((!inM)?' other-month':'')+(da.length?' has-appts':'');
        if(da.length) cell.onclick=()=>showDayList(dStr,da);
        cell.ondblclick=e=>{e.stopPropagation();openApptDrawer(dStr);};
        const num=document.createElement('div'); num.className='month-day-num'; num.textContent=cd.getDate(); cell.appendChild(num);
        da.slice(0,4).forEach(a=>{ const dot=document.createElement('div'); dot.className='month-dot'; dot.style.background=mColor(a.master_id)+'bb'; cell.appendChild(dot); });
        if(da.length>4){ const more=document.createElement('div'); more.className='text-[8px] text-zinc-600 font-black'; more.textContent=`+${da.length-4} ще`; cell.appendChild(more); }
        grid.appendChild(cell);
    }
}

// ══ Autocomplete ══════════════════════════════════════
window.acSearch=function(type){
    const input=document.getElementById(type+'-search');
    const q=input.value.toLowerCase().trim();
    acState[type].query=q;
    acState[type].selectedId='';
    if(type==='client') document.getElementById('a-client').value='';
    if(type==='service'){ document.getElementById('a-service').value=''; }
    renderAcDropdown(type);
};
window.acOpen=function(type){
    renderAcDropdown(type);
};
window.acKey=function(e,type){
    const dd=document.getElementById(type+'-dropdown');
    const items=dd.querySelectorAll('.ac-item');
    let idx=Array.from(items).findIndex(i=>i.classList.contains('active'));
    if(e.key==='ArrowDown'){ e.preventDefault(); idx=Math.min(idx+1,items.length-1); items.forEach((el,i)=>el.classList.toggle('active',i===idx)); items[idx]?.scrollIntoView({block:'nearest'}); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); idx=Math.max(idx-1,0); items.forEach((el,i)=>el.classList.toggle('active',i===idx)); items[idx]?.scrollIntoView({block:'nearest'}); }
    else if(e.key==='Enter'){ e.preventDefault(); const active=dd.querySelector('.ac-item.active'); if(active) active.click(); }
    else if(e.key==='Escape'){ closeAcAll(); }
};
function renderAcDropdown(type){
    const dd=document.getElementById(type+'-dropdown');
    const q=acState[type].query;
    let list=type==='client' ? clients : services;
    if(q) list=list.filter(x=>(x.full_name||x.name||'').toLowerCase().includes(q));
    if(!list.length){ dd.innerHTML='<div class="ac-empty">Нічого не знайдено</div>'; dd.classList.add('open'); return; }
    dd.innerHTML=list.slice(0,12).map(x=>{
        const label=x.full_name||x.name;
        const sub=type==='client'?(x.phone||''):(x.category||'')+(x.price?' · ₴'+x.price:'');
        return `<div class="ac-item" onclick="acSelect('${type}','${x.id}','${label.replace(/'/g,"\\'")}')">
            <span class="font-bold text-white">${label}</span>
            ${sub?`<span class="text-zinc-600 text-[10px] ml-1">${sub}</span>`:''}
        </div>`;
    }).join('');
    dd.classList.add('open');
}
window.acSelect=function(type,id,label){
    document.getElementById(type+'-search').value=label;
    acState[type].selectedId=id;
    if(type==='client') document.getElementById('a-client').value=id;
    if(type==='service'){
        document.getElementById('a-service').value=id;
        const svc=services.find(s=>s.id===id);
        if(svc?.price) document.getElementById('a-price').value=svc.price;
        onServicePicked(id);
    }
    document.getElementById(type+'-dropdown').classList.remove('open');
};
function closeAcAll(){
    document.querySelectorAll('.ac-dropdown').forEach(d=>d.classList.remove('open'));
}

// ══ Drawer: open ══════════════════════════════════════
window.openApptDrawer=function(prefillDate='',prefillTime='',prefillMasterId='',prefillStartH=null,prefillEndH=null){
    editingId=null;
    selStartHour=prefillStartH;
    selEndHour=prefillEndH;
    document.getElementById('drawer-title').textContent='Новий запис';
    document.getElementById('client-search').value='';
    document.getElementById('service-search').value='';
    document.getElementById('a-client').value='';
    document.getElementById('a-service').value='';
    document.getElementById('a-price').value='';
    document.getElementById('a-date').value=prefillDate||localDate(new Date());
    acState.client.selectedId=''; acState.service.selectedId='';

    populateMasterSelect('');
    if(prefillMasterId) document.getElementById('a-master').value=prefillMasterId;
    else if(filterMId)  document.getElementById('a-master').value=filterMId;

    document.getElementById('appt-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');

    if(document.getElementById('a-master').value && document.getElementById('a-date').value)
        onMasterOrDateChange();
    else renderSlotGrid([],selStartHour,selEndHour);
};

function onServicePicked(serviceId){
    populateMasterSelect(serviceId);
    if(document.getElementById('a-master').value && document.getElementById('a-date').value)
        onMasterOrDateChange();
}

function populateMasterSelect(serviceId){
    const sel=document.getElementById('a-master');
    const prev=sel.value;
    sel.innerHTML='<option value="">— Оберіть майстра —</option>';
    let list=masters;
    if(serviceId){
        const allowed=new Set(staffSvc.filter(x=>x.service_id===serviceId).map(x=>x.staff_id));
        list=masters.filter(s=>allowed.has(s.id));
    }
    list.forEach(s=>{
        const o=document.createElement('option'); o.value=s.id;
        o.textContent=s.name+(s.position?' ('+s.position+')':'');
        sel.appendChild(o);
    });
    const hint=document.getElementById('master-hint');
    if(serviceId&&!list.length){ hint.textContent='⚠ Жоден майстер не надає цю послугу'; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
    if(prev&&list.find(s=>s.id===prev)) sel.value=prev;
    else if(filterMId&&list.find(s=>s.id===filterMId)) sel.value=filterMId;
}

window.onMasterOrDateChange=async function(){
    const masterId=document.getElementById('a-master').value;
    const date=document.getElementById('a-date').value;
    if(!masterId||!date){ renderSlotGrid([],selStartHour,selEndHour); return; }

    // Fetch booked slots for this master+date
    const {data}=await window.db.from('appointments')
        .select('appointment_time,end_time')
        .eq('master_id',masterId).eq('appointment_date',date)
        .neq('status','cancelled');
    const booked=new Set();
    (data||[]).forEach(a=>{
        if(!a.appointment_time) return;
        const sh=parseInt(a.appointment_time.split(':')[0]);
        const eh=a.end_time ? parseInt(a.end_time.split(':')[0]) : sh+1;
        for(let h=sh;h<eh;h++) booked.add(h);
    });
    renderSlotGrid(booked, selStartHour, selEndHour, date);
};

function renderSlotGrid(bookedSet, startH, endH, dateStr=''){
    const grid=document.getElementById('slot-grid');
    const legend=document.getElementById('slot-legend');
    const badge=document.getElementById('time-range-badge');
    const now=new Date(), todayStr=localDate(now), nowH=now.getHours();

    if(!bookedSet||(!bookedSet.size&&!bookedSet.has)){
        grid.innerHTML='<p class="col-span-4 text-[10px] text-zinc-600 font-semibold py-1">Оберіть майстра та дату</p>';
        legend.classList.add('hidden'); badge.classList.add('hidden'); return;
    }
    legend.classList.remove('hidden');

    grid.innerHTML=HOURS.map(h=>{
        const isPast=dateStr===todayStr&&h<=nowH;
        const isBooked=bookedSet.has&&bookedSet.has(h);
        const inRange=startH!==null&&endH!==null&&h>=startH&&h<endH;
        let cls='time-slot';
        if(isBooked) cls+=' booked-slot';
        else if(isPast) cls+=' past-slot';
        else if(inRange) cls+=' sel-slot';
        const dis=isBooked||isPast;
        return `<button class="${cls}" ${dis?'disabled':''} onclick="slotClick(${h})"
            style="${inRange?'background:rgba(244,63,94,.25);border-color:rgba(244,63,94,.5);color:#fff':''}
                   ${isBooked?'opacity:.3;text-decoration:line-through;cursor:not-allowed':''}
                   ${isPast?'opacity:.2;cursor:not-allowed':''}
                   padding:9px 6px;border-radius:10px;font-size:11px;font-weight:800;text-align:center;
                   border:1px solid rgba(255,255,255,.08);background:${inRange?'rgba(244,63,94,.25)':isBooked?'rgba(255,255,255,.04)':'rgba(255,255,255,.04)'};
                   color:${inRange?'#fff':'#a1a1aa'};transition:all .18s;line-height:1;width:100%">
            ${hhmm(h)}</button>`;
    }).join('');

    updateTimeBadge();
}

window.slotClick=function(h){
    if(selStartHour===null||selEndHour===null||(selStartHour===selEndHour-1&&h!==selStartHour)){
        // Start new selection
        selStartHour=h; selEndHour=h+1;
    } else if(h<selStartHour){
        selStartHour=h;
    } else if(h>=selEndHour){
        selEndHour=h+1;
    } else {
        // Click inside range → reset
        selStartHour=h; selEndHour=h+1;
    }
    // Re-render keeping booked state
    const masterId=document.getElementById('a-master').value;
    const date=document.getElementById('a-date').value;
    if(masterId&&date) onMasterOrDateChange();
    else { renderSlotGrid(new Set(),selStartHour,selEndHour,date); }
    updateTimeBadge();
};

function updateTimeBadge(){
    const badge=document.getElementById('time-range-badge');
    if(selStartHour!==null&&selEndHour!==null){
        const dur=selEndHour-selStartHour;
        badge.textContent=`${hhmm(selStartHour)} – ${hhmm(selEndHour)} (${dur}год)`;
        badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
}

// ══ Save ══════════════════════════════════════════════
window.saveAppt=async function(){
    const clientId=document.getElementById('a-client').value;
    const serviceId=document.getElementById('a-service').value;
    const masterId=document.getElementById('a-master').value;
    const date=document.getElementById('a-date').value;
    const price=parseFloat(document.getElementById('a-price').value)||0;
    const svc=services.find(s=>s.id===serviceId);

    if(!clientId){ alert('Оберіть клієнта'); return; }
    if(!masterId){ alert('Оберіть майстра'); return; }
    if(!date){ alert('Вкажіть дату'); return; }
    if(selStartHour===null){ alert('Оберіть час запису (клікніть на слот)'); return; }

    const payload={
        client_id:masterId?masterId:undefined,
        master_id:masterId,
        service_id:serviceId||null,
        service_name:svc?.name||'',
        appointment_date:date,
        appointment_time:hhmm(selStartHour)+':00',
        end_time:hhmm(selEndHour)+':00',
        price:price||svc?.price||0,
        status:'waiting',
        client_id:clientId,
    };

    let error;
    if(editingId&&editingTable==='appointments'){
        ({error}=await window.db.from('appointments').update(payload).eq('id',editingId));
    } else {
        ({error}=await window.db.from('appointments').insert([payload]));
    }
    if(error){alert('Помилка: '+error.message);return;}
    closeAllDrawers();
    selStartHour=null; selEndHour=null;
    await refreshAppts(); render(); renderKPIs();
};

// ══ Detail Drawer ════════════════════════════════════
window.openDetail=function(id,tbl){
    const src=tbl==='appointment_history'?histAppts:appts;
    const a=src.find(x=>x.id===id); if(!a) return;
    const master=masters.find(s=>s.id===a.master_id);
    const svc=services.find(s=>s.id===a.service_id);
    const client=clients.find(c=>c.id===a.client_id);
    const color=mColor(a.master_id);
    const si=sBadge(a.status);
    const dateStr=parseLD(a._date)?.toLocaleDateString('uk-UA',{day:'2-digit',month:'long',year:'numeric'})||'—';
    const sh=a._start?a._start.slice(0,5):'', eh=a._end?a._end.slice(0,5):'';
    const timeStr=sh?(sh+(eh?' – '+eh:'')):'';

    document.getElementById('detail-body').innerHTML=`
        <div class="p-3 rounded-xl flex items-center justify-between" style="background:${color}15;border:1px solid ${color}33">
            <div>
                <p style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:${color}">Запис</p>
                <p style="font-size:12px;font-weight:700;color:#fff;margin-top:2px">${dateStr}${timeStr?' · '+timeStr:''}</p>
            </div>
            <span style="font-size:9px" class="px-2 py-1 rounded-full font-black ${si.cls}">${si.label}</span>
        </div>
        ${dRow('fa-user','Клієнт',client?.full_name||'—',client?.phone||'')}
        ${dRow('fa-scissors','Послуга',svc?.name||a.service_name||'—',svc?.category||'')}
        ${dRow('fa-circle','Майстер',master?.name||'—',master?.position||'','style="color:'+color+'"')}
        ${dRow('fa-hryvnia-sign','Сума','₴'+parseFloat(a.price||0).toLocaleString('uk-UA'),'','style="color:#f43f5e;font-size:16px;font-weight:800"')}`;

    document.getElementById('d-edit').onclick=()=>{ closeAllDrawers(); openEditDrawer(a,tbl); };
    document.getElementById('d-done').onclick=()=>updateStatus(id,tbl,'completed');
    document.getElementById('d-cancel').onclick=()=>{ if(confirm('Скасувати?')) updateStatus(id,tbl,'cancelled'); };
    document.getElementById('d-done').style.display=(a.status==='completed'||a.status==='Виконано')?'none':'';

    document.getElementById('detail-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
};

function dRow(icon,label,main,sub,extra=''){
    return `<div class="glass-panel rounded-xl p-3 flex items-center gap-3" style="margin-top:6px">
        <i class="fa-solid ${icon} w-4 text-xs" style="color:#52525b;width:16px;flex-shrink:0"></i>
        <div>
            <p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#52525b">${label}</p>
            <p ${extra} style="font-size:12px;font-weight:700;color:#fff">${main}</p>
            ${sub?`<p style="font-size:10px;color:#52525b">${sub}</p>`:''}
        </div>
    </div>`;
}

function openEditDrawer(a,tbl){
    editingId=a.id; editingTable=tbl;
    selStartHour=startHour(a); selEndHour=endHour(a);
    document.getElementById('drawer-title').textContent='Редагувати запис';
    const client=clients.find(c=>c.id===a.client_id);
    const svc=services.find(s=>s.id===a.service_id);
    document.getElementById('client-search').value=client?.full_name||'';
    document.getElementById('a-client').value=a.client_id||'';
    document.getElementById('service-search').value=svc?.name||a.service_name||'';
    document.getElementById('a-service').value=a.service_id||'';
    document.getElementById('a-price').value=a.price||'';
    document.getElementById('a-date').value=a._date||'';
    acState.client.selectedId=a.client_id||'';
    acState.service.selectedId=a.service_id||'';
    populateMasterSelect(a.service_id||'');
    document.getElementById('a-master').value=a.master_id||'';
    document.getElementById('appt-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    onMasterOrDateChange();
}

async function updateStatus(id,tbl,status){
    const table=tbl==='appointment_history'?'appointment_history':'appointments';
    const field=tbl==='appointment_history'?'status':'status';
    const val=tbl==='appointment_history'
        ?(status==='completed'?'Виконано':'Скасовано')
        :(status);
    const {error}=await window.db.from(table).update({[field]:val}).eq('id',id);
    if(error){alert(error.message);return;}
    closeAllDrawers(); await refreshAppts(); render(); renderKPIs();
}

// ══ Day list (month click) ════════════════════════════
function showDayList(dStr,da){
    const date=parseLD(dStr)?.toLocaleDateString('uk-UA',{day:'numeric',month:'long'});
    document.getElementById('detail-body').innerHTML=`
        <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#52525b;margin-bottom:12px">${date}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
        ${da.map(a=>{
            const cl=clients.find(c=>c.id===a.client_id);
            const sv=services.find(s=>s.id===a.service_id);
            const co=mColor(a.master_id),si=sBadge(a.status);
            const t=a._start?a._start.slice(0,5)+' ':'';
            return `<div onclick="openDetail('${a.id}','${a._tbl}')" style="padding:10px 12px;border-radius:10px;cursor:pointer;background:${co}10;border-left:3px solid ${co}66">
                <div style="display:flex;align-items:center;justify-content:space-between">
                    <span style="font-size:11px;font-weight:700;color:#fff">${t}${cl?.full_name||'—'}</span>
                    <span style="font-size:8px;font-weight:800" class="px-1.5 py-0.5 rounded-full ${si.cls}">${si.label}</span>
                </div>
                <span style="font-size:10px;color:${co}99">${sv?.name||a.service_name||'—'}</span>
                <span style="font-size:10px;color:rgba(255,255,255,.4);float:right">₴${parseFloat(a.price||0).toLocaleString('uk-UA')}</span>
            </div>`;
        }).join('')}
        </div>
        <button onclick="openApptDrawer('${dStr}')" style="width:100%;margin-top:12px;padding:10px;border-radius:10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;border:1px solid rgba(255,255,255,.08);color:#71717a;background:transparent">
            + Додати запис
        </button>`;
    ['d-edit','d-done','d-cancel'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    document.getElementById('detail-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
}

// ══ Close ════════════════════════════════════════════
function closeAllDrawers(){
    ['appt-drawer','detail-drawer'].forEach(id=>document.getElementById(id).classList.remove('open'));
    document.getElementById('drawer-overlay').classList.remove('open');
    ['d-edit','d-done','d-cancel'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});
    editingId=null; closeAcAll();
}
