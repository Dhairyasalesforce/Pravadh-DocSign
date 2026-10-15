/**
 * Pravadh DocSign - merge engine.
 *
 * Template syntax (works for ANY standard or custom object; resolved dynamically):
 *   {{Name}}  {{Account.Name}}  {{Owner.Email}}  {{Amount | currency}}  {{CloseDate | date:"dd MMM yyyy"}}
 *   {{#each OpportunityLineItems orderBy="SortOrder" limit="200"}} {{Product2.Name}} {{$index}} {{else}} none {{/each}}
 *   {{#if Payment_Terms__c == "Net 30"}} ... {{else}} ... {{/if}}     (==, !=, >, <, >=, <=, contains, and/or)
 *   {{$Today | date:"d MMMM yyyy"}}  {{$Now}}  {{$User.Name}}  {{$Org.Name}}  {{$root.Name}}  {{$PageNumber}}  {{$PageCount}}
 *   {{image:068XXXXXXXXXXXXXXX width="140"}}
 *   {{sign:signature:1}} {{sign:initial:1}} {{sign:date:1}} {{sign:name:1}} {{sign:email:1}} {{sign:text:1:Company Name}} {{sign:checkbox:2:I agree:optional}}
 *
 * The engine builds ONE query (with child sub-queries) per render, enforcing CRUD/FLS
 * (inaccessible or unknown fields render blank and are reported as warnings).
 */
public with sharing class DocSignMergeEngine {
    public enum OutputMode { HTML, XML, TEXT }

    public static final String FIELD_MARKER_PREFIX = '[[DSF|';
    public static final String IMAGE_MARKER_PREFIX = '[[DSI|';
    public static final String MARKER_SUFFIX = ']]';

    public class Node {
        public String kind; // TEXT, FIELD, EACH, IF, SIGN, IMAGE
        public String text;
        public String expr;
        public List<String> filters = new List<String>();
        public Map<String, String> options = new Map<String, String>();
        public List<Node> children = new List<Node>();
        public List<Node> elseChildren = new List<Node>();
        public Boolean inElse = false;
        public Node(String kind) {
            this.kind = kind;
        }
    }

    private class ChildPlan {
        String relName;
        Schema.SObjectType childType;
        Set<String> fields = new Set<String>{ 'Id' };
        String orderBy;
        Integer limitRows = 500;
    }

    /** A compiled, data-bound merge job for one record and one or more template parts. */
    public class Job {
        public Schema.SObjectType rootType;
        public Id recordId;
        public SObject record;
        public List<String> warnings = new List<String>();
        public Integer fieldCounter = 0;
        public OutputMode mode = OutputMode.HTML;
        private Map<String, List<Node>> parsed = new Map<String, List<Node>>();
        private Set<String> rootFields = new Set<String>{ 'Id' };
        private Map<String, ChildPlan> children = new Map<String, ChildPlan>();
        private Map<String, Schema.DescribeFieldResult> meta = new Map<String, Schema.DescribeFieldResult>();
        private Map<String, String> canonical = new Map<String, String>();
        private User currentUser;
        private Set<String> warned = new Set<String>();
        /** Merge fields that resolved to no value on this record (for "missing data" checks). */
        public List<String> blankFields = new List<String>();
        private Set<String> blankSeen = new Set<String>();
        /** Additional root paths to load (e.g. the record name field). */
        public List<String> extraPaths = new List<String>();

        public Object value(String path) {
            String canon = canonical.get(String.valueOf(rootType) + ':' + path.toLowerCase());
            return canon == null ? null : valueAt(record, canon);
        }
    }

    // ------------------------------------------------------------------ public API

    /** Merges several template parts against the same record with a single query. */
    public static Map<String, String> mergeParts(Id recordId, Map<String, String> parts, OutputMode mode, Job jobOut) {
        Job job = jobOut == null ? new Job() : jobOut;
        job.recordId = recordId;
        job.rootType = recordId.getSObjectType();
        job.mode = mode;
        for (String key : parts.keySet()) {
            String src = parts.get(key) == null ? '' : parts.get(key);
            List<Node> nodes = parse(src);
            job.parsed.put(key, nodes);
            collect(job, nodes, job.rootType, null);
        }
        for (String p : job.extraPaths) {
            addPath(job, p, job.rootType, null);
        }
        load(job);
        Map<String, String> out = new Map<String, String>();
        for (String key : parts.keySet()) {
            // Parts whose key starts with "text:" are rendered as plain text (file names, subjects).
            job.mode = key.startsWith('text:') ? OutputMode.TEXT : mode;
            List<String> buf = new List<String>();
            renderNodes(job, job.parsed.get(key), job.record, job.rootType, null, buf);
            out.put(key, String.join(buf, ''));
        }
        return out;
    }

    public static String mergeText(Id recordId, String template) {
        return mergeParts(recordId, new Map<String, String>{ 'text:v' => template }, OutputMode.TEXT, null).get('text:v');
    }

    // ------------------------------------------------------------------ parser

    public static List<Node> parse(String src) {
        List<Node> root = new List<Node>();
        List<Node> stack = new List<Node>();
        Integer pos = 0;
        Integer len = src.length();
        while (pos < len) {
            Integer start = src.indexOf('{{', pos);
            if (start < 0) {
                addText(root, stack, src.substring(pos));
                break;
            }
            Integer endIdx = src.indexOf('}}', start + 2);
            if (endIdx < 0) {
                addText(root, stack, src.substring(pos));
                break;
            }
            if (start > pos) {
                addText(root, stack, src.substring(pos, start));
            }
            String tag = normalizeTag(src.substring(start + 2, endIdx));
            pos = endIdx + 2;
            String lower = tag.toLowerCase();
            if (lower.startsWith('#each ')) {
                Node n = new Node('EACH');
                String rest = tag.substring(6).trim();
                n.expr = rest.split('\\s+')[0];
                n.options = parseOptions(rest.substring(n.expr.length()));
                append(root, stack, n);
                stack.add(n);
            } else if (lower.startsWith('#if ')) {
                Node n = new Node('IF');
                n.expr = tag.substring(4).trim();
                append(root, stack, n);
                stack.add(n);
            } else if (lower == 'else') {
                if (!stack.isEmpty()) {
                    stack[stack.size() - 1].inElse = true;
                }
            } else if (lower == '/each' || lower == '/if') {
                if (!stack.isEmpty()) {
                    stack.remove(stack.size() - 1);
                }
            } else if (lower.startsWith('sign:')) {
                Node n = new Node('SIGN');
                n.expr = tag;
                append(root, stack, n);
            } else if (lower.startsWith('image:')) {
                Node n = new Node('IMAGE');
                String rest = tag.substring(6).trim();
                n.expr = rest.split('\\s+')[0];
                n.options = parseOptions(rest.substring(n.expr.length()));
                append(root, stack, n);
            } else if (lower.startsWith('!')) {
                continue; // comment
            } else if (String.isNotBlank(tag)) {
                Node n = new Node('FIELD');
                List<String> segs = splitPipes(tag);
                n.expr = segs.remove(0).trim();
                n.filters = segs;
                append(root, stack, n);
            }
        }
        return root;
    }

    private static String normalizeTag(String raw) {
        String t = raw;
        // Rich-text / Word artefacts inside tags
        if (t.contains('<')) {
            t = t.replaceAll('<[^>]*>', '');
        }
        return t.replace('&quot;', '"').replace('&#39;', '\'').replace('&#x27;', '\'').replace('&gt;', '>').replace('&lt;', '<')
            .replace('&amp;', '&').replace('&nbsp;', ' ').replace('\u00a0', ' ').replace('“', '"').replace('”', '"')
            .replace('‘', '\'').replace('’', '\'').trim();
    }

    private static void addText(List<Node> root, List<Node> stack, String s) {
        if (String.isEmpty(s)) {
            return;
        }
        Node n = new Node('TEXT');
        n.text = s;
        append(root, stack, n);
    }

    private static void append(List<Node> root, List<Node> stack, Node n) {
        if (stack.isEmpty()) {
            root.add(n);
        } else {
            Node parent = stack[stack.size() - 1];
            if (parent.inElse) {
                parent.elseChildren.add(n);
            } else {
                parent.children.add(n);
            }
        }
    }

    private static List<String> splitPipes(String s) {
        List<String> out = new List<String>();
        String cur = '';
        Boolean inQ = false;
        String q = '';
        for (Integer i = 0; i < s.length(); i++) {
            String c = s.substring(i, i + 1);
            if (inQ) {
                if (c == q) {
                    inQ = false;
                }
                cur += c;
            } else if (c == '"' || c == '\'') {
                inQ = true;
                q = c;
                cur += c;
            } else if (c == '|') {
                out.add(cur);
                cur = '';
            } else {
                cur += c;
            }
        }
        out.add(cur);
        return out;
    }

    private static Map<String, String> parseOptions(String s) {
        Map<String, String> out = new Map<String, String>();
        if (String.isBlank(s)) {
            return out;
        }
        Pattern p = Pattern.compile('(\\w+)\\s*=\\s*("([^"]*)"|\'([^\']*)\'|(\\S+))');
        Matcher m = p.matcher(s);
        while (m.find()) {
            String v = m.group(3) != null ? m.group(3) : (m.group(4) != null ? m.group(4) : m.group(5));
            out.put(m.group(1).toLowerCase(), v);
        }
        return out;
    }

    // ------------------------------------------------------------------ query planning

    private static void collect(Job job, List<Node> nodes, Schema.SObjectType type, ChildPlan child) {
        for (Node n : nodes) {
            if (n.kind == 'FIELD') {
                addPath(job, n.expr, type, child);
            } else if (n.kind == 'IF') {
                for (String p : conditionPaths(n.expr)) {
                    addPath(job, p, type, child);
                }
                collect(job, n.children, type, child);
                collect(job, n.elseChildren, type, child);
            } else if (n.kind == 'EACH') {
                if (child != null) {
                    warn(job, 'Nested {{#each}} blocks are not supported yet: ' + n.expr);
                    continue;
                }
                Schema.ChildRelationship cr = DocSignSchemaService.resolveChild(type, n.expr);
                if (cr == null) {
                    warn(job, 'Unknown or inaccessible related list: ' + n.expr);
                    continue;
                }
                String key = cr.getRelationshipName().toLowerCase();
                ChildPlan cp = job.children.get(key);
                if (cp == null) {
                    cp = new ChildPlan();
                    cp.relName = cr.getRelationshipName();
                    cp.childType = cr.getChildSObject();
                    job.children.put(key, cp);
                }
                n.expr = cr.getRelationshipName();
                if (n.options.containsKey('orderby')) {
                    cp.orderBy = sanitizeOrderBy(job, cp.childType, n.options.get('orderby'));
                }
                if (n.options.containsKey('limit')) {
                    try {
                        cp.limitRows = Math.min(2000, Integer.valueOf(n.options.get('limit')));
                    } catch (Exception e) {
                        warn(job, 'Invalid limit on ' + n.expr);
                    }
                }
                collect(job, n.children, cp.childType, cp);
                collect(job, n.elseChildren, type, child);
            }
        }
    }

    private static void addPath(Job job, String path, Schema.SObjectType type, ChildPlan child) {
        if (String.isBlank(path)) {
            return;
        }
        if (path.startsWith('$')) {
            if (path.toLowerCase().startsWith('$root.')) {
                addPath(job, path.substring(6), job.rootType, null);
            }
            return;
        }
        String key = String.valueOf(type) + ':' + path.toLowerCase();
        if (job.canonical.containsKey(key)) {
            return;
        }
        DocSignSchemaService.ResolvedField rf = DocSignSchemaService.resolvePath(type, path);
        if (rf == null) {
            job.canonical.put(key, null);
            warn(job, 'Field not found or not accessible: ' + path);
            return;
        }
        job.canonical.put(key, rf.canonicalPath);
        job.meta.put(String.valueOf(type) + ':' + rf.canonicalPath.toLowerCase(), rf.leaf);
        if (child == null) {
            job.rootFields.add(rf.canonicalPath);
        } else {
            child.fields.add(rf.canonicalPath);
        }
        // Multi-currency aware formatting
        if (rf.leaf.getType() == Schema.DisplayType.CURRENCY && UserInfo.isMultiCurrencyOrganization()) {
            String prefix = rf.canonicalPath.contains('.') ? rf.canonicalPath.substringBeforeLast('.') + '.' : '';
            if (DocSignSchemaService.fields(rf.leafObject).containsKey('currencyisocode')) {
                if (child == null) {
                    job.rootFields.add(prefix + 'CurrencyIsoCode');
                } else {
                    child.fields.add(prefix + 'CurrencyIsoCode');
                }
            }
        }
    }

    private static String sanitizeOrderBy(Job job, Schema.SObjectType t, String raw) {
        List<String> parts = raw.trim().split('\\s+');
        DocSignSchemaService.ResolvedField rf = DocSignSchemaService.resolvePath(t, parts[0]);
        if (rf == null || !rf.leaf.isSortable()) {
            warn(job, 'Invalid orderBy: ' + raw);
            return null;
        }
        String dir = parts.size() > 1 && parts[1].equalsIgnoreCase('DESC') ? ' DESC' : ' ASC';
        return rf.canonicalPath + dir;
    }

    private static void load(Job job) {
        List<String> selects = new List<String>(job.rootFields);
        for (ChildPlan cp : job.children.values()) {
            String sub = '(SELECT ' + String.join(new List<String>(cp.fields), ', ') + ' FROM ' + cp.relName;
            if (cp.orderBy != null) {
                sub += ' ORDER BY ' + cp.orderBy;
            }
            sub += ' LIMIT ' + cp.limitRows + ')';
            selects.add(sub);
        }
        String soql = 'SELECT ' + String.join(selects, ', ') + ' FROM ' + job.rootType.getDescribe().getName() + ' WHERE Id = :recordId LIMIT 1';
        List<SObject> rows = Database.queryWithBinds(soql, new Map<String, Object>{ 'recordId' => job.recordId }, AccessLevel.USER_MODE);
        if (rows.isEmpty()) {
            throw new DocSignException('Record not found or you do not have access to it.');
        }
        job.record = rows[0];
    }

    // ------------------------------------------------------------------ rendering

    private static void renderNodes(Job job, List<Node> nodes, SObject rec, Schema.SObjectType type, Integer index, List<String> buf) {
        for (Node n : nodes) {
            switch on n.kind {
                when 'TEXT' {
                    buf.add(n.text);
                }
                when 'FIELD' {
                    buf.add(renderField(job, n, rec, type, index));
                }
                when 'IF' {
                    if (evaluate(job, n.expr, rec, type, index)) {
                        renderNodes(job, n.children, rec, type, index, buf);
                    } else {
                        renderNodes(job, n.elseChildren, rec, type, index, buf);
                    }
                }
                when 'EACH' {
                    List<SObject> kids = null;
                    try {
                        kids = rec == null ? null : rec.getSObjects(n.expr);
                    } catch (Exception e) {
                        kids = null;
                    }
                    Schema.ChildRelationship cr = DocSignSchemaService.resolveChild(type, n.expr);
                    if (kids == null || kids.isEmpty() || cr == null) {
                        renderNodes(job, n.elseChildren, rec, type, index, buf);
                    } else {
                        for (Integer i = 0; i < kids.size(); i++) {
                            renderNodes(job, n.children, kids[i], cr.getChildSObject(), i + 1, buf);
                        }
                    }
                }
                when 'SIGN' {
                    buf.add(renderSignMarker(job, n.expr));
                }
                when 'IMAGE' {
                    String width = n.options.containsKey('width') ? n.options.get('width').replaceAll('[^0-9]', '') : '';
                    String ref = n.expr.replaceAll('[^A-Za-z0-9]', '');
                    buf.add(job.mode == OutputMode.HTML ? IMAGE_MARKER_PREFIX + ref + '|' + width + MARKER_SUFFIX : '');
                }
            }
        }
    }

    private static String renderField(Job job, Node n, SObject rec, Schema.SObjectType type, Integer index) {
        List<DocSignFormatter.Filter> filters = DocSignFormatter.parseFilters(n.filters);
        String expr = n.expr;
        Object value;
        Schema.DisplayType dtype = null;
        Integer scale = null;
        String iso = null;
        String lower = expr.toLowerCase();
        if (lower == '$pagenumber') {
            return job.mode == OutputMode.HTML ? '<span class="ds-page"></span>' : '';
        } else if (lower == '$pagecount') {
            return job.mode == OutputMode.HTML ? '<span class="ds-pages"></span>' : '';
        } else if (lower.startsWith('$')) {
            value = builtin(job, expr, index);
        } else {
            String canon = job.canonical.get(String.valueOf(type) + ':' + lower);
            if (canon == null) {
                return DocSignFormatter.format(null, null, filters, null, null);
            }
            value = valueAt(rec, canon);
            Schema.DescribeFieldResult d = job.meta.get(String.valueOf(type) + ':' + canon.toLowerCase());
            if (d != null) {
                dtype = d.getType();
                scale = d.getScale();
            }
            if (dtype == Schema.DisplayType.CURRENCY && UserInfo.isMultiCurrencyOrganization()) {
                String prefix = canon.contains('.') ? canon.substringBeforeLast('.') + '.' : '';
                Object c = valueAt(rec, prefix + 'CurrencyIsoCode');
                iso = c == null ? null : String.valueOf(c);
            }
        }
        String s = DocSignFormatter.format(value, dtype, filters, iso, scale);
        if (String.isBlank(s) && !lower.startsWith('$') && job.blankSeen.add(expr)) {
            job.blankFields.add(expr);
        }
        if (DocSignFormatter.hasFilter(filters, 'raw') || job.mode == OutputMode.TEXT) {
            return s;
        }
        String esc = DocSignFormatter.escapeXml(s);
        if (esc.contains('\n')) {
            esc = esc.replace('\r\n', '\n');
            esc = job.mode == OutputMode.HTML ? esc.replace('\n', '<br/>') : esc.replace('\n', '</w:t><w:br/><w:t xml:space="preserve">');
        }
        return esc;
    }

    private static Object builtin(Job job, String expr, Integer index) {
        String lower = expr.toLowerCase();
        if (lower == '$today') {
            return Date.today();
        }
        if (lower == '$now') {
            return Datetime.now();
        }
        if (lower == '$index') {
            return index;
        }
        if (lower == '$org.name') {
            return UserInfo.getOrganizationName();
        }
        if (lower.startsWith('$root.')) {
            String canon = job.canonical.get(String.valueOf(job.rootType) + ':' + lower.substring(6));
            return canon == null ? null : valueAt(job.record, canon);
        }
        if (lower.startsWith('$user.')) {
            if (job.currentUser == null) {
                List<User> us = [
                    SELECT Id, Name, FirstName, LastName, Email, Title, Phone, CompanyName, Department
                    FROM User WHERE Id = :UserInfo.getUserId()
                    WITH USER_MODE LIMIT 1
                ];
                job.currentUser = us.isEmpty() ? new User() : us[0];
            }
            try {
                return job.currentUser.get(expr.substring(6));
            } catch (Exception e) {
                warn(job, 'Unsupported user field: ' + expr);
                return null;
            }
        }
        warn(job, 'Unknown built-in: ' + expr);
        return null;
    }

    public static Object valueAt(SObject rec, String canonPath) {
        if (rec == null || String.isBlank(canonPath)) {
            return null;
        }
        List<String> parts = canonPath.split('\\.');
        SObject cur = rec;
        try {
            for (Integer i = 0; i < parts.size() - 1; i++) {
                cur = cur.getSObject(parts[i]);
                if (cur == null) {
                    return null;
                }
            }
            return cur.get(parts[parts.size() - 1]);
        } catch (SObjectException e) {
            return null;
        }
    }

    private static String renderSignMarker(Job job, String tag) {
        // sign:type:role[:label][:optional]
        List<String> p = tag.split(':');
        String type = p.size() > 1 ? normalizeFieldType(p[1]) : 'Signature';
        String role = p.size() > 2 ? p[2].replaceAll('[^0-9]', '') : '1';
        if (String.isBlank(role)) {
            role = '1';
        }
        String label = p.size() > 3 ? p[3].replace('|', ' ').replace(']', ' ').replace('[', ' ').trim() : '';
        Boolean optional = (p.size() > 4 && p[4].trim().equalsIgnoreCase('optional')) || (p.size() > 3 && p[p.size() - 1].trim().equalsIgnoreCase('optional'));
        if (p.size() == 4 && optional) {
            label = '';
        }
        Boolean required = !optional && type != 'Checkbox';
        if (job.mode != OutputMode.HTML) {
            return job.mode == OutputMode.TEXT ? '' : '[' + type + ' - Signer ' + role + ']';
        }
        String marker = FIELD_MARKER_PREFIX + job.fieldCounter + '|' + type + '|' + role + '|' + (required ? '1' : '0') + '|' + label + MARKER_SUFFIX;
        job.fieldCounter++;
        return marker;
    }

    public static String normalizeFieldType(String raw) {
        String t = raw == null ? '' : raw.trim().toLowerCase();
        switch on t {
            when 'sig', 'signature', 'sign' {
                return 'Signature';
            }
            when 'initial', 'initials' {
                return 'Initial';
            }
            when 'date', 'datesigned', 'date signed' {
                return 'Date Signed';
            }
            when 'name', 'fullname' {
                return 'Name';
            }
            when 'email' {
                return 'Email';
            }
            when 'text', 'input' {
                return 'Text';
            }
            when 'checkbox', 'check' {
                return 'Checkbox';
            }
            when else {
                return 'Signature';
            }
        }
    }

    // ------------------------------------------------------------------ conditions

    private static final List<String> OPERATORS = new List<String>{ '==', '!=', '>=', '<=', '>', '<', ' contains ', ' startswith ' };

    private static List<String> conditionPaths(String expr) {
        List<String> out = new List<String>();
        for (String orPart : splitLogical(expr, ' or ')) {
            for (String andPart : splitLogical(orPart, ' and ')) {
                String[] c = splitComparison(andPart);
                if (isPath(c[0])) {
                    out.add(stripNot(c[0]));
                }
                if (c[2] != null && isPath(c[2])) {
                    out.add(c[2].trim());
                }
            }
        }
        return out;
    }

    private static Boolean evaluate(Job job, String expr, SObject rec, Schema.SObjectType type, Integer index) {
        for (String orPart : splitLogical(expr, ' or ')) {
            Boolean allOk = true;
            for (String andPart : splitLogical(orPart, ' and ')) {
                if (!evaluateOne(job, andPart, rec, type, index)) {
                    allOk = false;
                    break;
                }
            }
            if (allOk) {
                return true;
            }
        }
        return false;
    }

    private static Boolean evaluateOne(Job job, String expr, SObject rec, Schema.SObjectType type, Integer index) {
        String[] c = splitComparison(expr);
        String left = c[0].trim();
        Boolean negate = left.startsWith('!') || left.toLowerCase().startsWith('not ');
        left = stripNot(left);
        Object lv = operand(job, left, rec, type, index);
        if (c[1] == null) {
            Boolean truthy = isTruthy(lv);
            return negate ? !truthy : truthy;
        }
        Object rv = operand(job, c[2].trim(), rec, type, index);
        Integer cmp = compare(lv, rv);
        switch on c[1].trim() {
            when '==' {
                return cmp == 0;
            }
            when '!=' {
                return cmp != 0;
            }
            when '>' {
                return cmp != null && cmp > 0;
            }
            when '<' {
                return cmp != null && cmp < 0;
            }
            when '>=' {
                return cmp != null && cmp >= 0;
            }
            when '<=' {
                return cmp != null && cmp <= 0;
            }
            when 'contains' {
                return lv != null && rv != null && String.valueOf(lv).toLowerCase().contains(String.valueOf(rv).toLowerCase());
            }
            when 'startswith' {
                return lv != null && rv != null && String.valueOf(lv).toLowerCase().startsWith(String.valueOf(rv).toLowerCase());
            }
        }
        return false;
    }

    private static Object operand(Job job, String token, SObject rec, Schema.SObjectType type, Integer index) {
        String t = token.trim();
        if (t.startsWith('"') || t.startsWith('\'')) {
            return DocSignFormatter.unquote(t);
        }
        String lower = t.toLowerCase();
        if (lower == 'true') {
            return true;
        }
        if (lower == 'false') {
            return false;
        }
        if (lower == 'null' || lower == 'blank') {
            return null;
        }
        if (Pattern.matches('-?\\d+(\\.\\d+)?', t)) {
            return Decimal.valueOf(t);
        }
        if (t.startsWith('$')) {
            return builtin(job, t, index);
        }
        String canon = job.canonical.get(String.valueOf(type) + ':' + lower);
        return canon == null ? null : valueAt(rec, canon);
    }

    private static Integer compare(Object a, Object b) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null || b == null) {
            String s = a == null ? String.valueOf(b) : String.valueOf(a);
            return String.isBlank(s) ? 0 : (a == null ? -1 : 1);
        }
        Decimal da = DocSignFormatter.toDecimal(a instanceof Boolean ? null : a);
        Decimal db = DocSignFormatter.toDecimal(b instanceof Boolean ? null : b);
        if (da != null && db != null && !(a instanceof Date) && !(a instanceof Datetime)) {
            return da == db ? 0 : (da > db ? 1 : -1);
        }
        if (a instanceof Date || a instanceof Datetime) {
            Date x = DocSignFormatter.toDate(a);
            Date y = DocSignFormatter.toDate(b);
            if (x != null && y != null) {
                return x == y ? 0 : (x > y ? 1 : -1);
            }
        }
        if (a instanceof Boolean || b instanceof Boolean) {
            return String.valueOf(a).equalsIgnoreCase(String.valueOf(b)) ? 0 : 1;
        }
        String sa = String.valueOf(a).toLowerCase();
        String sb = String.valueOf(b).toLowerCase();
        return sa == sb ? 0 : (sa > sb ? 1 : -1);
    }

    private static Boolean isTruthy(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean) {
            return (Boolean) v;
        }
        if (v instanceof Decimal || v instanceof Integer || v instanceof Double || v instanceof Long) {
            return DocSignFormatter.toDecimal(v) != 0;
        }
        String s = String.valueOf(v);
        return String.isNotBlank(s) && s != 'false';
    }

    private static List<String> splitLogical(String expr, String op) {
        List<String> out = new List<String>();
        String lower = expr.toLowerCase();
        Integer fromIdx = 0;
        Integer idx = lower.indexOf(op, fromIdx);
        while (idx >= 0) {
            out.add(expr.substring(fromIdx, idx));
            fromIdx = idx + op.length();
            idx = lower.indexOf(op, fromIdx);
        }
        out.add(expr.substring(fromIdx));
        return out;
    }

    private static String[] splitComparison(String expr) {
        String lower = expr.toLowerCase();
        for (String op : OPERATORS) {
            Integer idx = lower.indexOf(op);
            if (idx > 0) {
                return new String[]{ expr.substring(0, idx), op.trim(), expr.substring(idx + op.length()) };
            }
        }
        return new String[]{ expr, null, null };
    }

    private static Boolean isPath(String token) {
        String t = stripNot(token == null ? '' : token.trim());
        if (t.toLowerCase().startsWith('$root.')) {
            return true;
        }
        if (String.isBlank(t) || t.startsWith('"') || t.startsWith('\'') || t.startsWith('$')) {
            return false;
        }
        String l = t.toLowerCase();
        return l != 'true' && l != 'false' && l != 'null' && l != 'blank' && !Pattern.matches('-?\\d+(\\.\\d+)?', t);
    }

    private static String stripNot(String t) {
        String s = t.trim();
        if (s.startsWith('!')) {
            return s.substring(1).trim();
        }
        if (s.toLowerCase().startsWith('not ')) {
            return s.substring(4).trim();
        }
        return s;
    }

    private static void warn(Job job, String msg) {
        if (!job.warned.contains(msg)) {
            job.warned.add(msg);
            job.warnings.add(msg);
        }
    }
}
