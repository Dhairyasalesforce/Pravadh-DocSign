import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDetail from '@salesforce/apex/DocSignWorkspaceController.getDetail';
import cancelEnvelope from '@salesforce/apex/DocSignWorkspaceController.cancelEnvelope';
import resendEnvelope from '@salesforce/apex/DocSignWorkspaceController.resendEnvelope';
import getPrepUrl from '@salesforce/apex/DocSignPdfPrepController.getPrepUrl';
import { reduceError, formatDateTime } from 'c/docSignUtils';

const EVENT_ICONS = {
    'Document Created': 'utility:file',
    'Envelope Created': 'utility:package',
    'Document Sent': 'utility:send',
    'Email Delivered': 'utility:email',
    'Document Viewed': 'utility:preview',
    'Consent Given': 'utility:check',
    'Signature Added': 'utility:signature',
    'Initial Added': 'utility:edit',
    'Recipient Signed': 'utility:success',
    'Document Completed': 'utility:approval',
    'Document Declined': 'utility:close',
    'Document Expired': 'utility:clock',
    'Envelope Cancelled': 'utility:ban',
    'Envelope Resent': 'utility:refresh',
    'Reminder Sent': 'utility:notification',
    'Signed Document Generated': 'utility:pdf_ext',
    'Certificate Generated': 'utility:ribbon'
};

export default class DocSignWorkspace extends NavigationMixin(LightningElement) {
    @api recordId;
    @track d;
    loading = true;
    error;
    busy = false;
    showCancel = false;
    cancelReason = '';
    tab = 'signers';
    prep;

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            this.d = await getDetail({ recordId: this.recordId });
            this.error = undefined;
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.loading = false;
        }
    }

    async openPrep() {
        try {
            const url = await getPrepUrl({ documentId: this.d.documentId });
            this.prep = { documentId: this.d.documentId, prepUrl: url };
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Cannot open this PDF', message: reduceError(e), variant: 'error' }));
        }
    }

    closePrep() {
        this.prep = undefined;
        this.load();
    }

    handlePrepared() {
        this.prep = undefined;
        this.dispatchEvent(new ShowToastEvent({ title: 'PDF prepared', message: 'Send it from the source record.', variant: 'success' }));
        this.load();
    }

    get prepLabel() {
        return this.d?.isDraft ? 'Continue preparing' : 'Edit fields';
    }

    get hasEnvelope() {
        return !!this.d?.envelopeId;
    }
    get recipients() {
        return (this.d?.recipients || []).map((r) => ({
            ...r,
            sent: formatDateTime(r.sentDate),
            viewed: formatDateTime(r.viewedDate),
            signed: formatDateTime(r.signedDate),
            cls: r.isCurrent ? 'ds-signer ds-current' : 'ds-signer'
        }));
    }
    get events() {
        return (this.d?.events || []).map((e) => ({ ...e, when: formatDateTime(e.timestamp), icon: EVENT_ICONS[e.type] || 'utility:record', shortHash: e.hash ? e.hash.substring(0, 16) : '' }));
    }
    get files() {
        return (this.d?.files || []).map((f) => ({ ...f, icon: f.kind === 'Certificate' ? 'utility:ribbon' : f.kind === 'Signed' ? 'utility:signature' : 'utility:file' }));
    }
    get hasFiles() {
        return this.files.length > 0;
    }
    get envelopes() {
        return this.d?.envelopes || [];
    }
    get hasMultipleEnvelopes() {
        return this.envelopes.length > 1;
    }
    get sent() {
        return formatDateTime(this.d?.sentDate);
    }
    get completed() {
        return formatDateTime(this.d?.completedDate);
    }
    get expires() {
        return formatDateTime(this.d?.expiresOn);
    }
    get integrityLabel() {
        return this.d?.chainIntact ? 'Audit trail verified' : 'Audit trail integrity check failed';
    }
    get integrityCls() {
        return this.d?.chainIntact ? 'ds-integrity ds-ok' : 'ds-integrity ds-bad';
    }
    get integrityIcon() {
        return this.d?.chainIntact ? 'utility:shield' : 'utility:warning';
    }
    get isSigners() {
        return this.tab === 'signers';
    }
    get isTimeline() {
        return this.tab === 'timeline';
    }
    get isFiles() {
        return this.tab === 'files';
    }
    get tabs() {
        return [
            { id: 'signers', label: `Signers (${this.recipients.length})` },
            { id: 'timeline', label: `Audit trail (${this.events.length})` },
            { id: 'files', label: `Files (${this.files.length})` }
        ].map((t) => ({ ...t, cls: t.id === this.tab ? 'ds-tab ds-tab-on' : 'ds-tab' }));
    }
    selectTab(e) {
        this.tab = e.currentTarget.dataset.id;
    }

    openFile(e) {
        this[NavigationMixin.Navigate]({ type: 'standard__namedPage', attributes: { pageName: 'filePreview' }, state: { selectedRecordId: e.currentTarget.dataset.id } });
    }
    openRecord(e) {
        this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: e.currentTarget.dataset.id, actionName: 'view' } });
    }

    async resend() {
        this.busy = true;
        try {
            const n = await resendEnvelope({ envelopeId: this.d.envelopeId });
            this.toast('Resent', `New signing links sent to ${n} signer(s).`, 'success');
            await this.load();
        } catch (e) {
            this.toast('Could not resend', reduceError(e), 'error');
        } finally {
            this.busy = false;
        }
    }

    openCancel() {
        this.showCancel = true;
    }
    closeCancel() {
        this.showCancel = false;
    }
    handleReason(e) {
        this.cancelReason = e.detail.value;
    }
    async confirmCancel() {
        this.busy = true;
        try {
            await cancelEnvelope({ envelopeId: this.d.envelopeId, reason: this.cancelReason });
            this.toast('Envelope cancelled', 'Signers were notified and their links no longer work.', 'success');
            this.showCancel = false;
            await this.load();
        } catch (e) {
            this.toast('Could not cancel', reduceError(e), 'error');
        } finally {
            this.busy = false;
        }
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
