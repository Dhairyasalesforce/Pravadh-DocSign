/*
 * Pravadh DocSign - PDF analysis engine.
 * Runs entirely in the preparer's browser: renders pages to images and detects fillable blanks,
 * signature blocks and existing PDF form fields. Nothing in the PDF is executed.
 */
(function (global) {
    'use strict';

    var TYPE_RULES = [
        { type: 'Signature', re: /\b(signature|signed|sign here|signatory|by|reviewed by|approved by|witness(ed)?( by)?|accepted by|agreed by)\s*:?\s*$/i },
        { type: 'Initial', re: /\binitials?\s*:?\s*$/i },
        { type: 'Date', re: /\b(date|dated|date signed|effective date|on)\s*:?\s*$/i },
        { type: 'Email', re: /\be-?mail( address)?\s*:?\s*$/i },
        { type: 'Name', re: /\b((print(ed)?|full|your) )?name\s*:?\s*$/i },
        { type: 'Title', re: /\b(title|designation|position)\s*:?\s*$/i },
        { type: 'Address', re: /\baddress\s*:?\s*$/i },
        { type: 'Phone', re: /\b(phone|mobile|tel(ephone)?)( number| no\.?)?\s*:?\s*$/i },
        { type: 'Checkbox', re: /^$/ }
    ];

    function classify(label) {
        var l = (label || '').trim();
        // "Signature of Tenant", "Signed by the Buyer", "Witness 2"
        if (/^(signature|signed)\s+(of|by)\s+\S/i.test(l) || /\bwitness\s*#?\d+\s*:?\s*$/i.test(l)) return 'Signature';
        for (var i = 0; i < TYPE_RULES.length - 1; i++) {
            if (TYPE_RULES[i].re.test(l)) return TYPE_RULES[i].type;
        }
        return 'Text';
    }

    function cleanLabel(s) {
        return (s || '').replace(/_{2,}/g, ' ').replace(/(\u2610|\u25A1|\[\s?\])/g, ' ').replace(/\s+/g, ' ').replace(/[:\s]+$/, '').trim();
    }

    /** Turns pdf.js text items into positioned runs in top-left page coordinates (points). */
    function runsFor(items, viewport) {
        var runs = [];
        items.forEach(function (it) {
            if (!it.str || !it.transform) return;
            var fontH = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
            var p = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
            var x = p[0];
            var baseline = p[1];
            var w = it.width;
            runs.push({ str: it.str, x: x, w: w, top: baseline - fontH, bottom: baseline, h: fontH });
        });
        return runs;
    }

    function sameLine(a, b) {
        return Math.abs(a.bottom - b.bottom) < Math.max(3, Math.min(a.h, b.h) * 0.45);
    }

    /** Finds "_____" runs (inside or across text items) and "[ ]"/"\u2610" checkboxes. */
    function blanksFor(runs) {
        var blanks = [];
        runs.forEach(function (r, idx) {
            var re = /_{3,}/g;
            var m;
            var len = r.str.length || 1;
            while ((m = re.exec(r.str)) !== null) {
                var cw = r.w / len;
                blanks.push({
                    kind: 'line',
                    x: r.x + m.index * cw,
                    w: m[0].length * cw,
                    bottom: r.bottom,
                    h: r.h,
                    run: idx,
                    before: r.str.substring(0, m.index)
                });
            }
            var cb = /(\u2610|\u25A1|\[\s?\])/g;
            while ((m = cb.exec(r.str)) !== null) {
                var cw2 = r.w / len;
                blanks.push({ kind: 'box', x: r.x + m.index * cw2, w: Math.max(9, m[0].length * cw2), bottom: r.bottom, h: r.h, run: idx, before: '', after: r.str.substring(m.index + m[0].length) });
            }
        });
        // merge adjacent line blanks on the same line (Word often splits long rules)
        // Same line (within 2pt) sorts left to right; two-column layouts often differ by a point or so.
        blanks.sort(function (a, b) { return Math.abs(a.bottom - b.bottom) < 2 ? a.x - b.x : a.bottom - b.bottom; });
        var merged = [];
        blanks.forEach(function (b) {
            var last = merged[merged.length - 1];
            var gap = last ? b.x - (last.x + last.w) : 0;
            if (last && last.kind === 'line' && b.kind === 'line' && Math.abs(last.bottom - b.bottom) < 2 && b.x >= last.x && gap < 4 && gap > -3) {
                last.w = b.x + b.w - last.x;
            } else {
                merged.push(b);
            }
        });
        return merged;
    }

    function isRule(s) {
        return /^[\s_]*$/.test(s);
    }

    /** Label = nearest text to the left on the same line, else the column header above. */
    function labelFor(blank, runs) {
        var own = cleanLabel(blank.before);
        var money = /(\$|\u20B9|\u20AC|\u00A3|\u00A5|\bRs\.?|\bINR|\bUSD|\bEUR|\bGBP)\s*$/i.test(blank.before || '');
        // "$____" or a one-character prefix is not a label: use the row / column context instead.
        if (own && !isRule(blank.before) && /[A-Za-z]/.test(own)) {
            if (money) {
                var sym0 = ((blank.before || '').match(/(\$|\u20B9|\u20AC|\u00A3|\u00A5|Rs\.?|INR|USD|EUR|GBP)\s*$/i) || ['', ''])[1];
                own = cleanLabel(own.replace(/(\$|\u20B9|\u20AC|\u00A3|\u00A5|Rs\.?|INR|USD|EUR|GBP)\s*$/i, '')) + ' (' + sym0 + ')';
            }
            return { label: own, source: 'left', money: money };
        }
        if (money) {
            // Row name in the first table column (may sit a line above/below the "$____" line).
            var rowName = runs
                .filter(function (r) { return r.x + r.w < blank.x - 40 && Math.abs(r.bottom - blank.bottom) < 16 && /[A-Za-z]{2}/.test(r.str) && !isRule(r.str); })
                .sort(function (a, b) { return a.x - b.x || Math.abs(a.bottom - blank.bottom) - Math.abs(b.bottom - blank.bottom); });
            var ctxLabel = tableLabel(blank, runs, rowName.length ? cleanLabel(rowName[0].str) : undefined);
            var sym = ((blank.before || '').match(/(\$|\u20B9|\u20AC|\u00A3|\u00A5|Rs\.?|INR|USD|EUR|GBP)\s*$/i) || ['', ''])[1];
            var base = cleanLabel((own || '').replace(/(\$|\u20B9|\u20AC|\u00A3|\u00A5|Rs\.?|INR|USD|EUR|GBP)\s*$/i, ''));
            return { label: (ctxLabel.rowLabel ? ctxLabel.rowLabel + ' \u2013 amount' : (base || ctxLabel.label || 'Amount')) + (sym ? ' (' + sym + ')' : ''), source: 'left', money: true, currency: sym };
        }
        var left = runs
            .filter(function (r) {
                return sameLine(r, blank) && r.x + r.w <= blank.x + 2 && blank.x - (r.x + r.w) < 220 && !isRule(r.str);
            })
            .sort(function (a, b) { return b.x - a.x; });
        if (left.length) {
            // collect contiguous words to the left (same phrase)
            var phrase = [left[0]];
            for (var i = 1; i < left.length; i++) {
                if (phrase[phrase.length - 1].x - (left[i].x + left[i].w) < 14) phrase.push(left[i]);
                else break;
            }
            var text = cleanLabel(phrase.reverse().map(function (r) { return r.str; }).join(' '));
            var gap = blank.x - (left[0].x + left[0].w);
            if (gap > 60) {
                return tableLabel(blank, runs, text);
            }
            return { label: text, source: 'left' };
        }
        return tableLabel(blank, runs);
    }

    var GENERIC_HEADERS = /^(value|values|detail|details|answer|response|information|info|entry)$/i;

    function isHeading(s) {
        var t = (s || '').trim();
        return t.length > 1 && /[A-Z]/.test(t) && t === t.toUpperCase();
    }

    /** Table cell: row label (left) + uppercase column header above (x-overlap, nearest). */
    function tableLabel(blank, runs, rowOverride) {
        var header = runs
            .filter(function (r) {
                return r.bottom < blank.bottom - 2 && blank.bottom - r.bottom < 240 && isHeading(r.str) &&
                    r.x < blank.x + blank.w + 50 && r.x + r.w > blank.x - 40;
            })
            .sort(function (a, b) { return b.bottom - a.bottom || Math.abs(a.x - blank.x) - Math.abs(b.x - blank.x); });
        var row = rowOverride !== undefined ? rowOverride : cleanLabel(runs
            .filter(function (r) { return sameLine(r, blank) && r.x + r.w < blank.x && !isRule(r.str); })
            .sort(function (a, b) { return a.x - b.x; })
            .map(function (r) { return r.str; }).join(' '));
        var h = header.length ? cleanLabel(header[0].str) : '';
        if (GENERIC_HEADERS.test(h)) h = '';
        var headerTitle = h ? h.charAt(0) + h.slice(1).toLowerCase() : '';
        var lbl = row && headerTitle ? row + ' \u2013 ' + headerTitle : row || headerTitle;
        return { label: lbl, source: 'header', header: headerTitle, rowLabel: row };
    }

    function titleCase(s) {
        return (s || '').split(/\s+/).map(function (w) {
            return w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase();
        }).join(' ');
    }

    /**
     * Groups signer fields into signature blocks. A block is anchored on a Signature field; Date/Name/
     * Email/Title/Address blanks in the same column within ~120pt of it belong to the same signer.
     */
    function bot(f) {
        return f.y + f.h;
    }

    function assignRoles(fields, pages) {
        var sigs = fields.filter(function (f) { return f.type === 'Signature'; });
        sigs.sort(function (a, b) { return a.page - b.page || (Math.abs(bot(a) - bot(b)) < 8 ? a.x - b.x : bot(a) - bot(b)); });
        var blocks = [];
        sigs.forEach(function (s) {
            var pw = pages[s.page - 1].w;
            var col = s.x + s.w / 2 < pw / 2 ? 0 : 1;
            var existing = blocks.find(function (b) { return b.page === s.page && b.col === col && Math.abs(b.bottom - bot(s)) < 20; });
            if (existing) {
                s.role = existing.role;
                return;
            }
            blocks.push({ page: s.page, col: col, bottom: bot(s), x: s.x, role: blocks.length + 1, anchor: s });
            s.role = blocks.length;
        });
        fields.forEach(function (f) {
            if (f.type === 'Signature') return;
            var best = null;
            blocks.forEach(function (b) {
                if (b.page !== f.page) return;
                var pw = pages[f.page - 1].w;
                var fcol = f.x + f.w / 2 < pw / 2 ? 0 : 1;
                var sameLineAsBlock = Math.abs(bot(f) - b.bottom) < 6;
                var colOwned = blocks.some(function (o) { return o.page === f.page && o.col === fcol && Math.abs(o.bottom - bot(f)) < 150; });
                var colOk = sameLineAsBlock || fcol === b.col || !colOwned;
                var dy = bot(f) - b.bottom;
                if (colOk && dy > -30 && dy < 140) {
                    var d = Math.abs(dy) + (sameLineAsBlock ? 0 : 5);
                    if (!best || d < best.d) best = { b: b, d: d };
                }
            });
            f.role = best ? best.b.role : 0; // 0 = preparer fills now
        });
        return blocks;
    }

    /** Signer display names from a heading above each block (e.g. "DHAIRYA SHAH", "PRAVADH LABS LLC"). */
    function roleNames(blocks, runsByPage, fields) {
        return blocks.map(function (b) {
            var runs = runsByPage[b.page - 1];
            var anchor = b.anchor;
            var line = b.bottom - 4;
            var heading = runs
                .filter(function (r) {
                    return r.bottom < line - 8 && line - r.bottom < 110 && r.x >= anchor.x - 120 && r.x < anchor.x + anchor.w + 20 && /[A-Za-z]/.test(r.str) && !isRule(r.str);
                })
                .sort(function (a, c) { return c.bottom - a.bottom; });
            var upper = heading.filter(function (r) { return r.str.trim().length > 2 && r.str === r.str.toUpperCase() && /[A-Z]{2}/.test(r.str); });
            var name = anchor.signerHint || (upper.length ? titleCase(upper[0].str.trim()) : '');
            var hasName = fields.some(function (f) { return f.role === b.role && f.type === 'Name'; });
            return { role: b.role, label: name || 'Signer ' + b.role, hasNameField: hasName };
        });
    }

    var ROLE_BY = { approved: 'Approver', reviewed: 'Reviewer', accepted: 'Accepted by', agreed: 'Agreed by', witnessed: 'Witness' };

    function capFirst(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }

    /** Who signs, when the signature label says it: "Signature of Tenant", "Employee signature", "Witness 2", "Approved by". */
    function signerFromLabel(label) {
        var l = (label || '').replace(/\s+/g, ' ').trim();
        var m = l.match(/^(?:signature|signed)\s+(?:of|by)\s+(?:the\s+)?(.+?)\s*:?$/i);
        if (m) return capFirst(m[1]);
        m = l.match(/^(.+?)['\u2019]s\s+signature\s*:?$/i) || l.match(/^(.+?)\s+signature\s*:?$/i);
        if (m && !/^(your|signer|authori[sz]ed)$/i.test(m[1])) return capFirst(m[1]);
        if (m && /^authori[sz]ed$/i.test(m[1])) return 'Authorised signatory';
        m = l.match(/^witness\s*#?(\d+)/i);
        if (m) return 'Witness ' + m[1];
        m = l.match(/^(approved|reviewed|accepted|agreed|witnessed)\s+by\s*:?$/i);
        if (m) return ROLE_BY[m[1].toLowerCase()];
        return '';
    }

    var CURRENCY_END = /(\$|\u20B9|\u20AC|\u00A3|\u00A5|Rs\.?|INR|USD|EUR|GBP)\s*$/i;

    function toField(blank, lab, page, idx) {
        if (blank.kind === 'box') {
            // A checkbox is described by the text right after it ("[ ] I agree to ...").
            var after = cleanLabel((blank.after || '').split(/(\u2610|\u25A1|\[\s?\])/)[0]);
            if (after) lab = { label: after.slice(0, 120), source: 'after' };
        } else if (lab.label && CURRENCY_END.test(lab.label) && !lab.money) {
            // "Monthly rent: <currency> ____" where the label came from the text to the left.
            var sym1 = lab.label.match(CURRENCY_END)[1];
            lab = { label: cleanLabel(lab.label.replace(CURRENCY_END, '')) + ' (' + sym1 + ')', source: lab.source, money: true };
        }
        var type = blank.kind === 'box' ? 'Checkbox' : classify(lab.label);
        if (lab.source === 'header' && blank.kind !== 'box') type = classify(lab.header) === 'Date' || classify(lab.rowLabel) === 'Date' ? 'Date' : 'Text';
        var h = type === 'Signature' ? 30 : type === 'Initial' ? 22 : Math.max(14, Math.min(24, blank.h * 1.6));
        return {
            id: 'f' + page + '_' + idx,
            page: page,
            x: +blank.x.toFixed(1),
            y: +(blank.bottom - h + 2).toFixed(1),
            w: +Math.max(blank.w, 40).toFixed(1),
            h: +h.toFixed(1),
            type: type,
            label: lab.label || (type === 'Text' ? 'Text' : type),
            required: type !== 'Checkbox',
            source: blank.kind === 'box' ? 'checkbox' : 'blank',
            labelSource: lab.source,
            signerHint: type === 'Signature' ? signerFromLabel(lab.label) : '',
            kind: lab.money ? 'Amount' : type,
            value: ''
        };
    }

    var NOT_A_NAME = /\b(date|name|title|address|e-?mail|phone|signature|initials?|by|amount|total|cash|number|no|section|schedule|page)\b/i;

    /** "Dhairya Shah ______  Date ____" or "For Pravadh Labs LLC ______": a person/company name before a signing line. */
    function looksLikeSignerName(label) {
        var l = (label || '').trim();
        if (!l || l.length > 48 || NOT_A_NAME.test(l.replace(/^for\s+/i, ''))) return false;
        return /^(for\s+)?[A-Z][A-Za-z.'&-]*(\s+(&|[A-Z][A-Za-z.'&-]*)){1,5}$/.test(l);
    }

    function promoteNamedSignatureLines(fields) {
        fields.forEach(function (f) {
            if (f.type !== 'Text' || f.source !== 'blank' || f.labelSource !== 'left' || !looksLikeSignerName(f.label)) return;
            var dateBeside = fields.some(function (o) {
                return o !== f && o.page === f.page && Math.abs(bot(o) - bot(f)) < 6 && o.x > f.x + f.w - 2 && /^date( signed)?$/i.test(o.label || '');
            });
            if (!dateBeside && !/^for\s+/i.test(f.label)) return;
            f.signerHint = f.label.replace(/^for\s+/i, '').trim();
            f.type = 'Signature';
            f.kind = 'Signature';
            f.label = 'Signature \u2013 ' + f.signerHint;
            var bottom = bot(f);
            // Stacked signing lines are close together, so keep the box inside its own line.
            f.h = 22;
            f.y = +(bottom - 22).toFixed(1);
        });
    }

    function normName(s) {
        return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /** Signature blocks naming the same signer (e.g. signature page + schedule acknowledgment) share one role. */
    function mergeRolesByName(roles, fields) {
        var first = {};
        var remap = {};
        var out = [];
        roles.forEach(function (r) {
            var key = /^signer \d+$/i.test(r.label) ? 'role' + r.role : normName(r.label);
            if (first[key] === undefined) {
                first[key] = out.length + 1;
                out.push({ role: out.length + 1, label: r.label, hasNameField: r.hasNameField });
            } else if (r.hasNameField) {
                out[first[key] - 1].hasNameField = true;
            }
            remap[r.role] = first[key];
        });
        fields.forEach(function (f) {
            if (f.role > 0 && remap[f.role]) f.role = remap[f.role];
        });
        return out;
    }

    async function analyze(data, opts) {
        opts = opts || {};
        var pdfjsLib = global.pdfjsLib;
        var base = opts.assetBase || '';
        var task = pdfjsLib.getDocument({
            data: data,
            isEvalSupported: false,
            enableXfa: false,
            disableAutoFetch: true,
            standardFontDataUrl: base + 'standard_fonts/',
            cMapUrl: base + 'cmaps/',
            cMapPacked: true
        });
        var pdf = await task.promise;
        var maxPages = opts.maxPages || 100;
        if (pdf.numPages > maxPages) {
            throw new Error('This PDF has ' + pdf.numPages + ' pages. The maximum is ' + maxPages + '.');
        }
        var pages = [];
        var fields = [];
        var runsByPage = [];
        // Image resolution and size adapt to the page count so the signed PDF stays inside the
        // Salesforce file/heap budget (about 8 MB for all pages together).
        var scale = pdf.numPages <= 30 ? 1.6 : pdf.numPages <= 60 ? 1.4 : 1.25;
        var budget = opts.imageBudgetBytes || 8000000;
        var perPage = Math.max(50000, Math.min(300000, Math.floor(budget / pdf.numPages)));
        var textChars = 0;
        for (var p = 1; p <= pdf.numPages; p++) {
            if (opts.onProgress) opts.onProgress(p, pdf.numPages);
            // Let the browser paint the progress bar between pages (PDF.js runs on the main thread here).
            await new Promise(function (r) { setTimeout(r, 0); });
            var page = await pdf.getPage(p);
            var vp1 = page.getViewport({ scale: 1 });
            var tc = await page.getTextContent();
            var runs = runsFor(tc.items, vp1);
            textChars += runs.reduce(function (n, r) { return n + r.str.trim().length; }, 0);
            runsByPage.push(runs);
            var blanks = blanksFor(runs);
            blanks.forEach(function (b, i) {
                fields.push(toField(b, labelFor(b, runs), p, i));
            });
            // Existing AcroForm widgets
            var annots = await page.getAnnotations({ intent: 'display' });
            annots.forEach(function (a, i) {
                if (a.subtype !== 'Widget' || !a.rect) return;
                var r = vp1.convertToViewportRectangle(a.rect);
                var x = Math.min(r[0], r[2]);
                var y = Math.min(r[1], r[3]);
                var t = a.fieldType === 'Sig' ? 'Signature' : a.fieldType === 'Btn' && a.checkBox ? 'Checkbox' : a.fieldType === 'Tx' ? classify(a.alternativeText || a.fieldName) : null;
                if (!t) return;
                fields.push({
                    id: 'a' + p + '_' + i, page: p, x: +x.toFixed(1), y: +y.toFixed(1), w: +Math.abs(r[2] - r[0]).toFixed(1), h: +Math.abs(r[3] - r[1]).toFixed(1),
                    type: t, label: cleanLabel(a.alternativeText || a.fieldName || t), required: t !== 'Checkbox', source: 'form', value: ''
                });
            });
            // Render page image (adaptive JPEG quality to stay inside the storage/finalization budget)
            var vp = page.getViewport({ scale: scale });
            var canvas = document.createElement('canvas');
            canvas.width = Math.ceil(vp.width);
            canvas.height = Math.ceil(vp.height);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS }).promise;
            var q = 0.86;
            var url = canvas.toDataURL('image/jpeg', q);
            while (url.length * 0.75 > perPage && q > 0.45) {
                q -= 0.1;
                url = canvas.toDataURL('image/jpeg', q);
            }
            if (url.length * 0.75 > perPage) {
                // Very dense page (photos, scans): shrink the image rather than dropping quality further.
                var small = document.createElement('canvas');
                small.width = Math.round(canvas.width * 0.75);
                small.height = Math.round(canvas.height * 0.75);
                var sctx = small.getContext('2d');
                sctx.fillStyle = '#ffffff';
                sctx.fillRect(0, 0, small.width, small.height);
                sctx.drawImage(canvas, 0, 0, small.width, small.height);
                url = small.toDataURL('image/jpeg', 0.6);
                small.width = 0;
                small.height = 0;
            }
            pages.push({ page: p, w: +vp1.width.toFixed(2), h: +vp1.height.toFixed(2), dataUrl: url, bytes: Math.round(url.length * 0.75) });
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
        }
        promoteNamedSignatureLines(fields);
        var blocks = assignRoles(fields, pages);
        var roles = mergeRolesByName(roleNames(blocks, runsByPage, fields), fields);
        // Signer-side types map onto DocSign field types
        fields.forEach(function (f) {
            if (f.role > 0) {
                if (f.type === 'Date') f.type = 'Date Signed';
                else if (f.type === 'Title' || f.type === 'Address' || f.type === 'Phone') f.type = 'Text';
            } else if (f.type === 'Signature' || f.type === 'Initial') {
                f.role = 1;
            } else if (f.type !== 'Checkbox') {
                f.type = 'Text';
            }
        });
        await pdf.destroy();
        return {
            numPages: pages.length,
            pages: pages,
            fields: fields,
            roles: roles,
            scanned: textChars < 20 * pages.length
        };
    }

    /** Suggests a value for a preparer field from Salesforce data (label similarity). */
    // ------------------------------------------------------------------ what to fill in
    // Hints and examples for a blank, from its label and detected kind, so the preparer knows what
    // kind of value is expected even when Salesforce has no matching data.
    var EXPECT = [
        { k: 'status-date', re: /status or date/, hint: 'A status or a completion date', ex: function (c) { return ['Completed', c.today]; } },
        { k: 'date', re: /\b(date|dated|effective|formation|commencement|expiry|expiration|dob|birth)\b/, hint: 'A date', ex: function (c) { return [c.today]; } },
        { k: 'amount', re: /(\$|\u20B9|\u20AC|\u00A3|\u00A5|\brs\.?|\binr\b|\busd\b|\beur\b|\bamount|\bprice|\bcash|\bfee|\brent\b|\bdeposit|\bsalary|\bcontribution|\bcapital|\bpayment|\badvance|\bconsideration|\btotal\b)/, hint: 'An amount', ex: function (c) { return [(c.currency || '') + '10,000.00']; } },
        { k: 'addr-email', re: /address and e-?mail/, hint: 'Postal address and email', ex: function (c) { return [(c.address || 'Street, City, Postal code') + ' \u00B7 ' + (c.email || 'name@example.com')]; } },
        { k: 'email', re: /e-?mail/, hint: 'An email address', ex: function (c) { return [c.email || 'name@example.com']; } },
        { k: 'agent', re: /registered agent/, hint: 'Registered agent name and address', ex: function () { return ['Agent name, street, city, postal code']; } },
        { k: 'address', re: /\b(address|office|location|premises|residence|residing)\b/, hint: 'A full postal address', ex: function (c) { return [c.address || 'Street, City, State/Region, Postal code']; } },
        { k: 'entity-no', re: /(entity|file|registration|company|incorporation|gst|pan|vat|cin|ein|tax) ?(number|no\.?|id)|\bein\b|\bgstin\b|\bvat\b/, hint: 'An official registration or tax number', ex: function () { return ['as shown on the registration certificate']; } },
        { k: 'number', re: /\b(number|no\.?|id|reference|ref)\b/, hint: 'A reference number', ex: function () { return ['ABC-123']; } },
        { k: 'percent', re: /(%|percent|percentage|ownership|share|stake|vested)/, hint: 'A percentage', ex: function () { return ['50%']; } },
        { k: 'url', re: /(repositor|url|website|web site|domain|link|branch)/, hint: 'A web address or repository name', ex: function () { return ['https://example.com']; } },
        { k: 'list', re: /(components|items|assets|list|inventory|schedule of)/, hint: 'A comma-separated list', ex: function () { return ['Item 1, Item 2']; } },
        { k: 'title', re: /\b(title|designation|job role|occupation)\b/, hint: 'A job title', ex: function (c) { return [c.title || 'Director']; } },
        { k: 'phone', re: /(phone|mobile|tel\b|telephone|contact no)/, hint: 'A phone number', ex: function (c) { return [c.phone || '+00 000 000 0000']; } },
        { k: 'place', re: /(county|state|jurisdiction|country|city|territory|place)/, hint: 'A place', ex: function () { return ['City, State/Region, Country']; } },
        { k: 'company', re: /\b(company|organi[sz]ation|employer|entity|firm|business) name\b|\blegal name\b/, hint: 'A company name', ex: function (c) { return [c.company || 'Company name']; } },
        { k: 'person', re: /\b(member|name|owner|party|by|signatory|manager|partner|witness|tenant|landlord|employee|buyer|seller|customer|client|guardian)\b/, hint: "A person's full name", ex: function (c) { return [c.people[0] || c.myName || 'Full name']; } },
        { k: 'description', re: /(description|purpose|details|notes?|remarks|reason)/, hint: 'A short description', ex: function () { return ['Short description']; } }
    ];

    var COMPANY_WORDS = /\b(llc|llp|ltd|limited|inc|corp|corporation|pvt|gmbh|plc|company|co\.)\b/i;

    /** Signer labels that are real people ("Priya Raman"), not roles ("Tenant") or companies. */
    function personNames(list) {
        return (list || []).filter(function (n) {
            return /^[A-Z][A-Za-z.'-]+(\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(n || '') && !COMPANY_WORDS.test(n) && !/^(signer|witness|hr|authori[sz]ed)\b/i.test(n);
        });
    }

    function ctxInfo(data) {
        var get = function (label) {
            var f = (data.fields || []).find(function (c) { return c.label === label; });
            return f ? f.value : '';
        };
        return { today: data.today || '', email: get('My Email'), title: get('My Title'), myName: get('My Name'), phone: get('My Phone'), address: get('My Address'), company: get('Company Legal Name'), currency: '', people: personNames(data.people) };
    }

    /** { kind, hint, example } for a blank the preparer fills. */
    function expect(field, data) {
        var l = ((field.label || '') + ' ' + (field.kind === 'Amount' ? 'amount' : '')).toLowerCase();
        var c = ctxInfo(data || {});
        var cur = ((field.label || '').match(/\((\$|\u20B9|\u20AC|\u00A3|\u00A5|Rs\.?|INR|USD|EUR|GBP)\)/i) || ['', ''])[1];
        c.currency = cur ? (cur.length === 1 ? cur : cur + ' ') : '';
        for (var i = 0; i < EXPECT.length; i++) {
            if (EXPECT[i].re.test(l)) {
                var ex = EXPECT[i].ex(c).filter(function (x) { return x; });
                return { kind: EXPECT[i].k, hint: EXPECT[i].hint, example: ex[0] || '' };
            }
        }
        if (field.kind === 'Date') return { kind: 'date', hint: 'A date', example: c.today };
        return { kind: 'text', hint: 'Text for "' + (field.label || 'this field') + '"', example: '' };
    }

    var TYPE_FOR_KIND = {
        'amount': ['CURRENCY'], 'email': ['EMAIL'],
        'phone': ['PHONE'], 'percent': ['PERCENT'], 'url': ['URL'], 'address': [], 'title': [], 'person': []
    };

    function tokens(s) {
        return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (t) { return t.length > 2 && ['the', 'and', 'for', 'number', 'exact', 'date', 'name', 'full', 'your', 'details'].indexOf(t) < 0; });
    }

    /**
     * Up to two candidate values: record/user fields whose label matches the blank, then values of the
     * expected type (dates, emails, amounts, people), then today's date for date blanks.
     */
    function suggestAll(field, data) {
        if (!data) return [];
        var out = [];
        var seen = {};
        var add = function (value, source, score) {
            if (!value || seen[value]) return;
            seen[value] = true;
            out.push({ value: String(value).slice(0, 255), source: source, score: score });
        };
        var exp = expect(field, data);
        var lt = tokens(field.label);
        (data.fields || []).forEach(function (c) {
            var ct = tokens(c.label);
            if (!lt.length || !ct.length) return;
            var inter = lt.filter(function (t) { return ct.indexOf(t) >= 0; }).length;
            var score = inter / Math.max(lt.length, ct.length);
            if (score >= 0.34) add(c.value, c.label, score);
        });
        var types = TYPE_FOR_KIND[exp.kind] || [];
        (data.fields || []).forEach(function (c) {
            if (c.type && types.indexOf(c.type) >= 0) add(c.value, c.label, 0.3);
        });
        if (exp.kind === 'person') {
            personNames(data.people).forEach(function (p) { add(p, 'Signer', 0.25); });
            if (data.fields) {
                var me = data.fields.find(function (c) { return c.label === 'My Name'; });
                if (me) add(me.value, 'My Name', 0.2);
            }
        }
        if (exp.kind === 'company') {
            (data.fields || []).forEach(function (c) {
                if (/company|account name|organi[sz]ation|legal name/i.test(c.label)) add(c.value, c.label, 0.4);
            });
        }
        if (exp.kind === 'title') {
            var t = (data.fields || []).find(function (c) { return c.label === 'My Title' || /\btitle\b/i.test(c.label); });
            if (t) add(t.value, t.label, 0.25);
        }
        if ((exp.kind === 'date' || exp.kind === 'status-date') && data.today) add(data.today, 'Today', 0.9);
        if (exp.kind === 'addr-email' || exp.kind === 'email' || exp.kind === 'address') {
            // Pick the contact details of the person named in the label (you, or the record's person).
            var lbl = (field.label || '').toLowerCase();
            var mine = (data.fields || []).find(function (c) { return c.label === 'My Name'; });
            var isMe = mine && lbl.indexOf(String(mine.value).toLowerCase()) >= 0;
            (data.fields || []).forEach(function (c) {
                var isUserField = /^My /.test(c.label);
                if (isMe !== isUserField) return;
                if (exp.kind !== 'address' && (c.type === 'EMAIL' || c.label === 'My Email')) add(c.value, c.label, 0.5);
                if (exp.kind !== 'email' && /address|street|city/i.test(c.label)) add(c.value, c.label, 0.45);
            });
        }
        if (exp.kind === 'status-date') add('Completed', 'Status', 0.15);
        out.sort(function (a, b) { return b.score - a.score; });
        if (exp.kind === 'addr-email') {
            var em = out.find(function (o) { return /@/.test(o.value); });
            var ad = out.find(function (o) { return !/@/.test(o.value); });
            if (em && ad) out.unshift({ value: (ad.value + ' \u00B7 ' + em.value).slice(0, 255), source: ad.source + ' + ' + em.source, score: 1 });
        }
        return out.slice(0, 2);
    }

    /** Back-compatible single best suggestion. */
    function suggest(field, data) {
        var all = suggestAll(field, data);
        return all.length ? { value: all[0].value, source: all[0].source } : null;
    }

    global.DocSignDetect = { analyze: analyze, suggest: suggest, suggestAll: suggestAll, expect: expect, classify: classify };
})(window);
