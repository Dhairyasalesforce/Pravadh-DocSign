/**
 * Pravadh DocSign - document composition and rendering (HTML -> PDF).
 * Uses the native Salesforce PDF rendering service (Blob.toPdf); no external services.
 */
public inherited sharing class DocSignRenderService {
    public enum FieldMode { PLACEHOLDER, SIGNING, FINAL_VALUES }

    public static final Integer AUTO_FIELD_BASE = 1000;

    public class FieldSpec {
        public Integer index;
        public String type;
        public Integer role;
        public Boolean required;
        public String label;
    }

    public class FieldValue {
        public String type;
        public String value;
        public String image;
        public Integer role;
        public Boolean mine = false;
        public String label;
        /** Display name of the signer who completes this field (shown to other signers). */
        public String owner;
    }

    // ------------------------------------------------------------------ composition

    public static String composeDocument(String body, String header, String footer, String css, String pageSize, String orientation, String title) {
        String size = String.isBlank(pageSize) ? 'A4' : pageSize;
        String orient = orientation == 'Landscape' ? 'landscape' : 'portrait';
        List<String> h = new List<String>();
        h.add('<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>');
        h.add('<title>' + DocSignFormatter.escapeXml(title) + '</title><style type="text/css">');
        h.add('@page { size: ' + size + ' ' + orient + '; margin: 24mm 18mm 20mm 18mm;');
        h.add(' @top-center { content: element(dsHeader); } @bottom-center { content: element(dsFooter); } }');
        h.add(baseCss());
        if (String.isNotBlank(css)) {
            h.add(css.replace('</style', ''));
        }
        h.add('</style></head><body>');
        h.add('<div class="ds-header">' + (header == null ? '' : header) + '</div>');
        h.add('<div class="ds-footer">' + (footer == null ? '' : footer) + '</div>');
        h.add('<div class="ds-body">' + (body == null ? '' : body) + '</div>');
        h.add('</body></html>');
        return String.join(h, '');
    }

    public static String baseCss() {
        return 'body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #1b1f24; line-height: 1.45; }'
            + ' .ds-header { position: running(dsHeader); font-size: 9pt; color: #555; }'
            + ' .ds-footer { position: running(dsFooter); font-size: 8.5pt; color: #666; }'
            + ' .ds-page:before { content: counter(page); } .ds-pages:before { content: counter(pages); }'
            + ' h1 { font-size: 18pt; margin: 0 0 8pt 0; } h2 { font-size: 13.5pt; margin: 14pt 0 6pt 0; } h3 { font-size: 11.5pt; }'
            + ' table { border-collapse: collapse; width: 100%; } th { background: #f1f4f8; text-align: left; }'
            + ' th, td { padding: 5pt 6pt; border-bottom: 1px solid #dde3ea; vertical-align: top; }'
            + ' .ds-tab { display: inline-block; min-width: 110px; padding: 3pt 7pt; border: 1px dashed #c89a00; background: #fff8dc; color: #6f5400; font-size: 8.5pt; }'
            + ' .ds-signed { display: inline-block; } .ds-signed img { height: 42px; } .ds-initial img { height: 26px; }'
            + ' .ds-sig-id { display: block; font-size: 6.5pt; color: #3056a0; border-top: 1px solid #3056a0; padding-top: 1pt; }'
            + ' .ds-check { display: inline-block; width: 10px; height: 10px; border: 1px solid #333; font-size: 8pt; line-height: 10px; text-align: center; }'
            + ' .ds-autoblock { margin-top: 24pt; page-break-inside: avoid; } .ds-autoblock td { border: none; padding: 8pt 6pt; width: 33%; }'
            + ' .ds-line { border-bottom: 1px solid #333; min-height: 30px; } .ds-caption { font-size: 8pt; color: #555; }';
    }

    // ------------------------------------------------------------------ signature fields

    public static List<FieldSpec> parseFields(String html) {
        List<FieldSpec> out = new List<FieldSpec>();
        if (String.isBlank(html)) {
            return out;
        }
        Integer pos = 0;
        String pre = DocSignMergeEngine.FIELD_MARKER_PREFIX;
        while (true) {
            Integer s = html.indexOf(pre, pos);
            if (s < 0) {
                break;
            }
            Integer e = html.indexOf(DocSignMergeEngine.MARKER_SUFFIX, s);
            if (e < 0) {
                break;
            }
            FieldSpec f = toSpec(html.substring(s + pre.length(), e));
            if (f != null) {
                out.add(f);
            }
            pos = e + 2;
        }
        return out;
    }

    private static FieldSpec toSpec(String markerBody) {
        List<String> p = markerBody.split('\\|', -1);
        if (p.size() < 4) {
            return null;
        }
        FieldSpec f = new FieldSpec();
        try {
            f.index = Integer.valueOf(p[0]);
            f.type = p[1];
            f.role = Integer.valueOf(p[2]);
            f.required = p[3] == '1';
            f.label = p.size() > 4 ? p[4] : '';
        } catch (Exception ex) {
            return null;
        }
        return f;
    }

    /** Appends a standard signature block for fields that were auto-created (index >= AUTO_FIELD_BASE). */
    public static String appendAutoBlock(String html, List<FieldSpec> autoFields) {
        if (autoFields == null || autoFields.isEmpty()) {
            return html;
        }
        Map<Integer, List<FieldSpec>> byRole = new Map<Integer, List<FieldSpec>>();
        List<Integer> roles = new List<Integer>();
        for (FieldSpec f : autoFields) {
            if (!byRole.containsKey(f.role)) {
                byRole.put(f.role, new List<FieldSpec>());
                roles.add(f.role);
            }
            byRole.get(f.role).add(f);
        }
        roles.sort();
        List<String> b = new List<String>{ '<div class="ds-autoblock"><h3>Signatures</h3><table>' };
        for (Integer r : roles) {
            b.add('<tr>');
            for (FieldSpec f : byRole.get(r)) {
                b.add('<td><div class="ds-line">' + marker(f) + '</div><div class="ds-caption">' + DocSignFormatter.escapeXml(f.type) + '</div></td>');
            }
            b.add('</tr>');
        }
        b.add('</table></div>');
        String block = String.join(b, '');
        Integer idx = html.lastIndexOf('</body>');
        return idx < 0 ? html + block : html.substring(0, idx) + block + html.substring(idx);
    }

    public static String marker(FieldSpec f) {
        return DocSignMergeEngine.FIELD_MARKER_PREFIX + f.index + '|' + f.type + '|' + f.role + '|' + (f.required ? '1' : '0') + '|' + (f.label == null ? '' : f.label) + DocSignMergeEngine.MARKER_SUFFIX;
    }

    public static String renderFields(String html, FieldMode mode, Map<Integer, FieldValue> values, String envelopeRef) {
        if (String.isBlank(html)) {
            return html;
        }
        List<String> out = new List<String>();
        Integer pos = 0;
        String pre = DocSignMergeEngine.FIELD_MARKER_PREFIX;
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
            FieldSpec f = toSpec(html.substring(s + pre.length(), e));
            out.add(f == null ? '' : renderOne(f, mode, values == null ? null : values.get(f.index), envelopeRef));
            pos = e + 2;
        }
        return String.join(out, '');
    }

    private static String renderOne(FieldSpec f, FieldMode mode, FieldValue v, String envelopeRef) {
        String caption = String.isNotBlank(f.label) ? f.label : f.type;
        if (mode == FieldMode.PLACEHOLDER) {
            return '<span class="ds-tab">' + DocSignFormatter.escapeXml(caption) + ' &#183; Signer ' + f.role + '</span>';
        }
        Boolean hasValue = v != null && (String.isNotBlank(v.value) || String.isNotBlank(v.image));
        if (mode == FieldMode.SIGNING && (!hasValue || (v != null && v.mine))) {
            String cls = (v != null && v.mine) ? 'ds-tab ds-mine' : 'ds-tab ds-other';
            String who = v != null && String.isNotBlank(v.owner) ? DocSignFormatter.escapeXml(v.owner) : 'Signer ' + f.role;
            String markerBody = hasValue ? finalValue(f, v, envelopeRef) : DocSignFormatter.escapeXml(caption) + ((v != null && v.mine) ? '' : ' &#183; ' + who);
            return '<span class="' + cls + '" id="dsf-' + f.index + '" data-type="' + DocSignFormatter.escapeXml(f.type) + '">' + markerBody + '</span>';
        }
        return hasValue ? finalValue(f, v, envelopeRef) : '';
    }

    private static String finalValue(FieldSpec f, FieldValue v, String envelopeRef) {
        if (f.type == 'Signature' && isSafeImage(v.image)) {
            return '<span class="ds-signed"><img src="' + v.image + '" alt="Signature"/><span class="ds-sig-id">Pravadh DocSign ' + DocSignFormatter.escapeXml(envelopeRef) + '</span></span>';
        }
        if (f.type == 'Initial' && isSafeImage(v.image)) {
            return '<span class="ds-signed ds-initial"><img src="' + v.image + '" alt="Initials"/></span>';
        }
        if (f.type == 'Checkbox') {
            return '<span class="ds-check">' + (v.value == 'true' ? 'X' : '&#160;') + '</span>' + (String.isNotBlank(f.label) ? ' ' + DocSignFormatter.escapeXml(f.label) : '');
        }
        return DocSignFormatter.escapeXml(v.value);
    }

    /** Relative Salesforce Files URL used for images in server-rendered PDFs (Blob.toPdf ignores data: URIs). */
    public static final String FILE_URL = '/sfc/servlet.shepherd/version/download/';

    /** Sum of the ContentSize of the files referenced by the last *ForPdf image resolution (render sanity check). */
    public static Long lastImageBytes = 0;

    public static String fileUrl(Id versionId) {
        return FILE_URL + String.valueOf(versionId);
    }

    public static Boolean isFileUrl(String s) {
        return s != null && s.startsWith(FILE_URL) && Pattern.matches('068[A-Za-z0-9]{12}([A-Za-z0-9]{3})?', s.substringAfter(FILE_URL));
    }

    /**
     * Only PNG/JPEG base64 data URIs (browser display) or a same-org Salesforce Files version URL
     * (server PDF rendering) are ever embedded - never remote URLs or script-capable content.
     */
    public static Boolean isSafeImage(String dataUri) {
        if (isFileUrl(dataUri)) {
            return true;
        }
        if (String.isBlank(dataUri) || dataUri.length() > 131000) {
            return false;
        }
        if (!(dataUri.startsWith('data:image/png;base64,') || dataUri.startsWith('data:image/jpeg;base64,'))) {
            return false;
        }
        return Pattern.matches('[A-Za-z0-9+/=]+', dataUri.substringAfter(','));
    }

    // ------------------------------------------------------------------ images

    public static String resolveImages(String html, Boolean systemMode) {
        return resolveImages(html, systemMode, false);
    }

    /**
     * For Blob.toPdf: images become relative Salesforce Files URLs of already committed versions
     * (the PDF service fetches them itself, so they never enter the Apex heap).
     */
    public static String resolveImagesForPdf(String html, Boolean systemMode) {
        return resolveImages(html, systemMode, true);
    }

    private static String resolveImages(String html, Boolean systemMode, Boolean asUrl) {
        lastImageBytes = 0;
        if (String.isBlank(html) || !html.contains(DocSignMergeEngine.IMAGE_MARKER_PREFIX)) {
            return html;
        }
        Set<String> ids = new Set<String>();
        Integer pos = 0;
        String pre = DocSignMergeEngine.IMAGE_MARKER_PREFIX;
        while (true) {
            Integer s = html.indexOf(pre, pos);
            if (s < 0) {
                break;
            }
            Integer e = html.indexOf(DocSignMergeEngine.MARKER_SUFFIX, s);
            if (e < 0) {
                break;
            }
            ids.add(html.substring(s + pre.length(), e).substringBefore('|'));
            pos = e + 2;
        }
        Map<String, String> uris = systemMode ? new SystemImageLoader().load(ids, asUrl) : loadImages(ids, AccessLevel.USER_MODE, asUrl);
        List<String> out = new List<String>();
        pos = 0;
        while (true) {
            Integer s = html.indexOf(pre, pos);
            if (s < 0) {
                out.add(html.substring(pos));
                break;
            }
            Integer e = html.indexOf(DocSignMergeEngine.MARKER_SUFFIX, s);
            out.add(html.substring(pos, s));
            String markerBody = html.substring(s + pre.length(), e);
            String id = markerBody.substringBefore('|');
            String width = markerBody.substringAfter('|');
            String uri = uris.get(id);
            if (uri != null) {
                out.add('<img src="' + uri + '"' + (String.isNotBlank(width) ? ' width="' + width.escapeHtml4() + '"' : '') + ' alt=""/>');
            }
            pos = e + 2;
        }
        return String.join(out, '');
    }

    private static Map<String, String> loadImages(Set<String> ids, AccessLevel level, Boolean asUrl) {
        Map<String, String> out = new Map<String, String>();
        Set<String> versionIds = new Set<String>();
        Set<String> docIds = new Set<String>();
        for (String i : ids) {
            if (i.startsWith('068')) {
                versionIds.add(i);
            } else if (i.startsWith('069')) {
                docIds.add(i);
            }
        }
        if (versionIds.isEmpty() && docIds.isEmpty()) {
            return out;
        }
        String cols = asUrl ? 'Id, ContentDocumentId, FileExtension, ContentSize' : 'Id, ContentDocumentId, FileExtension, ContentSize, VersionData';
        List<ContentVersion> rows = Database.queryWithBinds(
            'SELECT ' + cols + ' FROM ContentVersion WHERE (Id IN :vids OR (ContentDocumentId IN :dids AND IsLatest = true)) AND ContentSize < ' + (asUrl ? '10000000' : '2000000'),
            new Map<String, Object>{ 'vids' => versionIds, 'dids' => docIds },
            level
        );
        for (ContentVersion cv : rows) {
            String ext = cv.FileExtension == null ? 'png' : cv.FileExtension.toLowerCase();
            String mime = ext == 'jpg' || ext == 'jpeg' ? 'image/jpeg' : (ext == 'gif' ? 'image/gif' : 'image/png');
            String uri;
            if (asUrl) {
                uri = fileUrl(cv.Id);
                lastImageBytes += cv.ContentSize == null ? 0 : cv.ContentSize;
            } else {
                uri = 'data:' + mime + ';base64,' + EncodingUtil.base64Encode(cv.VersionData);
            }
            out.put(String.valueOf(cv.Id).left(15), uri);
            out.put(String.valueOf(cv.Id), uri);
            out.put(String.valueOf(cv.ContentDocumentId).left(15), uri);
            out.put(String.valueOf(cv.ContentDocumentId), uri);
        }
        return out;
    }

    /** Used only by the token-authenticated signing flow and system finalization, where the actor is not a Salesforce user. */
    private without sharing class SystemImageLoader {
        Map<String, String> load(Set<String> ids, Boolean asUrl) {
            return loadImages(ids, AccessLevel.SYSTEM_MODE, asUrl);
        }
    }

    // ------------------------------------------------------------------ PDF + hashing

    public static Blob toPdf(String html) {
        if (Test.isRunningTest()) {
            return Blob.valueOf(html);
        }
        return Blob.toPdf(html);
    }

    public static String sha256(Blob b) {
        return b == null ? null : EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', b));
    }

    public static String sha256(String s) {
        return sha256(Blob.valueOf(s == null ? '' : s));
    }

    /** Merged content is stored across three long text fields (up to ~390K characters). */
    public static String readHtml(DocSign_Document__c d) {
        return (d.Merged_Html__c == null ? '' : d.Merged_Html__c) + (d.Merged_Html_2__c == null ? '' : d.Merged_Html_2__c) + (d.Merged_Html_3__c == null ? '' : d.Merged_Html_3__c);
    }

    public static void writeHtml(DocSign_Document__c d, String html) {
        Integer max = 131072;
        String h = html == null ? '' : html;
        if (h.length() > max * 3) {
            throw new DocSignException('The generated document is too large (' + h.length() + ' characters). Reduce embedded images or split the template.');
        }
        d.Merged_Html__c = h.left(max);
        d.Merged_Html_2__c = h.length() > max ? h.mid(max, max) : null;
        d.Merged_Html_3__c = h.length() > max * 2 ? h.mid(max * 2, max) : null;
    }
}
