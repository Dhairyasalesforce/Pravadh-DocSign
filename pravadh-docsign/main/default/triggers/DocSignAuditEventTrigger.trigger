trigger DocSignAuditEventTrigger on DocSign_Audit_Event__c(before insert, before update, before delete) {
    DocSignAuditGuard.handle(Trigger.operationType, Trigger.new, Trigger.old);
}
