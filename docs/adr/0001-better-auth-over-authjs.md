# Better Auth over Auth.js

Auth.js was chosen at charting, but since September 2025 Better Auth maintains it in security-fix-only mode and tells new projects to use Better Auth. Its v5 has also never left beta. We use Better Auth. It covers every sign-in method we chose (Google, Microsoft, magic link, and passkeys for the Admin) without third-party code. Its organization plugin handles each Client's roster roles and Invitations, so we don't build them ourselves. In exchange, the plugin's schema shapes those tables, so every roster and auth call goes through one module of ours, which keeps a future swap contained.

## Considered options

- **Auth.js v5 (beta)**: it supports OAuth and magic links, but passkeys are experimental, there are no orgs or invitations, and the project is being wound down.
- **Hand-rolled sessions**: no lock-in, but we would own all of the security-sensitive code.
- **Better Auth with our own roster tables**: no schema lock-in, but we would rebuild invitation expiry and revocation, roles, and the at-least-one-Owner rule.
