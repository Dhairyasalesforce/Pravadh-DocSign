/**
 * Flow action: Resend Envelope (fresh signing links for the current signers).
 */
global with sharing class DocSignResendEnvelopeAction {
    global class Request {
        @InvocableVariable(label='Envelope ID' required=true)
        global String envelopeId;
    }

    @InvocableMethod(label='Resend Envelope' description='Pravadh DocSign: resend signing requests to the current signers.' category='Pravadh DocSign' iconName='slds:standard:email')
    global static List<Integer> resend(List<Request> requests) {
        List<Integer> out = new List<Integer>();
        for (Request r : requests) {
            DocSign_Envelope__c e = DocSignEnvelopeService.findByKeyOrId(r.envelopeId);
            out.add(DocSignEnvelopeService.resend(e.Id));
        }
        return out;
    }
}
