// js/notifications.js — Wella Glow floating notification bell
// Realtime: new appointments + new reviews
// Owner/Admin → all; Master → only their own
(function () {

    const STORAGE_KEY = 'wella_notifs_v2';
    const MAX         = 60;

    // ── Storage helpers ───────────────────────────────
    function load()  { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
    function save(l) { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)); }

    function push(notif) {
        const list = load();
        if (list.find(n => n.id === notif.id)) return;   // deduplicate
        list.unshift(notif);
        if (list.length > MAX) list.splice(MAX);
        save(list);
        updateBadge();
        shakebell();
    }

    function unreadCount() { return load().filter(n => !n.read).length; }

    function markRead(id) {
        // Remove the notification entirely (user wants it to disappear on click)
        save(load().filter(n => n.id !== id));
        updateBadge();
    }

    function markAllRead() {
        // Remove all notifications (user wants them to vanish, not stay as read)
        save([]);
        updateBadge();
        renderList();
    }

    // ── UI helpers ────────────────────────────────────
    function updateBadge() {
        const cnt = unreadCount();
        const badge = document.getElementById('_nb-badge');
        if (!badge) return;
        badge.textContent = cnt > 9 ? '9+' : cnt;
        badge.style.display = cnt > 0 ? 'flex' : 'none';
    }

    function shakebell() {
        const btn = document.getElementById('_nb-btn');
        if (!btn) return;
        btn.classList.remove('_nb-shake');
        void btn.offsetWidth;          // reflow to restart animation
        btn.classList.add('_nb-shake');
    }

    function formatTime(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 60000)    return 'Щойно';
        if (diff < 3600000)  return `${Math.floor(diff / 60000)} хв тому`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} год тому`;
        return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
    }

    // ── Panel ─────────────────────────────────────────
    function renderList() {
        const panel = document.getElementById('_nb-panel');
        if (!panel) return;
        const list = load();
        const listEl = panel.querySelector('._nb-list');
        if (!list.length) {
            listEl.innerHTML = '<p style="text-align:center;padding:28px 16px;font-size:10px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:.08em">Немає сповіщень</p>';
            return;
        }
        listEl.innerHTML = list.map(n => {
            const isRev = n.type === 'review';
            const icon  = isRev ? 'fa-star' : 'fa-calendar-plus';
            const col   = isRev ? '#f59e0b' : '#f43f5e';
            const bg    = isRev ? 'rgba(245,158,11,.12)' : 'rgba(244,63,94,.12)';
            const dot   = !n.read ? '<div style="width:7px;height:7px;border-radius:50%;background:#f43f5e;flex-shrink:0;margin-top:3px"></div>' : '';
            return `<div onclick="window._nbRead('${n.id}','${n.link||''}')"
                style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;
                       border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;
                       background:${n.read ? 'transparent' : 'rgba(244,63,94,.03)'};
                       transition:background .15s"
                onmouseenter="this.style.background='rgba(255,255,255,.03)'"
                onmouseleave="this.style.background='${n.read ? 'transparent' : 'rgba(244,63,94,.03)'}'">
                <div style="width:32px;height:32px;border-radius:10px;background:${bg};
                            display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <i class="fa-solid ${icon}" style="color:${col};font-size:11px"></i>
                </div>
                <div style="flex:1;min-width:0">
                    <p style="font-size:11px;font-weight:800;color:#fff;margin:0;line-height:1.3">${n.title}</p>
                    <p style="font-size:10px;color:#71717a;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.body}</p>
                    <p style="font-size:9px;color:#3f3f46;margin:3px 0 0;font-weight:700">${formatTime(n.time)}</p>
                </div>
                ${dot}
            </div>`;
        }).join('');
    }

    window._nbRead = function (id, link) {
        markRead(id);
        document.getElementById('_nb-panel')?.remove();
        // Migrate old-format links: if id is "appt-<N>" but link has no ?openAppt=, rebuild it
        let finalLink = link || '';
        const m = /^appt-(.+)$/.exec(id || '');
        if (m && finalLink && !/openAppt=/.test(finalLink)) {
            const sep = finalLink.includes('?') ? '&' : '?';
            finalLink = `${finalLink}${sep}openAppt=${m[1]}`;
        }
        if (finalLink) {
            // If already on target page, force reload by setting location (browsers reload when search changes)
            window.location.href = finalLink;
        }
    };

    window._nbToggle = function () {
        const existing = document.getElementById('_nb-panel');
        if (existing) { existing.remove(); return; }

        const panel = document.createElement('div');
        panel.id = '_nb-panel';
        panel.style.cssText = `
            position:fixed;bottom:88px;right:20px;z-index:10001;
            width:310px;max-width:calc(100vw - 32px);
            background:#0e0e10;border:1px solid rgba(255,255,255,.08);
            border-radius:20px;overflow:hidden;
            box-shadow:0 24px 64px rgba(0,0,0,.85);
            animation:_nbIn .2s cubic-bezier(.34,1.56,.64,1)`;
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,.06)">
                <p style="font-size:10px;font-weight:900;color:#fff;
                          text-transform:uppercase;letter-spacing:.1em;margin:0">Сповіщення</p>
                <button onclick="window._nbMarkAll()"
                    style="font-size:9px;font-weight:800;color:#52525b;border:none;
                           background:none;cursor:pointer;text-transform:uppercase;
                           letter-spacing:.06em;transition:color .15s;padding:0"
                    onmouseenter="this.style.color='#f43f5e'"
                    onmouseleave="this.style.color='#52525b'">Прочитати всі</button>
            </div>
            <div class="_nb-list" style="max-height:380px;overflow-y:auto"></div>`;

        document.body.appendChild(panel);
        renderList();

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function outside(e) {
                if (!e.target.closest('#_nb-panel') && !e.target.closest('#_nb-btn')) {
                    panel.remove();
                    document.removeEventListener('click', outside);
                }
            });
        }, 80);
    };

    window._nbMarkAll = function () { markAllRead(); };

    // ── Inject bell button ────────────────────────────
    function inject() {
        if (document.getElementById('_nb-root')) return;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes _nbFloat {
                0%,100%{transform:translateY(0);box-shadow:0 8px 28px rgba(244,63,94,.45)}
                50%{transform:translateY(-5px);box-shadow:0 16px 36px rgba(244,63,94,.6)}
            }
            @keyframes _nbShake {
                0%,100%{transform:translateY(0) rotate(0)}
                15%{transform:translateY(-4px) rotate(-12deg)}
                30%{transform:translateY(-2px) rotate(10deg)}
                45%{transform:translateY(-3px) rotate(-8deg)}
                60%{transform:translateY(-1px) rotate(6deg)}
                75%{transform:translateY(-2px) rotate(-4deg)}
            }
            @keyframes _nbIn {
                from{opacity:0;transform:scale(.9) translateY(10px)}
                to{opacity:1;transform:scale(1) translateY(0)}
            }
            #_nb-btn {
                position:fixed;bottom:20px;right:20px;z-index:10000;
                width:52px;height:52px;border-radius:16px;border:none;cursor:pointer;
                background:linear-gradient(135deg,#f43f5e 0%,#e11d48 100%);
                display:flex;align-items:center;justify-content:center;
                animation:_nbFloat 3.5s ease-in-out infinite;
                transition:transform .15s;
            }
            @media (max-width:639px){
                #_nb-btn{width:47px;height:47px;bottom:30px}
                #_nb-btn i{font-size:16px !important}
            }
            #_nb-btn:hover { animation:none; transform:scale(1.1); box-shadow:0 12px 36px rgba(244,63,94,.7); }
            #_nb-btn._nb-shake { animation:_nbShake .6s ease; }
            #_nb-badge {
                position:absolute;top:-7px;right:-7px;
                min-width:20px;height:20px;padding:0 4px;
                background:#fff;border-radius:10px;
                font-size:9px;font-weight:900;color:#f43f5e;
                display:none;align-items:center;justify-content:center;
                border:2px solid #0e0e10;line-height:1;
            }
            /* Extra bottom padding so floating btn never overlaps content */
            main, .main-content, #main-content { padding-bottom: 88px !important; }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = '_nb-root';
        root.innerHTML = `
            <button id="_nb-btn" onclick="window._nbToggle()" title="Сповіщення">
                <i class="fa-solid fa-bell" style="color:#fff;font-size:18px"></i>
                <span id="_nb-badge">0</span>
            </button>`;
        document.body.appendChild(root);
        updateBadge();
    }

    // ── Polling (free-plan alternative to Realtime) ───
    const POLL_MS       = 10000;                   // 10 seconds
    const POLL_REV_KEY  = 'wella_notifs_last_rev'; // last review created_at seen
    const KNOWN_KEY     = 'wella_notifs_known_appts'; // set of known appt IDs

    function getKnownAppts() {
        try { return new Set(JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')); } catch { return new Set(); }
    }
    function saveKnownAppts(set) {
        // keep max 500 IDs to avoid bloat
        const arr = [...set].slice(-500);
        localStorage.setItem(KNOWN_KEY, JSON.stringify(arr));
    }
    function getLastRevPoll() {
        return localStorage.getItem(POLL_REV_KEY) || new Date(Date.now() - 60000).toISOString();
    }

    async function poll() {
        if (!window.db) return;

        const role     = localStorage.getItem('wella_staff_role') || '';
        const myId     = localStorage.getItem('wella_staff_id')   || '';
        const isMaster = role === 'master';

        // ── Appointments: no created_at → track by known IDs ──────────
        // Query recent window: yesterday → +30 days (catches new bookings)
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const fromDate  = yesterday.toISOString().split('T')[0];

        let apptQ = window.db
            .from('appointments')
            .select('id, master_id, service_name, created_by_role, appointment_date')
            .gte('appointment_date', fromDate);
        if (isMaster) apptQ = apptQ.eq('master_id', myId);

        const { data: appts } = await apptQ;
        const knownAppts  = getKnownAppts();
        const isFirstAppt = knownAppts.size === 0;

        (appts || []).forEach(a => {
            if (knownAppts.has(String(a.id))) return; // already seen
            knownAppts.add(String(a.id));
            if (isFirstAppt) return; // first run — just seed, no notification
            const isOnline = !a.created_by_role || a.created_by_role === 'online';
            push({
                id:    `appt-${a.id}`,
                type:  'appointment',
                apptId: a.id,
                title: isOnline ? '🌐 Онлайн запис' : '📋 Новий запис',
                body:  a.service_name || 'Запис',
                time:  new Date().toISOString(),
                read:  false,
                link:  `admin-calendar.html?openAppt=${a.id}`,
            });
        });
        saveKnownAppts(knownAppts);

        // ── Reviews: have created_at → use timestamp ───────────────────
        const since = getLastRevPoll();
        const now   = new Date().toISOString();

        let revQ = window.db
            .from('reviews')
            .select('id, staff_id, rating, comment, created_at')
            .gt('created_at', since);
        if (isMaster) revQ = revQ.eq('staff_id', myId);

        const { data: revs } = await revQ;
        (revs || []).forEach(r => {
            push({
                id:    `rev-${r.id}`,
                type:  'review',
                title: `⭐ Новий відгук (${r.rating}/5)`,
                body:  r.comment || 'Без коментаря',
                time:  r.created_at,
                read:  false,
                link:  'admin-staff.html',
            });
        });
        localStorage.setItem(POLL_REV_KEY, now);
    }

    function subscribe() {
        if (!window.db) { setTimeout(subscribe, 400); return; }
        poll();                      // immediate first check
        setInterval(poll, POLL_MS); // then every 10 s
    }

    // ── Boot ──────────────────────────────────────────
    function init() {
        if (!localStorage.getItem('wella_staff_id')) return;   // not logged in
        inject();
        subscribe();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
