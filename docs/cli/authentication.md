---
sidebar_position: 2
slug: /cli/authentication
---

# Authentication

The EAI CLI authenticates with Microsoft Entra ID (CIAM) to access platform services. All API calls through the CLI use your authenticated session.

## Login

```bash
eai login
```

This opens a browser window for Entra CIAM authentication. After signing in, the CLI stores your encrypted tokens locally.

### Options

| Flag                   | Description                | Default                               |
| ---------------------- | -------------------------- | ------------------------------------- |
| `--tenant-name <name>` | CIAM tenant name           | `example-ciam-tenant`                 |
| `--tenant-id <id>`     | CIAM tenant GUID           | Platform default                      |
| `--client-id <id>`     | App registration client ID | From `.env.local`                     |
| `--scope <scope>`      | OAuth scopes               | `openid profile email offline_access` |

### Custom Tenant Authentication

For apps with their own Entra ID tenant:

```bash
eai login --tenant-name my-ciam-tenant --client-id 12dcbf85-xxxx-xxxx-xxxx
```

## Select the Working Tenant

Authentication and active tenant selection are separate:

```bash
eai tenant list --format json
eai tenant select <tenant-slug>
```

Most platform commands use the active tenant unless you explicitly pass `--tenant-id`.

## Check Auth Status

```bash
eai whoami
```

Displays:

- authenticated user email
- authority tenant and active tenant
- token expiry status
- current project context when run inside an app repo

## Logout

```bash
eai logout
```

Clears all stored authentication tokens from your machine.

## Token Flow

```
eai login
  → Opens browser → Entra CIAM sign-in
  → Receives authorization code
  → Exchanges for access + refresh tokens
  → Stores encrypted tokens in ~/.eai/tokens.json

eai <any command>
  → Reads stored access token
  → If expired → uses refresh token to get new access token
  → Attaches Authorization: Bearer <token> to API calls
  → PublicAPI validates JWT and applies platform authorization
```

## Environment Variables

The CLI reads auth-related variables from `.env.local` as fallbacks:

```bash
ENTRA_TENANT_NAME=example-ciam-tenant
ENTRA_TENANT_ID=50808ce0-xxxx-xxxx-xxxx
ENTRA_CLIENT_ID=12dcbf85-xxxx-xxxx-xxxx
ENTRA_CLIENT_SECRET=<secret>     # Only needed for client credentials
```

## Troubleshooting

### "Token expired" errors

```bash
eai logout && eai login
```

### "Unauthorized" on API calls

Check that your user is working in the correct tenant context:

```bash
eai tenant list --format json
eai tenant select <tenant-slug>
eai whoami
```

For read-only troubleshooting, you can also bypass active selection and target a tenant explicitly:

```bash
eai resources schema --tenant-id <tenant-id> --format json
eai verify calls --tenant-id <tenant-id> --resource-type <resource-type>
```

### Browser doesn't open

Set the `BROWSER` environment variable:

```bash
BROWSER=firefox eai login
```
