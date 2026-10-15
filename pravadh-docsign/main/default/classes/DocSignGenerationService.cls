/**
 * Pravadh DocSign - document generation: Object + Record + Template (+ related data) -> Document.
 */
public with sharing class DocSignGenerationService {
    public class GenerateRequest {
        public Id templateId;
        public Id recordId;
        public String fileName;
        public Boolean allowInactive = false;
    }

    public class GenerateResult {
        @AuraEnabled public Id documentId;
        @AuraEnabled public Id contentVersionId;
        @AuraEnabled public Id contentDocumentId;
        @AuraEnabled public String documentUrl;
        @AuraEnabled public String fileName;
        @AuraEnabled public String format;
        @AuraEnabled public Integer signatureFieldCount;
        @AuraEnabled public Integer signerRoles;
        @AuraEnabled public List<String> warnings;
    }

    public class PreviewResult {
        @AuraEnabled public String html;
        @AuraEnabled public List<String> warnings;
        @AuraEnabled public Integer signatureFieldCount;
        @AuraEnabled public Integer signerRoles;
        @AuraEnabled public Id contentDocumentId;
        @AuraEnabled public List<String> blankFields = new List<String>();
    }

    public static DocSign_Template__c loadTemplate(Id templateId) {
        List<DocSign_Template__c> ts = [
            SELECT Id, Name, Object_API_Name__c, Active__c, Format__c, Body__c, Header_Html__c, Footer_Html__c, Stylesheet__c,
                Page_Size__c, Orientation__c, Output_File_Name__c, Template_File_Id__c, Version__c, Default_Expiry_Days__c,
                Signing_Order__c, Default_Email_Subject__c, Default_Email_Message__c, On_Complete_Field__c, On_Complete_Value__c,
                Description__c, Category__c, LastModifiedDate
            FROM DocSign_Template__c
            WHERE Id = :templateId
            WITH USER_MODE
            LIMIT 1
        ];
        if (ts.isEmpty()) {
            throw new DocSignException('Template not found or you do not have access to it.');
        }
        return ts[0];
    }

    public static void assertCompatible(DocSign_Template__c t, Id recordId) {
        Schema.SObjectType expected = DocSignSchemaService.getType(t.Object_API_Name__c);
        if (expected == null) {
            throw new DocSignException('Template object "' + t.Object_API_Name__c + '" does not exist in this org.');
        }
        if (recordId.getSObjectType() != expected) {
            throw new DocSignException('Template "' + t.Name + '" is for ' + expected.getDescribe().getLabel() + ' records.');
        }
    }

    /** Merge + compose without saving anything (template preview / test with a real record). */
    public static PreviewResult preview(DocSign_Template__c t, Id recordId) {
        assertCompatible(t, recordId);
        DocSignMergeEngine.Job job = new DocSignMergeEngine.Job();
        Map<String, String> merged = DocSignMergeEngine.mergeParts(recordId, parts(t), DocSignMergeEngine.OutputMode.HTML, job);
        String html = DocSignRenderService.composeDocument(merged.get('body'), merged.get('header'), merged.get('footer'), t.Stylesheet__c, t.Page_Size__c, t.Orientation__c, t.Name);
        List<DocSignRenderService.FieldSpec> specs = DocSignRenderService.parseFields(html);
        html = DocSignRenderService.renderFields(html, DocSignRenderService.FieldMode.PLACEHOLDER, null, null);
        PreviewResult r = new PreviewResult();
        r.html = DocSignRenderService.resolveImagesForPdf(html, false);
        r.warnings = job.warnings;
        r.blankFields = job.blankFields;
        r.signatureFieldCount = specs.size();
        r.signerRoles = maxRole(specs);
        return r;
    }

    public static GenerateResult generate(GenerateRequest req) {
        if (req == null || req.templateId == null || req.recordId == null) {
            throw new DocSignException('A template and a record are required.');
        }
        DocSign_Template__c t = loadTemplate(req.templateId);
        if (!t.Active__c && req.allowInactive != true) {
            throw new DocSignException('Template "' + t.Name + '" is not active.');
        }
        assertCompatible(t, req.recordId);
        Schema.SObjectType rootType = req.recordId.getSObjectType();
        String nameField = DocSignSchemaService.nameField(rootType);

        DocSignMergeEngine.Job job = new DocSignMergeEngine.Job();
        job.extraPaths.add(nameField);
        GenerateResult res = new GenerateResult();
        DocSign_Document__c doc = new DocSign_Document__c(
            Template__c = t.Id,
            Template_Version__c = t.Version__c,
            Object_API_Name__c = rootType.getDescribe().getName(),
            Record_Id__c = req.recordId,
            Status__c = 'Generated',
            Page_Size__c = t.Page_Size__c,
            Orientation__c = t.Orientation__c
        );
        Blob output;
        String extension;
        List<DocSignRenderService.FieldSpec> specs = new List<DocSignRenderService.FieldSpec>();
        String fileTitle;

        if (t.Format__c == 'DOCX') {
            if (String.isBlank(t.Template_File_Id__c)) {
                throw new DocSignException('Upload a .docx file to template "' + t.Name + '" first.');
            }
            List<ContentVersion> src = [
                SELECT VersionData FROM ContentVersion
                WHERE ContentDocumentId = :t.Template_File_Id__c AND IsLatest = true
                WITH USER_MODE LIMIT 1
            ];
            if (src.isEmpty()) {
                throw new DocSignException('The template .docx file is not accessible.');
            }
            output = DocSignDocxRenderer.render(src[0].VersionData, req.recordId, job);
            fileTitle = DocSignMergeEngine.mergeText(req.recordId, defaultTitle(t));
            extension = 'docx';
            doc.Format__c = 'DOCX';
        } else {
            Map<String, String> p = parts(t);
            p.put('text:title', defaultTitle(t));
            Map<String, String> merged = DocSignMergeEngine.mergeParts(req.recordId, p, DocSignMergeEngine.OutputMode.HTML, job);
            fileTitle = merged.get('text:title');
            String html = DocSignRenderService.composeDocument(merged.get('body'), merged.get('header'), merged.get('footer'), t.Stylesheet__c, t.Page_Size__c, t.Orientation__c, fileTitle);
            specs = DocSignRenderService.parseFields(html);
            DocSignRenderService.writeHtml(doc, html);
            String printable = DocSignRenderService.resolveImagesForPdf(DocSignRenderService.renderFields(html, DocSignRenderService.FieldMode.PLACEHOLDER, null, null), false);
            output = DocSignRenderService.toPdf(printable);
            extension = 'pdf';
            doc.Format__c = 'PDF';
        }
        if (String.isNotBlank(req.fileName)) {
            fileTitle = req.fileName;
        }
        fileTitle = DocSignFileService.sanitize(String.isBlank(fileTitle) ? t.Name : fileTitle);
        Object recName = job.value(nameField);

        doc.Title__c = fileTitle.left(255);
        doc.Record_Name__c = recName == null ? null : String.valueOf(recName).left(255);
        doc.File_Name__c = (fileTitle + '.' + extension).left(255);
        doc.Document_Hash__c = DocSignRenderService.sha256(output);
        doc.Version_Number__c = nextVersion(t.Id, req.recordId);
        doc.Warnings__c = job.warnings.isEmpty() ? null : String.join(job.warnings, '\n').left(32000);
        insert as user doc;

        Set<Id> links = new Set<Id>();
        DocSign_Settings__c settings = DocSign_Settings__c.getOrgDefaults();
        if (settings == null || settings.Id == null || settings.Link_To_Source_Record__c) {
            links.add(req.recordId);
        }
        DocSignFileService.SavedFile file = DocSignFileService.save(fileTitle, doc.File_Name__c, output, doc.Id, links);
        doc.Content_Version_Id__c = file.versionId;
        doc.Content_Document_Id__c = file.contentDocumentId;
        update as user new DocSign_Document__c(Id = doc.Id, Content_Version_Id__c = file.versionId, Content_Document_Id__c = file.contentDocumentId);

        res.documentId = doc.Id;
        res.contentVersionId = file.versionId;
        res.contentDocumentId = file.contentDocumentId;
        res.documentUrl = DocSignFileService.viewUrl(file.contentDocumentId);
        res.fileName = doc.File_Name__c;
        res.format = doc.Format__c;
        res.signatureFieldCount = specs.size();
        res.signerRoles = maxRole(specs);
        res.warnings = job.warnings;
        return res;
    }

    private static Map<String, String> parts(DocSign_Template__c t) {
        return new Map<String, String>{ 'body' => t.Body__c, 'header' => t.Header_Html__c, 'footer' => t.Footer_Html__c };
    }

    private static String defaultTitle(DocSign_Template__c t) {
        return String.isNotBlank(t.Output_File_Name__c) ? t.Output_File_Name__c : t.Name;
    }

    public static Integer maxRole(List<DocSignRenderService.FieldSpec> specs) {
        Integer m = 0;
        for (DocSignRenderService.FieldSpec s : specs) {
            m = Math.max(m, s.role);
        }
        return m;
    }

    private static Integer nextVersion(Id templateId, Id recordId) {
        Integer c = [SELECT COUNT() FROM DocSign_Document__c WHERE Template__c = :templateId AND Record_Id__c = :recordId WITH USER_MODE];
        return c + 1;
    }
}
