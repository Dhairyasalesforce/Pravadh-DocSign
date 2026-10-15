# PDF detection regression samples

Generic documents used to check that field/signer detection is not tuned to one PDF:

| File | What it covers |
|---|---|
| nda.pdf | Two-column "By / Name / Title / Date" blocks under company headings |
| rent.pdf | "Signature of Landlord/Tenant", "Witness 1/2", rupee amounts, checkboxes, PAN, mobile |
| ack.pdf | Stacked "Name ____ Date ____" lines, "For <Company> ____", "Approved by", "Initials" |
| form.pdf | Two-column table form (FIELD / VALUE), "Employee signature", "HR manager signature" |

Run (needs playwright-core + Chromium, pdf.bundle.js and the two engine files next to detect.html):

    node multi.mjs nda.pdf rent.pdf ack.pdf form.pdf
