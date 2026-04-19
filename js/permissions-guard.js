/**
 * permissions-guard.js
 * Helper: runs fn immediately if DOM is ready, otherwise waits for DOMContentLoaded.
 * Needed because the async Supabase fetch often resolves AFTER DOMContentLoaded fires.
 */
function whenReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

/**
 * Async guard — reads staff_permissions from Supabase DB (not localStorage).
 * Requires: window.PAGE_MODULE set before this loads, window.db already init'd.
 * owner: always full access. admin: checked against DB staff_permissions.
 */
(async function () {
    const role    = localStorage.getItem('wella_staff_role') || '';
    const staffId = localStorage.getItem('wella_staff_id');

    if (!staffId) { window.location.href = 'staff-login.html'; return; }
    if (role === 'owner') {
        // Owner: just apply nav (nothing hidden)
        whenReady(() => applyNavVisibility({}));
        return;
    }
    if (role !== 'admin') return; // master pages handle their own auth

    // Hide page while we check DB — avoids flash of forbidden content
    document.documentElement.style.visibility = 'hidden';

    try {
        const { data: rows, error: readErr } = await window.db
            .from('staff_permissions')
            .select('module, can_access')
            .eq('staff_id', staffId);

        console.log('[guard] staffId:', staffId, 'rows:', rows, 'error:', readErr);

        // Build map; if no DB rows yet → treat as full default access for admins
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
        // Only block if explicitly set to false in DB (missing key = allow)
        if (mod && permMap[mod] === false) {
            const first = Object.keys(URLS).find(k => permMap[k] !== false);
            window.location.href = first ? URLS[first] : 'staff-login.html';
            return;
        }

        // Page is accessible — reveal and apply nav hiding
        document.documentElement.style.visibility = '';
        whenReady(() => applyNavVisibility(permMap, URLS));

    } catch (e) {
        // On error fail open — don't lock everyone out
        document.documentElement.style.visibility = '';
    }
})();

function applyNavVisibility(permMap, URLS) {
    if (!URLS) return;
    Object.entries(URLS).forEach(([key, href]) => {
        if (permMap[key] === false) {
            document.querySelectorAll(`a[href="${href}"], a[href*="${href}"]`).forEach(el => {
                el.style.display = 'none';
            });
        }
    });
    // Hide "Доступи по ролях" button if role_access is explicitly disabled
    if (permMap['role_access'] === false) {
        document.querySelectorAll('[onclick*="openRoleAccess"]').forEach(el => {
            el.style.display = 'none';
        });
    }
}
