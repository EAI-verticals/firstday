# Deploy an EAI App Anywhere

EAI apps use a provider-neutral runtime contract in `eai.runtime.json`. Hosting
providers should translate the contract into their own environment variables,
secrets, callback URLs, and smoke checks; the app code should not depend on a
specific host.

## Required Runtime Capabilities

- Auth.js with Microsoft Entra sign-in
- PublicAPI access through the app BFF at `/api/eai`
- tenant and workflow configuration from `/api/eai/config`
- `/health` for host liveness
- user-delegated access for tenant data-plane calls
- declared smoke tests that prove the app is usable, not only running

## Validate Locally

```bash
eai runtime validate
eai deploy env --provider generic
```

`eai runtime validate` checks that required env names and secrets are declared,
tenant/workflow keys are consistent, Auth.js callback paths are valid, public
endpoints are listed, and public endpoints do not claim anonymous server-side
platform access.

## Validate After Deploy

```bash
eai deploy doctor --url https://your-app.example.com
```

The deploy doctor checks `/health`, `/api/auth/providers`,
`/api/eai/config`, declared public endpoints, declared smoke tests, and the
app's BFF/runtime reachability. It classifies failures as host/infrastructure,
app not running, Auth.js config, Entra callback config, PublicAPI config,
tenant/workflow config, missing authenticated-probe configuration, local BFF
authorization, PublicAPI authorization, or app runtime errors.

The `/api/eai/readiness` smoke test is intentionally protected. Configure the
same `EAI_READINESS_PROBE_TOKEN`, tenant ID, app key, environment, and config
hash in the deployed runtime and in the environment of the operator or CI job
running deploy doctor. The runtime contract maps these values to request
headers. The CLI resolves `${ENV_NAME}` references in memory and never writes
resolved values to deploy-doctor output or artifacts.

If a required probe value is unavailable, deploy doctor does not make a
predictably unauthenticated request. It reports `authenticated_probe_not_available`
or `config_missing`; a missing probe credential is not evidence of a tenant or
PublicAPI authorization failure. Supply secrets through a CI secret store or
the invoking process environment, not as command-line arguments.

## Provider Examples

- Vercel: add required env vars in project settings, add required secrets as
  encrypted environment variables, then run deploy doctor against the preview
  and production URLs.
- Docker: provide env vars with `--env-file` or orchestrator secrets, expose the
  app port, then run deploy doctor against the container URL.
- AWS or Azure: map env vars to the app service/container environment and
  secrets to the platform secret store.
- Kubernetes: put non-secret env vars in a ConfigMap, secrets in a Secret, mount
  both into the workload, then run deploy doctor against the ingress URL.
- VM or internal demo host: provide the same environment contract through the
  host process manager and run the same doctor command.

Tenant apps do not use app-only PublicAPI credentials for ordinary ResourceAPI
or data-plane work. Require sign-in and use the `/api/eai` BFF path. For
long-running or scheduled work, create a user-authorized platform workflow/job
instead of giving the app a broad service identity.

Auth.js confidential-client credentials support interactive sign-in; they are
not an app-only data-plane identity. After sign-in, the BFF forwards the user's
delegated access token to PublicAPI. A separate app-only/service identity is
optional and must be introduced only for a reviewed workload that cannot use a
user-authorized platform workflow.
