/**
 * Flow action: Generate Document from any record and template.
 */
global with sharing class DocSignGenerateDocumentAction {
    global class Request {
        @InvocableVariable(label='Record Id' required=true description='Any standard or custom object record.')
        global Id recordId;
        @InvocableVariable(label='Template Id' description='DocSign Template record Id. Provide this or Template Name.')
        global Id templateId;
        @InvocableVariable(label='Template Name' description='Name of an active template for the record\'s object.')
        global String templateName;
        @InvocableVariable(label='File Name (optional)')
        global String fileName;
    }

    global class Result {
        @InvocableVariable(label='Document Id')
        global Id documentId;
        @InvocableVariable(label='File (ContentVersion) Id')
        global Id contentVersionId;
        @InvocableVariable(label='ContentDocument Id')
        global Id contentDocumentId;
        @InvocableVariable(label='Document URL')
        global String documentUrl;
        @InvocableVariable(label='Warnings')
        global String warnings;
    }

    @InvocableMethod(label='Generate Document' description='Pravadh DocSign: generate a document from any Salesforce record using a template.' category='Pravadh DocSign' iconName='slds:standard:document')
    global static List<Result> generate(List<Request> requests) {
        List<Result> out = new List<Result>();
        for (Request r : requests) {
            DocSignGenerationService.GenerateRequest g = new DocSignGenerationService.GenerateRequest();
            g.recordId = r.recordId;
            g.templateId = r.templateId != null ? r.templateId : findTemplate(r.templateName, r.recordId);
            g.fileName = r.fileName;
            DocSignGenerationService.GenerateResult res = DocSignGenerationService.generate(g);
            Result o = new Result();
            o.documentId = res.documentId;
            o.contentVersionId = res.contentVersionId;
            o.contentDocumentId = res.contentDocumentId;
            o.documentUrl = res.documentUrl;
            o.warnings = res.warnings == null || res.warnings.isEmpty() ? null : String.join(res.warnings, '\n');
            out.add(o);
        }
        return out;
    }

    public static Id findTemplate(String name, Id recordId) {
        if (String.isBlank(name)) {
            throw new DocSignException('Provide a Template Id or Template Name.');
        }
        String obj = recordId.getSObjectType().getDescribe().getName();
        List<DocSign_Template__c> ts = [
            SELECT Id FROM DocSign_Template__c WHERE Name = :name AND Object_API_Name__c = :obj AND Active__c = TRUE WITH USER_MODE ORDER BY Version__c DESC LIMIT 1
        ];
        if (ts.isEmpty()) {
            throw new DocSignException('No active template named "' + name + '" for ' + obj + '.');
        }
        return ts[0].Id;
    }
}
