/**
 * Pravadh DocSign - immutable, hash-chained audit trail.
 * Each event stores SHA-256(previousHash | event data), so any edit, deletion or re-ordering
 * of events is detectable (verifyChain). Updates/deletes are also blocked by trigger.
 *
 * Runs without sharing because events are written on behalf of external signers
 * (token-authenticated, no Salesforce user) and system finalization. Only called internally.
 */
public without sharing class DocSignAuditService {
    public class Entry {
        public Id envelopeId;
        public String eventType;
        public Id recipientId;
        public String actorName;
        public String actorEmail;
        public String ip;
        public String userAgent;
        public String documentReference;
        public String details;
        public Entry(Id envelopeId, String eventType) {
            this.envelopeId = envelopeId;
            this.eventType = eventType;
        }
    }

    public static Entry userEntry(Id envelopeId, String eventType, String details) {
        Entry e = new Entry(envelopeId, eventType);
        e.actorName = UserInfo.getName();
        e.actorEmail = UserInfo.getUserEmail();
        e.details = details;
        return e;
    }

    public static Entry systemEntry(Id envelopeId, String eventType, String details) {
        Entry e = new Entry(envelopeId, eventType);
        e.actorName = 'Pravadh DocSign';
        e.details = details;
        return e;
    }

    public static void log(Entry e) {
        log(new List<Entry>{ e });
    }

    public static void log(List<Entry> entries) {
        if (entries == null || entries.isEmpty()) {
            return;
        }
        Set<Id> ids = new Set<Id>();
        for (Entry e : entries) {
            ids.add(e.envelopeId);
        }
        Map<Id, DocSign_Envelope__c> envs = new Map<Id, DocSign_Envelope__c>(
            [SELECT Id, Envelope_Key__c, Last_Event_Hash__c, Event_Count__c FROM DocSign_Envelope__c WHERE Id IN :ids WITH SYSTEM_MODE FOR UPDATE]
        );
        Datetime ts = nowSeconds();
        List<DocSign_Audit_Event__c> rows = new List<DocSign_Audit_Event__c>();
        for (Entry e : entries) {
            DocSign_Envelope__c env = envs.get(e.envelopeId);
            if (env == null) {
                continue;
            }
            Integer seq = (env.Event_Count__c == null ? 0 : env.Event_Count__c.intValue()) + 1;
            DocSign_Audit_Event__c ev = new DocSign_Audit_Event__c(
                Envelope__c = env.Id,
                Envelope_Key__c = env.Envelope_Key__c,
                Event_Type__c = e.eventType,
                Sequence__c = seq,
                Recipient__c = e.recipientId,
                Actor_Name__c = cut(e.actorName, 255),
                Actor_Email__c = cut(e.actorEmail, 255),
                Event_Timestamp__c = ts,
                IP_Address__c = cut(e.ip, 64),
                User_Agent__c = cut(e.userAgent, 255),
                Document_Reference__c = cut(e.documentReference, 64),
                Details__c = cut(e.details, 32000),
                Previous_Hash__c = env.Last_Event_Hash__c
            );
            ev.Hash__c = hashOf(ev);
            env.Last_Event_Hash__c = ev.Hash__c;
            env.Event_Count__c = seq;
            rows.add(ev);
        }
        DocSignAuditGuard.allowInsert = true;
        try {
            Database.insert(rows, AccessLevel.SYSTEM_MODE);
        } finally {
            DocSignAuditGuard.allowInsert = false;
        }
        List<DocSign_Envelope__c> ups = new List<DocSign_Envelope__c>();
        for (DocSign_Envelope__c env : envs.values()) {
            ups.add(new DocSign_Envelope__c(Id = env.Id, Last_Event_Hash__c = env.Last_Event_Hash__c, Event_Count__c = env.Event_Count__c));
        }
        Database.update(ups, AccessLevel.SYSTEM_MODE);
    }

    public static String hashOf(DocSign_Audit_Event__c ev) {
        String payload = String.join(
            new List<String>{
                nz(ev.Envelope_Key__c),
                String.valueOf(ev.Sequence__c == null ? 0 : ev.Sequence__c.intValue()),
                nz(ev.Event_Type__c),
                nz(ev.Actor_Name__c),
                nz(ev.Actor_Email__c),
                ev.Event_Timestamp__c == null ? '' : ev.Event_Timestamp__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
                nz(ev.IP_Address__c),
                nz(ev.User_Agent__c),
                nz(ev.Document_Reference__c),
                nz(ev.Details__c),
                nz(ev.Previous_Hash__c)
            },
            '|'
        );
        return DocSignRenderService.sha256(payload);
    }

    /** Recomputes the chain. Returns true when every event hash and link is intact. */
    public static Boolean verifyChain(Id envelopeId) {
        List<DocSign_Audit_Event__c> evs = [
            SELECT Envelope_Key__c, Sequence__c, Event_Type__c, Actor_Name__c, Actor_Email__c, Event_Timestamp__c, IP_Address__c,
                User_Agent__c, Document_Reference__c, Details__c, Previous_Hash__c, Hash__c
            FROM DocSign_Audit_Event__c
            WHERE Envelope__c = :envelopeId
            WITH SYSTEM_MODE ORDER BY Sequence__c ASC
        ];
        String prev = null;
        Integer expected = 1;
        for (DocSign_Audit_Event__c ev : evs) {
            if (ev.Sequence__c == null || ev.Sequence__c.intValue() != expected || ev.Previous_Hash__c != prev || hashOf(ev) != ev.Hash__c) {
                return false;
            }
            prev = ev.Hash__c;
            expected++;
        }
        return true;
    }

    public static Datetime nowSeconds() {
        Datetime n = Datetime.now();
        return Datetime.newInstanceGmt(n.dateGmt(), Time.newInstance(n.hourGmt(), n.minuteGmt(), n.secondGmt(), 0));
    }

    private static String nz(String s) {
        return s == null ? '' : s;
    }

    /** Values are trimmed before hashing because Salesforce trims text on save. */
    public static String cut(String s, Integer n) {
        if (s == null) {
            return null;
        }
        String t = s.replace('\r\n', '\n').trim().left(n).trim();
        return String.isEmpty(t) ? null : t;
    }
}
