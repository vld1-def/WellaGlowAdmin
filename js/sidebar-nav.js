// js/sidebar-nav.js — Collapsible sidebar nav for staff sub-section
// ═══════════════════════════════════════════════════════════════════

(function () {
    // CSS injected once
    const style = document.createElement('style');
    style.textContent = `
        .staff-subnav {
            max-height: 0;
            overflow: hidden;
            transition: max-height .35s cubic-bezier(.4,0,.2,1), opacity .25s ease;
            opacity: 0;
        }
        .staff-subnav.open {
            max-height: 220px;
            opacity: 1;
        }
        .staff-chevron {
            transition: transform .3s cubic-bezier(.4,0,.2,1);
            flex-shrink: 0;
        }
        .staff-nav-group.open .staff-chevron {
            transform: rotate(90deg);
        }
        /* Sidebar link entrance animation */
        .staff-subnav a,
        .staff-subnav button {
            transition: background .15s, color .15s, transform .15s;
        }
        /* Active link pulse */
        .sidebar-link.active {
            animation: navPulse .4s ease;
        }
        @keyframes navPulse {
            0%   { opacity:.5; transform:translateX(-4px); }
            100% { opacity:1;  transform:translateX(0); }
        }
    `;
    document.head.appendChild(style);

    // Toggle open/close
    window.toggleStaffNav = function (e) {
        if (e) e.preventDefault();
        const group = document.getElementById('staff-nav-group');
        const subnav = document.getElementById('staff-subnav');
        if (!group || !subnav) return;
        const opening = !group.classList.contains('open');
        group.classList.toggle('open', opening);
        subnav.classList.toggle('open', opening);
    };

    // Auto-expand when a sub-link is active on this page
    document.addEventListener('DOMContentLoaded', function () {
        const subnav = document.getElementById('staff-subnav');
        const group  = document.getElementById('staff-nav-group');
        if (!subnav || !group) return;
        if (subnav.querySelector('.active') || group.querySelector(':scope > .staff-top-row > a.active')) {
            group.classList.add('open');
            subnav.classList.add('open');
        }
    });
})();
