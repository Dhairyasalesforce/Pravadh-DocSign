/**
 * Pravadh DocSign - Home dashboard and Settings endpoints.
 */
public with sharing class DocSignHomeController {
    public class Metric {
        @AuraEnabled public String key;
        @AuraEnabled public String label;
        @AuraEnabled public Integer value;
    }

    public class EnvelopeRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String title;
        @AuraEnabled public String status;
        @AuraEnabled public String sourceObject;
        @AuraEnabled public String sourceRecordId;
        @AuraEnabled public Datetime sentDate;
        @AuraEnabled public Datetime lastModified;
        @AuraEnabled public String owner;
    }

    public class DraftRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String title;
        @AuraEnabled public String recordName;
        @AuraEnabled public String sourceObject;
        @AuraEnabled public String sourceRecordId;
        @AuraEnabled public Integer pageCount;
        @AuraEnabled public Boolean hasProgress;
        @AuraEnabled public Datetime lastModified;
    }

    public class SetupItem {
        @AuraEnabled public String key;
        @AuraEnabled public String label;
        @AuraEnabled public String help;
        @AuraEnabled public Boolean done;
    }

    public class Dashboard {
        @AuraEnabled public List<Metric> metrics = new List<Metric>();
        @AuraEnabled public List<EnvelopeRow> recent = new List<EnvelopeRow>();
        @AuraEnabled public List<DraftRow> drafts = new List<DraftRow>();
        @AuraEnabled public List<SetupItem> setup = new List<SetupItem>();
        @AuraEnabled public Boolean isAdmin;
        @AuraEnabled public Integer templateCount;
        @AuraEnabled public String namespacePrefix;
    }

    public class SettingsDto {
        @AuraEnabled public String signingSiteUrl { get; set; }
        @AuraEnabled public String orgWideEmailId { get; set; }
        @AuraEnabled public Integer defaultExpiryDays { get; set; }
        @AuraEnabled public Integer reminderIntervalDays { get; set; }
        @AuraEnabled public String brandColor { get; set; }
        @AuraEnabled public String companyName { get; set; }
        @AuraEnabled public String consentText { get; set; }
        @AuraEnabled public Boolean linkToSourceRecord { get; set; }
        @AuraEnabled public Boolean showPromotions { get; set; }
        @AuraEnabled public Boolean maintenanceScheduled { get; set; }
        @AuraEnabled public Boolean isAdmin { get; set; }
        @AuraEnabled public String signingPageName { get; set; }
        @AuraEnabled public List<Map<String, String>> orgWideEmails { get; set; }
        @AuraEnabled public DocSignAgentSupport.AiStatus ai { get; set; }
        @AuraEnabled public DocSignEmailHealth.Health emailHealth { get; set; }
    }

    public static Boolean isAdmin() {
        return FeatureManagement.checkPermission('Pravadh_DocSign_Admin');
    }

    @AuraEnabled
    public static Dashboard getDashboard() {
        try {
            Dashboard d = new Dashboard();
            Map<String, Integer> byStatus = new Map<String, Integer>();
            for (AggregateResult ar : [SELECT Status__c s, COUNT(Id) c FROM DocSign_Envelope__c WITH USER_MODE GROUP BY Status__c]) {
                byStatus.put((String) ar.get('s'), (Integer) ar.get('c'));
            }
            Integer docs = [SELECT COUNT() FROM DocSign_Document__c WITH USER_MODE];
            Integer sent = 0;
            for (String s : byStatus.keySet()) {
                if (s != 'Draft' && s != 'Prepared') {
                    sent += byStatus.get(s);
                }
            }
            d.metrics.add(metric('created', 'Documents Created', docs));
            d.metrics.add(metric('sent', 'Documents Sent', sent));
            d.metrics.add(metric('awaiting', 'Awaiting Signature', n(byStatus, 'Sent') + n(byStatus, 'Viewed') + n(byStatus, 'Partially Signed')));
            d.metrics.add(metric('completed', 'Completed', n(byStatus, 'Completed')));
            d.metrics.add(metric('expired', 'Expired', n(byStatus, 'Expired')));
            d.metrics.add(metric('declined', 'Declined', n(byStatus, 'Declined')));
            for (DocSign_Envelope__c e : [
                SELECT Id, Name, Title__c, Status__c, Object_API_Name__c, Record_Id__c, Sent_Date__c, LastModifiedDate, Owner.Name
                FROM DocSign_Envelope__c WITH USER_MODE ORDER BY LastModifiedDate DESC LIMIT 12
            ]) {
                EnvelopeRow r = new EnvelopeRow();
                r.id = e.Id;
                r.name = e.Name;
                r.title = e.Title__c;
                r.status = e.Status__c;
                r.sourceObject = e.Object_API_Name__c;
                r.sourceRecordId = e.Record_Id__c;
                r.sentDate = e.Sent_Date__c;
                r.lastModified = e.LastModifiedDate;
                r.owner = e.Owner.Name;
                d.recent.add(r);
            }
            d.drafts = myDrafts();
            d.templateCount = [SELECT COUNT() FROM DocSign_Template__c WITH USER_MODE];
            d.isAdmin = isAdmin();
            d.namespacePrefix = DocSignSchemaService.namespace();
            DocSign_Settings__c s = DocSignEmailService.settings();
            d.setup.add(setup('template', 'Create your first template', 'Open Templates and start from any object.', d.templateCount > 0));
            d.setup.add(setup('site', 'Enable external signing', 'Create a Salesforce Site, add the DocSignSign page and paste its URL in Settings.', String.isNotBlank(s.Signing_Site_Url__c)));
            d.setup.add(setup('email', 'Choose a sender address', 'Pick an Org-Wide Email Address so signer emails come from your company.', String.isNotBlank(s.Org_Wide_Email_Id__c)));
            String dkim = 'unknown';
            try {
                dkim = DocSignEmailHealth.check().dkim;
            } catch (Exception healthError) {
                dkim = 'unknown';
            }
            d.setup.add(setup('domain', 'Verify your email domain', 'Setup > DKIM Keys: Salesforce only delivers reliably from verified domains. Use Send test email in Settings to check.', dkim == 'active'));
            d.setup.add(setup('jobs', 'Turn on reminders & expiry', 'Schedule the hourly maintenance job in Settings.', DocSignMaintenanceJob.isScheduled()));
            return d;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    /** Uploaded PDFs the current user started preparing but has not finished (resume from Home). */
    public static List<DraftRow> myDrafts() {
        List<DraftRow> out = new List<DraftRow>();
        Id me = UserInfo.getUserId();
        for (DocSign_Document__c doc : [
            SELECT Id, Title__c, Record_Name__c, Object_API_Name__c, Record_Id__c, Page_Count__c, Layout_Json__c, LastModifiedDate
            FROM DocSign_Document__c
            WHERE Status__c = 'Draft' AND Source_Type__c = 'Uploaded PDF' AND CreatedById = :me
            WITH USER_MODE
            ORDER BY LastModifiedDate DESC
            LIMIT 10
        ]) {
            DraftRow r = new DraftRow();
            r.id = doc.Id;
            r.title = doc.Title__c;
            r.recordName = doc.Record_Name__c;
            r.sourceObject = doc.Object_API_Name__c;
            r.sourceRecordId = doc.Record_Id__c;
            r.pageCount = doc.Page_Count__c == null ? null : doc.Page_Count__c.intValue();
            r.hasProgress = String.isNotBlank(doc.Layout_Json__c);
            r.lastModified = doc.LastModifiedDate;
            out.add(r);
        }
        return out;
    }

    @AuraEnabled
    public static DocSignEmailHealth.TestResult sendTestEmail(String toAddress) {
        try {
            return DocSignEmailHealth.sendTest(toAddress);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static SettingsDto getSettings() {
        try {
            DocSign_Settings__c s = DocSignEmailService.settings();
            SettingsDto d = new SettingsDto();
            d.signingSiteUrl = s.Signing_Site_Url__c;
            d.orgWideEmailId = s.Org_Wide_Email_Id__c;
            d.defaultExpiryDays = s.Default_Expiry_Days__c == null ? 30 : s.Default_Expiry_Days__c.intValue();
            d.reminderIntervalDays = s.Reminder_Interval_Days__c == null ? 3 : s.Reminder_Interval_Days__c.intValue();
            d.brandColor = String.isBlank(s.Brand_Color__c) ? '#0B5CAB' : s.Brand_Color__c;
            d.companyName = s.Company_Name__c;
            d.consentText = s.Consent_Text__c;
            d.linkToSourceRecord = s.Id == null ? true : s.Link_To_Source_Record__c;
            d.showPromotions = s.Id == null ? true : s.Show_Promotions__c;
            d.maintenanceScheduled = DocSignMaintenanceJob.isScheduled();
            d.isAdmin = isAdmin();
            d.signingPageName = DocSignSchemaService.nsPage('DocSignSign');
            d.ai = DocSignAgentSupport.status();
            try {
                d.emailHealth = DocSignEmailHealth.check();
            } catch (Exception healthError) {
                d.emailHealth = null;
            }
            d.orgWideEmails = new List<Map<String, String>>();
            for (OrgWideEmailAddress o : [SELECT Id, Address, DisplayName FROM OrgWideEmailAddress WITH USER_MODE ORDER BY DisplayName LIMIT 100]) {
                d.orgWideEmails.add(new Map<String, String>{ 'value' => o.Id, 'label' => o.DisplayName + ' <' + o.Address + '>' });
            }
            return d;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static void saveSettings(String payload) {
        try {
            if (!isAdmin()) {
                throw new DocSignException('You need the Pravadh DocSign Admin permission to change settings.');
            }
            SettingsDto d = (SettingsDto) JSON.deserialize(payload, SettingsDto.class);
            if (String.isNotBlank(d.signingSiteUrl) && !d.signingSiteUrl.trim().startsWithIgnoreCase('https://')) {
                throw new DocSignException('The Signing Site URL must start with https://');
            }
            if (String.isNotBlank(d.brandColor) && !Pattern.matches('#[0-9A-Fa-f]{3,6}', d.brandColor.trim())) {
                throw new DocSignException('Brand color must be a hex value such as #0B5CAB.');
            }
            DocSign_Settings__c s = DocSign_Settings__c.getOrgDefaults();
            if (s == null) {
                s = new DocSign_Settings__c();
            }
            s.SetupOwnerId = UserInfo.getOrganizationId();
            s.Signing_Site_Url__c = String.isBlank(d.signingSiteUrl) ? null : d.signingSiteUrl.trim().removeEnd('/');
            s.Org_Wide_Email_Id__c = String.isBlank(d.orgWideEmailId) ? null : d.orgWideEmailId;
            s.Default_Expiry_Days__c = d.defaultExpiryDays == null ? 30 : Math.max(1, Math.min(365, d.defaultExpiryDays));
            s.Reminder_Interval_Days__c = d.reminderIntervalDays == null ? 0 : Math.max(0, Math.min(60, d.reminderIntervalDays));
            s.Brand_Color__c = String.isBlank(d.brandColor) ? null : d.brandColor.trim();
            s.Company_Name__c = d.companyName;
            s.Consent_Text__c = d.consentText;
            s.Link_To_Source_Record__c = d.linkToSourceRecord != false;
            s.Show_Promotions__c = d.showPromotions != false;
            // Admin-gated by the Pravadh_DocSign_Admin custom permission above, then written in user
            // mode: the admin permission set grants access to the DocSign Settings custom setting.
            assertSettingsWritable(s.Id == null);
            upsert as user s;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    private static final List<Schema.SObjectField> SETTINGS_FIELDS = new List<Schema.SObjectField>{
        DocSign_Settings__c.Signing_Site_Url__c,
        DocSign_Settings__c.Org_Wide_Email_Id__c,
        DocSign_Settings__c.Default_Expiry_Days__c,
        DocSign_Settings__c.Reminder_Interval_Days__c,
        DocSign_Settings__c.Brand_Color__c,
        DocSign_Settings__c.Company_Name__c,
        DocSign_Settings__c.Consent_Text__c,
        DocSign_Settings__c.Link_To_Source_Record__c,
        DocSign_Settings__c.Show_Promotions__c
    };

    /** Explicit CRUD/FLS check before saving settings (create for the first save, update after). */
    private static void assertSettingsWritable(Boolean isNew) {
        Schema.DescribeSObjectResult o = Schema.SObjectType.DocSign_Settings__c;
        Boolean ok = isNew ? o.isCreateable() : o.isUpdateable();
        for (Schema.SObjectField f : SETTINGS_FIELDS) {
            Schema.DescribeFieldResult fd = f.getDescribe();
            ok = ok && (isNew ? fd.isCreateable() : fd.isUpdateable());
        }
        if (!ok) {
            throw new DocSignException('You do not have access to change DocSign Settings. Ask an admin to assign the Pravadh DocSign Admin permission set.');
        }
    }

    /** Whether the in-app Pravadh Labs product card is shown (defaults to on until an admin disables it). */
    @AuraEnabled(cacheable=true)
    public static Boolean promotionsEnabled() {
        DocSign_Settings__c s = DocSign_Settings__c.getOrgDefaults();
        return s == null || s.Id == null || s.Show_Promotions__c;
    }

    @AuraEnabled
    public static Boolean setMaintenance(Boolean enabled) {
        try {
            if (!isAdmin()) {
                throw new DocSignException('You need the Pravadh DocSign Admin permission to change scheduling.');
            }
            if (enabled == true) {
                DocSignMaintenanceJob.scheduleHourly();
            } else {
                DocSignMaintenanceJob.unschedule();
            }
            return DocSignMaintenanceJob.isScheduled();
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    private static Metric metric(String key, String label, Integer value) {
        Metric m = new Metric();
        m.key = key;
        m.label = label;
        m.value = value;
        return m;
    }

    private static SetupItem setup(String key, String label, String help, Boolean done) {
        SetupItem i = new SetupItem();
        i.key = key;
        i.label = label;
        i.help = help;
        i.done = done;
        return i;
    }

    private static Integer n(Map<String, Integer> m, String k) {
        return m.containsKey(k) ? m.get(k) : 0;
    }
}
