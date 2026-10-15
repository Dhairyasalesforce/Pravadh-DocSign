import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getDashboard from '@salesforce/apex/DocSignHomeController.getDashboard';
import getPrepUrl from '@salesforce/apex/DocSignPdfPrepController.getPrepUrl';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { reduceError, formatDateTime } from 'c/docSignUtils';
import DOCSIGN_LOGO from '@salesforce/resourceUrl/DocSignLogo';

const ICONS = {
    created: 'utility:file',
    sent: 'utility:send',
    awaiting: 'utility:clock',
    completed: 'utility:success',
    expired: 'utility:ban',
    declined: 'utility:close'
};

export default class DocSignHome extends NavigationMixin(LightningElement) {
    logoUrl = DOCSIGN_LOGO;
    @track data;
    error;
    loading = true;
    prep;

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            this.data = await getDashboard();
            this.error = undefined;
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.loading = false;
        }
    }

    get metrics() {
        return (this.data?.metrics || []).map((m) => ({ ...m, icon: ICONS[m.key], cls: `ds-metric ds-metric-${m.key}` }));
    }

    get recent() {
        return (this.data?.recent || []).map((r) => ({ ...r, when: formatDateTime(r.lastModified) }));
    }

    get drafts() {
        return (this.data?.drafts || []).map((r) => ({
            ...r,
            when: formatDateTime(r.lastModified),
            detail: [r.recordName || r.sourceObject, r.pageCount ? `${r.pageCount} pages` : null, r.hasProgress ? 'work saved' : 'not started'].filter((x) => x).join(' · ')
        }));
    }

    get hasDrafts() {
        return this.drafts.length > 0;
    }

    async continueDraft(event) {
        const documentId = event.currentTarget.dataset.id;
        try {
            const url = await getPrepUrl({ documentId });
            this.prep = { documentId, prepUrl: url };
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Cannot open this PDF', message: reduceError(e), variant: 'error' }));
        }
    }

    closePrep() {
        this.prep = undefined;
        this.load();
    }

    handlePrepared() {
        const documentId = this.prep?.documentId;
        this.prep = undefined;
        this.dispatchEvent(new ShowToastEvent({ title: 'PDF prepared', message: 'Open the record to add signers and send it.', variant: 'success' }));
        this.load();
        if (documentId) {
            this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: documentId, actionName: 'view' } });
        }
    }

    get hasRecent() {
        return this.recent.length > 0;
    }

    get setup() {
        return (this.data?.setup || []).map((s) => ({ ...s, icon: s.done ? 'utility:success' : 'utility:routing_offline', cls: s.done ? 'ds-step ds-done' : 'ds-step' }));
    }

    get progressStyle() {
        return `width:${this.setupProgress}%`;
    }

    get setupOpen() {
        return this.setup.some((s) => !s.done);
    }

    get setupProgress() {
        const s = this.setup;
        return s.length ? Math.round((100 * s.filter((x) => x.done).length) / s.length) : 0;
    }

    openEnvelope(event) {
        this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: event.currentTarget.dataset.id, actionName: 'view' } });
    }

    openSource(event) {
        event.stopPropagation();
        this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: event.currentTarget.dataset.id, actionName: 'view' } });
    }

    goTab(event) {
        const ns = this.data?.namespacePrefix;
        const tab = event.currentTarget.dataset.tab;
        this[NavigationMixin.Navigate]({ type: 'standard__navItemPage', attributes: { apiName: ns ? `${ns}__${tab}` : tab } });
    }
}
