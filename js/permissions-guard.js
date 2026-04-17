/**
 * permissions-guard.js
 * Runs on every admin page. Redirects if the current user's role doesn't have
 * permission for this module. Also hides nav links and role-access button.
 *
 * Each page must set window.PAGE_MODULE = 'calendar' (etc.) BEFORE this loads.
 * owner: always full access. admin: checked against localStorage wella_role_perms_admin.
 */
(function () {
    const role    = localStorage.getItem('wella_staff_role') || '';
    const staffId = localStorage.getItem('wella_staff_id');

    if (!staffId) { window.location.href = 'staff-login.html'; return; }
    if (role === 'owner') { applyNavVisibility(role); return; }

    if (role === 'admin') {
        const DEFAULTS = {
            dashboard:true, calendar:true, finance:true, clients:true,
            inventory:true, staff:true, bonuses:true, role_access:true
        };
        const saved = JSON.parse(localStorage.getItem('wella_role_perms_admin') || 'null');
        const perms = saved ? Object.assign({}, DEFAULTS, saved) : DEFAULTS;

        const module = window.PAGE_MODULE;
        if (module && perms[module] === false) {
            const URLS = {
                dashboard:'owner-dashboard.html', calendar:'admin-calendar.html',
                finance:'admin-finance.html',     clients:'admin-clients-base.html',
                inventory:'admin-inventory.html', staff:'admin-staff.html',
                bonuses:'admin-bonuses.html'
            };
            const first = Object.keys(URLS).find(k => perms[k] !== false);
            window.location.href = first ? URLS[first] : 'staff-login.html';
            return;
        }
        applyNavVisibility(role, perms);
        return;
    }
    // master: handled by master pages
})();

function applyNavVisibility(role, perms) {
    if (role === 'owner' || !perms) return;

    const NAV_MAP = {
        dashboard:  ['owner-dashboard.html'],
        calendar:   ['admin-calendar.html'],
        finance:    ['admin-finance.html'],
        clients:    ['admin-clients-base.html'],
        inventory:  ['admin-inventory.html'],
        staff:      ['admin-staff.html'],
        bonuses:    ['admin-bonuses.html'],
    };

    document.addEventListener('DOMContentLoaded', function () {
        // Hide page links for blocked modules
        Object.entries(NAV_MAP).forEach(([key, hrefs]) => {
            if (perms[key] === false) {
                hrefs.forEach(href => {
                    document.querySelectorAll(`a[href="${href}"], a[href*="${href}"]`).forEach(el => {
                        el.style.display = 'none';
                    });
                });
            }
        });

        // Hide "Доступи по ролях" button if role_access is disabled
        if (perms.role_access === false) {
            // Sidebar button (admin-staff.html)
            document.querySelectorAll('[onclick*="openRoleAccess"]').forEach(el => {
                el.style.display = 'none';
            });
        }
    });
}
