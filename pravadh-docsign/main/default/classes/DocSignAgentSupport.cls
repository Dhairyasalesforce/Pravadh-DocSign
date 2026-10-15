/**
 * Pravadh DocSign - plain-language summaries and AI/agent environment detection.
 * Used by agent actions (Agentforce / any model that can call Salesforce actions) and the Settings page.
 */
public with sharing class DocSignAgentSupport {
    public class AiStatus {
        @AuraEnabled public Boolean modelsApiAvailable = false;
        @AuraEnabled public Integer agentCount = 0;
        @AuraEnabled public Boolean agentforceDetected = false;
        @AuraEnabled public String activeProvider;
        @AuraEnabled public Integer registeredProviders = 0;
    }

    /** Detects GA platform capabilities at runtime without creating a package dependency on them. */
    public static AiStatus status() {
        AiStatus s = new AiStatus();
        try {
            s.modelsApiAvailable = Type.forName('aiplatform', 'ModelsAPI') != null;
        } catch (Exception e) {
            s.modelsApiAvailable = false;
        }
        try {
            if (Schema.getGlobalDescribe().containsKey('botdefinition')) {
                // Count only; BotDefinition is setup data readable by admins.
                s.agentCount = Database.countQuery('SELECT COUNT() FROM BotDefinition', AccessLevel.SYSTEM_MODE);
            }
        } catch (Exception e) {
            s.agentCount = 0;
        }
        s.agentforceDetected = s.modelsApiAvailable || s.agentCount > 0;
        List<DocSignIntelligence.Provider> providers = DocSignIntelligence.registeredProviders();
        s.registeredProviders = providers.size();
        s.activeProvider = providers.isEmpty() ? 'Pravadh DocSign (built-in)' : String.valueOf(providers[0]).substringBefore(':');
        return s;
    }

    public static String envelopeSummary(Id envelopeId) {
        DocSign_Envelope__c e = DocSignEnvelopeService.getEnvelope(envelopeId);
        List<DocSign_Recipient__c> rs = [
            SELECT Name, Email__c, Status__c, Routing_Order__c, Signed_Date__c, Sent_Date__c, Viewed_Date__c, Decline_Reason__c
            FROM DocSign_Recipient__c WHERE Envelope__c = :e.Id WITH USER_MODE ORDER BY Routing_Order__c, Role_Number__c
        ];
        List<String> signed = new List<String>();
        List<String> waiting = new List<String>();
        List<String> declined = new List<String>();
        for (DocSign_Recipient__c r : rs) {
            if (r.Status__c == 'Signed') {
                signed.add(r.Name + (r.Signed_Date__c == null ? '' : ' (' + r.Signed_Date__c.format('d MMM yyyy') + ')'));
            } else if (r.Status__c == 'Declined') {
                declined.add(r.Name + (String.isBlank(r.Decline_Reason__c) ? '' : ': "' + r.Decline_Reason__c.left(200) + '"'));
            } else {
                waiting.add(r.Name + (r.Status__c == 'Viewed' ? ' (opened it)' : r.Status__c == 'Sent' ? ' (not opened yet)' : ' (not sent yet)'));
            }
        }
        List<String> parts = new List<String>{ e.Name + ' "' + (e.Title__c == null ? 'Document' : e.Title__c) + '" is ' + e.Status__c + '.' };
        if (!signed.isEmpty()) {
            parts.add('Signed: ' + String.join(signed, ', ') + '.');
        }
        if (!declined.isEmpty()) {
            parts.add('Declined: ' + String.join(declined, ', ') + '.');
        }
        if (!waiting.isEmpty() && e.Status__c != 'Cancelled' && e.Status__c != 'Expired' && e.Status__c != 'Declined') {
            parts.add('Waiting on: ' + String.join(waiting, ', ') + '.');
        }
        if (e.Status__c == 'Completed' && e.Completed_Date__c != null) {
            parts.add('Completed on ' + e.Completed_Date__c.format('d MMM yyyy') + '; the signed PDF and Certificate of Completion are in Salesforce Files.');
        } else if (e.Expires_On__c != null && DocSignRoutingService.ACTIVE_STATUSES.contains(e.Status__c)) {
            parts.add('Expires on ' + e.Expires_On__c.format('d MMM yyyy') + '.');
        }
        return String.join(parts, ' ');
    }

    public static String documentSummary(Id documentId) {
        List<DocSign_Document__c> ds = [
            SELECT Name, Title__c, Status__c, Source_Type__c, Format__c, Page_Count__c, Record_Name__c, Object_API_Name__c, CreatedDate,
                (SELECT Id FROM Envelopes__r ORDER BY CreatedDate DESC LIMIT 1)
            FROM DocSign_Document__c WHERE Id = :documentId WITH USER_MODE LIMIT 1
        ];
        if (ds.isEmpty()) {
            throw new DocSignException('Document not found or you do not have access to it.');
        }
        DocSign_Document__c d = ds[0];
        String s = d.Name + ' "' + d.Title__c + '" (' + (d.Source_Type__c == 'Uploaded PDF' ? 'uploaded PDF' : d.Format__c) + ') for '
            + d.Object_API_Name__c + ' ' + (d.Record_Name__c == null ? '' : '"' + d.Record_Name__c + '"') + ' is ' + d.Status__c + '.';
        if (!d.Envelopes__r.isEmpty()) {
            s += ' ' + envelopeSummary(d.Envelopes__r[0].Id);
        }
        return s;
    }

    /** Latest envelope for any record: a source record, a DocSign Document or a DocSign Envelope. */
    public static Id latestEnvelopeFor(Id recordId) {
        if (recordId.getSObjectType() == DocSign_Envelope__c.SObjectType) {
            return recordId;
        }
        List<DocSign_Envelope__c> es;
        if (recordId.getSObjectType() == DocSign_Document__c.SObjectType) {
            es = [SELECT Id FROM DocSign_Envelope__c WHERE Document__c = :recordId WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1];
        } else {
            String rid = String.valueOf(recordId);
            es = [SELECT Id FROM DocSign_Envelope__c WHERE Record_Id__c = :rid WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1];
        }
        return es.isEmpty() ? null : es[0].Id;
    }
}
