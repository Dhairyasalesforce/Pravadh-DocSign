import { LightningElement, api } from 'lwc';
import { statusTheme } from 'c/docSignUtils';

export default class DocSignStatusBadge extends LightningElement {
    @api status;

    get cls() {
        return `ds-badge ds-${statusTheme(this.status)}`;
    }
}
