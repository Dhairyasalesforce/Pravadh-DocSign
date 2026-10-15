/**
 * Pravadh DocSign Intelligence - AI extension point (generally available platform features only).
 *
 * The core package never hard-codes an AI vendor. Providers implement the global Provider interface and are
 * registered with DocSign_AI_Provider__mdt records (Apex class name, priority, active). The first provider
 * that handles a request wins; the built-in heuristic provider is always the fallback. An Agentforce add-on
 * package (Models API / Prompt Builder) or a customer's own class can register itself without code changes here.
 *
 * The interface has a single generic method on purpose: global interfaces cannot gain methods once released.
 */
global with sharing class DocSignIntelligence {
    global static final String TASK_SUGGEST_TEMPLATE = 'suggest_template';
    global static final String TASK_MISSING_DATA = 'missing_data';
    global static final String TASK_SUMMARIZE_ENVELOPE = 'summarize_envelope';
    global static final String TASK_SUMMARIZE_DOCUMENT = 'summarize_document';

    global interface Provider {
        DocSignIntelligence.Response handle(DocSignIntelligence.Request request);
    }

    global class Request {
        global String task;
        global Id recordId;
        global Id templateId;
        global Id documentId;
        global Id envelopeId;
        global String prompt;
        global Map<String, Object> params = new Map<String, Object>();
    }

    global class Response {
        global Boolean handled = false;
        global String text;
        global Id reference;
        global List<String> items = new List<String>();
        global Map<String, Object> data = new Map<String, Object>();
        global String provider;
    }

    /** Runs a request through registered providers (priority order) and falls back to heuristics. */
    public static Response run(Request req) {
        for (Provider p : registeredProviders()) {
            try {
                Response r = p.handle(req);
                if (r != null && r.handled == true) {
                    if (String.isBlank(r.provider)) {
                        r.provider = String.valueOf(p).substringBefore(':');
                    }
                    return r;
                }
            } catch (Exception e) {
                continue; // a failing provider must never break the core document workflow
            }
        }
        Response r = new HeuristicProvider().handle(req);
        r.provider = 'Pravadh DocSign (built-in)';
        return r;
    }

    public static List<Provider> registeredProviders() {
        List<DocSign_AI_Provider__mdt> rows = DocSign_AI_Provider__mdt.getAll().values();
        List<DocSign_AI_Provider__mdt> active = new List<DocSign_AI_Provider__mdt>();
        for (DocSign_AI_Provider__mdt m : rows) {
            if (m.Active__c && String.isNotBlank(m.Apex_Class__c)) {
                active.add(m);
            }
        }
        // simple priority sort (lower first)
        for (Integer i = 0; i < active.size(); i++) {
            for (Integer j = i + 1; j < active.size(); j++) {
                Decimal a = active[i].Priority__c == null ? 100 : active[i].Priority__c;
                Decimal b = active[j].Priority__c == null ? 100 : active[j].Priority__c;
                if (b < a) {
                    DocSign_AI_Provider__mdt t = active[i];
                    active[i] = active[j];
                    active[j] = t;
                }
            }
        }
        List<Provider> out = new List<Provider>();
        for (DocSign_AI_Provider__mdt m : active) {
            Type t = Type.forName(m.Apex_Class__c.trim());
            Object inst = t == null ? null : t.newInstance();
            if (inst instanceof Provider) {
                out.add((Provider) inst);
            }
        }
        return out;
    }

    /** Deterministic, data-driven provider used when no AI provider is registered. */
    public with sharing class HeuristicProvider implements Provider {
        public Response handle(Request req) {
            Response r = new Response();
            r.handled = true;
            if (req.task == TASK_SUGGEST_TEMPLATE) {
                suggestTemplate(req, r);
            } else if (req.task == TASK_MISSING_DATA) {
                missingData(req, r);
            } else if (req.task == TASK_SUMMARIZE_ENVELOPE) {
                r.text = DocSignAgentSupport.envelopeSummary(req.envelopeId);
                r.reference = req.envelopeId;
            } else if (req.task == TASK_SUMMARIZE_DOCUMENT) {
                r.text = DocSignAgentSupport.documentSummary(req.documentId);
                r.reference = req.documentId;
            } else {
                r.handled = false;
                r.text = 'Unsupported task: ' + req.task;
            }
            return r;
        }

        private void suggestTemplate(Request req, Response r) {
            String obj = req.recordId.getSObjectType().getDescribe().getName();
            List<DocSign_Template__c> ts = [
                SELECT Id, Name, Description__c, Category__c FROM DocSign_Template__c
                WHERE Object_API_Name__c = :obj AND Active__c = TRUE WITH USER_MODE ORDER BY LastModifiedDate DESC LIMIT 50
            ];
            String q = req.prompt == null ? '' : req.prompt.toLowerCase();
            DocSign_Template__c best = null;
            Integer bestScore = -1;
            for (DocSign_Template__c t : ts) {
                Integer score = 0;
                String hay = (t.Name + ' ' + (t.Description__c == null ? '' : t.Description__c) + ' ' + (t.Category__c == null ? '' : t.Category__c)).toLowerCase();
                for (String w : q.split('[^a-z0-9]+')) {
                    if (w.length() > 3 && hay.contains(w)) {
                        score += t.Name.toLowerCase().contains(w) ? 3 : 1;
                    }
                }
                if (score > bestScore) {
                    best = t;
                    bestScore = score;
                }
                r.items.add(t.Name);
            }
            r.reference = best == null ? null : best.Id;
            r.text = best == null ? 'No active templates exist for ' + obj + '.' : 'Suggested template: ' + best.Name;
        }

        private void missingData(Request req, Response r) {
            DocSign_Template__c t = DocSignGenerationService.loadTemplate(req.templateId);
            DocSignGenerationService.PreviewResult p = DocSignGenerationService.preview(t, req.recordId);
            r.items.addAll(p.blankFields);
            r.items.addAll(p.warnings);
            r.data.put('blankFields', p.blankFields);
            r.data.put('warnings', p.warnings);
            r.text = r.items.isEmpty() ? 'All merge fields have data.' : r.items.size() + ' item(s) need attention: ' + String.join(r.items, '; ');
        }
    }

    /** Backwards-compatible accessor. */
    public static Provider provider() {
        return new HeuristicProvider();
    }
}
