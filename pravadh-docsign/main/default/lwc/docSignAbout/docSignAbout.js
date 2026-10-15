import { LightningElement, api } from 'lwc';
import FOUNDER_PHOTO from '@salesforce/resourceUrl/DocSignFounder';

export default class DocSignAbout extends LightningElement {
    /** compact = single row (Settings); default = card (Home) */
    @api variant = 'card';

    photoUrl = FOUNDER_PHOTO;
    linkedInUrl = 'https://www.linkedin.com/in/dhairyasf/';
    websiteUrl = 'https://pravadhlabs.com/?utm_source=salesforce&utm_medium=pravadh_docsign&utm_campaign=built_by';

    get cls() {
        return this.variant === 'compact' ? 'ds-about ds-compact' : 'ds-about';
    }
}
