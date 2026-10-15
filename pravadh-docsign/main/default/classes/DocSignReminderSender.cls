/**
 * Pravadh DocSign - reminder delivery for the maintenance job (system context).
 */
public without sharing class DocSignReminderSender {
    public static void remind(Id envelopeId) {
        DocSignRoutingService.sendCurrentGroup(envelopeId, 'reminder', 'Pravadh DocSign', null);
    }

    public static void stamp(List<DocSign_Envelope__c> rows) {
        Database.update(rows, AccessLevel.SYSTEM_MODE);
    }
}
