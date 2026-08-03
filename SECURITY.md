# Security policy

## Supported version

Security fixes target the latest code on the default branch and the current
production deployment.

## Reporting a vulnerability

Please do not disclose security vulnerabilities in a public issue.

Use **Report a vulnerability** in the repository's Security tab to open a
private security advisory. If that option is unavailable, contact the
repository owner privately through GitHub and include:

- the affected route, message type, or component;
- clear reproduction steps;
- the expected and observed behavior;
- the practical impact; and
- any suggested mitigation.

Do not include live Redis credentials, resume tokens, private room messages, or
personal data. You should receive an acknowledgement within seven days.

## Security model

- The server is authoritative for room membership, turns, moves, scores, chat,
  and match transitions.
- Resume tokens are generated server-side. Only SHA-256 hashes are persisted;
  raw credentials stay in the participant's browser session.
- Redis room state expires after six hours of inactivity.
- Chat is room-scoped and rate-limited, but it is not end-to-end encrypted.
- The demo has no user-account or password system.
