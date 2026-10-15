/**
 * Agent action: checks a record for data a template needs before generating the document.
 */
global with sharing class DocSignMissingDataAction {
    global class Request {
        @InvocableVariable(label='Record Id' required=true description='The Salesforce record the document will be generated from.')
        global Id recordId;
        @InvocableVariable(label='Template Id' description='DocSign Template Id. Provide this or Template Name.')
        global Id templateId;
        @InvocableVariable(label='Template Name' description='Name of an active template for the record type.')
        global String templateName;
    }

    global class Result {
        @InvocableVariable(label='Is Ready' description='True when every merge field in the template has data on this record.')
        global Boolean isReady;
        @InvocableVariable(label='Missing Data' description='Plain-language list of blank or inaccessible fields the document would show empty.')
        global String missingData;
        @InvocableVariable(label='Missing Count')
        global Integer missingCount;
    }

    @InvocableMethod(
        label='Check Missing Document Data'
        description='Pravadh DocSign: before generating, checks which fields a template needs that are blank or not accessible on the record, so the user can fill them first. Nothing is generated or saved.'
        category='Pravadh DocSign'
    )
    global static List<Result> check(List<Request> requests) {
        List<Result> out = new List<Result>();
        for (Request q : requests) {
            DocSignIntelligence.Request req = new DocSignIntelligence.Request();
            req.task = DocSignIntelligence.TASK_MISSING_DATA;
            req.recordId = q.recordId;
            req.templateId = q.templateId != null ? q.templateId : DocSignGenerateDocumentAction.findTemplate(q.templateName, q.recordId);
            DocSignIntelligence.Response r = DocSignIntelligence.run(req);
            Result res = new Result();
            res.missingCount = r.items.size();
            res.isReady = r.items.isEmpty();
            res.missingData = r.text;
            out.add(res);
        }
        return out;
    }
}
