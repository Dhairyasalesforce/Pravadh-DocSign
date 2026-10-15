/**
 * Pravadh DocSign - asynchronous follow-up: next-signer delivery, finalization and decline notices.
 */
public without sharing class DocSignEventJob implements Queueable {
    private Map<String, List<Id>> work;

    public DocSignEventJob(Map<String, List<Id>> work) {
        this.work = work;
    }

    public void execute(QueueableContext ctx) {
        if (work.containsKey('RoutingAdvanced')) {
            for (Id envId : work.get('RoutingAdvanced')) {
                DocSignRoutingService.sendCurrentGroup(envId, 'initial', 'Pravadh DocSign', null);
            }
        }
        if (work.containsKey('Declined')) {
            for (Id envId : work.get('Declined')) {
                DocSignLifecycle.notifyDeclined(envId);
            }
        }
        if (work.containsKey('AllSigned')) {
            List<Id> ids = work.get('AllSigned');
            List<Id> rest = new List<Id>();
            // true = signer images were just stored as files; render in the next transaction.
            if (DocSignCompletionService.finalizeStep(ids[0])) {
                rest.add(ids[0]);
            }
            for (Integer i = 1; i < ids.size(); i++) {
                rest.add(ids[i]);
            }
            // One PDF render per transaction keeps heap/CPU well inside limits.
            if (!rest.isEmpty() && !Test.isRunningTest()) {
                System.enqueueJob(new DocSignEventJob(new Map<String, List<Id>>{ 'AllSigned' => rest }));
            }
        }
    }
}
