/**
 * Pravadh DocSign - Template Manager endpoints.
 */
public with sharing class DocSignTemplateController {
    public class TemplateDto {
        @AuraEnabled public Id id { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String objectApiName { get; set; }
        @AuraEnabled public String objectLabel { get; set; }
        @AuraEnabled public Boolean active { get; set; }
        @AuraEnabled public String format { get; set; }
        @AuraEnabled public String body { get; set; }
        @AuraEnabled public String header { get; set; }
        @AuraEnabled public String footer { get; set; }
        @AuraEnabled public String stylesheet { get; set; }
        @AuraEnabled public String pageSize { get; set; }
        @AuraEnabled public String orientation { get; set; }
        @AuraEnabled public String outputFileName { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String category { get; set; }
        @AuraEnabled public String templateFileId { get; set; }
        @AuraEnabled public Integer version { get; set; }
        @AuraEnabled public Integer defaultExpiryDays { get; set; }
        @AuraEnabled public String signingOrder { get; set; }
        @AuraEnabled public String emailSubject { get; set; }
        @AuraEnabled public String emailMessage { get; set; }
        @AuraEnabled public String onCompleteField { get; set; }
        @AuraEnabled public String onCompleteValue { get; set; }
        @AuraEnabled public Datetime lastModified { get; set; }
        @AuraEnabled public Integer documentCount { get; set; }
    }

    public class RecordOption {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
    }

    @AuraEnabled(cacheable=true)
    public static List<DocSignSchemaService.ObjectInfo> listObjects() {
        try {
            return DocSignSchemaService.listObjects();
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<DocSignSchemaService.FieldInfo> describeObject(String objectApiName) {
        try {
            return DocSignSchemaService.describeForExplorer(objectApiName);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static List<TemplateDto> listTemplates() {
        try {
            List<TemplateDto> out = new List<TemplateDto>();
            Map<Id, Integer> counts = new Map<Id, Integer>();
            for (AggregateResult ar : [SELECT Template__c t, COUNT(Id) c FROM DocSign_Document__c WHERE Template__c != null WITH USER_MODE GROUP BY Template__c]) {
                counts.put((Id) ar.get('t'), (Integer) ar.get('c'));
            }
            for (DocSign_Template__c t : [
                SELECT Id, Name, Object_API_Name__c, Active__c, Format__c, Version__c, Description__c, Category__c, LastModifiedDate
                FROM DocSign_Template__c WITH USER_MODE ORDER BY Name LIMIT 1000
            ]) {
                TemplateDto d = shallow(t);
                d.documentCount = counts.containsKey(t.Id) ? counts.get(t.Id) : 0;
                out.add(d);
            }
            return out;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static TemplateDto getTemplate(Id templateId) {
        try {
            DocSign_Template__c t = DocSignGenerationService.loadTemplate(templateId);
            TemplateDto d = shallow(t);
            d.body = t.Body__c;
            d.header = t.Header_Html__c;
            d.footer = t.Footer_Html__c;
            d.stylesheet = t.Stylesheet__c;
            d.pageSize = t.Page_Size__c;
            d.orientation = t.Orientation__c;
            d.outputFileName = t.Output_File_Name__c;
            d.templateFileId = t.Template_File_Id__c;
            d.defaultExpiryDays = t.Default_Expiry_Days__c == null ? null : t.Default_Expiry_Days__c.intValue();
            d.signingOrder = t.Signing_Order__c;
            d.emailSubject = t.Default_Email_Subject__c;
            d.emailMessage = t.Default_Email_Message__c;
            d.onCompleteField = t.On_Complete_Field__c;
            d.onCompleteValue = t.On_Complete_Value__c;
            return d;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static Id saveTemplate(String payload) {
        try {
            TemplateDto d = (TemplateDto) JSON.deserialize(payload, TemplateDto.class);
            if (String.isBlank(d.name)) {
                throw new DocSignException('Template name is required.');
            }
            Schema.SObjectType t = DocSignSchemaService.getType(d.objectApiName);
            if (t == null || !t.getDescribe().isAccessible()) {
                throw new DocSignException('Choose a valid object for the template.');
            }
            DocSign_Template__c rec = d.id == null ? new DocSign_Template__c(Version__c = 1) : [
                SELECT Id, Version__c, Body__c, Header_Html__c, Footer_Html__c FROM DocSign_Template__c WHERE Id = :d.id WITH USER_MODE LIMIT 1
            ];
            if (d.id != null && (rec.Body__c != d.body || rec.Header_Html__c != d.header || rec.Footer_Html__c != d.footer)) {
                rec.Version__c = (rec.Version__c == null ? 1 : rec.Version__c) + 1;
            }
            rec.Name = d.name.left(80);
            rec.Object_API_Name__c = t.getDescribe().getName();
            rec.Active__c = d.active == true;
            rec.Format__c = String.isBlank(d.format) ? 'HTML' : d.format;
            rec.Body__c = d.body;
            rec.Header_Html__c = d.header;
            rec.Footer_Html__c = d.footer;
            rec.Stylesheet__c = d.stylesheet;
            rec.Page_Size__c = String.isBlank(d.pageSize) ? 'A4' : d.pageSize;
            rec.Orientation__c = String.isBlank(d.orientation) ? 'Portrait' : d.orientation;
            rec.Output_File_Name__c = d.outputFileName;
            rec.Description__c = d.description;
            rec.Category__c = d.category;
            rec.Default_Expiry_Days__c = d.defaultExpiryDays;
            rec.Signing_Order__c = String.isBlank(d.signingOrder) ? 'Sequential' : d.signingOrder;
            rec.Default_Email_Subject__c = d.emailSubject;
            rec.Default_Email_Message__c = d.emailMessage;
            rec.On_Complete_Field__c = d.onCompleteField;
            rec.On_Complete_Value__c = d.onCompleteValue;
            if (String.isNotBlank(d.onCompleteField)) {
                DocSignSchemaService.ResolvedField rf = DocSignSchemaService.resolvePath(t, d.onCompleteField);
                if (rf == null || d.onCompleteField.contains('.') || !rf.leaf.isUpdateable()) {
                    throw new DocSignException('On Complete field must be an updateable field on ' + rec.Object_API_Name__c + '.');
                }
            }
            upsert as user rec;
            return rec.Id;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static Id cloneTemplate(Id templateId) {
        try {
            DocSign_Template__c src = DocSignGenerationService.loadTemplate(templateId);
            DocSign_Template__c c = src.clone(false, true, false, false);
            c.Name = ('Copy of ' + src.Name).left(80);
            c.Active__c = false;
            c.Version__c = 1;
            insert as user c;
            return c.Id;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static List<RecordOption> searchRecords(String objectApiName, String term) {
        try {
            Schema.SObjectType t = DocSignSchemaService.getType(objectApiName);
            if (t == null) {
                throw new DocSignException('Unknown object: ' + objectApiName);
            }
            String nameField = DocSignSchemaService.nameField(t);
            String soql = 'SELECT Id, ' + (nameField == 'Id' ? '' : nameField + ', ') + 'CreatedDate FROM ' + t.getDescribe().getName();
            Map<String, Object> binds = new Map<String, Object>();
            String q = term == null ? '' : term.trim();
            if (q.length() == 15 || q.length() == 18) {
                try {
                    binds.put('rid', Id.valueOf(q));
                    soql += ' WHERE Id = :rid';
                } catch (Exception ignore) {
                    binds.clear();
                }
            }
            if (binds.isEmpty() && String.isNotBlank(q) && nameField != 'Id' && DocSignSchemaService.fields(t).get(nameField.toLowerCase()).isFilterable()) {
                binds.put('term', '%' + q + '%');
                soql += ' WHERE ' + nameField + ' LIKE :term';
            }
            soql += ' ORDER BY CreatedDate DESC LIMIT 20';
            List<RecordOption> out = new List<RecordOption>();
            for (SObject s : Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE)) {
                RecordOption o = new RecordOption();
                o.id = s.Id;
                o.name = nameField == 'Id' ? String.valueOf(s.Id) : String.valueOf(s.get(nameField));
                out.add(o);
            }
            return out;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    /**
     * Renders the saved template against a real record as a PDF - exactly what Generate produces -
     * and stores it as a new version of the template's preview file (no document record is created).
     */
    @AuraEnabled
    public static DocSignGenerationService.PreviewResult previewPdf(Id templateId, Id recordId) {
        try {
            DocSign_Template__c t = DocSignGenerationService.loadTemplate(templateId);
            DocSignGenerationService.PreviewResult r = DocSignGenerationService.preview(t, recordId);
            Blob pdf = DocSignRenderService.toPdf(r.html);
            r.html = null;
            ContentVersion cv = new ContentVersion(
                Title = ('Preview - ' + t.Name).left(255),
                PathOnClient = DocSignFileService.sanitize('Preview - ' + t.Name) + '.pdf',
                VersionData = pdf,
                Description = 'Pravadh DocSign template preview'
            );
            List<DocSign_Template__c> cur = [SELECT Preview_File_Id__c FROM DocSign_Template__c WHERE Id = :templateId WITH USER_MODE LIMIT 1];
            String existing = cur.isEmpty() ? null : cur[0].Preview_File_Id__c;
            if (String.isNotBlank(existing) && [SELECT COUNT() FROM ContentDocument WHERE Id = :existing WITH USER_MODE] > 0) {
                cv.ContentDocumentId = existing;
            } else {
                cv.FirstPublishLocationId = templateId;
            }
            insert as user cv;
            Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id WITH USER_MODE LIMIT 1].ContentDocumentId;
            if (docId != existing) {
                update as user new DocSign_Template__c(Id = templateId, Preview_File_Id__c = docId);
            }
            r.contentDocumentId = docId;
            return r;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    /** Starter content generated from the object's own metadata (no hardcoded objects). */
    @AuraEnabled(cacheable=true)
    public static String starterBody(String objectApiName) {
        try {
            Schema.SObjectType t = DocSignSchemaService.getType(objectApiName);
            if (t == null) {
                throw new DocSignException('Unknown object: ' + objectApiName);
            }
            Schema.DescribeSObjectResult d = t.getDescribe();
            String nameField = DocSignSchemaService.nameField(t);
            List<String> rows = new List<String>();
            Integer n = 0;
            for (Schema.DescribeFieldResult f : DocSignSchemaService.fields(t).values()) {
                if (n >= 6 || !f.isAccessible() || f.isNameField() || !f.isCustom() && !f.isUpdateable()) {
                    continue;
                }
                Schema.DisplayType ft = f.getType();
                if (ft == Schema.DisplayType.STRING || ft == Schema.DisplayType.PICKLIST || ft == Schema.DisplayType.CURRENCY || ft == Schema.DisplayType.DATE
                    || ft == Schema.DisplayType.DOUBLE || ft == Schema.DisplayType.EMAIL || ft == Schema.DisplayType.PHONE) {
                    String filter = ft == Schema.DisplayType.CURRENCY ? ' | currency' : (ft == Schema.DisplayType.DATE ? ' | date:"d MMMM yyyy"' : '');
                    rows.add('<tr><th style="width:35%">' + DocSignFormatter.escapeXml(f.getLabel()) + '</th><td>{{' + f.getName() + filter + '}}</td></tr>');
                    n++;
                }
            }
            return '<h1>' + DocSignFormatter.escapeXml(d.getLabel()) + ': {{' + nameField + '}}</h1>\n'
                + '<p>Date: {{$Today | date:"d MMMM yyyy"}}</p>\n'
                + '<table>\n' + String.join(rows, '\n') + '\n</table>\n'
                + '<h2>Agreement</h2>\n<p>This document was prepared by {{$User.Name}} of {{$Org.Name}}.</p>\n'
                + '<table style="margin-top:36px"><tr>\n'
                + '<td style="border:none;width:50%">{{sign:signature:1}}<br/>{{sign:name:1}}<br/>{{sign:date:1}}</td>\n'
                + '<td style="border:none;width:50%">{{sign:signature:2}}<br/>{{sign:name:2}}<br/>{{sign:date:2}}</td>\n'
                + '</tr></table>';
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    private static TemplateDto shallow(DocSign_Template__c t) {
        TemplateDto d = new TemplateDto();
        d.id = t.Id;
        d.name = t.Name;
        d.objectApiName = t.Object_API_Name__c;
        Schema.SObjectType st = DocSignSchemaService.getType(t.Object_API_Name__c);
        d.objectLabel = st == null ? t.Object_API_Name__c + ' (missing)' : st.getDescribe(SObjectDescribeOptions.DEFERRED).getLabel();
        d.active = t.Active__c;
        d.format = t.Format__c;
        d.version = t.Version__c == null ? 1 : t.Version__c.intValue();
        d.description = t.Description__c;
        d.category = t.Category__c;
        d.lastModified = t.LastModifiedDate;
        return d;
    }
}
