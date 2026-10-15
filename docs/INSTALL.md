# Installing Pravadh DocSign

Pravadh DocSign can run in an org in two ways. Use one per org, never both.

| | Managed package | Source deploy |
|---|---|---|
| Who it suits | Most orgs | Teams that want to change the code |
| Namespace | `prvd` | None |
| Upgrades | Install the next version | Pull from git and redeploy |
| Code visible in the org | No (managed code is hidden) | Yes |
| Tests run at install | No | Yes (`RunLocalTests`) |

## 1. Managed package

### Current release: 1.0.0

* Package version Id: `04tdN000000StZRQA0`
* Production or Developer Edition: <https://login.salesforce.com/packaging/installPackage.apexp?p0=04tdN000000StZRQA0>
* Sandbox: <https://test.salesforce.com/packaging/installPackage.apexp?p0=04tdN000000StZRQA0>

With the CLI:

```bash
sf package install --package 04tdN000000StZRQA0 --target-org <alias> --wait 20 --security-type AdminsOnly
```

`AdminsOnly` installs for administrators only; you then grant access with the permission sets below. Use `AllUsers` only if you want every profile to get access straight away.

### Upgrading

Install the newer version over the old one with the same link or command. Templates, documents, envelopes and audit history are kept. Orgs on 0.1.0 can upgrade straight to 1.0.0.

### Beta versions

Every beta build is listed in [CHANGELOG.md](../CHANGELOG.md) with its package version Id. Salesforce allows beta package versions only in sandboxes, scratch orgs and Developer Edition orgs, and a beta cannot be upgraded. Install one only to reproduce or test a specific build:

```bash
sf package install --package <04t id from the changelog> --target-org <sandbox-alias> --wait 20
```

## 2. Source deploy (unmanaged)

Requirements: [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`), git, and an org where you can deploy Apex (sandbox, Developer Edition or scratch org; production needs 75% coverage, which the included tests provide).

```bash
git clone https://github.com/Dhairyasalesforce/Pravadh-DocSign.git
cd Pravadh-DocSign
sf org login web --alias my-org            # add --instance-url https://test.salesforce.com for a sandbox
sf project deploy start --source-dir pravadh-docsign --target-org my-org --test-level RunLocalTests --dry-run
sf project deploy start --source-dir pravadh-docsign --target-org my-org --test-level RunLocalTests
```

The dry run validates and runs tests without saving anything. The code detects whether it runs inside the `prvd` namespace, so the same source works unmanaged.

To update later: `git pull`, then run the deploy again.

## 3. Set up the org (both options)

1. **Permissions.** Assign **Pravadh DocSign Admin** to people who build templates and change settings, and **Pravadh DocSign User** to people who generate and send documents.
2. **App and record pages.** Open the **Pravadh DocSign** app from the App Launcher. In Lightning App Builder, add the **Pravadh DocSign** component to the record pages of the objects you'll generate documents from (any standard or custom object).
3. **Templates.** DocSign → Templates → New Template. Pick the object, then build the body in the visual editor or in HTML. Use **Save & Preview PDF** with a real record, then activate the template.
4. **External signers (Salesforce Site).** People who sign do not need a Salesforce licence. They sign on a Salesforce Site page:
   1. Setup → Digital Experiences / Sites → create a Salesforce Site (Require Secure Connections on).
   2. Site Visualforce Pages: add `DocSignSign` and `DocSignPageImage` (`prvd__DocSignSign` and `prvd__DocSignPageImage` for the managed package).
   3. Public Access Settings → assign the **Pravadh DocSign Signing Guest** permission set to the site guest user. Give it nothing else.
   4. Copy the site URL into **DocSign → Settings → Signing Site URL**.
5. **Email.** Setup → Deliverability → Access level: All email. Optionally pick an org-wide email address in DocSign → Settings, then use **Send test email**.
6. **Optional.**
   * Turn on the **Reminders & expiry job** in DocSign → Settings (runs hourly, expires envelopes and sends reminders).
   * Setup → Platform Events → DocSign Envelope Event → subscriber configuration, to run follow-up processing as a named integration user instead of Automated Process.
   * Flow: the actions appear in Flow Builder under **Pravadh DocSign**.
   * Agentforce: Agent Builder → topic → New Action → Apex → pick a Pravadh DocSign action.

## 4. Check it works

1. Open a record with the DocSign component, pick the template, **Generate Document**. The PDF appears in the panel and in the record's Files.
2. **Send for Signature** to two addresses you can read, in sequence. Each signer gets an email, signs on the site, and the record's Files then show the signed PDF and the Certificate of Completion. The envelope status becomes Completed.
3. Try **Upload a PDF for signature** with any PDF of 100 pages or fewer.

Signing emails come from the org's default sender or the org-wide address. Check spam if they don't arrive.

## 5. Contributors: scratch org

```bash
npm install                                   # lint and LWC tests
sf org create scratch --definition-file config/project-scratch-def.json --alias docsign-dev --no-namespace --duration-days 14 --target-dev-hub <your-dev-hub>
sf project deploy start --source-dir pravadh-docsign --target-org docsign-dev
sf org assign permset --name Pravadh_DocSign_Admin --target-org docsign-dev
sf apex run test --target-org docsign-dev --test-level RunLocalTests --code-coverage --wait 20
```

`--no-namespace` is needed because only the Pravadh Labs Dev Hub owns the `prvd` namespace. Package versions are built by the maintainers (see [CONTRIBUTING.md](../CONTRIBUTING.md#releases)).

## Uninstalling

* Managed package: Setup → Installed Packages → Pravadh DocSign → Uninstall. Salesforce deletes the package's data; export what you need first.
* Source deploy: remove the components with a destructive-changes deploy, or delete them in Setup.
