# Security policy

## Reporting a vulnerability

Please do not report security problems in public issues or pull requests.

Email **inquire@pravadhlabs.com** with the subject line `SECURITY: Pravadh DocSign`, or use GitHub's **Report a vulnerability** button on the repository's Security tab (private vulnerability reporting). Include:

* the version (managed package version or git commit),
* what an attacker could do and under which user or guest context,
* steps or a proof of concept against your own org,
* any suggested fix.

We aim to acknowledge reports within 3 working days and to agree a disclosure date with you once a fix is ready. We credit reporters in the release notes unless you ask us not to.

## Supported versions

| Version | Security fixes |
|---|---|
| 1.x (latest release) | Yes |
| 0.x and beta builds | No, please upgrade |

## Security design

How DocSign handles sharing, CRUD/FLS, signer tokens, the guest user and the audit chain is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-design). The evidence submitted for the AppExchange security review, including scanner reports and justified false positives, is in [docs/security-review](docs/security-review).
