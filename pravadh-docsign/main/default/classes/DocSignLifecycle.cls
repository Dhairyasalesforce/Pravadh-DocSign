/**
 * Pravadh DocSign - system-side lifecycle transitions (cancel, decline, expire) and notifications.
 * Internal: invoked only after the caller has been authorized (user DML gate, verified signer token or scheduled job).
 */
public without sharing class DocSignLifecycle {
    public static void afterCancel(Id envelopeId, String reason) {
        DocSign_Envelope__c env = load(envelopeId);
        List<DocSign_Recipient__c> notified = invalidate(env);
        if (env.Document__c != null) {
            Database.update(new DocSign_Document__c(Id = env.Document__c, Status__c = 'Cancelled'), AccessLevel.SYSTEM_MODE);
        }
        DocSignAuditService.log(DocSignAuditService.userEntry(env.Id, 'Envelope Cancelled', String.isBlank(reason) ? 'Envelope cancelled by sender.' : 'Envelope cancelled: ' + reason));
        List<Messaging.SingleEmailMessage> msgs = new List<Messaging.SingleEmailMessage>();
        for (DocSign_Recipient__c r : notified) {
            msgs.add(DocSignEmailService.notice(r.Email__c, 'Cancelled: ' + nz(env.Title__c), 'This signature request was cancelled',
                '<p>' + DocSignEmailService.esc(UserInfo.getName()) + ' cancelled <b>' + DocSignEmailService.esc(env.Title__c) + '</b>. No further action is needed.</p>'
                + (String.isBlank(reason) ? '' : '<p>Reason: ' + DocSignEmailService.esc(reason) + '</p>'), null));
        }
        DocSignEmailService.send(msgs);
        DocSignEvents.publish(env.Id, 'Cancelled', null);
    }

    public static void notifyDeclined(Id envelopeId) {
        DocSign_Envelope__c env = load(envelopeId);
        DocSign_Recipient__c decliner = null;
        for (DocSign_Recipient__c r : env.Recipients__r) {
            if (r.Status__c == 'Declined') {
                decliner = r;
            }
        }
        String who = decliner == null ? 'A signer' : decliner.Name + ' (' + decliner.Email__c + ')';
        String reason = decliner == null ? null : decliner.Decline_Reason__c;
        List<Messaging.SingleEmailMessage> msgs = new List<Messaging.SingleEmailMessage>();
        if (String.isNotBlank(env.Owner.Email)) {
            msgs.add(DocSignEmailService.notice(env.Owner.Email, 'Declined: ' + nz(env.Title__c), 'A signer declined your document',
                '<p>' + DocSignEmailService.esc(who) + ' declined to sign <b>' + DocSignEmailService.esc(env.Title__c) + '</b> (' + DocSignEmailService.esc(env.Name) + ').</p>'
                + (String.isBlank(reason) ? '' : '<p>Reason: ' + DocSignEmailService.esc(reason) + '</p>')
                + DocSignEmailService.button(URL.getOrgDomainUrl().toExternalForm() + '/' + env.Id, 'Open envelope'), null));
        }
        DocSignEmailService.send(msgs);
    }

    /** Marks overdue envelopes Expired. Used by the maintenance job. */
    public static Integer expire(List<DocSign_Envelope__c> candidates) {
        List<DocSign_Envelope__c> expired = new List<DocSign_Envelope__c>();
        List<DocSign_Document__c> docs = new List<DocSign_Document__c>();
        List<DocSignAuditService.Entry> audit = new List<DocSignAuditService.Entry>();
        for (DocSign_Envelope__c e : candidates) {
            if (DocSignRoutingService.ACTIVE_STATUSES.contains(e.Status__c) && e.Expires_On__c != null && e.Expires_On__c < Datetime.now()) {
                expired.add(new DocSign_Envelope__c(Id = e.Id, Status__c = 'Expired'));
                if (e.Document__c != null) {
                    docs.add(new DocSign_Document__c(Id = e.Document__c, Status__c = 'Expired'));
                }
                audit.add(DocSignAuditService.systemEntry(e.Id, 'Document Expired', 'Envelope expired on ' + e.Expires_On__c.formatGmt('yyyy-MM-dd HH:mm') + ' UTC before all signers completed.'));
            }
        }
        if (expired.isEmpty()) {
            return 0;
        }
        Database.update(expired, AccessLevel.SYSTEM_MODE);
        Database.update(docs, AccessLevel.SYSTEM_MODE);
        Set<Id> ids = new Map<Id, DocSign_Envelope__c>(expired).keySet();
        List<DocSign_Recipient__c> recips = [SELECT Id FROM DocSign_Recipient__c WHERE Envelope__c IN :ids AND Token_Hash__c != null WITH SYSTEM_MODE];
        for (DocSign_Recipient__c r : recips) {
            r.Token_Hash__c = null;
        }
        Database.update(recips, AccessLevel.SYSTEM_MODE);
        DocSignAuditService.log(audit);
        DocSignEvents.publish([SELECT Id, Envelope_Key__c, Document__c, Record_Id__c, Object_API_Name__c, Status__c FROM DocSign_Envelope__c WHERE Id IN :ids WITH SYSTEM_MODE], 'Expired', null);
        return expired.size();
    }

    /** Invalidates all outstanding signing links; returns recipients that had been contacted. */
    public static List<DocSign_Recipient__c> invalidate(DocSign_Envelope__c env) {
        List<DocSign_Recipient__c> contacted = new List<DocSign_Recipient__c>();
        List<DocSign_Recipient__c> ups = new List<DocSign_Recipient__c>();
        for (DocSign_Recipient__c r : env.Recipients__r) {
            if (r.Status__c == 'Sent' || r.Status__c == 'Viewed') {
                contacted.add(r);
            }
            ups.add(new DocSign_Recipient__c(Id = r.Id, Token_Hash__c = null));
        }
        Database.update(ups, AccessLevel.SYSTEM_MODE);
        return contacted;
    }

    public static DocSign_Envelope__c load(Id envelopeId) {
        return [
            SELECT Id, Name, Title__c, Status__c, Document__c, Record_Id__c, Object_API_Name__c, Envelope_Key__c, Owner.Email, Owner.Name,
                (SELECT Id, Name, Email__c, Status__c, Decline_Reason__c FROM Recipients__r)
            FROM DocSign_Envelope__c WHERE Id = :envelopeId WITH SYSTEM_MODE LIMIT 1
        ];
    }

    private static String nz(String s) {
        return s == null ? '' : s;
    }
}
