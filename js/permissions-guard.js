/**
 * permissions-guard.js
 * 1. Injects a full-screen loader immediately (visible even while html{visibility:hidden}).
 * 2. For admin: reads staff_permissions from Supabase, redirects if blocked, hides nav items.
 * 3. For owner: no DB check — full access.
 * 4. For others: just reveal the page.
 * Requires: window.PAGE_MODULE set before this loads, window.db already init'd.
 */

// ── Inject spinner into <html> so it shows while html{visibility:hidden} ──
(function () {
    const el = document.createElement('div');
    el.id = '_page-loader';
    el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'background:#09090b', 'display:flex', 'align-items:center',
        'justify-content:center', 'visibility:visible',
    ].join(';');
    el.innerHTML =
        '<div id="_pl-spin" style="width:34px;height:34px;border-radius:50%;' +
        'border:3px solid rgba(255,255,255,.08);border-top-color:#f43f5e;' +
        'animation:_plspin .7s linear infinite"></div>' +
        '<style>@keyframes _plspin{to{transform:rotate(360deg)}}</style>';
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
                document.documentElement.style.visibility = '';
            }, 250);
        } else {
            document.documentElement.style.visibility = '';
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
