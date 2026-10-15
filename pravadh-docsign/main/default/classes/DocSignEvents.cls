/**
 * Pravadh DocSign - publishes DocSign_Envelope_Event__e. Subscribe from Flow
 * (e.g. a Pause element resuming when Status = Completed) or from Apex.
 * Internal event types consumed by DocSignEventHandler: RoutingAdvanced, AllSigned, Declined.
 */
public without sharing class DocSignEvents {
    public static void publish(List<DocSign_Envelope__c> envelopes, String eventType, Id recipientId) {
        List<DocSign_Envelope_Event__e> evs = new List<DocSign_Envelope_Event__e>();
        for (DocSign_Envelope__c e : envelopes) {
            evs.add(
                new DocSign_Envelope_Event__e(
                    Envelope_Id__c = e.Id,
                    Envelope_Key__c = e.Envelope_Key__c,
                    Document_Id__c = e.Document__c,
                    Record_Id__c = e.Record_Id__c,
                    Object_API_Name__c = e.Object_API_Name__c,
                    Status__c = e.Status__c,
                    Event_Type__c = eventType,
                    Recipient_Id__c = recipientId
                )
            );
        }
        if (!evs.isEmpty()) {
            EventBus.publish(evs);
        }
    }

    public static void publish(Id envelopeId, String eventType, Id recipientId) {
        publish([SELECT Id, Envelope_Key__c, Document__c, Record_Id__c, Object_API_Name__c, Status__c FROM DocSign_Envelope__c WHERE Id = :envelopeId WITH SYSTEM_MODE], eventType, recipientId);
    }
}
