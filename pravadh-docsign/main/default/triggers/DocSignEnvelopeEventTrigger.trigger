trigger DocSignEnvelopeEventTrigger on DocSign_Envelope_Event__e(after insert) {
    DocSignEventHandler.handle(Trigger.new);
}
