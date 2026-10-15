trigger DocSignEnvelopeTrigger on DocSign_Envelope__c(before delete) {
    DocSignAuditGuard.beforeEnvelopeDelete(Trigger.old);
}
