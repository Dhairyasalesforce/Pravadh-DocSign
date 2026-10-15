/**
 * Pravadh DocSign - Apex-defined type for Flow: one signer.
 */
global with sharing class DocSignRecipientInput {
    @AuraEnabled @InvocableVariable(label='Name' required=true)
    global String name;
    @AuraEnabled @InvocableVariable(label='Email' required=true)
    global String email;
    @AuraEnabled @InvocableVariable(label='Signer Role (1, 2, 3...)' description='Matches {{sign:...:N}} tags in the template. Defaults to list position.')
    global Integer roleNumber;
    @AuraEnabled @InvocableVariable(label='Routing Order' description='Recipients with the same order sign in parallel. Defaults from the signing order.')
    global Integer routingOrder;
    @AuraEnabled @InvocableVariable(label='Role Label' description='e.g. Customer, Sales Manager, Legal')
    global String roleLabel;
    @AuraEnabled @InvocableVariable(label='Access Code' description='Optional code the signer must enter (share it separately).')
    global String accessCode;
}
