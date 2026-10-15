/**
 * Pravadh DocSign - Document & Envelope workspace endpoints.
 */
public with sharing class DocSignWorkspaceController {
    public class RecipientRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String email;
        @AuraEnabled public String role;
        @AuraEnabled public Integer routingOrder;
        @AuraEnabled public String status;
        @AuraEnabled public Datetime sentDate;
        @AuraEnabled public Datetime viewedDate;
        @AuraEnabled public Datetime signedDate;
        @AuraEnabled public String declineReason;
        @AuraEnabled public Boolean isCurrent;
        @AuraEnabled public Boolean hasAccessCode;
    }

    public class EventRow {
        @AuraEnabled public Integer sequence;
        @AuraEnabled public String type;
        @AuraEnabled public String actor;
        @AuraEnabled public String actorEmail;
        @AuraEnabled public Datetime timestamp;
        @AuraEnabled public String ip;
        @AuraEnabled public String details;
        @AuraEnabled public String hash;
    }

    public class FileRow {
        @AuraEnabled public String label;
        @AuraEnabled public Id contentDocumentId;
        @AuraEnabled public Id versionId;
        @AuraEnabled public String kind;
    }

    public class EnvelopeRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String status;
        @AuraEnabled public Datetime createdDate;
    }

    public class Detail {
        @AuraEnabled public Id documentId;
        @AuraEnabled public String documentName;
        @AuraEnabled public String documentStatus;
        @AuraEnabled public String title;
        @AuraEnabled public String sourceRecordId;
        @AuraEnabled public String sourceObject;
        @AuraEnabled public String documentHash;
        @AuraEnabled public String warnings;
        @AuraEnabled public Id envelopeId;
        @AuraEnabled public String envelopeNumber;
        @AuraEnabled public String envelopeKey;
        @AuraEnabled public String status;
        @AuraEnabled public String signingOrder;
        @AuraEnabled public Datetime sentDate;
        @AuraEnabled public Datetime completedDate;
        @AuraEnabled public Datetime expiresOn;
        @AuraEnabled public String sender;
        @AuraEnabled public String finalHash;
        @AuraEnabled public Boolean chainIntact;
        @AuraEnabled public Boolean canCancel;
        @AuraEnabled public Boolean canResend;
        @AuraEnabled public Boolean canSend;
        @AuraEnabled public Boolean canPrepare = false;
        @AuraEnabled public Boolean isDraft = false;
        @AuraEnabled public List<RecipientRow> recipients = new List<RecipientRow>();
        @AuraEnabled public List<EventRow> events = new List<EventRow>();
        @AuraEnabled public List<FileRow> files = new List<FileRow>();
        @AuraEnabled public List<EnvelopeRow> envelopes = new List<EnvelopeRow>();
    }

    /** Accepts a DocSign Envelope Id or a DocSign Document Id. */
    @AuraEnabled
    public static Detail getDetail(Id recordId) {
        try {
            Detail d = new Detail();
            Id envelopeId = null;
            Id documentId = null;
            if (recordId.getSObjectType() == DocSign_Envelope__c.SObjectType) {
                envelopeId = recordId;
            } else if (recordId.getSObjectType() == DocSign_Document__c.SObjectType) {
                documentId = recordId;
            } else {
                throw new DocSignException('This component works on DocSign Document and DocSign Envelope records.');
            }
            if (envelopeId != null) {
                documentId = DocSignEnvelopeService.getEnvelope(envelopeId).Document__c;
            }
            if (documentId != null) {
                List<DocSign_Document__c> docs = [
                    SELECT Id, Name, Title__c, Status__c, Record_Id__c, Object_API_Name__c, Document_Hash__c, Warnings__c, Format__c, Source_Type__c,
                        Content_Document_Id__c, Content_Version_Id__c, Signed_Version_Id__c, Certificate_Version_Id__c,
                        (SELECT Id, Name, Status__c, CreatedDate FROM Envelopes__r ORDER BY CreatedDate DESC LIMIT 20)
                    FROM DocSign_Document__c WHERE Id = :documentId WITH USER_MODE LIMIT 1
                ];
                if (!docs.isEmpty()) {
                    DocSign_Document__c doc = docs[0];
                    d.documentId = doc.Id;
                    d.documentName = doc.Name;
                    d.documentStatus = doc.Status__c;
                    d.title = doc.Title__c;
                    d.sourceRecordId = doc.Record_Id__c;
                    d.sourceObject = doc.Object_API_Name__c;
                    d.documentHash = doc.Document_Hash__c;
                    d.warnings = doc.Warnings__c;
                    for (DocSign_Envelope__c e : doc.Envelopes__r) {
                        EnvelopeRow r = new EnvelopeRow();
                        r.id = e.Id;
                        r.name = e.Name;
                        r.status = e.Status__c;
                        r.createdDate = e.CreatedDate;
                        d.envelopes.add(r);
                    }
                    if (envelopeId == null && !doc.Envelopes__r.isEmpty()) {
                        envelopeId = doc.Envelopes__r[0].Id;
                    }
                    addFiles(d, doc.Content_Version_Id__c, doc.Signed_Version_Id__c, doc.Certificate_Version_Id__c);
                    d.canSend = doc.Status__c != 'Draft' && doc.Format__c == 'PDF' && (d.envelopes.isEmpty() || !DocSignRoutingService.ACTIVE_STATUSES.contains(d.envelopes[0].status) && d.envelopes[0].status != 'Completed');
                    d.isDraft = doc.Status__c == 'Draft';
                    d.status = doc.Status__c;
                    d.canPrepare = doc.Source_Type__c == 'Uploaded PDF' && (d.isDraft || (doc.Status__c == 'Generated' && d.canSend));
                }
            }
            if (envelopeId != null) {
                DocSign_Envelope__c env = DocSignEnvelopeService.getEnvelope(envelopeId);
                d.envelopeId = env.Id;
                d.envelopeNumber = env.Name;
                d.envelopeKey = env.Envelope_Key__c;
                d.status = env.Status__c;
                d.signingOrder = env.Signing_Order__c;
                d.sentDate = env.Sent_Date__c;
                d.completedDate = env.Completed_Date__c;
                d.expiresOn = env.Expires_On__c;
                d.sender = env.Owner.Name;
                d.finalHash = env.Final_Hash__c;
                d.canCancel = DocSignRoutingService.ACTIVE_STATUSES.contains(env.Status__c) || env.Status__c == 'Prepared';
                d.canResend = DocSignRoutingService.ACTIVE_STATUSES.contains(env.Status__c);
                for (DocSign_Recipient__c r : [
                    SELECT Id, Name, Email__c, Role_Label__c, Routing_Order__c, Status__c, Sent_Date__c, Viewed_Date__c, Signed_Date__c, Decline_Reason__c, Access_Code_Hash__c
                    FROM DocSign_Recipient__c WHERE Envelope__c = :env.Id WITH USER_MODE ORDER BY Routing_Order__c, Role_Number__c
                ]) {
                    RecipientRow rr = new RecipientRow();
                    rr.id = r.Id;
                    rr.name = r.Name;
                    rr.email = r.Email__c;
                    rr.role = r.Role_Label__c;
                    rr.routingOrder = r.Routing_Order__c == null ? null : r.Routing_Order__c.intValue();
                    rr.status = r.Status__c;
                    rr.sentDate = r.Sent_Date__c;
                    rr.viewedDate = r.Viewed_Date__c;
                    rr.signedDate = r.Signed_Date__c;
                    rr.declineReason = r.Decline_Reason__c;
                    rr.hasAccessCode = String.isNotBlank(r.Access_Code_Hash__c);
                    rr.isCurrent = r.Routing_Order__c == env.Current_Routing_Order__c && (r.Status__c == 'Sent' || r.Status__c == 'Viewed') && d.canResend;
                    d.recipients.add(rr);
                }
                for (DocSign_Audit_Event__c ev : [
                    SELECT Sequence__c, Event_Type__c, Actor_Name__c, Actor_Email__c, Event_Timestamp__c, IP_Address__c, Details__c, Hash__c
                    FROM DocSign_Audit_Event__c WHERE Envelope__c = :env.Id WITH USER_MODE ORDER BY Sequence__c DESC LIMIT 500
                ]) {
                    EventRow er = new EventRow();
                    er.sequence = ev.Sequence__c == null ? null : ev.Sequence__c.intValue();
                    er.type = ev.Event_Type__c;
                    er.actor = ev.Actor_Name__c;
                    er.actorEmail = ev.Actor_Email__c;
                    er.timestamp = ev.Event_Timestamp__c;
                    er.ip = ev.IP_Address__c;
                    er.details = ev.Details__c;
                    er.hash = ev.Hash__c;
                    d.events.add(er);
                }
                d.chainIntact = DocSignAuditService.verifyChain(env.Id);
                if (d.files.isEmpty()) {
                    addFiles(d, null, env.Signed_Version_Id__c, env.Certificate_Version_Id__c);
                }
            }
            return d;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    private static void addFiles(Detail d, String original, String signed, String cert) {
        Map<String, String> kinds = new Map<String, String>();
        if (String.isNotBlank(original)) {
            kinds.put(original, 'Original');
        }
        if (String.isNotBlank(signed)) {
            kinds.put(signed, 'Signed');
        }
        if (String.isNotBlank(cert)) {
            kinds.put(cert, 'Certificate');
        }
        if (kinds.isEmpty()) {
            return;
        }
        Set<String> ids = kinds.keySet();
        for (ContentVersion cv : [SELECT Id, Title, ContentDocumentId FROM ContentVersion WHERE Id IN :ids WITH USER_MODE]) {
            FileRow f = new FileRow();
            f.label = cv.Title;
            f.contentDocumentId = cv.ContentDocumentId;
            f.versionId = cv.Id;
            f.kind = kinds.get(String.valueOf(cv.Id));
            d.files.add(f);
        }
    }

    @AuraEnabled
    public static void cancelEnvelope(Id envelopeId, String reason) {
        try {
            DocSignEnvelopeService.cancel(envelopeId, reason);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static Integer resendEnvelope(Id envelopeId) {
        try {
            return DocSignEnvelopeService.resend(envelopeId);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }
}
