/**
 * Pravadh DocSign - recipient routing (sequential & parallel) and signing-request delivery.
 * Routing orders: recipients sharing an order sign in parallel; orders are processed ascending.
 * Internal service: callers must authorize the action first (sender user, token-verified signer or system job).
 */
public without sharing class DocSignRoutingService {
    public static final Set<String> ACTIVE_STATUSES = new Set<String>{ 'Sent', 'Viewed', 'Partially Signed' };

    /** Test-only: raw tokens are otherwise never retained (only their hash is stored). */
    @TestVisible
    private static Map<Id, String> issuedTokens = new Map<Id, String>();

    /**
     * Issues fresh signing links to the recipients of the current routing order.
     * kind: initial | reminder | resend
     */
    public static Integer sendCurrentGroup(Id envelopeId, String kind, String actorName, String actorEmail) {
        DocSign_Envelope__c env = [
            SELECT Id, Name, Title__c, Status__c, Current_Routing_Order__c, Email_Subject__c, Email_Message__c, Expires_On__c, Envelope_Key__c,
                Document__c, Record_Id__c, Object_API_Name__c, Owner.Name, CreatedBy.Name
            FROM DocSign_Envelope__c WHERE Id = :envelopeId WITH SYSTEM_MODE LIMIT 1
        ];
        Set<String> statuses = kind == 'initial' ? new Set<String>{ 'Created' } : new Set<String>{ 'Created', 'Sent', 'Viewed' };
        List<DocSign_Recipient__c> recips = [
            SELECT Id, Name, Email__c, Status__c, Routing_Order__c
            FROM DocSign_Recipient__c
            WHERE Envelope__c = :envelopeId AND Routing_Order__c = :env.Current_Routing_Order__c AND Status__c IN :statuses
            WITH SYSTEM_MODE ORDER BY Role_Number__c
        ];
        if (recips.isEmpty()) {
            return 0;
        }
        String senderName = String.isNotBlank(actorName) && actorName != 'Pravadh DocSign' ? actorName : env.Owner.Name;
        List<Messaging.SingleEmailMessage> msgs = new List<Messaging.SingleEmailMessage>();
        Datetime now = Datetime.now();
        for (DocSign_Recipient__c r : recips) {
            String token = DocSignTokenService.newToken();
            r.Token_Hash__c = DocSignTokenService.hash(token);
            if (Test.isRunningTest()) {
                issuedTokens.put(r.Id, token);
            }
            r.Failed_Access_Attempts__c = 0;
            if (r.Status__c == 'Created') {
                r.Status__c = 'Sent';
            }
            r.Sent_Date__c = now;
            msgs.add(DocSignEmailService.signingRequest(env, r, DocSignEmailService.signingUrl(token), kind, senderName));
        }
        Database.update(recips, AccessLevel.SYSTEM_MODE);
        List<Messaging.SendEmailResult> results = DocSignEmailService.send(msgs);
        String evType = kind == 'reminder' ? 'Reminder Sent' : (kind == 'resend' ? 'Envelope Resent' : 'Document Sent');
        List<DocSignAuditService.Entry> audit = new List<DocSignAuditService.Entry>();
        for (Integer i = 0; i < recips.size(); i++) {
            DocSign_Recipient__c r = recips[i];
            DocSignAuditService.Entry e = new DocSignAuditService.Entry(env.Id, evType);
            e.recipientId = r.Id;
            e.actorName = String.isNotBlank(actorName) ? actorName : 'Pravadh DocSign';
            e.actorEmail = actorEmail;
            e.details = 'Signing request issued to ' + r.Name + ' <' + r.Email__c + '> (routing order ' + r.Routing_Order__c + ')';
            audit.add(e);
            Boolean ok = i < results.size() && results[i].isSuccess();
            DocSignAuditService.Entry d = new DocSignAuditService.Entry(env.Id, ok ? 'Email Delivered' : 'Email Failed');
            d.recipientId = r.Id;
            d.actorName = 'Pravadh DocSign';
            d.actorEmail = r.Email__c;
            String why = i < results.size() && !results[i].getErrors().isEmpty() ? results[i].getErrors()[0].getMessage() : DocSignEmailService.lastError;
            d.details = ok ? 'Email accepted for delivery to ' + r.Email__c : 'Email could not be sent to ' + r.Email__c + ': ' + (why == null ? 'unknown error' : why);
            audit.add(d);
        }
        DocSignAuditService.log(audit);
        return recips.size();
    }

    /**
     * Called after a recipient signs. Moves routing forward, or flags the envelope as fully signed.
     * Returns the resulting internal event type (RoutingAdvanced, AllSigned or PartiallySigned).
     */
    public static String advance(Id envelopeId) {
        DocSign_Envelope__c env = [
            SELECT Id, Status__c, Current_Routing_Order__c, Envelope_Key__c, Document__c, Record_Id__c, Object_API_Name__c
            FROM DocSign_Envelope__c WHERE Id = :envelopeId WITH SYSTEM_MODE LIMIT 1 FOR UPDATE
        ];
        List<DocSign_Recipient__c> recips = [SELECT Id, Status__c, Routing_Order__c FROM DocSign_Recipient__c WHERE Envelope__c = :envelopeId WITH SYSTEM_MODE];
        Boolean currentDone = true;
        Decimal nextOrder = null;
        for (DocSign_Recipient__c r : recips) {
            if (r.Status__c == 'Signed') {
                continue;
            }
            if (r.Routing_Order__c == env.Current_Routing_Order__c) {
                currentDone = false;
            } else if (r.Routing_Order__c > env.Current_Routing_Order__c && (nextOrder == null || r.Routing_Order__c < nextOrder)) {
                nextOrder = r.Routing_Order__c;
            }
        }
        String evt;
        if (!currentDone) {
            env.Status__c = 'Partially Signed';
            evt = 'PartiallySigned';
        } else if (nextOrder != null) {
            env.Status__c = 'Partially Signed';
            env.Current_Routing_Order__c = nextOrder;
            evt = 'RoutingAdvanced';
        } else {
            evt = 'AllSigned';
        }
        Database.update(new DocSign_Envelope__c(Id = env.Id, Status__c = env.Status__c, Current_Routing_Order__c = env.Current_Routing_Order__c), AccessLevel.SYSTEM_MODE);
        DocSignEvents.publish(new List<DocSign_Envelope__c>{ env }, evt, null);
        return evt;
    }
}
