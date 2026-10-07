# Firstday demo deployment

## Target

- Repository: https://github.com/EAI-verticals/firstday
- Host after successful deployment: https://firstday.demo.eaigroup.ai
- Azure subscription: 3001a4e4-fcd1-46e5-bfd9-e04ba193f65d
- Resource group: rg-demo-infrastructure
- Container Apps environment: cae-demo-eai-dev
- Existing EAI app key: vending-machine-app

The hostname is planned. Do not treat it as live until the checks below pass.

## Deployment

The app uses `.github/workflows/deploy.yml`, which calls `EAI-verticals/demo-infra/.github/workflows/deploy-container-app.yml@main`. The shared workflow owns image publication, app creation, managed identity, DNS, certificate and landing-page registration. Use it without app-specific DNS or certificate commands.

Docker builds the app at the root of its domain. Node 24 satisfies pdfjs-dist's runtime requirement. The image excludes environment files and private diagnostics, runs as a non-root user, binds 0.0.0.0:3000 and probes /health. Resources are 0.5 CPU/1Gi, zero minimum replicas and two maximum replicas.

Required repository Actions secrets:

- `AZURE_CREDENTIALS`: existing authorized demo-infra deployment credential, supplied by the infrastructure owner. GitHub cannot reveal an existing secret value for copying.
- `AZURE_SUBSCRIPTION_ID`: the subscription above.

After settings and runtime access are ready, push main or use the workflow dispatch. The old App Service workflow is manual only.

## App runtime and login

The reusable infrastructure workflow supplies its shared configuration endpoints. It does not supply all Firstday EAI/Auth settings automatically. Configure the app-scoped runtime through the approved platform/hosting secret store before claiming readiness.

Reuse the local project's valid tenant, PublicAPI URL, Entra registration, scopes and workflow identifiers. Preserve `EAI_APP_KEY=vending-machine-app`; firstday is the hosting name, not a new platform app.

Root-hosted settings:

```text
APP_BASE_PATH=
NEXT_PUBLIC_APP_BASE_PATH=
NEXT_PUBLIC_APP_NAME=Firstday
AUTH_URL=https://firstday.demo.eaigroup.ai/api/auth
NEXTAUTH_URL=https://firstday.demo.eaigroup.ai
AUTH_TRUST_HOST=true
```

Add this redirect URI to the existing authorized Entra registration:

```text
https://firstday.demo.eaigroup.ai/api/auth/callback/microsoft-entra-id
```

Reuse the existing names required by `.env.example` and `eai.runtime.json`, including tenant keys, chat and document workflow settings, PublicAPI routing, Entra scopes and registration. Store AUTH_SECRET, ENTRA_CLIENT_SECRET and the readiness probe token only in approved secret storage. Do not put local .env files in Git or Docker context.

After an EAI CLI sign-in, verify the existing published resource and tenant contracts. Do not seed unrelated types or broaden user access to resolve a deployment problem.

## Completion checks

1. Deployment workflow is green and reached Register app in App Configuration.
2. Firstday hostname binding is SniEnabled with HTTPS.
3. https://firstday.demo.eaigroup.ai/health returns 200.
4. https://demo.eaigroup.ai/api/apps contains firstday.
5. The protected readiness endpoint succeeds with app-scoped runtime settings.
6. Microsoft sign-in returns to the correct host; denied users remain denied.
7. Test chat and document extraction using synthetic data and the saved Admin rules.

Health confirms the server is running. It does not prove sign-in, AI or data access. Existing local onboarding records do not become shared employee records merely by deploying. Production Admin hire sharing remains a separate implementation task.

## Current prerequisites

The repository initially had no deployment secrets. Current GitHub account cannot inspect organization secrets, and current Azure account cannot read demo Key Vault metadata. An infrastructure owner must make the existing deployment credential available. The EAI CLI session was expired during preparation; the prior sign-in request remains pending. No broad role assignment or secret-access bypass is authorized by these instructions.
