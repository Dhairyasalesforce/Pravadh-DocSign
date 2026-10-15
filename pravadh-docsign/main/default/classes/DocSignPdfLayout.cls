/**
 * Pravadh DocSign - uploaded PDF layout.
 *
 * An uploaded PDF is represented as one image per page plus absolutely positioned fields. This class
 * validates the layout submitted by the preparer and converts it into the same signable HTML the
 * template engine produces ([[DSF|...]] field markers, [[DSI|...]] page images). Signing, audit,
 * finalization (native Salesforce PDF rendering) and the Certificate of Completion are then shared.
 */
public with sharing class DocSignPdfLayout {
    public static final Integer MAX_FIELDS = 600;
    public static final Integer MAX_PAGES = 100;
    private static final Set<String> SIGNER_TYPES = new Set<String>{ 'Signature', 'Initial', 'Date Signed', 'Name', 'Email', 'Text', 'Checkbox' };

    public class PageInfo {
        public Integer page;
        public Decimal w;
        public Decimal h;
        public String versionId;
    }

    public class FieldInfo {
        public Integer page;
        public Decimal x;
        public Decimal y;
        public Decimal w;
        public Decimal h;
        public String type;
        public Integer role;
        public String label;
        public Boolean required;
        public String value;
    }

    public class RoleInfo {
        public Integer role;
        public String label;
    }

    public class Layout {
        public List<PageInfo> pages = new List<PageInfo>();
        public List<FieldInfo> fields = new List<FieldInfo>();
        public List<RoleInfo> roles = new List<RoleInfo>();
    }

    /** Validates bounds, types and sizes; renumbers signer roles to 1..n in order of first use. */
    public static Layout validate(Layout l) {
        if (l == null || l.pages == null || l.pages.isEmpty()) {
            throw new DocSignException('The prepared PDF has no pages.');
        }
        if (l.pages.size() > MAX_PAGES) {
            throw new DocSignException('A PDF can have at most ' + MAX_PAGES + ' pages.');
        }
        if (l.fields == null) {
            l.fields = new List<FieldInfo>();
        }
        if (l.fields.size() > MAX_FIELDS) {
            throw new DocSignException('Too many fields (maximum ' + MAX_FIELDS + ').');
        }
        Map<Integer, PageInfo> byPage = new Map<Integer, PageInfo>();
        for (Integer i = 0; i < l.pages.size(); i++) {
            PageInfo p = l.pages[i];
            if (p == null || p.page != i + 1 || !inRange(p.w, 36, 5000) || !inRange(p.h, 36, 5000) || String.isBlank(p.versionId)) {
                throw new DocSignException('Invalid page information for page ' + (i + 1) + '.');
            }
            byPage.put(p.page, p);
        }
        List<Integer> used = new List<Integer>();
        Map<Integer, Integer> remap = new Map<Integer, Integer>();
        for (FieldInfo f : l.fields) {
            PageInfo p = f == null ? null : byPage.get(f.page);
            if (p == null) {
                throw new DocSignException('A field refers to a page that does not exist.');
            }
            if (!inRange(f.x, -1, p.w) || !inRange(f.y, -1, p.h) || !inRange(f.w, 4, p.w) || !inRange(f.h, 4, p.h)) {
                throw new DocSignException('A field on page ' + f.page + ' is outside the page.');
            }
            f.role = f.role == null || f.role < 0 ? 0 : f.role;
            if (f.role > 20) {
                throw new DocSignException('A document can have at most 20 signers.');
            }
            f.label = f.label == null ? '' : f.label.replaceAll('[\\[\\]|]', ' ').normalizeSpace().left(120);
            f.value = f.value == null ? null : f.value.left(255);
            f.required = f.required != false;
            if (f.role == 0) {
                if (f.type != 'Checkbox') {
                    f.type = 'Text';
                }
            } else {
                if (!SIGNER_TYPES.contains(f.type)) {
                    throw new DocSignException('Unsupported field type: ' + f.type);
                }
                if (!remap.containsKey(f.role)) {
                    used.add(f.role);
                    remap.put(f.role, remap.size() + 1);
                }
            }
        }
        for (FieldInfo f : l.fields) {
            if (f.role > 0) {
                f.role = remap.get(f.role);
            }
        }
        List<RoleInfo> roles = new List<RoleInfo>();
        Map<Integer, String> names = new Map<Integer, String>();
        if (l.roles != null) {
            for (RoleInfo r : l.roles) {
                if (r != null && r.role != null && remap.containsKey(r.role)) {
                    names.put(remap.get(r.role), r.label == null ? null : r.label.normalizeSpace().left(80));
                }
            }
        }
        for (Integer i = 1; i <= remap.size(); i++) {
            RoleInfo r = new RoleInfo();
            r.role = i;
            r.label = names.containsKey(i) && String.isNotBlank(names.get(i)) ? names.get(i) : 'Signer ' + i;
            roles.add(r);
        }
        l.roles = roles;
        return l;
    }

    /**
     * Work-in-progress layout (autosave): same bounds/type/size checks as validate(), but page images
     * are not uploaded yet and signer numbers are kept exactly as the preparer set them.
     */
    public static Layout validateDraft(Layout l) {
        if (l == null || l.pages == null || l.pages.isEmpty() || l.pages.size() > MAX_PAGES) {
            throw new DocSignException('Invalid draft.');
        }
        if (l.fields == null) {
            l.fields = new List<FieldInfo>();
        }
        if (l.fields.size() > MAX_FIELDS) {
            throw new DocSignException('Too many fields (maximum ' + MAX_FIELDS + ').');
        }
        Map<Integer, PageInfo> byPage = new Map<Integer, PageInfo>();
        for (Integer i = 0; i < l.pages.size(); i++) {
            PageInfo p = l.pages[i];
            if (p == null || p.page != i + 1 || !inRange(p.w, 36, 5000) || !inRange(p.h, 36, 5000)) {
                throw new DocSignException('Invalid page information for page ' + (i + 1) + '.');
            }
            p.versionId = null;
            byPage.put(p.page, p);
        }
        for (FieldInfo f : l.fields) {
            PageInfo p = f == null ? null : byPage.get(f.page);
            if (p == null || !inRange(f.x, -1, p.w) || !inRange(f.y, -1, p.h) || !inRange(f.w, 4, p.w) || !inRange(f.h, 4, p.h)) {
                throw new DocSignException('A field is outside its page.');
            }
            f.role = f.role == null || f.role < 0 ? 0 : f.role;
            if (f.role > 20) {
                throw new DocSignException('A document can have at most 20 signers.');
            }
            f.label = f.label == null ? '' : f.label.replaceAll('[\\[\\]|]', ' ').normalizeSpace().left(120);
            f.value = f.value == null ? null : f.value.left(255);
            f.required = f.required != false;
            if (f.role == 0 && f.type != 'Checkbox') {
                f.type = 'Text';
            } else if (f.role > 0 && !SIGNER_TYPES.contains(f.type)) {
                throw new DocSignException('Unsupported field type: ' + f.type);
            }
        }
        List<RoleInfo> roles = new List<RoleInfo>();
        if (l.roles != null) {
            for (RoleInfo r : l.roles) {
                if (r != null && r.role != null && r.role >= 1 && r.role <= 20 && roles.size() < 20) {
                    RoleInfo c = new RoleInfo();
                    c.role = r.role;
                    c.label = String.isBlank(r.label) ? 'Signer ' + r.role : r.label.normalizeSpace().left(80);
                    roles.add(c);
                }
            }
        }
        l.roles = roles;
        return l;
    }

    private static Boolean inRange(Decimal v, Decimal lo, Decimal hi) {
        return v != null && v >= lo && v <= hi + 1;
    }

    private static String pt(Decimal d) {
        return String.valueOf(d.setScale(1, RoundingMode.HALF_UP)) + 'pt';
    }

    /** Builds the signable HTML: page images as backgrounds, preparer values stamped, signer fields as markers. */
    public static String buildHtml(Layout l, String title) {
        PageInfo first = l.pages[0];
        List<String> h = new List<String>();
        h.add('<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>');
        h.add('<title>' + DocSignFormatter.escapeXml(title) + '</title><style type="text/css">');
        h.add('@page { size: ' + pt(first.w) + ' ' + pt(first.h) + '; margin: 0; }');
        h.add('body { margin: 0; padding: 0; font-family: Helvetica, Arial, sans-serif; color: #0b1f4d; }');
        h.add('.ds-pdfpage { position: relative; overflow: hidden; margin: 0; padding: 0; }');
        h.add('.ds-bg { position: absolute; left: 0; top: 0; }');
        h.add('.ds-box { position: absolute; overflow: hidden; }');
        h.add('.ds-val { font-size: 9pt; line-height: 1.1; white-space: nowrap; }');
        h.add('.ds-tab { display: block; padding: 1pt 3pt; border: 1px dashed #c89a00; background: #fff8dc; color: #6f5400; font-size: 7pt; white-space: nowrap; overflow: hidden; }');
        h.add('.ds-signed { display: block; } .ds-signed img { display: block; } .ds-sig-id { display: block; font-size: 5pt; color: #3056a0; }');
        h.add('.ds-check { display: inline-block; width: 9pt; height: 9pt; border: 1px solid #333; font-size: 7pt; line-height: 9pt; text-align: center; }');
        for (PageInfo p : l.pages) {
            h.add('.ds-p' + p.page + ' .ds-bg, .ds-p' + p.page + ' .ds-bg img { width: ' + pt(p.w) + '; height: ' + pt(p.h) + '; }');
        }
        Integer idx = 0;
        List<String> body = new List<String>();
        List<String> sizing = new List<String>();
        for (PageInfo p : l.pages) {
            Boolean last = p.page == l.pages.size();
            body.add('<div class="ds-pdfpage ds-p' + p.page + '" style="width:' + pt(p.w) + ';height:' + pt(p.h) + (last ? '' : ';page-break-after:always') + '">');
            body.add('<div class="ds-bg">' + DocSignMergeEngine.IMAGE_MARKER_PREFIX + String.valueOf(p.versionId).replaceAll('[^A-Za-z0-9]', '') + '|' + DocSignMergeEngine.MARKER_SUFFIX + '</div>');
            for (FieldInfo f : l.fields) {
                if (f.page != p.page) {
                    continue;
                }
                String box = 'left:' + pt(f.x) + ';top:' + pt(f.y) + ';width:' + pt(f.w) + ';height:' + pt(f.h);
                if (f.role == 0) {
                    if (String.isBlank(f.value)) {
                        continue;
                    }
                    Decimal size = Math.min(10.0, Math.max(6.0, (f.h * 0.62).setScale(1, RoundingMode.HALF_UP)));
                    String v = f.type == 'Checkbox'
                        ? '<span class="ds-check">' + (f.value == 'true' ? 'X' : '&#160;') + '</span>'
                        : DocSignFormatter.escapeXml(f.value);
                    body.add('<div class="ds-box ds-val" style="' + box + ';font-size:' + size + 'pt;padding-top:' + pt(Math.max(0.0, f.h - size - 3)) + '">' + v + '</div>');
                } else {
                    // Signature/initial images are sized to the box height through a per-field CSS rule.
                    String sigCss = '';
                    if (f.type == 'Signature' || f.type == 'Initial') {
                        sigCss = ' ds-fb' + idx;
                        sizing.add('.ds-fb' + idx + ' .ds-signed img { height: ' + pt(Math.max(8.0, f.h - (f.type == 'Signature' ? 7 : 1))) + '; }');
                    }
                    Decimal fs = Math.min(10.0, Math.max(6.0, (f.h * 0.6).setScale(1, RoundingMode.HALF_UP)));
                    body.add('<div class="ds-box' + sigCss + '" style="' + box + ';font-size:' + fs + 'pt">');
                    body.add(DocSignMergeEngine.FIELD_MARKER_PREFIX + idx + '|' + f.type + '|' + f.role + '|' + (f.required ? '1' : '0') + '|' + f.label + DocSignMergeEngine.MARKER_SUFFIX);
                    body.add('</div>');
                    idx++;
                }
            }
            body.add('</div>');
        }
        h.addAll(sizing);
        h.add('</style></head><body>');
        h.addAll(body);
        h.add('</body></html>');
        return String.join(h, '');
    }

    /** Signing page: page images are fetched lazily (one per request) instead of being inlined. */
    public static String lazyImages(String html) {
        if (String.isBlank(html) || !html.contains(DocSignMergeEngine.IMAGE_MARKER_PREFIX)) {
            return html;
        }
        List<String> out = new List<String>();
        Integer pos = 0;
        String pre = DocSignMergeEngine.IMAGE_MARKER_PREFIX;
        while (true) {
            Integer s = html.indexOf(pre, pos);
            if (s < 0) {
                out.add(html.substring(pos));
                break;
            }
            Integer e = html.indexOf(DocSignMergeEngine.MARKER_SUFFIX, s);
            if (e < 0) {
                out.add(html.substring(pos));
                break;
            }
            out.add(html.substring(pos, s));
            String ref = html.substring(s + pre.length(), e).substringBefore('|').replaceAll('[^A-Za-z0-9]', '');
            out.add('<img class="ds-lazy" data-ref="' + ref + '" alt="Page"/>');
            pos = e + 2;
        }
        return String.join(out, '');
    }

    public static Set<String> pageVersionIds(String pageImagesJson) {
        Set<String> ids = new Set<String>();
        if (String.isBlank(pageImagesJson)) {
            return ids;
        }
        for (Object o : (List<Object>) JSON.deserializeUntyped(pageImagesJson)) {
            Object v = ((Map<String, Object>) o).get('versionId');
            if (v != null) {
                String s = String.valueOf(v);
                ids.add(s);
                ids.add(s.left(15));
            }
        }
        return ids;
    }
}
