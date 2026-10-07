# Firstday experience rubric

Target: at least 9/10 in **every** category. Evaluate the complete local walkthrough chosen on 6 October 2026. Live shared cases, real role assignments and deployment are recorded separately and cannot be described as working based on local scores.

Each category has five criteria, worth 0–2 points each: 0 = missing/broken/unverified; 1 = present with a material limitation; 2 = demonstrated reliable and clear. A serious privacy, authorization, wrong-pay or false-completion defect caps its affected category at 5. Do not round 8.5 to 9. A screenshot does not prove a workflow, and a component test does not prove visual quality. Record evidence and re-test after material changes.

| Category | Five criteria (2 points each) | Baseline |
| --- | --- | --- |
| Navigation and task clarity | Role purposes are distinct; one coherent journey; visible current location; obvious next action; return/back does not lose progress | 4 |
| Visual design and consistency | Common layout/grid; hierarchy and readable type; consistent controls/statuses; balanced spacing at desktop; purposeful original styling without decorative clutter | 5 |
| Employee onboarding | Employer owns role/pay; employee personal details validate; prerequisites explain next action; extraction review can finish; signing/download/completion reflect actual state | 4 |
| Employer walkthrough | Prepare hire; validate employer terms; inspect progress; review/request corrections; local handoff and completion acknowledgement work without pretending to invite/share | 2 |
| Admin workflow | Services have clear owners; config versus live health distinct; loading/error/retry; real setup destinations; steps explain what to test | 4 |
| Forms and recovery | Labels/autocomplete/input types; grouped short forms; actionable inline or summary errors; data survives navigation; changed terms/results invalidate stale approvals/signatures | 5 |
| Document experience | File rules and type selection; preview PDF/image; honest progress/failure/retry; typed fields/confidence and human review; correct PDF exports and replacement cleanup | 6 |
| AI assistant | Visible unobtrusive launcher; usable conversation/composer; streamed actual responses and recoverable errors; citations open resolved sources; prompts/docs remain Admin-owned and AI unavailable is clear | 7 |
| Accessibility | Semantic landmarks/heading structure; keyboard/focus return; names/error/status association; readable contrast; touch targets and reduced motion | 5 |
| Responsive behavior | 1440/1280 desktop; 768 tablet; 390 mobile; no overflow or covered actions; usable nav/forms/document/chat at each size | 5 |
| State and trust | Session-only storage disclosed; role selection cannot grant permissions; no false AI/identity/completion claims; no data loss from role/page switching; safe consent and signed snapshot | 5 |
| Workflow quality and reliability | All key happy paths; failure paths; prerequisites/empty states; no duplicate/dead-end controls; automated checks plus browser journey evidence | 4 |

## Required journeys

1. Chooser → Employer → prepare hire → save validated offer → preview Employee. No invite is sent.
2. Employee dashboard → personal details → save → documents → choose type/file → consent → signed-in EAI extraction → compare fields → confirm review.
3. Failed extraction → specific error → retry or replace → previous file result cannot complete the new file.
4. Employee → salary terms read-only → create PDF → preview → explicit consent/signature → download → awaiting employer review.
5. Employer → inspect employee stages → request correction with a reason → Employee sees request → correct → signature/review invalidation → return for review.
6. Employer → local completion acknowledgement only after valid employee stages. Human identity/work checks stay explicit.
7. Admin → loading/configuration → refresh/retry → setup destination → distinguish configuration from tested service.
8. Resources → generate each supported template → correct shared profile/PDF; checklist upload → specific missing fields → timestamped checked copy.
9. Assistant → sign-in/unavailable → question → stream → response → clickable citation; error/retry; keyboard close/focus return.
10. Repeat navigation and primary forms at desktop, tablet and mobile. Confirm focus, zoom/reduced-motion behavior, no overlap and no horizontal overflow.

## Evidence and final scores

See `.specify/specs/005-firstday-experience/validation-report.md` for the current scorecard, checks, iterations and blockers. No category is awarded 9/10 without its required evidence. The previous localhost browser policy rejection is an inspection blocker, not evidence that the app is visually sound.

## Reference patterns

[Employment Hero official onboarding tour](https://employmenthero.com/quick-demos/onboarding-interactive-demo/) shows employer basics/employment/pay stages, employee self setup, progress tracking and persistent navigation. [Dashboard guidance](https://help.employmenthero.com/hc/en-au/articles/17426626769807-Configuring-the-dashboard) describes task and onboarding widgets. Firstday uses these workflow ideas with its own brand and a focused feature set.
