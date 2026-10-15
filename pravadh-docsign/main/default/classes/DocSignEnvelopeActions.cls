/**
 * Flow actions: Get Signature Status, Cancel Envelope, Resend Envelope.
 * Envelope ID accepts the envelope key (UUID), number (ENV-000123) or record Id.
 */
global with sharing class DocSignEnvelopeActions {
    global class StatusRequest {
        @InvocableVariable(label='Envelope ID' required=true)
        global String envelopeId;
    }

    global class StatusResult {
        @InvocableVariable(label='Status')
        global String status;
        @InvocableVariable(label='Envelope Record Id')
        global Id envelopeRecordId;
        @InvocableVariable(label='Is Completed')
        global Boolean isCompleted;
        @InvocableVariable(label='Completed Date')
        global Datetime completedDate;
        @InvocableVariable(label='Signed File (ContentVersion) Id')
        global String signedVersionId;
        @InvocableVariable(label='Certificate (ContentVersion) Id')
        global String certificateVersionId;
    }

    @InvocableMethod(label='Get Signature Status' description='Pravadh DocSign: get the status of an envelope.' category='Pravadh DocSign' iconName='slds:standard:dashboard')
    global static List<StatusResult> getStatus(List<StatusRequest> requests) {
        List<StatusResult> out = new List<StatusResult>();
        for (StatusRequest r : requests) {
            DocSign_Envelope__c e = DocSignEnvelopeService.findByKeyOrId(r.envelopeId);
            StatusResult s = new StatusResult();
            s.status = e.Status__c;
            s.envelopeRecordId = e.Id;
            s.isCompleted = e.Status__c == 'Completed';
            s.completedDate = e.Completed_Date__c;
            s.signedVersionId = e.Signed_Version_Id__c;
            s.certificateVersionId = e.Certificate_Version_Id__c;
            out.add(s);
        }
        return out;
    }
}
