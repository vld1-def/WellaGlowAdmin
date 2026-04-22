// js/ui-toast.js — Replace native alert/confirm with Wella Glow styled toast/modal.
// Include after DOM is available on every admin page.
(function () {
    // Inject styles once
    if (!document.getElementById('__wg_toast_styles')) {
        const s = document.createElement('style');
        s.id = '__wg_toast_styles';
        s.textContent = `
            #__wg_toast_wrap{position:fixed;top:20px;left:50%;transform:translateX(-50%);
                z-index:100000;display:flex;flex-direction:column;gap:8px;align-items:center;
                pointer-events:none;width:max-content;max-width:calc(100vw - 32px)}
            .__wg_toast{pointer-events:all;min-width:260px;max-width:440px;
                background:#0d0d0f;border:1px solid rgba(255,255,255,.08);border-radius:14px;
                padding:12px 14px;display:flex;align-items:flex-start;gap:10px;
                box-shadow:0 24px 60px rgba(0,0,0,.7);
                font-family:'Manrope',sans-serif;color:#e2e8f0;
                animation:__wg_toast_in .22s cubic-bezier(.34,1.56,.64,1)}
            .__wg_toast.leaving{animation:__wg_toast_out .18s ease forwards}
            .__wg_toast_ic{width:28px;height:28px;border-radius:9px;display:flex;align-items:center;
                justify-content:center;flex-shrink:0;font-size:12px}
            .__wg_toast_tx{flex:1;font-size:11px;font-weight:700;line-height:1.45;color:#fff;
                word-break:break-word}
            .__wg_toast_x{color:#52525b;background:none;border:none;cursor:pointer;
                font-size:11px;padding:2px 4px;flex-shrink:0;transition:color .15s}
            .__wg_toast_x:hover{color:#fff}
            .__wg_toast.err .__wg_toast_ic{background:rgba(244,63,94,.14);color:#f43f5e;border:1px solid rgba(244,63,94,.3)}
            .__wg_toast.ok  .__wg_toast_ic{background:rgba(16,185,129,.14);color:#10b981;border:1px solid rgba(16,185,129,.3)}
            .__wg_toast.info .__wg_toast_ic{background:rgba(99,102,241,.14);color:#818cf8;border:1px solid rgba(99,102,241,.3)}
            @keyframes __wg_toast_in{from{opacity:0;transform:translateY(-10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
            @keyframes __wg_toast_out{to{opacity:0;transform:translateY(-6px) scale(.97)}}

            /* Confirm modal */
            #__wg_confirm{position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.65);
                backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;
                padding:16px;opacity:0;pointer-events:none;transition:opacity .18s}
            #__wg_confirm.open{opacity:1;pointer-events:all}
            #__wg_confirm .__wg_box{background:#111113;border:1px solid rgba(255,255,255,.08);
                border-radius:20px;max-width:360px;width:100%;padding:22px;
                box-shadow:0 32px 80px rgba(0,0,0,.85);transform:scale(.95);transition:transform .2s}
            #__wg_confirm.open .__wg_box{transform:scale(1)}
        `;
        document.head.appendChild(s);
    }

    function ensureWrap() {
        let wrap = document.getElementById('__wg_toast_wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = '__wg_toast_wrap';
            document.body.appendChild(wrap);
        }
        return wrap;
    }

    function guessKind(msg) {
        const s = String(msg || '').toLowerCase();
        if (/помилк|error|не вдал|fail|невірн|заборон|duplicate|conflict/.test(s)) return 'err';
        if (/успіш|збереж|додано|готово|виконан/.test(s))                         return 'ok';
        return 'info';
    }

    function icon(kind) {
        if (kind === 'err') return 'fa-triangle-exclamation';
        if (kind === 'ok')  return 'fa-check';
        return 'fa-circle-info';
    }

    function toast(msg, opts) {
        const kind = (opts && opts.kind) || guessKind(msg);
        const wrap = ensureWrap();
        const el = document.createElement('div');
        el.className = '__wg_toast ' + kind;
        el.innerHTML = `
            <div class="__wg_toast_ic"><i class="fa-solid ${icon(kind)}"></i></div>
            <div class="__wg_toast_tx"></div>
            <button class="__wg_toast_x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>`;
        el.querySelector('.__wg_toast_tx').textContent = String(msg ?? '');
        const close = () => {
            if (el.classList.contains('leaving')) return;
            el.classList.add('leaving');
            setTimeout(() => el.remove(), 200);
        };
        el.querySelector('.__wg_toast_x').addEventListener('click', close);
        wrap.appendChild(el);
        const ttl = (opts && opts.duration) || (kind === 'err' ? 5000 : 3200);
        setTimeout(close, ttl);
        return el;
    }

    // Confirm (promise-based)
    function confirmModal(message, { title = 'Підтвердження', okText = 'OK', cancelText = 'Скасувати', danger = false } = {}) {
        return new Promise(resolve => {
            let root = document.getElementById('__wg_confirm');
            if (!root) {
                root = document.createElement('div');
                root.id = '__wg_confirm';
                document.body.appendChild(root);
            }
            const okColor = danger ? '#f43f5e' : '#10b981';
            root.innerHTML = `
                <div class="__wg_box" style="font-family:'Manrope',sans-serif">
                    <h3 style="font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#fff;margin:0 0 8px">${title}</h3>
                    <p style="font-size:11px;font-weight:600;color:#a1a1aa;line-height:1.5;margin:0 0 18px"></p>
                    <div style="display:flex;gap:8px">
                        <button id="__wg_cf_c" style="flex:1;padding:10px;border-radius:10px;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;border:1px solid rgba(255,255,255,.1);background:transparent;color:#71717a;cursor:pointer">${cancelText}</button>
                        <button id="__wg_cf_o" style="flex:1;padding:10px;border-radius:10px;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;border:1px solid ${okColor}33;background:${okColor}18;color:${okColor};cursor:pointer">${okText}</button>
                    </div>
                </div>`;
            root.querySelector('p').textContent = String(message || '');
            requestAnimationFrame(() => root.classList.add('open'));
            const done = v => {
                root.classList.remove('open');
                setTimeout(() => { root.innerHTML = ''; }, 200);
                resolve(v);
            };
            root.querySelector('#__wg_cf_c').onclick = () => done(false);
            root.querySelector('#__wg_cf_o').onclick = () => done(true);
            root.onclick = e => { if (e.target === root) done(false); };
        });
    }

    // Public
    window.wgToast    = toast;
    window.wgConfirm  = confirmModal;
    // Replace native alert with styled toast (preserve old reference in case needed)
    window._nativeAlert = window.alert;
    window.alert       = (msg) => toast(msg);
})();
