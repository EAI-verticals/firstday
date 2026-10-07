# AGENTS.md

**Project**: @eai-tools/vending-machine-app | **Language**: TypeScript
- **Framework**: Next.js |
**Package Manager**: npm

## Commands

- **Build**: `npm run build`
- **Test**: `npm test`
- **Lint**: `npm run lint`

## Code Style

### TypeScript Conventions

- Use strict mode (`"strict": true` in tsconfig.json)
- Use ESM imports (`import`/`export`), never `require()`
- Add explicit return types to all public functions
- Prefer `unknown` over `any`; use proper type narrowing
- Use `readonly` for properties that should not be reassigned
- Prefer interfaces over type aliases for object shapes

### Next.js App Router Guardrail

- In `src/app/**/route.ts`, export only HTTP methods such as `GET`, `POST`,
  `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`
- Only export supported route config fields such as `dynamic`, `runtime`, and
  `revalidate`
- Do not export helper functions, dependency interfaces, or test seams from
  `route.ts`
- Put reusable logic in a sibling `handler.ts` or a module under `src/lib/`,
  then keep `route.ts` as a thin wrapper

## Testing

- **Run Tests**: `npm test`
- Write tests for new functionality before marking tasks complete
- Run the full test suite before committing

## Git Workflow

- Use conventional commit messages (feat:, fix:, chore:, docs:)
- Create feature branches for new work
- Run tests and linting before committing

## Gofer Pipeline

This project uses Gofer for spec-driven development. Run `/eai` to start or
continue the core pipeline (Gofer Start -> research -> specify -> plan -> tasks
-> implement -> validate). Use `#eai` in Copilot-style prompts and `$eai` in
hosts that use dollar-prefixed skills. Gofer
routes internally through `.specify/commands/*.md` contracts; validation is the
terminal quality gate and includes the final engineering review loop. Before EAI
readiness, classify the request: app delivery continues directly, while clear
non-app work asks once before skipping EAI tenant/app setup. Artifacts in
`.specify/specs/{feature}/`.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal
  code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer
  standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid
  introducing bugs.

## Always-On EAI Contract
<!-- gofer:always-on-eai:start -->

Apply this contract to every request after Gofer is installed for this repo or AI coding app. The user does not need to type `/eai` or `$eai`.

1. Preserve the user's request. Do not rewrite it or add a visible command prefix.
2. Treat an explicit `/eai` in Claude, Copilot, Antigravity, Grok, or VS Code, and `$eai` in Codex, as an idempotent request for the same contract.
3. Apply Gofer's Controlled English and business-first response rules.
4. Select the internal pipeline stage. Do not make the user select a stage.
5. Check workspace health before meaningful repo work, tool use, or a pipeline stage. Do not repeat setup on every message.
6. When the user explicitly asks to update Gofer, use its maintenance contract only.
<!-- gofer:always-on-eai:end -->
