/**
 * Agent action: plain-language signature status for a record, document or envelope.
 */
global with sharing class DocSignSignatureSummaryAction {
    global class Request {
        @InvocableVariable(label='Record Id' required=true description='A Salesforce record (any object), a DocSign Document or a DocSign Envelope. The most recent envelope is summarized.')
        global Id recordId;
    }

    global class Result {
        @InvocableVariable(label='Summary' description='Plain-language status: who signed, who is pending, expiry, and where the signed files are.')
        global String summary;
        @InvocableVariable(label='Status' description='Envelope status: Sent, Viewed, Partially Signed, Completed, Declined, Expired or Cancelled.')
        global String status;
        @InvocableVariable(label='Envelope Record Id')
        global Id envelopeId;
        @InvocableVariable(label='Is Completed')
        global Boolean isCompleted;
    }

    @InvocableMethod(
        label='Get Signature Summary'
        description='Pravadh DocSign: explains in plain language where a document stands - who has signed, who is still pending, whether anyone declined, and when it expires. Accepts any record, a DocSign Document or a DocSign Envelope.'
        category='Pravadh DocSign'
    )
    global static List<Result> summarize(List<Request> requests) {
        List<Result> out = new List<Result>();
        for (Request q : requests) {
            Result res = new Result();
            Id envId = DocSignAgentSupport.latestEnvelopeFor(q.recordId);
            if (envId == null) {
                res.summary = 'No signature request has been sent for this record yet.';
                res.isCompleted = false;
            } else {
                DocSignIntelligence.Request req = new DocSignIntelligence.Request();
                req.task = DocSignIntelligence.TASK_SUMMARIZE_ENVELOPE;
                req.envelopeId = envId;
                res.summary = DocSignIntelligence.run(req).text;
                DocSign_Envelope__c e = DocSignEnvelopeService.getEnvelope(envId);
                res.status = e.Status__c;
                res.envelopeId = e.Id;
                res.isCompleted = e.Status__c == 'Completed';
            }
            out.add(res);
        }
        return out;
    }
}
