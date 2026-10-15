/*
 * Pravadh DocSign - PDF preparation editor (runs in the DocSignPdfPrep Visualforce page).
 * All text is written with textContent / input.value (never innerHTML with document data).
 */
(function (global) {
    'use strict';

    var ROLE_COLORS = ['#0f766e', '#0b5cab', '#7c3aed', '#c2410c', '#be185d', '#15803d', '#4338ca', '#b45309', '#0e7490', '#9333ea'];
    var SIGNER_TYPES = ['Signature', 'Initial', 'Date Signed', 'Name', 'Email', 'Text', 'Checkbox'];
    var PREP_TYPES = ['Text', 'Checkbox'];

    var S = {
        cfg: null,
        ctx: null,
        pages: [],
        fields: [],
        roles: [],
        selected: null,
        zoom: 1,
        placing: null,
        seq: 0,
        draft: null,
        focusRole: null
    };

    function $(id) {
        return document.getElementById(id);
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function status(msg, kind) {
        var s = $('ds-status');
        s.textContent = msg || '';
        s.className = 'ds-status' + (kind ? ' ds-' + kind : '');
    }

    // Determinate progress bar under the status line. progress(null) hides it; total 0 = indeterminate.
    function progress(done, total, label) {
        var wrap = $('ds-progress');
        if (!wrap) return;
        if (done === null || done === undefined) {
            wrap.style.display = 'none';
            document.body.classList.remove('ds-busy');
            return;
        }
        wrap.style.display = 'block';
        document.body.classList.add('ds-busy');
        var bar = $('ds-progress-bar');
        var pct = total ? Math.max(2, Math.min(100, Math.round((done / total) * 100))) : 0;
        wrap.classList.toggle('ds-indeterminate', !total);
        bar.style.width = total ? pct + '%' : '35%';
        wrap.setAttribute('aria-valuenow', total ? String(pct) : '');
        $('ds-progress-label').textContent = (label || '') + (total ? '  ' + pct + '%' : '');
    }

    // Salesforce calls are made by the Lightning component that hosts this page (Visualforce
    // remoting is not used: it fails on header-less pages). Requests go to the parent window at its
    // exact origin with the one-time nonce; replies are accepted only from that origin and nonce.
    var rpcSeq = 0;
    var rpcPending = {};
    var rpcListening = false;

    function onRpcReply(event) {
        var d = event.data;
        if (!S.cfg || event.origin !== S.cfg.parentOrigin) return;
        if (!d || typeof d !== 'object' || d.type !== 'docsign:rpc-result' || d.nonce !== S.cfg.nonce) return;
        var p = rpcPending[d.id];
        if (!p) return;
        delete rpcPending[d.id];
        clearTimeout(p.timer);
        if (d.ok) p.resolve(d.result);
        else p.reject(new Error(d.error || 'Request failed'));
    }

    function remote(method) {
        var args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function (resolve, reject) {
            if (!global.parent || global.parent === global || !S.cfg || !S.cfg.parentOrigin) {
                reject(new Error('Open this editor from a Salesforce record (Pravadh DocSign component).'));
                return;
            }
            if (!rpcListening) {
                global.addEventListener('message', onRpcReply);
                rpcListening = true;
            }
            var id = 'r' + (++rpcSeq);
            var timer = setTimeout(function () {
                if (rpcPending[id]) {
                    delete rpcPending[id];
                    reject(new Error('Salesforce did not respond. Please try again.'));
                }
            }, 120000);
            rpcPending[id] = { resolve: resolve, reject: reject, timer: timer };
            global.parent.postMessage({ type: 'docsign:rpc', id: id, method: method, args: args, nonce: S.cfg.nonce }, S.cfg.parentOrigin);
        });
    }

    function roleColor(role) {
        return role === 0 ? '#6b7280' : ROLE_COLORS[(role - 1) % ROLE_COLORS.length];
    }

    function roleName(role) {
        if (role === 0) return 'You (fill now)';
        var r = S.roles.find(function (x) { return x.role === role; });
        return r ? r.label : 'Signer ' + role;
    }

    // ------------------------------------------------------------------ loading

    async function start(cfg) {
        S.cfg = cfg;
        try {
            status('Loading document\u2026');
            progress(0, 0, 'Loading document\u2026');
            S.ctx = await remote('getContext', cfg.documentId);
            $('ds-title').textContent = S.ctx.title || 'Document';
            var bytes = await fetchPdf(S.ctx.versionId);
            if (!bytes && S.ctx.contentSize && S.ctx.contentSize <= 2000000) {
                progress(0, 0, 'Loading PDF\u2026');
                bytes = await fetchPdfViaSalesforce(cfg.documentId);
            }
            if (!bytes) {
                progress(null);
                showPicker();
                return;
            }
            await analyze(bytes);
        } catch (e) {
            progress(null);
            status(e.message, 'error');
        }
    }

    // Downloads the uploaded PDF through the Salesforce REST API on this page's own (Visualforce)
    // domain, so the browser never has to follow the cross-domain file-download redirect (blocked by
    // CORS). Shows download progress for large files.
    async function fetchPdf(versionId) {
        if (!S.cfg.sid || !/^068[A-Za-z0-9]{12,15}$/.test(versionId || '')) return null;
        try {
            var res = await fetch('/services/data/v' + (S.cfg.apiVersion || '62.0') + '/sobjects/ContentVersion/' + encodeURIComponent(versionId) + '/VersionData', {
                credentials: 'omit',
                cache: 'no-store',
                headers: { Authorization: 'Bearer ' + S.cfg.sid }
            });
            if (!res.ok) return null;
            var total = +(res.headers.get('Content-Length') || S.ctx.contentSize || 0);
            var buf;
            if (res.body && res.body.getReader) {
                var reader = res.body.getReader();
                var chunks = [];
                var got = 0;
                for (;;) {
                    var step = await reader.read();
                    if (step.done) break;
                    chunks.push(step.value);
                    got += step.value.length;
                    progress(got, total, 'Downloading PDF (' + (got / 1048576).toFixed(1) + ' MB)');
                }
                buf = new Uint8Array(got);
                var off = 0;
                chunks.forEach(function (c) { buf.set(c, off); off += c.length; });
            } else {
                buf = new Uint8Array(await res.arrayBuffer());
            }
            return isPdf(buf) ? buf : null;
        } catch (e) {
            return null;
        }
    }

    async function fetchPdfViaSalesforce(documentId) {
        try {
            var b64 = await remote('getPdfData', documentId);
            if (!b64) return null;
            var bin = global.atob(b64);
            var buf = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return isPdf(buf) ? buf : null;
        } catch (e) {
            return null;
        }
    }

    function isPdf(buf) {
        return buf && buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d;
    }

    function showPicker() {
        status('');
        $('ds-picker').style.display = 'block';
        $('ds-file').addEventListener('change', async function (ev) {
            var f = ev.target.files && ev.target.files[0];
            if (!f) return;
            if (S.ctx.contentSize && f.size !== S.ctx.contentSize) {
                status('That file is different from the one you uploaded. Please choose the same PDF.', 'error');
                return;
            }
            var buf = new Uint8Array(await f.arrayBuffer());
            if (!isPdf(buf)) {
                status('That file is not a PDF.', 'error');
                return;
            }
            $('ds-picker').style.display = 'none';
            await analyze(buf);
        });
    }

    async function analyze(bytes) {
        status('Reading the PDF and looking for blanks and signature lines\u2026');
        progress(0, 0, 'Opening PDF\u2026');
        var result;
        try {
            result = await global.DocSignDetect.analyze(bytes, {
                assetBase: S.cfg.assetBase,
                maxPages: S.ctx.maxPages || 100,
                onProgress: function (p, n) { progress(p - 1, n, 'Preparing page ' + p + ' of ' + n); }
            });
            progress(null);
        } catch (e) {
            progress(null);
            var msg = e && e.name === 'PasswordException' ? 'This PDF is password-protected. Remove the password and upload it again.' : 'This PDF could not be read: ' + (e.message || e);
            status(msg, 'error');
            return;
        }
        S.pages = result.pages;
        S.detected = { roles: result.roles, fields: result.fields };
        var saved = parseSaved(S.ctx.layout);
        S.restored = !!saved;
        if (saved) {
            S.fields = saved.fields.filter(function (f) { return f.page >= 1 && f.page <= S.pages.length; }).map(function (f) { return Object.assign({ id: 'f' + (++S.seq) }, f); });
            S.roles = saved.roles || [];
        } else {
            S.roles = result.roles.map(function (r) { return { role: r.role, label: r.label }; });
            S.fields = result.fields.map(function (f) { return Object.assign({}, f, { id: 'f' + (++S.seq) }); });
            // Prefill suggestions for fields the preparer fills now
            S.fields.forEach(function (f) {
                if (f.role === 0 && f.type !== 'Checkbox') {
                    var sg = global.DocSignDetect.suggest(f, S.ctx);
                    if (sg) f.suggestion = sg;
                }
            });
        }
        if (!S.roles.length) S.roles = [{ role: 1, label: 'Signer 1' }];
        renderPages();
        renderPanel();
        refreshRoleSelect();
        startBubble();
        startHistory();
        var prep = S.fields.filter(function (f) { return f.role === 0; }).length;
        var sig = S.fields.filter(function (f) { return f.role > 0; }).length;
        var msg = saved
            ? 'Welcome back. Your saved work is restored: ' + S.fields.length + ' fields (' + prep + ' for you, ' + sig + ' for ' + S.roles.length + ' signer(s)). Continue editing, then Save & continue.'
            : result.scanned
                ? 'This looks like a scanned PDF, so blanks could not be detected automatically. Use "Add field" to place fields.'
                : 'Found ' + S.fields.length + ' fields: ' + prep + ' for you to fill now and ' + sig + ' for ' + S.roles.length + ' signer(s). Review, adjust and save.';
        status(msg, saved ? 'info' : result.scanned ? 'warn' : 'ok');
        $('ds-save').disabled = false;
        // A fresh detection is saved as the first draft right away; a restored draft only when it changes.
        if (S.ctx.status === 'Draft') {
            startDraftAutosave(saved ? draftSnapshot() : null);
            draftBadge(saved ? 'Draft restored' : 'Autosave on', 'ok');
            if (!saved) saveDraftNow();
        } else {
            draftBadge('Changes apply when you click Save & continue');
        }
    }

    // ------------------------------------------------------------------ undo / redo
    // Every user interaction in the editor (drag, resize, add, delete, edits in the side panel,
    // suggestion chips, signer changes, re-detect) is captured as a before-snapshot; if the fields
    // or signers changed when the interaction ends, that snapshot goes on the undo stack. Typing in
    // one box counts as a single step (committed when the box loses focus).

    var H = { undo: [], redo: [], before: null, timer: null, max: 200 };

    function histSnap() {
        return JSON.stringify({ f: S.fields, r: S.roles });
    }

    function isHistControl(t) {
        return !!(t && t.closest && t.closest('#ds-undo, #ds-redo, #ds-save, #ds-cancel'));
    }

    function inTextBox() {
        var a = document.activeElement;
        return !!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'search'))));
    }

    function beginChange(ev) {
        if (!S.pages.length || isHistControl(ev && ev.target)) return;
        if (H.before === null) H.before = histSnap();
    }

    function endChange(ev) {
        if (isHistControl(ev && ev.target)) return;
        // Clicking into a text box starts a typing step; it ends when the box loses focus.
        var t = ev && ev.target;
        if (ev && (ev.type === 'pointerup' || ev.type === 'click') && t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search')))) return;
        clearTimeout(H.timer);
        H.timer = setTimeout(commitChange, 40);
    }

    function commitChange() {
        if (H.before === null) return;
        var now = histSnap();
        if (now !== H.before) {
            H.undo.push(H.before);
            if (H.undo.length > H.max) H.undo.shift();
            H.redo = [];
            H.before = inTextBox() ? now : null;
        } else if (!inTextBox()) {
            H.before = null;
        }
        updateHistButtons();
    }

    function restoreSnap(json) {
        var o = JSON.parse(json);
        S.fields = o.f;
        S.roles = o.r;
        if (S.selected && !S.fields.some(function (f) { return f.id === S.selected; })) S.selected = null;
        S.placing = null;
        document.body.classList.remove('ds-placing');
        document.querySelectorAll('.ds-box').forEach(function (b) { b.remove(); });
        S.fields.forEach(drawBox);
        renderPanel();
        refreshRoleSelect();
    }

    function undo() {
        commitChange();
        if (!H.undo.length) return;
        H.redo.push(histSnap());
        restoreSnap(H.undo.pop());
        H.before = null;
        status('Undone. ' + (H.undo.length ? H.undo.length + ' more step(s) can be undone.' : 'Nothing more to undo.'), 'info');
        updateHistButtons();
    }

    function redo() {
        if (!H.redo.length) return;
        H.undo.push(histSnap());
        restoreSnap(H.redo.pop());
        H.before = null;
        status('Redone.', 'info');
        updateHistButtons();
    }

    function updateHistButtons() {
        var u = $('ds-undo');
        var r = $('ds-redo');
        if (u) u.disabled = !H.undo.length;
        if (r) r.disabled = !H.redo.length;
    }

    function startHistory() {
        if (H.started) return;
        H.started = true;
        ['pointerdown', 'focusin'].forEach(function (t) { document.addEventListener(t, beginChange, true); });
        ['pointerup', 'click', 'change', 'focusout'].forEach(function (t) { document.addEventListener(t, endChange, true); });
        document.addEventListener('keydown', function (ev) {
            var mod = ev.metaKey || ev.ctrlKey;
            var key = (ev.key || '').toLowerCase();
            if (mod && key === 'z' && !inTextBox()) {
                ev.preventDefault();
                if (ev.shiftKey) redo();
                else undo();
                return;
            }
            if (mod && key === 'y' && !inTextBox()) {
                ev.preventDefault();
                redo();
                return;
            }
            if ((ev.key === 'Delete' || ev.key === 'Backspace') && !inTextBox()) {
                beginChange(ev);
                endChange(ev);
            }
        }, true);
        $('ds-undo').addEventListener('click', undo);
        $('ds-redo').addEventListener('click', redo);
        updateHistButtons();
    }

    // ------------------------------------------------------------------ helper bubble (nudges & tips)
    // A small bubble that keeps pointing to the next useful step (missing signatures, empty fields)
    // and otherwise rotates short tips. Closing it hides it for a few minutes; it then comes back.

    var TIPS = [
        'Drag a box to move it. Drag its bottom-right corner to resize it.',
        'Select a field and press Delete to remove it.',
        'Grey boxes are filled by you now. Coloured boxes are completed by each signer.',
        'Your work saves automatically. Close this window any time and continue later from the record, Home or the document.',
        'Use \u201C+ Add signer\u201D for another person. Every signer gets their own colour.',
        'Click a suggestion under a field to fill it from Salesforce in one click.',
        'Missing a signature line? Pick \u201CSignature\u201D and the signer at the top, then click \u201C+ Add field\u201D.',
        '\u201CRe-detect\u201D runs automatic detection again if you want to start over.',
        'Made a mistake? Click Undo (or press Ctrl+Z / \u2318Z). Redo is Ctrl+Shift+Z.'
    ];

    var bubble = { tip: 0, hiddenUntil: 0, timer: null };

    function nextEmptyPrepField() {
        return S.fields
            .filter(function (f) { return f.role === 0 && f.type !== 'Checkbox' && !f.value; })
            .sort(function (a, b) { return a.page - b.page || a.y - b.y || a.x - b.x; })[0];
    }

    function normLabel(x) {
        return (x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /** Signers found by (newer) automatic detection that a restored draft does not have yet. */
    function missingDetectedSigners() {
        if (!S.restored || !S.detected) return [];
        return S.detected.roles.filter(function (r) {
            return !/^signer \d+$/i.test(r.label) && !S.roles.some(function (x) { return normLabel(x.label) === normLabel(r.label); });
        });
    }

    /** Adds those signers and their detected fields, replacing overlapping "fill now" boxes. */
    function addMissingSigners() {
        missingDetectedSigners().forEach(function (dr) {
            var n = S.roles.length + 1;
            if (n > 20) return;
            S.roles.push({ role: n, label: dr.label });
            var overlaps = function (e, df) {
                if (e.page !== df.page) return false;
                var ix = Math.min(e.x + e.w, df.x + df.w) - Math.max(e.x, df.x);
                var iy = Math.min(e.y + e.h, df.y + df.h) - Math.max(e.y, df.y);
                return ix > 0 && iy > 0 && ix * iy >= 0.4 * Math.min(e.w * e.h, df.w * df.h);
            };
            S.detected.fields.filter(function (f) { return f.role === dr.role; }).forEach(function (df) {
                S.fields = S.fields.filter(function (e) { return !(e.role === 0 && overlaps(e, df)); });
                var dup = S.fields.some(function (e) { return overlaps(e, df); });
                if (!dup) S.fields.push(Object.assign({}, df, { id: 'f' + (++S.seq), role: n, value: '' }));
            });
        });
        renderPages();
        renderPanel();
        refreshRoleSelect();
        status('Added the missing signer(s). Review their fields, then Save & continue.', 'ok');
    }

    function smartNudge() {
        var missing = missingDetectedSigners();
        if (missing.length) {
            return {
                text: 'Detection also found ' + missing.map(function (r) { return r.label; }).join(', ') + ' as signer' + (missing.length > 1 ? 's' : '') + '. Add them with their signature fields?',
                action: 'Add signer' + (missing.length > 1 ? 's' : ''),
                run: addMissingSigners
            };
        }
        var noSig = S.roles.filter(function (r) {
            return !S.fields.some(function (f) { return f.role === r.role && f.type === 'Signature'; });
        })[0];
        if (noSig) {
            return {
                text: roleName(noSig.role) + ' has no signature field yet.',
                action: 'Add one',
                run: function () {
                    $('ds-new-type').value = 'Signature';
                    $('ds-new-role').value = String(noSig.role);
                    beginPlace();
                }
            };
        }
        var empty = S.fields.filter(function (f) { return f.role === 0 && f.type !== 'Checkbox' && !f.value; });
        if (empty.length) {
            var f = empty.length ? nextEmptyPrepField() : null;
            return {
                text: empty.length + ' field' + (empty.length > 1 ? 's' : '') + ' for you ' + (empty.length > 1 ? 'are' : 'is') + ' still empty. Next: \u201C' + (f.label || f.type) + '\u201D (page ' + f.page + ').',
                action: 'Go to it',
                run: function () {
                    select(f.id);
                    scrollToField(f);
                    var inp = document.querySelector('#item-' + f.id + ' input[type=text]');
                    if (inp) {
                        inp.scrollIntoView({ block: 'center' });
                        inp.focus();
                    }
                }
            };
        }
        if (S.fields.length) {
            return { text: 'Everything you need to fill is done. Review the signers, then click Save & continue.', action: null };
        }
        return null;
    }

    function showBubble(forceTip) {
        var b = $('ds-bubble');
        if (!b || !S.pages.length || Date.now() < bubble.hiddenUntil) return;
        var nudge = forceTip ? null : smartNudge();
        var text;
        var action = null;
        if (nudge && !(bubble.lastNudge === nudge.text && bubble.nudgeShows > 2)) {
            bubble.nudgeShows = bubble.lastNudge === nudge.text ? (bubble.nudgeShows || 0) + 1 : 1;
            bubble.lastNudge = nudge.text;
            text = nudge.text;
            action = nudge;
        } else {
            text = TIPS[bubble.tip % TIPS.length];
            bubble.tip++;
        }
        $('ds-bubble-kind').textContent = action ? 'Next step' : 'Tip';
        $('ds-bubble-text').textContent = text;
        var btn = $('ds-bubble-go');
        btn.style.display = action && action.action ? 'inline-block' : 'none';
        btn.textContent = action && action.action ? action.action : '';
        btn.onclick = function () {
            if (action && action.run) action.run();
        };
        b.classList.add('ds-show');
    }

    function startBubble() {
        $('ds-bubble-close').addEventListener('click', function () {
            $('ds-bubble').classList.remove('ds-show');
            bubble.hiddenUntil = Date.now() + 3 * 60 * 1000;
        });
        $('ds-bubble-more').addEventListener('click', function () { showBubble(true); });
        setTimeout(function () { showBubble(false); }, 2500);
        bubble.timer = setInterval(function () { showBubble(false); }, 25000);
    }

    // ------------------------------------------------------------------ draft autosave
    // Work in progress (fields, values, signers) is saved to Salesforce every few seconds, so the
    // preparer can close the window, log out, and resume later from the record, Home or the document.

    function layoutPayload(includePages) {
        return {
            pages: S.pages.map(function (p) { return includePages ? { page: p.page, w: p.w, h: p.h, versionId: p.versionId } : { page: p.page, w: p.w, h: p.h }; }),
            fields: S.fields.map(function (f) {
                return { page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, type: f.type, role: f.role, label: f.label, required: f.required !== false, value: f.value || null };
            }),
            roles: S.roles
        };
    }

    function draftSnapshot() {
        var p = layoutPayload(false);
        return JSON.stringify({ fields: p.fields, roles: p.roles });
    }

    function draftBadge(text, kind) {
        var b = $('ds-draft');
        if (!b) return;
        b.textContent = text || '';
        b.className = 'ds-draft' + (kind ? ' ds-draft-' + kind : '');
    }

    async function saveDraftNow() {
        if (!S.draft || S.draft.saving || S.draft.done || !S.pages.length) return;
        var snap = draftSnapshot();
        if (snap === S.draft.last) return;
        S.draft.saving = true;
        draftBadge('Saving draft\u2026');
        try {
            await remote('saveDraft', S.cfg.documentId, JSON.stringify(layoutPayload(false)));
            S.draft.last = snap;
            var t = new Date();
            draftBadge('Draft saved ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'ok');
        } catch (e) {
            draftBadge('Draft not saved: ' + (e.message || 'error'), 'error');
        } finally {
            S.draft.saving = false;
        }
    }

    // The hosting Lightning component asks for a last save before it closes the modal.
    global.addEventListener('message', async function (event) {
        var d = event.data;
        if (!S.cfg || event.origin !== S.cfg.parentOrigin || !d || typeof d !== 'object' || d.type !== 'docsign:flush' || d.nonce !== S.cfg.nonce) return;
        await saveDraftNow();
        notifyParent({ type: 'docsign:flushed' });
    });

    function startDraftAutosave(baseline) {
        S.draft = { last: baseline, saving: false, done: false };
        setInterval(function () {
            if (!document.body.classList.contains('ds-busy')) saveDraftNow();
        }, 4000);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') saveDraftNow();
        });
    }

    function parseSaved(json) {
        if (!json) return null;
        try {
            var l = JSON.parse(json);
            return l && l.fields ? l : null;
        } catch (e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ pages & boxes

    function renderPages() {
        var host = $('ds-pages');
        host.textContent = '';
        var avail = Math.max(420, host.clientWidth - 40);
        S.zoom = Math.min(1.6, avail / (S.pages[0] ? S.pages[0].w : 612));
        S.pages.forEach(function (p) {
            var wrap = el('div', 'ds-page');
            wrap.style.width = p.w * S.zoom + 'px';
            wrap.style.height = p.h * S.zoom + 'px';
            wrap.dataset.page = p.page;
            var img = el('img');
            img.src = p.dataUrl;
            img.alt = 'Page ' + p.page;
            img.draggable = false;
            wrap.appendChild(img);
            var num = el('div', 'ds-pnum', 'Page ' + p.page);
            wrap.appendChild(num);
            wrap.addEventListener('pointerdown', function (ev) {
                if (ev.target !== img && ev.target !== wrap) return;
                if (S.placing) {
                    var r = wrap.getBoundingClientRect();
                    addField(p.page, (ev.clientX - r.left) / S.zoom, (ev.clientY - r.top) / S.zoom);
                } else {
                    select(null);
                }
            });
            host.appendChild(wrap);
        });
        S.fields.forEach(drawBox);
    }

    function pageEl(page) {
        return document.querySelector('.ds-page[data-page="' + page + '"]');
    }

    function drawBox(f) {
        var old = document.getElementById('box-' + f.id);
        if (old) old.remove();
        var host = pageEl(f.page);
        if (!host) return;
        var b = el('div', 'ds-box' + (S.selected === f.id ? ' ds-sel' : ''));
        b.id = 'box-' + f.id;
        b.style.left = f.x * S.zoom + 'px';
        b.style.top = f.y * S.zoom + 'px';
        b.style.width = f.w * S.zoom + 'px';
        b.style.height = f.h * S.zoom + 'px';
        b.style.borderColor = roleColor(f.role);
        b.style.background = f.role === 0 ? 'rgba(107,114,128,.10)' : hexA(roleColor(f.role), 0.14);
        b.setAttribute('data-role', String(f.role));
        if (S.focusRole !== null && S.focusRole !== f.role) b.classList.add('ds-dim');
        // Name tag: who completes this field.
        var tag = el('span', 'ds-btag' + (f.role === 0 ? ' ds-btag-you' : ''), f.role === 0 ? 'You' : roleName(f.role));
        tag.style.background = roleColor(f.role);
        b.appendChild(tag);
        var text = f.role === 0 && f.value ? f.value : (f.type === 'Text' ? f.label || 'Text' : f.type) + (f.role > 0 ? ' \u00B7 ' + roleName(f.role) : '');
        var lbl = el('span', 'ds-blabel', text);
        lbl.style.color = roleColor(f.role);
        b.appendChild(lbl);
        var handle = el('span', 'ds-resize');
        b.appendChild(handle);
        b.addEventListener('pointerdown', function (ev) {
            ev.stopPropagation();
            select(f.id);
            startDrag(ev, f, ev.target === handle ? 'resize' : 'move');
        });
        host.appendChild(b);
    }

    function hexA(hex, a) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function startDrag(ev, f, mode) {
        var startX = ev.clientX;
        var startY = ev.clientY;
        var o = { x: f.x, y: f.y, w: f.w, h: f.h };
        var page = S.pages[f.page - 1];
        var box = document.getElementById('box-' + f.id);
        box.setPointerCapture(ev.pointerId);
        function move(e) {
            var dx = (e.clientX - startX) / S.zoom;
            var dy = (e.clientY - startY) / S.zoom;
            if (mode === 'move') {
                f.x = clamp(o.x + dx, 0, page.w - f.w);
                f.y = clamp(o.y + dy, 0, page.h - f.h);
            } else {
                f.w = clamp(o.w + dx, 12, page.w - f.x);
                f.h = clamp(o.h + dy, 8, page.h - f.y);
            }
            box.style.left = f.x * S.zoom + 'px';
            box.style.top = f.y * S.zoom + 'px';
            box.style.width = f.w * S.zoom + 'px';
            box.style.height = f.h * S.zoom + 'px';
        }
        function up() {
            box.removeEventListener('pointermove', move);
            box.removeEventListener('pointerup', up);
            f.x = +f.x.toFixed(1);
            f.y = +f.y.toFixed(1);
            f.w = +f.w.toFixed(1);
            f.h = +f.h.toFixed(1);
        }
        box.addEventListener('pointermove', move);
        box.addEventListener('pointerup', up);
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function addField(page, x, y) {
        var spec = S.placing;
        S.placing = null;
        document.body.classList.remove('ds-placing');
        var h = spec.type === 'Signature' ? 30 : spec.type === 'Checkbox' ? 12 : 16;
        var w = spec.type === 'Signature' ? 150 : spec.type === 'Checkbox' ? 12 : spec.type === 'Initial' ? 50 : 140;
        var p = S.pages[page - 1];
        var f = {
            id: 'f' + (++S.seq), page: page, x: +clamp(x - w / 2, 0, p.w - w).toFixed(1), y: +clamp(y - h / 2, 0, p.h - h).toFixed(1), w: w, h: h,
            type: spec.role === 0 && PREP_TYPES.indexOf(spec.type) < 0 ? 'Text' : spec.type, role: spec.role,
            label: spec.type === 'Text' ? 'Text' : spec.type, required: spec.type !== 'Checkbox', value: ''
        };
        S.fields.push(f);
        drawBox(f);
        select(f.id);
        renderPanel();
    }

    function select(id) {
        var prev = S.selected;
        S.selected = id;
        [prev, id].forEach(function (fid) {
            if (!fid) return;
            var f = S.fields.find(function (x) { return x.id === fid; });
            if (f) drawBox(f);
        });
        renderEditor();
        if (id) {
            var item = document.getElementById('item-' + id);
            if (item) item.scrollIntoView({ block: 'nearest' });
        }
    }

    // ------------------------------------------------------------------ side panel

    function renderPanel() {
        renderRoles();
        renderList();
        renderEditor();
    }

    function renderRoles() {
        var host = $('ds-roles');
        host.textContent = '';
        S.roles.forEach(function (r) {
            var row = el('div', 'ds-role');
            var dot = el('span', 'ds-dot');
            dot.style.background = roleColor(r.role);
            var inp = el('input');
            inp.type = 'text';
            inp.maxLength = 80;
            inp.value = r.label;
            inp.setAttribute('aria-label', 'Signer ' + r.role + ' name');
            inp.addEventListener('change', function () {
                r.label = inp.value.trim() || 'Signer ' + r.role;
                S.fields.filter(function (f) { return f.role === r.role; }).forEach(drawBox);
                renderList();
            });
            row.appendChild(dot);
            row.appendChild(el('span', 'ds-rnum', String(r.role)));
            row.appendChild(inp);
            host.appendChild(row);
        });
    }

    /** Colour key + filter: who fills what. Clicking a person highlights only their fields. */
    function renderLegend() {
        var host = $('ds-legend');
        if (!host) return;
        host.textContent = '';
        host.appendChild(el('span', 'ds-legend-title', 'Who fills what:'));
        var chip = function (role, text, count) {
            var c = el('button', 'ds-lchip' + (S.focusRole === role ? ' ds-on' : ''));
            c.type = 'button';
            if (role !== null) {
                var dot = el('span', 'ds-ldot');
                dot.style.background = roleColor(role);
                c.appendChild(dot);
            }
            c.appendChild(document.createTextNode(text + (count !== undefined ? ' \u00B7 ' + count : '')));
            c.title = role === null ? 'Show everyone\u2019s fields' : 'Highlight only ' + text + '\u2019s fields';
            c.addEventListener('click', function () { setFocusRole(S.focusRole === role ? null : role); });
            host.appendChild(c);
        };
        chip(null, 'Everyone', S.fields.length);
        chip(0, 'You (fill now)', S.fields.filter(function (f) { return f.role === 0; }).length);
        S.roles.forEach(function (r) {
            chip(r.role, r.label || 'Signer ' + r.role, S.fields.filter(function (f) { return f.role === r.role; }).length);
        });
    }

    function setFocusRole(role) {
        S.focusRole = role;
        document.querySelectorAll('.ds-box').forEach(function (b) {
            b.classList.toggle('ds-dim', role !== null && b.getAttribute('data-role') !== String(role));
        });
        renderList();
        if (role !== null) {
            var first = S.fields.filter(function (f) { return f.role === role; }).sort(function (a, b) { return a.page - b.page || a.y - b.y; })[0];
            if (first) scrollToField(first);
            status(role === 0 ? 'Showing the fields you fill now.' : 'Showing the fields ' + roleName(role) + ' completes when signing.', 'info');
        }
    }

    function renderList() {
        var host = $('ds-list');
        host.textContent = '';
        renderLegend();
        if (S.focusRole !== null && !S.fields.some(function (f) { return f.role === S.focusRole; }) && S.focusRole !== 0 && !S.roles.some(function (r) { return r.role === S.focusRole; })) S.focusRole = null;
        var groups = [0].concat(S.roles.map(function (r) { return r.role; })).filter(function (r) { return S.focusRole === null || r === S.focusRole; });
        groups.forEach(function (role) {
            var items = S.fields.filter(function (f) { return f.role === role; }).sort(function (a, b) { return a.page - b.page || a.y - b.y || a.x - b.x; });
            if (!items.length) return;
            var h = el('div', 'ds-group', roleName(role) + ' (' + items.length + ')');
            h.style.borderLeftColor = roleColor(role);
            host.appendChild(h);
            items.forEach(function (f) {
                var it = el('div', 'ds-item' + (S.selected === f.id ? ' ds-sel' : ''));
                it.id = 'item-' + f.id;
                var top = el('div', 'ds-item-top');
                top.appendChild(el('span', 'ds-item-label', f.label || f.type));
                top.appendChild(el('span', 'ds-item-meta', f.type + ' \u00B7 p' + f.page));
                it.appendChild(top);
                if (role === 0 && f.type !== 'Checkbox') {
                    var sdata = suggestionContext();
                    var exp = global.DocSignDetect.expect(f, sdata);
                    var inp = el('input');
                    inp.type = 'text';
                    inp.maxLength = 255;
                    inp.placeholder = exp.example ? 'e.g. ' + exp.example : 'Type a value (optional)';
                    inp.value = f.value || '';
                    inp.addEventListener('input', function () {
                        f.value = inp.value;
                        drawBox(f);
                    });
                    inp.addEventListener('focus', function () { select(f.id); scrollToField(f); });
                    it.appendChild(inp);
                    if (!f.value) {
                        it.appendChild(el('div', 'ds-hint', 'Expected: ' + exp.hint + (exp.example ? ' (e.g. ' + exp.example + ')' : '')));
                        global.DocSignDetect.suggestAll(f, sdata).forEach(function (sg) {
                            var chip = el('button', 'ds-chip', 'Use "' + sg.value + '" \u00B7 ' + sg.source);
                            chip.type = 'button';
                            chip.title = sg.value;
                            chip.addEventListener('click', function (ev) {
                                ev.stopPropagation();
                                f.value = sg.value;
                                drawBox(f);
                                renderList();
                            });
                            it.appendChild(chip);
                        });
                    }
                } else if (role === 0 && f.type === 'Checkbox') {
                    var lab = el('label', 'ds-cb');
                    var cb = el('input');
                    cb.type = 'checkbox';
                    cb.checked = f.value === 'true';
                    cb.addEventListener('change', function () { f.value = cb.checked ? 'true' : ''; drawBox(f); });
                    lab.appendChild(cb);
                    lab.appendChild(document.createTextNode(' Checked'));
                    it.appendChild(lab);
                }
                it.addEventListener('click', function (ev) {
                    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'BUTTON') return;
                    select(f.id);
                    scrollToField(f);
                });
                host.appendChild(it);
            });
        });
        $('ds-count').textContent = S.fields.length + ' fields';
    }

    function suggestionContext() {
        return Object.assign({}, S.ctx || {}, { people: S.roles.map(function (r) { return r.label; }).filter(function (l) { return !/^Signer \d+$/.test(l); }) });
    }

    /** Throws away the current fields and runs automatic detection again. */
    function redetect() {
        if (!S.detected) return;
        // eslint-disable-next-line no-alert
        if (!global.confirm('Replace all current fields with a fresh automatic detection? Values you typed will be cleared.')) return;
        S.roles = S.detected.roles.map(function (r) { return { role: r.role, label: r.label }; });
        S.fields = S.detected.fields.map(function (f) { return Object.assign({}, f, { id: 'f' + (++S.seq), value: '' }); });
        if (!S.roles.length) S.roles = [{ role: 1, label: 'Signer 1' }];
        S.selected = null;
        S.restored = false;
        renderPages();
        renderPanel();
        refreshRoleSelect();
        status('Detection re-run: ' + S.fields.length + ' fields for ' + S.roles.length + ' signer(s).', 'ok');
    }

    function scrollToField(f) {
        var b = document.getElementById('box-' + f.id);
        if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function renderEditor() {
        var host = $('ds-editor');
        host.textContent = '';
        var f = S.fields.find(function (x) { return x.id === S.selected; });
        if (!f) {
            host.appendChild(el('div', 'ds-muted', 'Select a field on the page to edit it, or use "Add field".'));
            return;
        }
        host.appendChild(el('div', 'ds-ed-title', 'Selected field'));
        var roleSel = el('select');
        [{ v: 0, t: 'You (fill now)' }].concat(S.roles.map(function (r) { return { v: r.role, t: r.label }; })).forEach(function (o) {
            var op = el('option', null, o.t);
            op.value = String(o.v);
            roleSel.appendChild(op);
        });
        roleSel.value = String(f.role);
        roleSel.addEventListener('change', function () {
            f.role = +roleSel.value;
            if (f.role === 0 && PREP_TYPES.indexOf(f.type) < 0) f.type = 'Text';
            drawBox(f);
            renderList();
            renderEditor();
        });
        host.appendChild(row('Completed by', roleSel));
        var typeSel = el('select');
        (f.role === 0 ? PREP_TYPES : SIGNER_TYPES).forEach(function (t) {
            var op = el('option', null, t);
            op.value = t;
            typeSel.appendChild(op);
        });
        typeSel.value = f.type;
        typeSel.addEventListener('change', function () { f.type = typeSel.value; drawBox(f); renderList(); });
        host.appendChild(row('Type', typeSel));
        var lbl = el('input');
        lbl.type = 'text';
        lbl.maxLength = 120;
        lbl.value = f.label || '';
        lbl.addEventListener('input', function () { f.label = lbl.value; drawBox(f); });
        lbl.addEventListener('change', renderList);
        host.appendChild(row('Label', lbl));
        if (f.role > 0) {
            var req = el('input');
            req.type = 'checkbox';
            req.checked = f.required !== false;
            req.addEventListener('change', function () { f.required = req.checked; });
            host.appendChild(row('Required', req));
        }
        var del = el('button', 'ds-btn ds-danger', 'Delete field');
        del.type = 'button';
        del.addEventListener('click', function () {
            S.fields = S.fields.filter(function (x) { return x.id !== f.id; });
            var b = document.getElementById('box-' + f.id);
            if (b) b.remove();
            S.selected = null;
            renderList();
            renderEditor();
        });
        host.appendChild(del);
    }

    function row(label, control) {
        var r = el('label', 'ds-row');
        r.appendChild(el('span', null, label));
        r.appendChild(control);
        return r;
    }

    // ------------------------------------------------------------------ toolbar actions

    function beginPlace() {
        var type = $('ds-new-type').value;
        var role = +$('ds-new-role').value;
        S.placing = { type: type, role: role };
        document.body.classList.add('ds-placing');
        status('Click on the page where the ' + type.toLowerCase() + ' field should go.', 'info');
    }

    function addSigner() {
        var n = S.roles.length + 1;
        if (n > 20) return;
        S.roles.push({ role: n, label: 'Signer ' + n });
        renderRoles();
        refreshRoleSelect();
    }

    function refreshRoleSelect() {
        var sel = $('ds-new-role');
        var cur = sel.value;
        sel.textContent = '';
        [{ v: 0, t: 'You (fill now)' }].concat(S.roles.map(function (r) { return { v: r.role, t: r.label }; })).forEach(function (o) {
            var op = el('option', null, o.t);
            op.value = String(o.v);
            sel.appendChild(op);
        });
        sel.value = cur && sel.querySelector('option[value="' + cur + '"]') ? cur : '1';
    }

    async function save() {
        var btn = $('ds-save');
        var signerFields = S.fields.filter(function (f) { return f.role > 0; });
        if (!signerFields.some(function (f) { return f.type === 'Signature'; })) {
            // eslint-disable-next-line no-alert
            if (!global.confirm('No signature field is placed. Signers will get an automatic signature block at the end. Continue?')) return;
        }
        var emptyPrep = S.fields.filter(function (f) { return f.role === 0 && f.type !== 'Checkbox' && !f.value; }).length;
        if (emptyPrep > 0) {
            // eslint-disable-next-line no-alert
            if (!global.confirm(emptyPrep + ' field(s) you should fill are still empty and will stay blank. Continue?')) return;
        }
        btn.disabled = true;
        // Stop autosave and let an in-flight draft save finish first.
        if (S.draft) {
            S.draft.done = true;
            while (S.draft.saving) await new Promise(function (r) { setTimeout(r, 150); });
        }
        try {
            var total = S.pages.length;
            var pages = new Array(total);
            var done = 0;
            var next = 0;
            status('Saving to Salesforce. Keep this window open.', 'info');
            progress(0, total + 1, 'Saving page 1 of ' + total);
            // Upload page images three at a time, retrying a page up to twice on a transient error.
            var worker = async function () {
                while (next < total) {
                    var i = next++;
                    var vid = null;
                    for (var attempt = 0; attempt < 3 && !vid; attempt++) {
                        try {
                            vid = await remote('savePage', S.cfg.documentId, i + 1, S.pages[i].dataUrl);
                        } catch (err) {
                            if (attempt === 2) throw err;
                            await new Promise(function (r) { setTimeout(r, 800 * (attempt + 1)); });
                        }
                    }
                    pages[i] = { page: i + 1, w: S.pages[i].w, h: S.pages[i].h, versionId: vid };
                    done++;
                    progress(done, total + 1, 'Saved page ' + done + ' of ' + total);
                }
            };
            await Promise.all([worker(), worker(), worker()]);
            progress(total, total + 1, 'Saving fields');
            status('Saving fields\u2026');
            var payload = {
                pages: pages,
                fields: S.fields.map(function (f) {
                    return { page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, type: f.type, role: f.role, label: f.label, required: f.required !== false, value: f.value || null };
                }),
                roles: S.roles
            };
            var res = await remote('saveLayout', S.cfg.documentId, JSON.stringify(payload));
            progress(null);
            status('Saved. ' + res.signatureFieldCount + ' signer field(s) for ' + res.signerRoles + ' signer(s).', 'ok');
            if (S.draft) S.draft.done = true;
            draftBadge('Saved', 'ok');
            notifyParent({ type: 'docsign:prepared', documentId: res.documentId, recordId: res.recordId });
            $('ds-done').style.display = 'flex';
        } catch (e) {
            progress(null);
            status(e.message, 'error');
            btn.disabled = false;
            if (S.draft) S.draft.done = false;
        }
    }

    function notifyParent(msg) {
        var origin = S.cfg.parentOrigin;
        if (global.parent && global.parent !== global && origin) {
            msg.nonce = S.cfg.nonce;
            global.parent.postMessage(msg, origin);
        }
    }

    function init(cfg) {
        $('ds-add').addEventListener('click', beginPlace);
        $('ds-add-signer').addEventListener('click', addSigner);
        $('ds-redetect').addEventListener('click', redetect);
        $('ds-save').addEventListener('click', save);
        $('ds-cancel').addEventListener('click', async function () {
            // Keep the work in progress before closing.
            await saveDraftNow();
            notifyParent({ type: 'docsign:cancel' });
        });
        var t = $('ds-new-type');
        SIGNER_TYPES.forEach(function (x) {
            var op = el('option', null, x);
            op.value = x;
            t.appendChild(op);
        });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && S.placing) {
                S.placing = null;
                document.body.classList.remove('ds-placing');
                status('');
            }
            if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.selected && ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'SELECT') {
                var f = S.fields.find(function (x) { return x.id === S.selected; });
                if (f) {
                    S.fields = S.fields.filter(function (x) { return x !== f; });
                    var b = document.getElementById('box-' + f.id);
                    if (b) b.remove();
                    S.selected = null;
                    renderList();
                    renderEditor();
                }
            }
        });
        window.addEventListener('resize', function () {
            if (S.pages.length) renderPages();
        });
        start(cfg);
    }

    global.DocSignPrepUI = { init: init, _state: S };
})(window);
