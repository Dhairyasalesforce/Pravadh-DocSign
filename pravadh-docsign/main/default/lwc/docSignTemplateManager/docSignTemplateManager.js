import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LightningConfirm from 'lightning/confirm';
import listTemplates from '@salesforce/apex/DocSignTemplateController.listTemplates';
import getTemplate from '@salesforce/apex/DocSignTemplateController.getTemplate';
import saveTemplate from '@salesforce/apex/DocSignTemplateController.saveTemplate';
import cloneTemplate from '@salesforce/apex/DocSignTemplateController.cloneTemplate';
import { updateRecord, deleteRecord } from 'lightning/uiRecordApi';
import ID_FIELD from '@salesforce/schema/DocSign_Template__c.Id';
import ACTIVE_FIELD from '@salesforce/schema/DocSign_Template__c.Active__c';
import FILE_FIELD from '@salesforce/schema/DocSign_Template__c.Template_File_Id__c';
import FORMAT_FIELD from '@salesforce/schema/DocSign_Template__c.Format__c';
import listObjects from '@salesforce/apex/DocSignTemplateController.listObjects';
import describeObject from '@salesforce/apex/DocSignTemplateController.describeObject';
import searchRecords from '@salesforce/apex/DocSignTemplateController.searchRecords';
import previewPdf from '@salesforce/apex/DocSignTemplateController.previewPdf';
import starterBody from '@salesforce/apex/DocSignTemplateController.starterBody';
import { reduceError, formatDateTime } from 'c/docSignUtils';

const EMPTY = {
    id: null,
    name: '',
    objectApiName: '',
    active: false,
    format: 'HTML',
    body: '',
    header: '',
    footer: '<div style="text-align:right">Page {{$PageNumber}} of {{$PageCount}}</div>',
    stylesheet: '',
    pageSize: 'A4',
    orientation: 'Portrait',
    outputFileName: '',
    description: '',
    category: '',
    signingOrder: 'Sequential',
    defaultExpiryDays: null,
    emailSubject: '',
    emailMessage: '',
    onCompleteField: '',
    onCompleteValue: ''
};

const DSX_MARKER = '<!--dsx:1-->';

/** Can this body open in the visual editor without losing template logic? Returns null or a reason. */
function visualBlocker(body) {
    const src = String(body || '');
    if (!src.trim() || src.startsWith(DSX_MARKER)) return null;
    const stack = [];
    for (const t of src.match(/\{\{[\s\S]*?\}\}/g) || []) {
        const tok = t.replace(/\s+/g, ' ');
        if (tok.startsWith('{{#each')) {
            if (stack.includes('each')) return 'it has a loop inside another loop';
            stack.push('each');
        } else if (tok.startsWith('{{#if')) stack.push('if');
        else if (tok === '{{else}}' && stack[stack.length - 1] === 'each') return 'it uses {{else}} inside a loop';
        else if (tok === '{{/each}}' || tok === '{{/if}}') stack.pop();
    }
    const re = /\{\{#each[^}]*\}\}([\s\S]*?)\{\{\/each\}\}/g;
    let m;
    while ((m = re.exec(src))) {
        const inner = m[1].trim();
        const rows = inner.match(/<tr[\s>]/gi) || [];
        if (/<\/?t[dhr][\s>]/i.test(inner) && !(/^<tr[\s>]/i.test(inner) && /<\/tr>$/i.test(inner) && rows.length === 1)) {
            return 'it has a loop inside a table that is not exactly one row';
        }
    }
    return null;
}

const PARTS = [
    { value: 'body', label: 'Body' },
    { value: 'header', label: 'Header' },
    { value: 'footer', label: 'Footer' },
    { value: 'stylesheet', label: 'CSS' }
];

const SIGN_TAGS = [
    { value: 'signature', label: 'Signature', icon: 'utility:signature' },
    { value: 'initial', label: 'Initials', icon: 'utility:edit' },
    { value: 'date', label: 'Date Signed', icon: 'utility:date_input' },
    { value: 'name', label: 'Full Name', icon: 'utility:user' },
    { value: 'email', label: 'Email', icon: 'utility:email' },
    { value: 'text', label: 'Text Input', icon: 'utility:text' },
    { value: 'checkbox', label: 'Checkbox', icon: 'utility:check' }
];

export default class DocSignTemplateManager extends NavigationMixin(LightningElement) {
    mode = 'list';
    loading = false;
    error;
    @track templates = [];
    filter = '';
    @track tpl = { ...EMPTY };
    dirty = false;
    activePart = 'body';
    bodyMode = 'visual';
    visualConverting = false;
    normalisedOnce = false;
    objects = [];
    objectFilter = '';

    // explorer
    @track explorerStack = [];
    @track explorerFields = [];
    explorerFilter = '';
    explorerLoading = false;
    signRole = '1';

    // preview
    recordTerm = '';
    @track recordOptions = [];
    previewRecordId;
    @track previewWarnings = [];
    previewStats;
    previewLoading = false;
    pendingCaret;

    parts = PARTS;
    signTags = SIGN_TAGS;
    builtins = [
        { label: 'Today', tag: '{{$Today | date:"d MMMM yyyy"}}' },
        { label: 'Current user', tag: '{{$User.Name}}' },
        { label: 'Company', tag: '{{$Org.Name}}' },
        { label: 'Page #', tag: '{{$PageNumber}}' },
        { label: 'Page count', tag: '{{$PageCount}}' },
        { label: 'Row #', tag: '{{$index}}' }
    ];
    fileNameHelp = 'Supports merge fields, e.g. {{Name}} - Agreement';
    docxSaveFirst = 'Save the template first, then upload your Word file. Use the same {{merge}} tags inside Word.';
    docxHelp = 'Word templates are authored in Microsoft Word. Type merge tags such as {{Name}} or {{Account.Name}}, and put {{#each OpportunityLineItems}} … {{/each}} inside a table row to repeat it.';
    syntaxHint = 'HTML with merge tags: {{Field}}  {{Parent.Field}}  {{Amount | currency}}  {{#each Children}}…{{/each}}  {{#if Field == "X"}}…{{else}}…{{/if}}  {{image:068…}}  {{sign:signature:1}}';

    get loopBanner() {
        return `Fields here go inside {{#each ${this.childRel}}}`;
    }

    connectedCallback() {
        this.refresh();
    }

    // ------------------------------------------------------------ list
    async refresh() {
        this.loading = true;
        try {
            const rows = await listTemplates();
            this.templates = rows.map((t) => ({ ...t, updated: formatDateTime(t.lastModified), statusLabel: t.active ? 'Active' : 'Inactive', toggleLabel: t.active ? 'Deactivate' : 'Activate' }));
            this.error = undefined;
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.loading = false;
        }
    }

    get isList() {
        return this.mode === 'list';
    }
    get isEditor() {
        return this.mode === 'editor';
    }
    get filteredTemplates() {
        const f = this.filter.toLowerCase();
        return this.templates.filter((t) => !f || (t.name + ' ' + t.objectLabel + ' ' + (t.category || '')).toLowerCase().includes(f));
    }
    get hasTemplates() {
        return this.filteredTemplates.length > 0;
    }
    handleFilter(e) {
        this.filter = e.target.value || '';
    }

    async newTemplate() {
        this.tpl = { ...EMPTY };
        this.resetPreview();
        this.dirty = false;
        this.activePart = 'body';
        this.bodyMode = 'visual';
        this.normalisedOnce = false;
        this.mode = 'editor';
        await this.ensureObjects();
    }

    async editTemplate(event) {
        const id = event.currentTarget.dataset.id;
        this.loading = true;
        try {
            const t = await getTemplate({ templateId: id });
            this.tpl = { ...EMPTY, ...t };
            this.resetPreview();
            this.dirty = false;
            this.activePart = 'body';
            this.normalisedOnce = false;
            this.bodyMode = !t.body || String(t.body).startsWith(DSX_MARKER) ? 'visual' : 'html';
            this.mode = 'editor';
            await this.ensureObjects();
            await this.openExplorer(this.tpl.objectApiName);
        } catch (e) {
            this.toast('Error', reduceError(e), 'error');
        } finally {
            this.loading = false;
        }
    }

    async handleRowAction(event) {
        const { id, action } = event.currentTarget.dataset;
        try {
            if (action === 'clone') {
                await cloneTemplate({ templateId: id });
                this.toast('Template cloned', 'A copy was created as an inactive template.', 'success');
            } else if (action === 'toggle') {
                const t = this.templates.find((x) => x.id === id);
                // Lightning Data Service: record-level changes need no custom Apex DML.
                await updateRecord({ fields: { [ID_FIELD.fieldApiName]: id, [ACTIVE_FIELD.fieldApiName]: !t.active } });
            } else if (action === 'delete') {
                const ok = await LightningConfirm.open({ message: 'Delete this template? Documents already generated from it are kept.', variant: 'header', label: 'Delete template', theme: 'warning' });
                if (!ok) return;
                await deleteRecord(id);
                this.toast('Template deleted', '', 'success');
            }
            await this.refresh();
        } catch (e) {
            this.toast('Error', reduceError(e), 'error');
        }
    }

    // ------------------------------------------------------------ editor
    async ensureObjects() {
        if (this.objects.length) return;
        try {
            const objs = await listObjects();
            this.objects = objs
                .map((o) => ({ label: `${o.label} (${o.apiName})`, value: o.apiName, custom: o.isCustom }))
                .sort((a, b) => a.label.localeCompare(b.label));
        } catch (e) {
            this.toast('Could not load objects', reduceError(e), 'error');
        }
    }

    get objectOptions() {
        const f = this.objectFilter.toLowerCase();
        const list = f ? this.objects.filter((o) => o.label.toLowerCase().includes(f)) : this.objects;
        const sel = this.objects.find((o) => o.value === this.tpl.objectApiName);
        const out = list.slice(0, 300);
        if (sel && !out.includes(sel)) out.unshift(sel);
        return out;
    }
    handleObjectFilter(e) {
        this.objectFilter = e.target.value || '';
    }

    get formatOptions() {
        return [
            { label: 'HTML → PDF (supports eSignature)', value: 'HTML' },
            { label: 'Word (.docx) → Word', value: 'DOCX' }
        ];
    }
    get pageSizeOptions() {
        return ['A4', 'Letter', 'Legal'].map((v) => ({ label: v, value: v }));
    }
    get orientationOptions() {
        return ['Portrait', 'Landscape'].map((v) => ({ label: v, value: v }));
    }
    get orderOptions() {
        return [
            { label: 'Sequential (one after another)', value: 'Sequential' },
            { label: 'Parallel (all at once)', value: 'Parallel' }
        ];
    }
    get roleOptions() {
        return ['1', '2', '3', '4', '5', '6'].map((v) => ({ label: `Signer ${v}`, value: v }));
    }
    get isDocx() {
        return this.tpl.format === 'DOCX';
    }
    get isHtml() {
        return !this.isDocx;
    }
    get canUpload() {
        return this.isDocx && !!this.tpl.id;
    }
    get docxAccept() {
        return ['.docx'];
    }
    get hasDocxFile() {
        return !!this.tpl.templateFileId;
    }
    get editorTitle() {
        return this.tpl.id ? `Edit: ${this.tpl.name}` : 'New template';
    }
    get activeText() {
        return this.tpl[this.activePart] || '';
    }
    get isVisual() {
        return this.isHtml && this.activePart === 'body' && this.bodyMode === 'visual';
    }
    get showCode() {
        return !this.isVisual;
    }
    get isBodyPart() {
        return this.activePart === 'body';
    }
    get editorClass() {
        return this.isVisual ? 'ds-editor ds-visual' : 'ds-editor';
    }
    get visualVariant() {
        return this.bodyMode === 'visual' ? 'brand' : 'neutral';
    }
    get htmlVariant() {
        return this.bodyMode === 'html' ? 'brand' : 'neutral';
    }

    async useVisual() {
        if (this.bodyMode === 'visual') return;
        const reason = visualBlocker(this.tpl.body);
        if (reason) {
            this.toast('Keep editing in HTML', `This template can't open in the visual editor because ${reason}.`, 'warning');
            return;
        }
        if (this.tpl.body && !String(this.tpl.body).startsWith(DSX_MARKER)) {
            const ok = await LightningConfirm.open({
                message: 'Merge fields, loops, conditions and signer fields are kept. Layout styling written by hand (column widths, colours, custom classes) may be simplified. You can review the result with Save & Preview PDF before activating.',
                variant: 'header',
                label: 'Open this template in the visual editor?',
                theme: 'info'
            });
            if (!ok) return;
            this.visualConverting = true;
        }
        this.bodyMode = 'visual';
    }

    useHtml() {
        this.bodyMode = 'html';
        this.normalisedOnce = false;
    }

    handleVisualChange(event) {
        const body = event.detail.body;
        const firstNormalise = !this.normalisedOnce && !this.visualConverting;
        this.normalisedOnce = true;
        if (body === this.tpl.body) return;
        this.tpl = { ...this.tpl, body };
        // The editor's first report after opening is its own normalised copy, not a user edit.
        if (!firstNormalise) {
            this.dirty = true;
        }
        this.visualConverting = false;
    }

    get partButtons() {
        return PARTS.map((p) => ({ ...p, variant: p.value === this.activePart ? 'brand' : 'neutral' }));
    }

    handleField(event) {
        const f = event.target.dataset.field;
        const t = event.target.type;
        const v = t === 'toggle' || t === 'checkbox' ? event.target.checked : event.detail && event.detail.value !== undefined ? event.detail.value : event.target.value;
        this.tpl = { ...this.tpl, [f]: v };
        this.dirty = true;
        if (f === 'objectApiName') {
            this.openExplorer(v);
            this.resetPreview();
        }
    }

    handleText(event) {
        this.tpl = { ...this.tpl, [this.activePart]: event.target.value };
        this.dirty = true;
    }

    selectPart(event) {
        this.activePart = event.currentTarget.dataset.part;
    }

    async insertStarter() {
        if (!this.tpl.objectApiName) {
            this.toast('Choose an object first', '', 'warning');
            return;
        }
        try {
            const body = await starterBody({ objectApiName: this.tpl.objectApiName });
            if (this.isVisual) {
                const ed = this.template.querySelector('c-doc-sign-template-editor');
                if (ed) ed.insertHtml(body);
                return;
            }
            this.tpl = { ...this.tpl, body: body + (this.tpl.body ? '\n' + this.tpl.body : '') };
            this.activePart = 'body';
            this.dirty = true;
        } catch (e) {
            this.toast('Error', reduceError(e), 'error');
        }
    }

    insertAtCursor(text) {
        const ta = this.refs.editor;
        const current = this.tpl[this.activePart] || '';
        let start = current.length;
        let end = current.length;
        if (ta && typeof ta.selectionStart === 'number') {
            start = ta.selectionStart;
            end = ta.selectionEnd;
        }
        const next = current.slice(0, start) + text + current.slice(end);
        this.tpl = { ...this.tpl, [this.activePart]: next };
        this.dirty = true;
        // caret is restored in renderedCallback once the new value is rendered
        this.pendingCaret = start + text.length;
    }

    async save() {
        if (!this.tpl.name || !this.tpl.objectApiName) {
            this.toast('Name and object are required', '', 'warning');
            return;
        }
        this.loading = true;
        try {
            const id = await saveTemplate({ payload: JSON.stringify(this.tpl) });
            const fresh = await getTemplate({ templateId: id });
            this.tpl = { ...EMPTY, ...fresh };
            this.dirty = false;
            this.toast('Template saved', `Version ${fresh.version}`, 'success');
        } catch (e) {
            this.toast('Could not save', reduceError(e), 'error');
        } finally {
            this.loading = false;
        }
    }

    async backToList() {
        if (this.dirty) {
            const ok = await LightningConfirm.open({ message: 'You have unsaved changes. Discard them?', variant: 'header', label: 'Discard changes', theme: 'warning' });
            if (!ok) return;
        }
        this.mode = 'list';
        await this.refresh();
    }

    async handleUpload(event) {
        const files = event.detail.files || [];
        if (!files.length) return;
        try {
            await updateRecord({
                fields: {
                    [ID_FIELD.fieldApiName]: this.tpl.id,
                    [FILE_FIELD.fieldApiName]: files[0].documentId,
                    [FORMAT_FIELD.fieldApiName]: 'DOCX'
                }
            });
            this.tpl = { ...this.tpl, templateFileId: files[0].documentId, format: 'DOCX' };
            this.toast('Word template uploaded', files[0].name, 'success');
        } catch (e) {
            this.toast('Error', reduceError(e), 'error');
        }
    }

    // ------------------------------------------------------------ field explorer
    async openExplorer(objectApiName) {
        if (!objectApiName) return;
        this.explorerStack = [{ objectApiName, prefix: '', label: objectApiName, kind: 'root' }];
        await this.loadExplorer();
    }

    async loadExplorer() {
        const top = this.explorerStack[this.explorerStack.length - 1];
        this.explorerLoading = true;
        try {
            const rows = await describeObject({ objectApiName: top.objectApiName });
            this.explorerFields = rows
                .map((r) => ({
                    ...r,
                    key: `${r.kind}:${r.apiName}`,
                    icon: r.kind === 'parent' ? 'utility:level_up' : r.kind === 'child' ? 'utility:rows' : 'utility:record',
                    meta: r.kind === 'field' ? r.type : r.kind === 'parent' ? `→ ${r.referenceTo}` : `list of ${r.childObject}`,
                    sortKey: (r.kind === 'field' ? '0' : r.kind === 'parent' ? '1' : '2') + r.label.toLowerCase()
                }))
                .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        } catch (e) {
            this.explorerFields = [];
            this.toast('Could not describe object', reduceError(e), 'error');
        } finally {
            this.explorerLoading = false;
        }
    }

    get explorerRows() {
        const f = this.explorerFilter.toLowerCase();
        const top = this.explorerStack[this.explorerStack.length - 1];
        return this.explorerFields
            .filter((r) => !(top && top.kind === 'child' && r.kind === 'child'))
            .filter((r) => !f || r.label.toLowerCase().includes(f) || r.apiName.toLowerCase().includes(f))
            .slice(0, 400);
    }
    get breadcrumbs() {
        return this.explorerStack.map((s, i) => ({ ...s, index: i, text: i === 0 ? s.objectApiName : s.label }));
    }
    get inChildLoop() {
        const top = this.explorerStack[this.explorerStack.length - 1];
        return top && top.kind === 'child';
    }
    get childRel() {
        const top = this.explorerStack[this.explorerStack.length - 1];
        return top ? top.rel : '';
    }
    get hasExplorer() {
        return this.explorerStack.length > 0;
    }
    handleExplorerFilter(e) {
        this.explorerFilter = e.target.value || '';
    }

    async pickExplorer(event) {
        const key = event.currentTarget.dataset.key;
        const row = this.explorerFields.find((r) => r.key === key);
        const top = this.explorerStack[this.explorerStack.length - 1];
        if (!row) return;
        if (row.kind === 'field') {
            let filter = '';
            if (row.type === 'CURRENCY') filter = ' | currency';
            else if (row.type === 'DATE') filter = ' | date:"d MMM yyyy"';
            this.insertAtCursor(`{{${top.prefix}${row.apiName}${filter}}}`);
        } else if (row.kind === 'parent') {
            if (this.explorerStack.length >= 5) {
                this.toast('Maximum depth reached', 'Salesforce supports up to 5 relationship levels.', 'info');
                return;
            }
            this.explorerStack = [...this.explorerStack, { objectApiName: row.referenceTo, prefix: `${top.prefix}${row.relationshipName}.`, label: row.relationshipName, kind: top.kind === 'child' ? 'child' : 'parent', rel: top.rel }];
            this.explorerFilter = '';
            await this.loadExplorer();
        } else if (row.kind === 'child') {
            this.explorerStack = [...this.explorerStack, { objectApiName: row.childObject, prefix: '', label: row.relationshipName, kind: 'child', rel: row.relationshipName }];
            this.explorerFilter = '';
            await this.loadExplorer();
        }
    }

    async crumb(event) {
        const idx = Number(event.currentTarget.dataset.index);
        this.explorerStack = this.explorerStack.slice(0, idx + 1);
        await this.loadExplorer();
    }

    insertLoopTable() {
        const rel = this.childRel;
        const nameField = (this.explorerFields.find((r) => r.kind === 'field' && r.apiName === 'Name') || this.explorerFields.find((r) => r.kind === 'field')) || { apiName: 'Id', label: 'Id' };
        const snippet =
            `<table>\n<thead><tr><th>#</th><th>${nameField.label}</th></tr></thead>\n<tbody>\n` +
            `{{#each ${rel}}}\n<tr><td>{{$index}}</td><td>{{${nameField.apiName}}}</td></tr>\n{{else}}\n<tr><td colspan="2">No records</td></tr>\n{{/each}}\n</tbody>\n</table>\n`;
        this.insertAtCursor(snippet);
    }

    insertIf() {
        this.insertAtCursor('{{#if FieldName__c == "Value"}}\nShown when true\n{{else}}\nShown otherwise\n{{/if}}');
    }

    handleRole(e) {
        this.signRole = e.detail.value;
    }

    insertSign(event) {
        const type = event.currentTarget.dataset.type;
        let tag = `{{sign:${type}:${this.signRole}}}`;
        if (type === 'text') tag = `{{sign:text:${this.signRole}:Label}}`;
        if (type === 'checkbox') tag = `{{sign:checkbox:${this.signRole}:I agree:optional}}`;
        this.insertAtCursor(tag);
    }

    insertBuiltin(event) {
        this.insertAtCursor(event.currentTarget.dataset.tag);
    }

    // ------------------------------------------------------------ preview
    resetPreview() {
        this.previewWarnings = [];
        this.previewRecordId = undefined;
        this.recordOptions = [];
        this.previewStats = undefined;
    }

    async handleRecordSearch(event) {
        this.recordTerm = event.target.value || '';
        if (!this.tpl.objectApiName) return;
        try {
            const rows = await searchRecords({ objectApiName: this.tpl.objectApiName, term: this.recordTerm });
            this.recordOptions = rows.map((r) => ({ label: `${r.name} (${r.id})`, value: r.id }));
        } catch (ignoredError) {
            this.recordOptions = [];
        }
    }

    handleRecordPick(event) {
        this.previewRecordId = event.detail.value;
    }

    async runPreview() {
        if (!this.previewRecordId) {
            this.toast('Pick a record to preview with', '', 'warning');
            return;
        }
        if (this.isDocx) {
            this.toast('Word templates', 'Save the template and use Generate on a record to produce the .docx.', 'info');
            return;
        }
        if (this.dirty || !this.tpl.id) {
            await this.save();
            if (this.dirty || !this.tpl.id) return;
        }
        this.previewLoading = true;
        try {
            const res = await previewPdf({ templateId: this.tpl.id, recordId: this.previewRecordId });
            this.previewWarnings = res.warnings || [];
            this.previewStats = `${res.signatureFieldCount} signature field(s) · ${res.signerRoles} signer role(s)`;
            this[NavigationMixin.Navigate]({ type: 'standard__namedPage', attributes: { pageName: 'filePreview' }, state: { selectedRecordId: res.contentDocumentId } });
        } catch (e) {
            this.toast('Preview failed', reduceError(e), 'error');
        } finally {
            this.previewLoading = false;
        }
    }

    renderedCallback() {
        if (this.pendingCaret !== undefined && this.refs && this.refs.editor) {
            const ta = this.refs.editor;
            ta.focus();
            ta.selectionStart = this.pendingCaret;
            ta.selectionEnd = this.pendingCaret;
            this.pendingCaret = undefined;
        }
    }

    get hasWarnings() {
        return this.previewWarnings && this.previewWarnings.length > 0;
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
