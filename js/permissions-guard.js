/**
 * permissions-guard.js
 * 1. Injects a full-screen loader immediately (visible even while html{visibility:hidden}).
 * 2. For admin: reads staff_permissions from Supabase, redirects if blocked, hides nav items.
 * 3. For owner: no DB check — full access.
 * 4. For others: just reveal the page.
 * Requires: window.PAGE_MODULE set before this loads, window.db already init'd.
 */

// ── Inject loader into <html> so it shows while html{visibility:hidden} ──
(function () {
    var style = document.createElement('style');
    style.textContent =
        '@keyframes _plspin{to{transform:rotate(360deg)}}' +
        '@keyframes _plpulse{0%,100%{opacity:.3}50%{opacity:1}}';
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = '_page-loader';
    el.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:#09090b;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:20px;visibility:visible';
    el.innerHTML =
        '<div style="position:relative;width:52px;height:52px">' +
          '<div style="position:absolute;inset:0;border-radius:50%;' +
               'border:3px solid rgba(255,255,255,.06)"></div>' +
          '<div style="position:absolute;inset:0;border-radius:50%;' +
               'border:3px solid transparent;border-top-color:#f43f5e;' +
               'animation:_plspin .75s linear infinite"></div>' +
          '<div style="position:absolute;inset:6px;border-radius:50%;' +
               'border:2px solid transparent;border-top-color:rgba(244,63,94,.4);' +
               'animation:_plspin .5s linear infinite reverse"></div>' +
        '</div>' +
        '<p style="font-size:10px;font-weight:800;letter-spacing:.15em;' +
            'text-transform:uppercase;color:rgba(255,255,255,.25);' +
            'animation:_plpulse 1.5s ease-in-out infinite">Завантаження...</p>';
    document.documentElement.appendChild(el);
})();

// ── Helpers ──────────────────────────────────────────────────────────────
function whenReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

function revealPage(fn) {
    // fn (optional) runs after DOM is ready, before we reveal
    whenReady(function () {
        if (fn) fn();
        // fade out loader, then reveal html
        const loader = document.getElementById('_page-loader');
        if (loader) {
            loader.style.transition = 'opacity .25s';
            loader.style.opacity = '0';
            setTimeout(function () {
                loader.remove();
                document.documentElement.style.visibility = 'visible';
            }, 250);
        } else {
            document.documentElement.style.visibility = 'visible';
        }
    });
}

// ── Main guard ───────────────────────────────────────────────────────────
(async function () {
    const role    = localStorage.getItem('wella_staff_role') || '';
    const staffId = localStorage.getItem('wella_staff_id');

    if (!staffId) { window.location.href = 'staff-login.html'; return; }

    if (role === 'owner') {
        revealPage(function () { applyNavVisibility({}); });
        return;
    }

    if (role !== 'admin') {
        revealPage(); // master/other pages handle their own auth
        return;
    }

    // Admin: check DB permissions
    try {
        const { data: rows, error: readErr } = await window.db
            .from('staff_permissions')
            .select('module, can_access')
            .eq('staff_id', staffId);

        console.log('[guard] staffId:', staffId, 'rows:', rows, 'error:', readErr);

        const permMap = {};
        (rows || []).forEach(r => { permMap[r.module] = r.can_access; });
        console.log('[guard] permMap:', permMap, 'PAGE_MODULE:', window.PAGE_MODULE);

        const URLS = {
            dashboard: 'owner-dashboard.html', calendar:  'admin-calendar.html',
            finance:   'admin-finance.html',   clients:   'admin-clients-base.html',
            inventory: 'admin-inventory.html', staff:     'admin-staff.html',
            bonuses:   'admin-bonuses.html',
        };

        const mod = window.PAGE_MODULE;
        if (mod && permMap[mod] === false) {
            const first = Object.keys(URLS).find(k => permMap[k] !== false);
            window.location.href = first ? URLS[first] : 'staff-login.html';
            return;
        }

        revealPage(function () { applyNavVisibility(permMap, URLS); });

    } catch (e) {
        revealPage(); // fail open — don't lock everyone out
    }
})();

// ── Nav visibility ───────────────────────────────────────────────────────
function applyNavVisibility(permMap, URLS) {
    if (!URLS) return;
    Object.entries(URLS).forEach(function ([key, href]) {
        if (permMap[key] === false) {
            document.querySelectorAll('a[href="' + href + '"], a[href*="' + href + '"]').forEach(function (el) {
                el.style.display = 'none';
            });
        }
    });
    if (permMap['role_access'] === false) {
        document.querySelectorAll('[onclick*="openRoleAccess"]').forEach(function (el) {
            el.style.display = 'none';
        });
    }
}
