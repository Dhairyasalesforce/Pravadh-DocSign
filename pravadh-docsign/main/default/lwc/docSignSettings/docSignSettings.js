import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getSettings from '@salesforce/apex/DocSignHomeController.getSettings';
import saveSettings from '@salesforce/apex/DocSignHomeController.saveSettings';
import setMaintenance from '@salesforce/apex/DocSignHomeController.setMaintenance';
import sendTestEmail from '@salesforce/apex/DocSignHomeController.sendTestEmail';
import USER_EMAIL from '@salesforce/schema/User.Email';
import USER_ID from '@salesforce/user/Id';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { NavigationMixin } from 'lightning/navigation';
import { reduceError } from 'c/docSignUtils';

const SETUP = {
    deliverability: '/lightning/setup/OrgEmailSettings/home',
    dkim: '/lightning/setup/EmailDKIMList/home',
    owea: '/lightning/setup/OrgWideEmailAddresses/home',
    logs: '/lightning/setup/EmailLogFiles/home'
};

export default class DocSignSettings extends NavigationMixin(LightningElement) {
    @track s;
    testTo;
    testResult;
    testing = false;
    loading = true;

    @wire(getRecord, { recordId: USER_ID, fields: [USER_EMAIL] })
    wiredUser({ data }) {
        if (data && !this.testTo) {
            this.testTo = getFieldValue(data, USER_EMAIL);
        }
    }

    get health() {
        return this.s?.emailHealth;
    }
    get healthCls() {
        const l = this.health?.level;
        return l === 'ok' ? 'ds-health ds-health-ok' : l === 'warn' ? 'ds-health ds-health-warn' : 'ds-health';
    }
    get healthIcon() {
        const l = this.health?.level;
        return l === 'ok' ? 'utility:success' : l === 'warn' ? 'utility:warning' : 'utility:info';
    }
    get testDisabled() {
        return this.readOnly || this.testing || !this.testTo;
    }
    get testCls() {
        return this.testResult?.ok ? 'ds-test-result ds-health-ok' : 'ds-test-result ds-health-warn';
    }
    /** Guided email delivery setup: each step with its status and a button to the right Setup page. */
    get emailSteps() {
        const h = this.health || {};
        const dom = h.domain || 'your domain';
        const dkimState = {
            active: { done: true, text: `DKIM key for ${dom} is active.` },
            pending: { done: false, text: `Key ${h.dkimSelector || ''} for ${dom} exists but is not active. Add its 2 CNAME records to your DNS, wait until it shows "Published", then click Activate.` },
            missing: { done: false, text: `Create a DKIM key for ${dom} (selector e.g. sf1), add the 2 CNAME records it shows to your DNS, then Activate it.` },
            public: { done: false, text: `${dom} is a public mailbox domain and can't be verified. Use an address on your company domain.` },
            unknown: { done: false, text: `Check that ${dom} has an active DKIM key.` }
        }[h.dkim || 'unknown'];
        const steps = [
            { key: 'deliv', title: 'Allow email', text: 'Deliverability → Access level must be "All email".', page: 'deliverability', button: 'Open Deliverability', done: null },
            { key: 'dkim', title: 'Verify your domain (DKIM)', text: dkimState.text, page: 'dkim', button: 'Open DKIM Keys', done: dkimState.done },
            { key: 'owea', title: 'Company sender address', text: h.orgWide ? `Emails are sent from ${h.senderAddress}.` : 'Add and verify an address like sign@yourcompany.com, then choose it above under "Send emails from".', page: 'owea', button: 'Open Org-Wide Addresses', done: !!h.orgWide },
            { key: 'test', title: 'Send a test email', text: 'Use the button below. If it doesn’t arrive, request an Email Log to see why.', page: 'logs', button: 'Open Email Logs', done: this.testResult ? this.testResult.ok : null }
        ];
        return steps.map((s, i) => ({
            ...s,
            num: i + 1,
            icon: s.done === true ? 'utility:success' : s.done === false ? 'utility:warning' : 'utility:info',
            cls: 'ds-estep' + (s.done === true ? ' ds-estep-done' : s.done === false ? ' ds-estep-todo' : '')
        }));
    }

    openSetup(event) {
        const url = SETUP[event.currentTarget.dataset.page];
        if (url) {
            this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url } });
        }
    }

    handleTestTo(event) {
        this.testTo = event.detail.value;
    }
    async sendTest() {
        this.testing = true;
        this.testResult = undefined;
        try {
            this.testResult = await sendTestEmail({ toAddress: this.testTo });
        } catch (e) {
            this.testResult = { ok: false, message: reduceError(e) };
        } finally {
            this.testing = false;
        }
    }
    saving = false;
    error;

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            this.s = await getSettings();
            this.error = undefined;
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.loading = false;
        }
    }

    get readOnly() {
        return !this.s?.isAdmin;
    }
    get owOptions() {
        return [{ label: '— Use sender name only —', value: '' }, ...(this.s?.orgWideEmails || [])];
    }
    get jobLabel() {
        return this.s?.maintenanceScheduled ? 'Scheduled (hourly)' : 'Not scheduled';
    }
    get jobButton() {
        return this.s?.maintenanceScheduled ? 'Turn off' : 'Turn on';
    }
    get siteSteps() {
        const page = this.s?.signingPageName || 'DocSignSign';
        return [
            'Setup → Sites: create a site (e.g. "sign") or reuse an existing one.',
            `Site Visualforce Pages: add "${page}".`,
            'Public Access Settings: assign the "Pravadh DocSign Signing Guest" permission set to the site guest user.',
            'Paste the site URL (for example https://yourcompany.my.salesforce-sites.com/sign) below and save.'
        ].map((text, i) => ({ key: i, text }));
    }
    get ai() {
        return this.s?.ai || {};
    }
    get aiAgentLabel() {
        return this.ai.agentCount > 0 ? `${this.ai.agentCount} agent(s) found` : 'No agents found';
    }
    get aiAgentCls() {
        return this.ai.agentCount > 0 ? 'ds-chip ds-on' : 'ds-chip';
    }
    get aiModelsLabel() {
        return this.ai.modelsApiAvailable ? 'Models API available' : 'Models API not enabled';
    }
    get aiModelsCls() {
        return this.ai.modelsApiAvailable ? 'ds-chip ds-on' : 'ds-chip';
    }
    get aiProvider() {
        return this.ai.activeProvider || 'Pravadh DocSign (built-in)';
    }
    get agentActions() {
        return ['Find Document Templates', 'Check Missing Document Data', 'Generate Document', 'Send for Signature', 'Get Signature Summary', 'Get Signature Status', 'Resend Envelope', 'Cancel Envelope'];
    }

    get swatch() {
        return `background:${this.s?.brandColor || '#0B5CAB'}`;
    }

    handle(event) {
        const f = event.target.dataset.field;
        const v = event.target.type === 'toggle' || event.target.type === 'checkbox' ? event.target.checked : event.detail.value;
        this.s = { ...this.s, [f]: v };
    }

    async save() {
        this.saving = true;
        try {
            const payload = { ...this.s };
            delete payload.orgWideEmails;
            await saveSettings({ payload: JSON.stringify(payload) });
            this.dispatchEvent(new ShowToastEvent({ title: 'Settings saved', variant: 'success' }));
            await this.load();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Could not save', message: reduceError(e), variant: 'error' }));
        } finally {
            this.saving = false;
        }
    }

    async toggleJob() {
        try {
            const on = await setMaintenance({ enabled: !this.s.maintenanceScheduled });
            this.s = { ...this.s, maintenanceScheduled: on };
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Could not update schedule', message: reduceError(e), variant: 'error' }));
        }
    }
}
