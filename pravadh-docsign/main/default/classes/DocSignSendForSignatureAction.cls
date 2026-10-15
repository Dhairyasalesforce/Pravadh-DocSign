/**
 * Flow action: Send for Signature.
 */
global with sharing class DocSignSendForSignatureAction {
    global class Request {
        @InvocableVariable(label='Document Id' required=true)
        global Id documentId;
        @InvocableVariable(label='Signers' description='Collection of DocSignRecipientInput (Apex-defined).')
        global List<DocSignRecipientInput> signers;
        @InvocableVariable(label='Signer Names (simple)' description='Alternative to Signers: text collection of names (same order as emails).')
        global List<String> signerNames;
        @InvocableVariable(label='Signer Emails (simple)')
        global List<String> signerEmails;
        @InvocableVariable(label='Signing Order' description='Sequential or Parallel')
        global String signingOrder;
        @InvocableVariable(label='Email Subject')
        global String emailSubject;
        @InvocableVariable(label='Email Message')
        global String emailMessage;
        @InvocableVariable(label='Expires In (Days)')
        global Integer expiryDays;
    }

    global class Result {
        @InvocableVariable(label='Envelope Record Id')
        global Id envelopeId;
        @InvocableVariable(label='Envelope ID')
        global String envelopeKey;
        @InvocableVariable(label='Status')
        global String status;
    }

    @InvocableMethod(label='Send for Signature' description='Pravadh DocSign: send a generated document to one or more signers.' category='Pravadh DocSign' iconName='slds:standard:approval')
    global static List<Result> send(List<Request> requests) {
        List<Result> out = new List<Result>();
        for (Request r : requests) {
            DocSignEnvelopeService.SendRequest s = new DocSignEnvelopeService.SendRequest();
            s.documentId = r.documentId;
            s.signingOrder = r.signingOrder;
            s.emailSubject = r.emailSubject;
            s.emailMessage = r.emailMessage;
            s.expiryDays = r.expiryDays;
            s.recipients = new List<DocSignEnvelopeService.RecipientInput>();
            if (r.signers != null) {
                for (DocSignRecipientInput i : r.signers) {
                    DocSignEnvelopeService.RecipientInput x = new DocSignEnvelopeService.RecipientInput();
                    x.name = i.name;
                    x.email = i.email;
                    x.roleNumber = i.roleNumber;
                    x.routingOrder = i.routingOrder;
                    x.roleLabel = i.roleLabel;
                    x.accessCode = i.accessCode;
                    s.recipients.add(x);
                }
            }
            if (s.recipients.isEmpty() && r.signerEmails != null) {
                for (Integer k = 0; k < r.signerEmails.size(); k++) {
                    DocSignEnvelopeService.RecipientInput x = new DocSignEnvelopeService.RecipientInput();
                    x.email = r.signerEmails[k];
                    x.name = r.signerNames != null && r.signerNames.size() > k ? r.signerNames[k] : r.signerEmails[k];
                    s.recipients.add(x);
                }
            }
            DocSignEnvelopeService.SendResult res = DocSignEnvelopeService.createAndSend(s);
            Result o = new Result();
            o.envelopeId = res.envelopeId;
            o.envelopeKey = res.envelopeKey;
            o.status = res.status;
            out.add(o);
        }
        return out;
    }
}
