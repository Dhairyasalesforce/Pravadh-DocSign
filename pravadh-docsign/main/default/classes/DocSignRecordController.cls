/**
 * Pravadh DocSign - record page component endpoints. Works on ANY object's record page.
 */
public with sharing class DocSignRecordController {
    public class TemplateOption {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String format;
        @AuraEnabled public String description;
        @AuraEnabled public String category;
    }

    public class DocumentRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String title;
        @AuraEnabled public String status;
        @AuraEnabled public String format;
        @AuraEnabled public Integer version;
        @AuraEnabled public Datetime createdDate;
        @AuraEnabled public String createdBy;
        @AuraEnabled public Id contentDocumentId;
        @AuraEnabled public Id signedDocumentId;
        @AuraEnabled public Id envelopeId;
        @AuraEnabled public String envelopeStatus;
        @AuraEnabled public String envelopeNumber;
        @AuraEnabled public Boolean canSend;
        @AuraEnabled public Boolean isDraft;
        @AuraEnabled public String sourceType;
    }

    public class Context {
        @AuraEnabled public String objectApiName;
        @AuraEnabled public String objectLabel;
        @AuraEnabled public List<TemplateOption> templates = new List<TemplateOption>();
        @AuraEnabled public List<DocumentRow> documents = new List<DocumentRow>();
        @AuraEnabled public Boolean siteConfigured;
        @AuraEnabled public Integer finishing = 0;
    }

    public class Suggestion {
        @AuraEnabled public String name;
        @AuraEnabled public String email;
        @AuraEnabled public String source;
    }

    public class SendDefaults {
        @AuraEnabled public Integer requiredSigners;
        @AuraEnabled public String signingOrder;
        @AuraEnabled public String emailSubject;
        @AuraEnabled public String emailMessage;
        @AuraEnabled public Integer expiryDays;
        @AuraEnabled public List<Suggestion> suggestions = new List<Suggestion>();
        @AuraEnabled public String title;
        @AuraEnabled public List<String> roleHints = new List<String>();
        /** Per signer (1..n): which fields they complete and on which pages. */
        @AuraEnabled public List<String> roleSummaries = new List<String>();
    }

    @AuraEnabled
    public static Context getContext(Id recordId) {
        try {
            Schema.SObjectType t = recordId.getSObjectType();
            Context c = new Context();
            c.objectApiName = t.getDescribe().getName();
            c.objectLabel = t.getDescribe().getLabel();
            c.siteConfigured = DocSignEmailService.usesSite();
            String objectName = c.objectApiName;
            for (DocSign_Template__c tpl : [
                SELECT Id, Name, Format__c, Description__c, Category__c FROM DocSign_Template__c
                WHERE Object_API_Name__c = :objectName AND Active__c = TRUE WITH USER_MODE ORDER BY Name LIMIT 200
            ]) {
                TemplateOption o = new TemplateOption();
                o.id = tpl.Id;
                o.name = tpl.Name;
                o.format = tpl.Format__c;
                o.description = tpl.Description__c;
                o.category = tpl.Category__c;
                c.templates.add(o);
            }
            try {
                // Everyone signed but the signed PDF is still missing: retry it as this user.
                c.finishing = DocSignCompletionService.resumePending(recordId);
            } catch (Exception retryError) {
                c.finishing = 0;
            }
            c.documents = documentsFor(recordId);
            return c;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    public static List<DocumentRow> documentsFor(Id recordId) {
        String rid = String.valueOf(recordId);
        List<DocSign_Document__c> docs = [
            SELECT Id, Name, Title__c, Status__c, Format__c, Version_Number__c, CreatedDate, CreatedBy.Name, Content_Document_Id__c, Signed_Version_Id__c, Source_Type__c,
                (SELECT Id, Name, Status__c FROM Envelopes__r ORDER BY CreatedDate DESC LIMIT 1)
            FROM DocSign_Document__c
            WHERE Record_Id__c = :rid
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 50
        ];
        Set<Id> signedVersions = new Set<Id>();
        for (DocSign_Document__c d : docs) {
            if (d.Signed_Version_Id__c != null) {
                signedVersions.add(d.Signed_Version_Id__c);
            }
        }
        Map<Id, Id> signedDocIds = new Map<Id, Id>();
        if (!signedVersions.isEmpty()) {
            for (ContentVersion cv : [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id IN :signedVersions WITH USER_MODE]) {
                signedDocIds.put(cv.Id, cv.ContentDocumentId);
            }
        }
        List<DocumentRow> out = new List<DocumentRow>();
        for (DocSign_Document__c d : docs) {
            DocumentRow r = new DocumentRow();
            r.id = d.Id;
            r.name = d.Name;
            r.title = d.Title__c;
            r.status = d.Status__c;
            r.format = d.Format__c;
            r.version = d.Version_Number__c == null ? 1 : d.Version_Number__c.intValue();
            r.createdDate = d.CreatedDate;
            r.createdBy = d.CreatedBy.Name;
            r.contentDocumentId = d.Content_Document_Id__c;
            r.signedDocumentId = d.Signed_Version_Id__c == null ? null : signedDocIds.get(d.Signed_Version_Id__c);
            if (!d.Envelopes__r.isEmpty()) {
                r.envelopeId = d.Envelopes__r[0].Id;
                r.envelopeStatus = d.Envelopes__r[0].Status__c;
                r.envelopeNumber = d.Envelopes__r[0].Name;
            }
            r.isDraft = d.Status__c == 'Draft';
            r.sourceType = d.Source_Type__c;
            r.canSend = !r.isDraft && d.Format__c == 'PDF' && (r.envelopeStatus == null || r.envelopeStatus == 'Cancelled' || r.envelopeStatus == 'Expired' || r.envelopeStatus == 'Declined');
            out.add(r);
        }
        return out;
    }

    @AuraEnabled
    public static DocSignGenerationService.GenerateResult generate(Id templateId, Id recordId) {
        try {
            DocSignGenerationService.GenerateRequest g = new DocSignGenerationService.GenerateRequest();
            g.templateId = templateId;
            g.recordId = recordId;
            return DocSignGenerationService.generate(g);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static SendDefaults getSendDefaults(Id documentId) {
        try {
            DocSign_Document__c doc = [
                SELECT Id, Title__c, Record_Id__c, Template__c, Merged_Html__c, Merged_Html_2__c, Merged_Html_3__c, Layout_Json__c
                FROM DocSign_Document__c WHERE Id = :documentId WITH USER_MODE LIMIT 1
            ];
            SendDefaults sd = new SendDefaults();
            sd.title = doc.Title__c;
            List<DocSignRenderService.FieldSpec> specs = DocSignRenderService.parseFields(DocSignRenderService.readHtml(doc));
            sd.requiredSigners = DocSignGenerationService.maxRole(specs);
            sd.expiryDays = DocSignEnvelopeService.defaultExpiry();
            sd.signingOrder = 'Sequential';
            if (doc.Template__c != null) {
                List<DocSign_Template__c> ts = [
                    SELECT Signing_Order__c, Default_Email_Subject__c, Default_Email_Message__c, Default_Expiry_Days__c
                    FROM DocSign_Template__c WHERE Id = :doc.Template__c WITH USER_MODE LIMIT 1
                ];
                if (!ts.isEmpty()) {
                    sd.signingOrder = ts[0].Signing_Order__c == null ? 'Sequential' : ts[0].Signing_Order__c;
                    sd.emailSubject = ts[0].Default_Email_Subject__c;
                    sd.emailMessage = ts[0].Default_Email_Message__c;
                    if (ts[0].Default_Expiry_Days__c != null) {
                        sd.expiryDays = ts[0].Default_Expiry_Days__c.intValue();
                    }
                }
            }
            if (String.isNotBlank(doc.Record_Id__c)) {
                sd.suggestions = suggestSigners(Id.valueOf(doc.Record_Id__c));
            }
            if (String.isNotBlank(doc.Layout_Json__c)) {
                Object roles = ((Map<String, Object>) JSON.deserializeUntyped(doc.Layout_Json__c)).get('roles');
                if (roles instanceof List<Object>) {
                    for (Object o : (List<Object>) roles) {
                        Object lbl = ((Map<String, Object>) o).get('label');
                        sd.roleHints.add(lbl == null ? '' : String.valueOf(lbl));
                    }
                }
            }
            sd.roleSummaries = roleSummaries(specs, doc.Layout_Json__c, sd.requiredSigners);
            return sd;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    /** e.g. "6 fields: Signature, Date Signed, Address, Email · pages 11, 16" for each signer. */
    public static List<String> roleSummaries(List<DocSignRenderService.FieldSpec> specs, String layoutJson, Integer roles) {
        Map<Integer, List<String>> types = new Map<Integer, List<String>>();
        Map<Integer, Integer> counts = new Map<Integer, Integer>();
        for (DocSignRenderService.FieldSpec f : specs) {
            Integer r = f.role == null ? 1 : f.role;
            if (!types.containsKey(r)) {
                types.put(r, new List<String>());
                counts.put(r, 0);
            }
            counts.put(r, counts.get(r) + 1);
            if (!types.get(r).contains(f.type)) {
                types.get(r).add(f.type);
            }
        }
        Map<Integer, List<Integer>> pages = new Map<Integer, List<Integer>>();
        if (String.isNotBlank(layoutJson)) {
            Object fields = ((Map<String, Object>) JSON.deserializeUntyped(layoutJson)).get('fields');
            if (fields instanceof List<Object>) {
                for (Object o : (List<Object>) fields) {
                    Map<String, Object> m = (Map<String, Object>) o;
                    Integer r = m.get('role') == null ? 0 : Integer.valueOf(m.get('role'));
                    Integer pg = m.get('page') == null ? null : Integer.valueOf(m.get('page'));
                    if (r > 0 && pg != null) {
                        if (!pages.containsKey(r)) {
                            pages.put(r, new List<Integer>());
                        }
                        if (!pages.get(r).contains(pg)) {
                            pages.get(r).add(pg);
                        }
                    }
                }
            }
        }
        List<String> out = new List<String>();
        for (Integer r = 1; r <= roles; r++) {
            if (!types.containsKey(r)) {
                out.add('no fields in the document yet, so a signature block is added at the end.');
                continue;
            }
            String line = counts.get(r) + (counts.get(r) == 1 ? ' field to complete (' : ' fields to complete (') + String.join(types.get(r), ', ') + ')';
            if (pages.containsKey(r)) {
                List<Integer> ps = pages.get(r);
                ps.sort();
                List<String> labels = new List<String>();
                for (Integer pg : ps) {
                    labels.add(String.valueOf(pg));
                }
                line += (ps.size() == 1 ? ' · page ' : ' · pages ') + String.join(labels, ', ');
            }
            out.add(line);
        }
        return out;
    }

    /**
     * Metadata-driven signer suggestions: email fields on the record itself and on up to
     * 8 directly related (lookup) records that expose an email field. No objects are hardcoded.
     */
    public static List<Suggestion> suggestSigners(Id recordId) {
        List<Suggestion> out = new List<Suggestion>();
        Schema.SObjectType t = recordId.getSObjectType();
        Map<String, Schema.DescribeFieldResult> fields = DocSignSchemaService.fields(t);
        List<String> selects = new List<String>{ 'Id' };
        List<String[]> emailPaths = new List<String[]>();
        String rootName = DocSignSchemaService.nameField(t);
        if (rootName != 'Id') {
            selects.add(rootName);
        }
        Integer parents = 0;
        for (Schema.DescribeFieldResult f : fields.values()) {
            if (!f.isAccessible()) {
                continue;
            }
            if (f.getType() == Schema.DisplayType.EMAIL) {
                selects.add(f.getName());
                emailPaths.add(new String[]{ f.getName(), rootName, f.getLabel() });
            } else if (f.getType() == Schema.DisplayType.REFERENCE && parents < 8 && f.getReferenceTo().size() == 1 && String.isNotBlank(f.getRelationshipName())) {
                Schema.SObjectType p = f.getReferenceTo()[0];
                if (!p.getDescribe(SObjectDescribeOptions.DEFERRED).isAccessible()) {
                    continue;
                }
                Map<String, Schema.DescribeFieldResult> pf = DocSignSchemaService.fields(p);
                String pName = DocSignSchemaService.nameField(p);
                for (Schema.DescribeFieldResult ef : pf.values()) {
                    if (ef.getType() == Schema.DisplayType.EMAIL && ef.isAccessible() && pName != 'Id') {
                        String rel = f.getRelationshipName();
                        selects.add(rel + '.' + ef.getName());
                        selects.add(rel + '.' + pName);
                        emailPaths.add(new String[]{ rel + '.' + ef.getName(), rel + '.' + pName, f.getLabel() });
                        parents++;
                        break;
                    }
                }
            }
        }
        List<SObject> rows = Database.queryWithBinds(
            'SELECT ' + String.join(new List<String>(new Set<String>(selects)), ', ') + ' FROM ' + t.getDescribe().getName() + ' WHERE Id = :rid LIMIT 1',
            new Map<String, Object>{ 'rid' => recordId },
            AccessLevel.USER_MODE
        );
        Set<String> seen = new Set<String>();
        if (!rows.isEmpty()) {
            for (String[] p : emailPaths) {
                Object email = DocSignMergeEngine.valueAt(rows[0], p[0]);
                Object nm = DocSignMergeEngine.valueAt(rows[0], p[1]);
                if (email != null && seen.add(String.valueOf(email).toLowerCase())) {
                    Suggestion s = new Suggestion();
                    s.email = String.valueOf(email);
                    s.name = nm == null ? s.email : String.valueOf(nm);
                    s.source = p[2];
                    out.add(s);
                }
            }
        }
        if (seen.add(UserInfo.getUserEmail().toLowerCase())) {
            Suggestion me = new Suggestion();
            me.name = UserInfo.getName();
            me.email = UserInfo.getUserEmail();
            me.source = 'Me';
            out.add(me);
        }
        return out;
    }

    @AuraEnabled
    public static DocSignEnvelopeService.SendResult send(String payload) {
        try {
            DocSignEnvelopeService.SendRequest req = (DocSignEnvelopeService.SendRequest) JSON.deserialize(payload, DocSignEnvelopeService.SendRequest.class);
            return DocSignEnvelopeService.createAndSend(req);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }
}
