/**
 * Pravadh DocSign - enforces audit immutability. Audit events can only be created through
 * DocSignAuditService and can never be edited or deleted (not even by administrators).
 */
public with sharing class DocSignAuditGuard {
    public static Boolean allowInsert = false;

    /** Single entry point for DocSignAuditEventTrigger (no logic in the trigger). */
    public static void handle(System.TriggerOperation op, List<DocSign_Audit_Event__c> newRows, List<DocSign_Audit_Event__c> oldRows) {
        if (op == System.TriggerOperation.BEFORE_INSERT) {
            beforeInsert(newRows);
        } else if (op == System.TriggerOperation.BEFORE_UPDATE) {
            blockChange(newRows);
        } else if (op == System.TriggerOperation.BEFORE_DELETE) {
            blockChange(oldRows);
        }
    }

    public static void beforeInsert(List<DocSign_Audit_Event__c> rows) {
        if (!allowInsert) {
            for (DocSign_Audit_Event__c r : rows) {
                r.addError('DocSign audit events are system-generated and cannot be created manually.');
            }
        }
    }

    public static void blockChange(List<SObject> rows) {
        for (SObject r : rows) {
            r.addError('DocSign audit events are immutable and cannot be modified or deleted.');
        }
    }

    /** Envelopes that have left Draft carry legal evidence and cannot be deleted. */
    public static void beforeEnvelopeDelete(List<DocSign_Envelope__c> rows) {
        for (DocSign_Envelope__c e : rows) {
            if (e.Status__c != null && e.Status__c != 'Draft' && e.Status__c != 'Prepared') {
                e.addError('Envelopes that have been sent cannot be deleted. Cancel the envelope instead.');
            }
        }
    }
}
