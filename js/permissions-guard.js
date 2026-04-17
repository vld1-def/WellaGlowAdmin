/**
 * permissions-guard.js
 * Runs on every admin page. Redirects to access-denied if the current user's
 * role doesn't have permission for this module. Also hides nav links that
 * are not permitted.
 *
 * Each page must set window.PAGE_MODULE = 'calendar' (or dashboard/finance/etc.)
 * BEFORE this script runs.
 *
 * owner role: always full access, no restrictions.
 * admin role: checked against localStorage 'wella_role_perms_admin'.
 */
(function () {
    const role   = localStorage.getItem('wella_staff_role') || '';
    const staffId = localStorage.getItem('wella_staff_id');

    // Not logged in → login page
    if (!staffId) { window.location.href = 'staff-login.html'; return; }

    // Owner always has full access
    if (role === 'owner') { applyNavVisibility(role); return; }

    // Admin: check module-level permission
    if (role === 'admin') {
        const DEFAULTS = { dashboard:true, calendar:true, finance:true, clients:true, inventory:true, staff:true, bonuses:true };
        const saved = JSON.parse(localStorage.getItem('wella_role_perms_admin') || 'null');
        const perms = saved || DEFAULTS;

        const module = window.PAGE_MODULE;
        if (module && perms[module] === false) {
            // No access — redirect to a page they CAN access, or show blocked screen
            const first = Object.keys(perms).find(k => perms[k] !== false);
            const URLS = { dashboard:'owner-dashboard.html', calendar:'admin-calendar.html', finance:'admin-finance.html',
                           clients:'admin-clients-base.html', inventory:'admin-inventory.html', staff:'admin-staff.html', bonuses:'admin-bonuses.html' };
            if (first && URLS[first]) { window.location.href = URLS[first]; }
            else { window.location.href = 'staff-login.html'; }
            return;
        }
        applyNavVisibility(role, perms);
        return;
    }

    // master or unknown: handled by their own pages
})();

function applyNavVisibility(role, perms) {
    if (role === 'owner' || !perms) return; // owner sees everything

    // Map module key → href patterns to match against
    const NAV_MAP = {
        dashboard:  ['owner-dashboard.html'],
        calendar:   ['admin-calendar.html'],
        finance:    ['admin-finance.html'],
        clients:    ['admin-clients-base.html'],
        inventory:  ['admin-inventory.html'],
        staff:      ['admin-staff.html'],
        bonuses:    ['admin-bonuses.html'],
    };

    // Hide sidebar links + mobile nav links for forbidden modules
    document.addEventListener('DOMContentLoaded', function () {
        Object.entries(NAV_MAP).forEach(([key, hrefs]) => {
            if (perms[key] === false) {
                hrefs.forEach(href => {
                    document.querySelectorAll(`a[href="${href}"], a[href*="${href}"]`).forEach(el => {
                        el.style.display = 'none';
                    });
                });
            }
        });
    });
}
