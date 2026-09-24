---
sidebar_position: 3
slug: /tutorials/deploy-to-azure
---

# Tutorial: Deploy An EAI App

Deploy an EAI App Template project to your organization's approved hosting
target. This public guide stays at the supported CLI and application boundary;
use your organization's private deployment guide for exact cloud resource names,
subscriptions, and environment-specific settings.

## Prerequisites

- A working app project created from the EAI App Template.
- A GitHub repository for the app.
- Access to your organization's deployment environment.
- Required deployment secrets configured in the hosting provider or CI system.
- A tenant that has been connected and verified through the `eai` CLI.

Before deploying, confirm the app and tenant contract:

```bash
eai login
eai tenant select <tenant-slug>
eai types validate
eai types seed --tenant-key <tenant-key> --tenant-id <tenant-id> --format json
eai types diff --tenant-key <tenant-key> --tenant-id <tenant-id>
eai resources schema --tenant-id <tenant-id> --format json
eai verify calls --tenant-id <tenant-id> --resource-type <resource-type>
```

The platform remains the storage and AI boundary. Browser code should call the
app BFF at `/api/eai/...` and should never receive raw database, blob, search,
model-provider, or PublicAPI credentials.

## Step 1: Prepare Runtime Settings

Set runtime values through your deployment provider's secret or app settings
store. Do not commit tenant IDs, endpoint URLs, client secrets, or generated
credentials to source control.

Common runtime values include:

| Setting                                   | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `BASE_URL_PUBLIC_API`                     | PublicAPI base URL supplied by onboarding or your environment profile. |
| `TENANT_<KEY>_ID`                         | Tenant ID for the app runtime boundary.                                |
| `WORKFLOW_<KEY>_ID`                       | Workflow ID used by chat or AI-assisted screens.                       |
| `ENTRA_TENANT_NAME` / `ENTRA_TENANT_ID`   | Entra CIAM authority used by the app.                                  |
| `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` | App registration values stored only in secret storage.                 |
| `AUTH_SECRET`                             | Auth.js secret generated for the deployment environment.               |
| `APP_BASE_PATH`                           | Optional app base path when hosted below a subpath.                    |

## Step 2: Configure Deployment

If your organization has enabled the EAI deployment workflow, use the CLI:

```bash
eai deploy setup --repo <owner>/<repo>
```

The setup command prepares the repository workflow and prompts for the settings
it is allowed to configure. It does not remove the need for environment-specific
approval, secrets, or hosting access.

If your organization uses a custom deployment pipeline, keep the public app
contract the same:

1. Install dependencies with `npm ci`.
2. Build the app with the correct environment settings.
3. Deploy the built Next.js output to the approved hosting target.
4. Keep all secrets in the hosting or CI secret store.

## Step 3: Deploy

Trigger the deployment through your configured workflow:

```bash
eai deploy trigger
```

Or use your CI provider's manual workflow trigger if your organization manages
deployments outside the CLI.

## Step 4: Verify

Check the deployment workflow:

```bash
eai deploy status
```

Then run platform checks against the tenant:

```bash
eai verify calls --tenant-id <tenant-id> --resource-type <resource-type>
```

After the app is reachable, verify:

1. Sign-in completes.
2. Object Type-backed pages can list and create resources.
3. Chat or document workflows use the app BFF and do not expose credentials.
4. Browser routes work under the configured base path.

## Troubleshooting

### App returns 404

- Confirm the deployed base path matches `APP_BASE_PATH`.
- Confirm your hosting provider routes requests to the Next.js app.
- Rebuild locally with the same base path before redeploying.

```bash
APP_BASE_PATH=/my-app npm run build
```

### Authentication Redirect Fails

- Ensure the deployed auth URL includes the app's auth route path.
- Ensure Entra CIAM redirect URIs match the deployed callback URL.
- Keep callback URLs environment-specific and out of committed examples.

### Runtime Settings Are Missing

Check the hosting provider's app settings or CI secret store. Do not print
secret values in logs; confirm only that required keys exist.

## What You Learned

- How to verify tenant contracts before deployment.
- How to keep deployment secrets outside source control.
- How to use `eai deploy` without exposing private hosting details.
- How to validate the app through PublicAPI-backed CLI checks after deployment.

## Next Steps

- [EAI Service Patterns](/docs/platform/eai-service-patterns) — Choose the right
  resource, document, chat, and PublicAPI pattern.
- [Configuration](/docs/cli/authentication) — Confirm sign-in and tenant
  context.
