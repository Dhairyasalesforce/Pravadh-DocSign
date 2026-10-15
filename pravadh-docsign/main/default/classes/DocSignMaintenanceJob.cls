/**
 * Pravadh DocSign - hourly maintenance: expires overdue envelopes and sends reminders.
 * Schedule from DocSign Settings (or: System.schedule('Pravadh DocSign Maintenance', '0 0 * * * ?', new DocSignMaintenanceJob());)
 */
public with sharing class DocSignMaintenanceJob implements Schedulable, Database.Batchable<SObject> {
    public static final String JOB_NAME = 'Pravadh DocSign Maintenance';

    public void execute(SchedulableContext sc) {
        Database.executeBatch(new DocSignMaintenanceJob(), 50);
    }

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator(
            [SELECT Id, Status__c, Expires_On__c, Document__c, Sent_Date__c, Last_Reminder_Date__c FROM DocSign_Envelope__c WHERE Status__c IN ('Sent', 'Viewed', 'Partially Signed') WITH SYSTEM_MODE]
        );
    }

    public void execute(Database.BatchableContext bc, List<DocSign_Envelope__c> scope) {
        DocSignLifecycle.expire(scope);
        Decimal interval = DocSignEmailService.settings().Reminder_Interval_Days__c;
        if (interval == null || interval <= 0) {
            return;
        }
        Datetime threshold = Datetime.now().addHours(-(interval * 24).intValue());
        Integer sent = 0;
        List<DocSign_Envelope__c> stamped = new List<DocSign_Envelope__c>();
        for (DocSign_Envelope__c e : scope) {
            Boolean expired = e.Expires_On__c != null && e.Expires_On__c < Datetime.now();
            Datetime last = e.Last_Reminder_Date__c != null ? e.Last_Reminder_Date__c : e.Sent_Date__c;
            if (!expired && last != null && last < threshold && sent < 10) {
                DocSignReminderSender.remind(e.Id);
                stamped.add(new DocSign_Envelope__c(Id = e.Id, Last_Reminder_Date__c = Datetime.now()));
                sent++;
            }
        }
        if (!stamped.isEmpty()) {
            DocSignReminderSender.stamp(stamped);
        }
    }

    public void finish(Database.BatchableContext bc) {
        return;
    }

    public static Boolean isScheduled() {
        return ![SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = :JOB_NAME WITH SYSTEM_MODE LIMIT 1].isEmpty();
    }

    public static void scheduleHourly() {
        if (!isScheduled()) {
            System.schedule(JOB_NAME, '0 0 * * * ?', new DocSignMaintenanceJob());
        }
    }

    public static void unschedule() {
        for (CronTrigger ct : [SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = :JOB_NAME WITH SYSTEM_MODE]) {
            System.abortJob(ct.Id);
        }
    }
}
