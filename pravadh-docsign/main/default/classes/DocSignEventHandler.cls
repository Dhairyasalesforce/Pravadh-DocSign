/**
 * Pravadh DocSign - consumes internal envelope events and runs follow-up work asynchronously
 * as the platform event process user (never as the Site guest user).
 */
public without sharing class DocSignEventHandler {
    public static void handle(List<DocSign_Envelope_Event__e> events) {
        Map<String, List<Id>> work = new Map<String, List<Id>>();
        for (DocSign_Envelope_Event__e ev : events) {
            if (ev.Event_Type__c == 'RoutingAdvanced' || ev.Event_Type__c == 'AllSigned' || ev.Event_Type__c == 'Declined') {
                if (!work.containsKey(ev.Event_Type__c)) {
                    work.put(ev.Event_Type__c, new List<Id>());
                }
                work.get(ev.Event_Type__c).add(Id.valueOf(ev.Envelope_Id__c));
            }
        }
        if (!work.isEmpty()) {
            System.enqueueJob(new DocSignEventJob(work));
        }
    }
}
