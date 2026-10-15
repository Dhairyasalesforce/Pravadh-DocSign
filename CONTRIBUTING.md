# Contributing to Pravadh DocSign

Thanks for helping. Bug reports, template examples, docs fixes and code are all welcome.

## Ways to help

* **Report a bug** with the bug template. Include the DocSign version (managed or source), the org edition, steps to reproduce, and the template HTML if the problem is in a generated document. Remove any customer data first.
* **Suggest a feature** with the feature template. Say what you're trying to get done, not only the feature.
* **Send a pull request.** For anything bigger than a small fix, open an issue first so we can agree the approach.
* **Security issues:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Set up a development org

You need the Salesforce CLI (`sf`), Node.js 20+, git and a Dev Hub (any Developer Edition org can enable one).

```bash
git clone https://github.com/Dhairyasalesforce/Pravadh-DocSign.git
cd Pravadh-DocSign
npm install
sf org create scratch --definition-file config/project-scratch-def.json --alias docsign-dev --no-namespace --duration-days 14 --target-dev-hub <your-dev-hub>
sf project deploy start --source-dir pravadh-docsign --target-org docsign-dev
sf org assign permset --name Pravadh_DocSign_Admin --target-org docsign-dev
sf org open --target-org docsign-dev
```

Run the checks before you open a pull request:

```bash
npm run lint
npm run prettier:verify
sf apex run test --target-org docsign-dev --test-level RunLocalTests --code-coverage --wait 20
```

## Rules the code follows

These come from the AppExchange security review and keep DocSign safe to install anywhere. Pull requests that break them will be asked to change.

* **User mode by default.** SOQL uses `WITH USER_MODE`, DML uses `as user` or `AccessLevel.USER_MODE`. A class that needs system mode must be `without sharing` on purpose, documented in [docs/security-review/DocSign-False-Positives.md](docs/security-review/DocSign-False-Positives.md), and reachable only after an authorisation check.
* **No hardcoded objects, fields or Ids.** Everything is discovered through `DocSignSchemaService`.
* **No external callouts, CDNs or telemetry.** Third-party code is bundled in a static resource, with its licence added to [NOTICE](NOTICE).
* **Escape every merged value.** The `raw` filter is the only exception.
* **PDF-safe output.** HTML that reaches `Blob.toPdf` uses tables and CSS 2.1: no flexbox, grid, CSS variables or `data:` images.
* **No Visualforce remoting.** Visualforce pages talk to Lightning through the hosting LWC with postMessage (exact origin, one-time nonce, allow-listed methods).
* **Tests** cover new Apex and keep overall coverage above 75%.

## Rebuilding the static resources

* Visual template editor: [template-editor/README.md](template-editor/README.md)
* PDF engine: [pdf-engine/README.md](pdf-engine/README.md)

Commit both the source change and the rebuilt `.resource` file.

## Website

[`website/`](website) is the Next.js source of [pravadhdocsign.pravadhlabs.com](https://pravadhdocsign.pravadhlabs.com). `npm install && npm run dev` inside that folder.

<a id="releases"></a>
## Releases

Managed package versions are built and promoted by Pravadh Labs from the Dev Hub that owns the `prvd` namespace:

```bash
sf package version create --package "Pravadh DocSign" --installation-key-bypass --code-coverage --wait 60 --target-dev-hub <pravadh-devhub>
sf package version promote --package "Pravadh DocSign@x.y.z-n" --target-dev-hub <pravadh-devhub>
```

Every release is tagged `vX.Y.Z` in git, listed in [CHANGELOG.md](CHANGELOG.md) with its `04t` Id, and published as a GitHub release with install links.

## Licence of contributions

By submitting a pull request you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the same licence as the project (Apache 2.0, section 5).
