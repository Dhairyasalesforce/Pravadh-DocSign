/**
 * Pravadh DocSign - dynamic, metadata-driven schema discovery.
 * No object or field names are hardcoded: every object, field, parent and child
 * relationship is resolved at runtime through the Schema describe APIs.
 */
public with sharing class DocSignSchemaService {
    private static Map<String, Schema.SObjectType> globalDescribe;
    private static Map<String, Map<String, Schema.DescribeFieldResult>> fieldCache = new Map<String, Map<String, Schema.DescribeFieldResult>>();
    private static Map<String, Map<String, Schema.DescribeFieldResult>> relCache = new Map<String, Map<String, Schema.DescribeFieldResult>>();
    private static Map<String, Map<String, Schema.ChildRelationship>> childCache = new Map<String, Map<String, Schema.ChildRelationship>>();
    private static String nsPrefix;

    /** A path resolved against the schema, e.g. "Account.Owner.Name". */
    public class ResolvedField {
        public String canonicalPath;
        public Schema.DescribeFieldResult leaf;
        public Schema.SObjectType leafObject;
    }

    public class ObjectInfo {
        @AuraEnabled public String apiName;
        @AuraEnabled public String label;
        @AuraEnabled public Boolean isCustom;
    }

    public class FieldInfo {
        @AuraEnabled public String apiName;
        @AuraEnabled public String label;
        @AuraEnabled public String type;
        @AuraEnabled public String relationshipName;
        @AuraEnabled public String referenceTo;
        @AuraEnabled public String childObject;
        @AuraEnabled public String kind; // field | parent | child
    }

    /** Namespace prefix of this package ('' when unmanaged). */
    public static String namespace() {
        if (nsPrefix == null) {
            String n = DocSign_Envelope__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getName();
            nsPrefix = n.countMatches('__') > 1 ? n.substringBefore('__') : '';
        }
        return nsPrefix;
    }

    public static String nsPage(String pageName) {
        return String.isBlank(namespace()) ? pageName : namespace() + '__' + pageName;
    }

    public static Schema.SObjectType getType(String apiName) {
        if (String.isBlank(apiName)) {
            return null;
        }
        if (globalDescribe == null) {
            globalDescribe = Schema.getGlobalDescribe();
        }
        return globalDescribe.get(apiName.trim().toLowerCase());
    }

    public static Schema.SObjectType typeOf(Id recordId) {
        return recordId == null ? null : recordId.getSObjectType();
    }

    /** All objects the current user can query that are meaningful document sources. */
    public static List<ObjectInfo> listObjects() {
        if (globalDescribe == null) {
            globalDescribe = Schema.getGlobalDescribe();
        }
        List<ObjectInfo> result = new List<ObjectInfo>();
        for (Schema.SObjectType t : globalDescribe.values()) {
            Schema.DescribeSObjectResult d = t.getDescribe(SObjectDescribeOptions.DEFERRED);
            String n = d.getName();
            if (!d.isAccessible() || !d.isQueryable() || d.isCustomSetting() || !d.isSearchable() && !d.isCustom()) {
                continue;
            }
            if (n.endsWith('__mdt') || n.endsWith('__e') || n.endsWith('__x') || n.endsWith('Share') || n.endsWith('History')
                || n.endsWith('Feed') || n.endsWith('ChangeEvent') || n.endsWith('__b') || n.endsWith('Tag')) {
                continue;
            }
            ObjectInfo o = new ObjectInfo();
            o.apiName = n;
            o.label = d.getLabel();
            o.isCustom = d.isCustom();
            result.add(o);
        }
        return result;
    }

    public static Map<String, Schema.DescribeFieldResult> fields(Schema.SObjectType t) {
        String key = String.valueOf(t);
        if (!fieldCache.containsKey(key)) {
            Map<String, Schema.DescribeFieldResult> m = new Map<String, Schema.DescribeFieldResult>();
            Map<String, Schema.DescribeFieldResult> rels = new Map<String, Schema.DescribeFieldResult>();
            for (Schema.SObjectField f : t.getDescribe().fields.getMap().values()) {
                Schema.DescribeFieldResult d = f.getDescribe();
                m.put(d.getName().toLowerCase(), d);
                if (d.getType() == Schema.DisplayType.REFERENCE && String.isNotBlank(d.getRelationshipName())) {
                    rels.put(d.getRelationshipName().toLowerCase(), d);
                }
            }
            fieldCache.put(key, m);
            relCache.put(key, rels);
        }
        return fieldCache.get(key);
    }

    private static Map<String, Schema.DescribeFieldResult> relationships(Schema.SObjectType t) {
        fields(t);
        return relCache.get(String.valueOf(t));
    }

    public static Map<String, Schema.ChildRelationship> childRelationships(Schema.SObjectType t) {
        String key = String.valueOf(t);
        if (!childCache.containsKey(key)) {
            Map<String, Schema.ChildRelationship> m = new Map<String, Schema.ChildRelationship>();
            for (Schema.ChildRelationship cr : t.getDescribe().getChildRelationships()) {
                if (String.isNotBlank(cr.getRelationshipName())) {
                    m.put(cr.getRelationshipName().toLowerCase(), cr);
                }
            }
            childCache.put(key, m);
        }
        return childCache.get(key);
    }

    public static Schema.ChildRelationship resolveChild(Schema.SObjectType parent, String relName) {
        if (parent == null || String.isBlank(relName)) {
            return null;
        }
        Schema.ChildRelationship cr = childRelationships(parent).get(relName.trim().toLowerCase());
        if (cr == null || !cr.getChildSObject().getDescribe().isAccessible()) {
            return null;
        }
        return cr;
    }

    /**
     * Resolves a merge path against an object. Returns null when the path does not exist
     * or is not readable by the running user (CRUD/FLS enforced at every hop).
     */
    public static ResolvedField resolvePath(Schema.SObjectType root, String path) {
        if (root == null || String.isBlank(path)) {
            return null;
        }
        List<String> parts = path.trim().split('\\.');
        // Allow {{Opportunity.Amount}} on an Opportunity template: a leading segment equal
        // to the root object name (and not a relationship) is ignored.
        if (parts.size() > 1) {
            String rootName = root.getDescribe().getName().toLowerCase();
            String localName = rootName.countMatches('__') > 1 ? rootName.substringAfter('__') : rootName;
            String first = parts[0].toLowerCase();
            if ((first == rootName || first == localName) && !relationships(root).containsKey(first)) {
                parts.remove(0);
            }
        }
        Schema.SObjectType cur = root;
        List<String> canon = new List<String>();
        for (Integer i = 0; i < parts.size() - 1; i++) {
            Schema.DescribeFieldResult rel = relationships(cur).get(parts[i].toLowerCase());
            if (rel == null || !rel.isAccessible() || rel.getReferenceTo().isEmpty()) {
                return null;
            }
            canon.add(rel.getRelationshipName());
            cur = rel.getReferenceTo()[0];
            if (!cur.getDescribe().isAccessible()) {
                return null;
            }
        }
        Schema.DescribeFieldResult leaf = fields(cur).get(parts[parts.size() - 1].toLowerCase());
        if (leaf == null || !leaf.isAccessible()) {
            return null;
        }
        canon.add(leaf.getName());
        ResolvedField rf = new ResolvedField();
        rf.canonicalPath = String.join(canon, '.');
        rf.leaf = leaf;
        rf.leafObject = cur;
        return rf;
    }

    /** Field explorer data for the template builder. */
    public static List<FieldInfo> describeForExplorer(String objectApiName) {
        Schema.SObjectType t = getType(objectApiName);
        if (t == null || !t.getDescribe().isAccessible()) {
            throw new DocSignException('Object not found or not accessible: ' + objectApiName);
        }
        List<FieldInfo> out = new List<FieldInfo>();
        for (Schema.DescribeFieldResult d : fields(t).values()) {
            if (!d.isAccessible()) {
                continue;
            }
            FieldInfo fi = new FieldInfo();
            fi.apiName = d.getName();
            fi.label = d.getLabel();
            fi.type = String.valueOf(d.getType());
            fi.kind = 'field';
            out.add(fi);
            if (d.getType() == Schema.DisplayType.REFERENCE && String.isNotBlank(d.getRelationshipName()) && !d.getReferenceTo().isEmpty()) {
                FieldInfo p = new FieldInfo();
                p.apiName = d.getRelationshipName();
                p.relationshipName = d.getRelationshipName();
                p.label = d.getLabel() + ' (' + d.getReferenceTo()[0].getDescribe().getLabel() + ')';
                p.referenceTo = d.getReferenceTo()[0].getDescribe().getName();
                p.type = 'PARENT';
                p.kind = 'parent';
                out.add(p);
            }
        }
        for (Schema.ChildRelationship cr : childRelationships(t).values()) {
            Schema.DescribeSObjectResult cd = cr.getChildSObject().getDescribe(SObjectDescribeOptions.DEFERRED);
            if (!cd.isAccessible() || !cd.isQueryable()) {
                continue;
            }
            FieldInfo c = new FieldInfo();
            c.apiName = cr.getRelationshipName();
            c.relationshipName = cr.getRelationshipName();
            c.childObject = cd.getName();
            c.label = cd.getLabelPlural() + ' (' + cr.getRelationshipName() + ')';
            c.type = 'CHILD';
            c.kind = 'child';
            out.add(c);
        }
        return out;
    }

    public static String nameField(Schema.SObjectType t) {
        for (Schema.DescribeFieldResult d : fields(t).values()) {
            if (d.isNameField()) {
                return d.getName();
            }
        }
        return 'Id';
    }
}
