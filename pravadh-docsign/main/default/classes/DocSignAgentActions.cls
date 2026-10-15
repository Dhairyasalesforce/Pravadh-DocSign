/**
 * Agent-ready actions for Agentforce (and any agent/model that can invoke Salesforce actions).
 * Labels and descriptions are written for AI planners. All actions run as the user (sharing, CRUD, FLS).
 */
global with sharing class DocSignAgentActions {
    global class FindTemplatesRequest {
        @InvocableVariable(label='Record Id' required=true description='The Salesforce record the document is for (any standard or custom object).')
        global Id recordId;
        @InvocableVariable(label='What the user asked for' description='Optional natural-language request, e.g. "enterprise agreement" or "NDA", used to rank templates.')
        global String request;
    }

    global class FindTemplatesResult {
        @InvocableVariable(label='Best Template Id' description='Id of the best matching active template, or empty if none exist.')
        global Id templateId;
        @InvocableVariable(label='Best Template Name')
        global String templateName;
        @InvocableVariable(label='Available Templates' description='Comma-separated names of all active templates for this record type.')
        global String availableTemplates;
        @InvocableVariable(label='Template Count')
        global Integer templateCount;
    }

    @InvocableMethod(
        label='Find Document Templates'
        description='Pravadh DocSign: lists the active document templates available for a Salesforce record and picks the best match for the user request. Use before Generate Document when the template is not known.'
        category='Pravadh DocSign'
    )
    global static List<FindTemplatesResult> findTemplates(List<FindTemplatesRequest> requests) {
        List<FindTemplatesResult> out = new List<FindTemplatesResult>();
        for (FindTemplatesRequest q : requests) {
            DocSignIntelligence.Request req = new DocSignIntelligence.Request();
            req.task = DocSignIntelligence.TASK_SUGGEST_TEMPLATE;
            req.recordId = q.recordId;
            req.prompt = q.request;
            DocSignIntelligence.Response r = DocSignIntelligence.run(req);
            FindTemplatesResult res = new FindTemplatesResult();
            res.templateId = r.reference;
            res.templateCount = r.items.size();
            res.availableTemplates = String.join(r.items, ', ');
            res.templateName = r.reference == null ? null : [SELECT Name FROM DocSign_Template__c WHERE Id = :r.reference WITH USER_MODE LIMIT 1].Name;
            out.add(res);
        }
        return out;
    }
}
