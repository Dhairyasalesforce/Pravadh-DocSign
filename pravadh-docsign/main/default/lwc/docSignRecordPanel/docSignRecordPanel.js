import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import getContext from '@salesforce/apex/DocSignRecordController.getContext';
import generate from '@salesforce/apex/DocSignRecordController.generate';
import createFromUpload from '@salesforce/apex/DocSignPdfPrepController.createFromUpload';
import getPrepUrl from '@salesforce/apex/DocSignPdfPrepController.getPrepUrl';
import { reduceError, formatDateTime } from 'c/docSignUtils';
import DOCSIGN_LOGO from '@salesforce/resourceUrl/DocSignLogo';

export default class DocSignRecordPanel extends NavigationMixin(LightningElement) {
    @api recordId;
    @api objectApiName;
    @api cardTitle = 'Pravadh DocSign';
    @api showDocuments = false;

    logoUrl = DOCSIGN_LOGO;
    @track ctx;
    templateId;
    loading = true;
    generating = false;
    error;
    @track lastResult;
    sendDocumentId;
    showUpload = false;
    prep;
    showList = true;
    openingPdf = false;

    connectedCallback() {
        this.showList = this.showDocuments !== false;
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            this.ctx = await getContext({ recordId: this.recordId });
            if (!this.templateId && this.ctx.templates.length === 1) {
                this.templateId = this.ctx.templates[0].id;
            }
            this.error = undefined;
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.loading = false;
        }
    }

    get templateOptions() {
        return (this.ctx?.templates || []).map((t) => ({ label: t.format === 'DOCX' ? `${t.name} (Word)` : t.name, value: t.id, description: t.description }));
    }
    get hasTemplates() {
        return this.templateOptions.length > 0;
    }
    get generateDisabled() {
        return !this.templateId || this.generating;
    }
    get documents() {
        return (this.ctx?.documents || []).map((d) => ({
            ...d,
            when: formatDateTime(d.createdDate),
            statusToShow: d.isDraft ? 'Draft' : d.envelopeStatus || d.status,
            canPrepare: d.sourceType === 'Uploaded PDF' && (d.isDraft || d.canSend),
            subtitle: `${d.sourceType === 'Uploaded PDF' ? 'Uploaded PDF' : 'v' + d.version + ' · ' + d.format} · ${d.createdBy}`
        }));
    }
    get draftDocs() {
        return this.documents.filter((d) => d.isDraft && d.sourceType === 'Uploaded PDF');
    }
    get hasDrafts() {
        return this.draftDocs.length > 0;
    }
    get resumeDoc() {
        return this.draftDocs[0];
    }
    get resumeText() {
        const n = this.draftDocs.length;
        return n > 1 ? `${n} PDFs are waiting to be prepared. Your work is saved.` : 'A PDF is waiting to be prepared. Your work is saved.';
    }
    get isFinishing() {
        return (this.ctx?.finishing || 0) > 0;
    }
    get hasDocuments() {
        return this.documents.length > 0;
    }
    get documentCount() {
        return this.documents.length;
    }
    get listToggleLabel() {
        return this.showList ? 'Hide documents' : `View documents (${this.documentCount})`;
    }
    get lastCanSend() {
        return this.lastResult && this.lastResult.format === 'PDF';
    }
    get lastWarnings() {
        return this.lastResult?.warnings || [];
    }
    get hasLastWarnings() {
        return this.lastWarnings.length > 0;
    }
    get lastSummary() {
        if (!this.lastResult) return '';
        const r = this.lastResult;
        const sig = r.signatureFieldCount ? ` · ${r.signatureFieldCount} signature field(s) for ${r.signerRoles} signer(s)` : '';
        return `${r.fileName}${sig}`;
    }
    get showSend() {
        return !!this.sendDocumentId;
    }

    get pdfAccept() {
        return ['.pdf'];
    }

    toggleUpload() {
        this.showUpload = !this.showUpload;
    }

    async handleUploadFinished(event) {
        const files = event.detail.files || [];
        if (!files.length) return;
        this.openingPdf = true;
        try {
            const res = await createFromUpload({ recordId: this.recordId, contentDocumentId: files[0].documentId });
            this.showUpload = false;
            this.prep = { documentId: res.documentId, prepUrl: res.prepUrl };
            await this.load();
        } catch (e) {
            this.toast('Could not use this PDF', reduceError(e), 'error');
        } finally {
            this.openingPdf = false;
        }
    }

    async openPrep(documentId) {
        try {
            const url = await getPrepUrl({ documentId });
            this.prep = { documentId, prepUrl: url };
        } catch (e) {
            this.toast('Cannot edit this PDF', reduceError(e), 'error');
        }
    }

    closePrep() {
        this.prep = undefined;
        this.load();
    }

    async handlePrepared(event) {
        const documentId = event.detail.documentId;
        this.prep = undefined;
        await this.load();
        this.toast('PDF prepared', 'Now add the signers and send it.', 'success');
        this.sendDocumentId = documentId;
    }

    handleTemplate(event) {
        this.templateId = event.detail.value;
    }

    toggleList() {
        this.showList = !this.showList;
    }

    async handleGenerate() {
        this.generating = true;
        try {
            this.lastResult = await generate({ templateId: this.templateId, recordId: this.recordId });
            this.toast('Document generated', this.lastResult.fileName, 'success');
            await this.load();
            notifyRecordUpdateAvailable([{ recordId: this.recordId }]).catch(() => {});
        } catch (e) {
            this.toast('Could not generate', reduceError(e), 'error');
        } finally {
            this.generating = false;
        }
    }

    previewFile(contentDocumentId) {
        this[NavigationMixin.Navigate]({ type: 'standard__namedPage', attributes: { pageName: 'filePreview' }, state: { selectedRecordId: contentDocumentId } });
    }

    previewLast() {
        this.previewFile(this.lastResult.contentDocumentId);
    }

    sendLast() {
        this.sendDocumentId = this.lastResult.documentId;
    }

    handleDocAction(event) {
        const { action, id, file } = event.currentTarget.dataset;
        if (action === 'preview' || action === 'signed') {
            this.previewFile(file);
        } else if (action === 'prepare') {
            this.openPrep(id);
        } else if (action === 'send') {
            this.sendDocumentId = id;
        } else if (action === 'open') {
            this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: id, actionName: 'view' } });
        }
    }

    closeSend() {
        this.sendDocumentId = undefined;
    }

    async handleSent() {
        this.sendDocumentId = undefined;
        this.lastResult = undefined;
        await this.load();
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
