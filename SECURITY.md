# Security Policy

## Reporting A Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use GitHub private vulnerability reporting:

https://github.com/eai-support/eai-app-template/security/advisories/new

Include as much detail as possible:

- affected template version, branch, or commit
- steps to reproduce
- expected and actual behavior
- impact and any known workaround
- whether credentials, tenant data, or customer data may be exposed

## Public Repository Hygiene

Do not include secrets, tenant data, customer data, private URLs, local `.env`
files, or generated runtime/spec artifacts in issues, pull requests, commits,
screenshots, or logs. If you accidentally disclose a secret, rotate it
immediately even if the commit is later removed.

## Public Issue Attachment Policy

Do not attach ZIP files, scripts, installers, binaries, or "fix archives" to
public issues, pull requests, or comments. Paste commands, sanitized logs, and
text snippets directly instead.

Maintainers will remove unsolicited executable/archive attachments from public
issue conversations. If a file is required for a security report, use GitHub
private vulnerability reporting rather than a public issue.

The repository includes an issue/comment moderation workflow that checks new
issues and issue comments for unsafe GitHub attachment links. For comments from
unknown or unaffiliated users, unsafe archive/script/binary attachment links are
removed from the visible conversation. For issue bodies, unsafe attachment links
are replaced with a removal marker and a maintainer warning is posted.

GitHub-hosted attachment blobs may still require GitHub Trust & Safety removal
if their direct URL has already been shared elsewhere.
