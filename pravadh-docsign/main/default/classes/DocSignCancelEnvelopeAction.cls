/**
 * Flow action: Cancel Envelope.
 */
global with sharing class DocSignCancelEnvelopeAction {
    global class Request {
        @InvocableVariable(label='Envelope ID' required=true)
        global String envelopeId;
        @InvocableVariable(label='Reason')
        global String reason;
    }

    @InvocableMethod(label='Cancel Envelope' description='Pravadh DocSign: cancel an envelope that is in progress.' category='Pravadh DocSign' iconName='slds:standard:first_non_empty')
    global static List<String> cancel(List<Request> requests) {
        List<String> out = new List<String>();
        for (Request r : requests) {
            DocSign_Envelope__c e = DocSignEnvelopeService.findByKeyOrId(r.envelopeId);
            DocSignEnvelopeService.cancel(e.Id, r.reason);
            out.add('Cancelled');
        }
        return out;
    }
}
