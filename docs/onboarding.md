# Onboarding workspace

Open the local app at **http://localhost:3001/vending-machine-app**. From the repository root, start it with `./run.sh dev 3001`. The runner respects the requested port and does not kill another process using it.

## Employee portal

The default screen is the employee dashboard. Use My onboarding to follow these steps:

1. Enter personal, contact, emergency contact and employment details. Use example details only for a demo.
2. Upload a passport or driving licence for EAI Content Understanding. Review the extracted fields and resolve issues. A profile photo is optional.
3. Review salary terms, create the salary confirmation, then enter your legal name and give explicit consent to sign. Download the PDF before refreshing.

My profile shows your current details. My documents holds the documents in this session. The assistant remains available throughout. Changes to profile, reviewed documents or terms invalidate a previous signature. Salary terms are editable in this local prototype; an employer-controlled approval workflow is not implemented.

**Live document checking is currently blocked.** Content Understanding is active, the identity classifier is published and ready, and app readiness passes. EAI still rejects the final classifier association with HTTP 409. The upload gate stays disabled. Signing success is covered by tests with mocked service results, not a real identity upload. Current salary PDFs use the existing local template generator; live EAI drafting remains unavailable while AI Providers is inactive.

The EAI document adapter accepts PDF, JPEG and PNG files up to 10 MB. It requests explicit processing consent. Extraction and human review do not establish identity authenticity. Local state clears on refresh; remote EAI uploads follow company retention rules. Set `ONBOARDING_DOCUMENT_WORKFLOW_KEY` only after a verified classifier association.

## Company guides and existing tools

1. **Your details:** enter your employee name, department, role, manager and start date. Select Save and continue.
2. **Read and ask:** read the company guides. Use the persistent Onboarding assistant from any step to ask about policies. Select Ask a question to open the assistant. The launcher stays available on every screen. Minimize and reopen without losing the conversation or draft. Sources are linked beside answers. The six bundled documents are labelled samples; they are not actual company policy. Under Company documents, open Add company documents, select the matching category and upload real documents to replace that category's sample, or remove all samples first.
3. **Prepare documents:** select and generate a personalized checklist, welcome email or IT setup sheet, or a blank direct deposit form. PDFs download immediately. Add IT-provided account and equipment details when needed; the app never invents credentials.
4. Complete and save the fillable checklist, then upload it in **Submit for checking**. A blank, negative or incomplete checklist fails. Only a passing result enables Mark onboarding as complete.
5. Download the checked copy to retain its timestamp, findings and original document pages or extracted source text.

PDF, DOCX, TXT and Markdown uploads are supported, up to **10 MB per file**. PDFs must contain selectable text or readable form values. Scanned images need OCR or a text-based copy first. The seven required fields are employee signature, hire date, manager approval, emergency contact, tax forms completed, background check cleared and equipment inventory signed. Use `Label: value`; use YYYY-MM-DD dates, a contact name plus phone, named signatures/approvals, and explicit statuses such as Completed, Cleared and Signed. Completeness checks do not authenticate signatures or certify background checks.

## Local preview and AI

The local preview works without an AI workflow: it retrieves document excerpts, generates templates and checks explicit fields. AI mode adds grounded generated answers, document drafts and evidence-based field extraction through the existing signed-in EAI proxy. Failed AI requests show an error; they are not silently replaced by local results.

The three AI UI paths have been exercised with **mocked EAI responses**, including a mocked authenticated session. This does not prove real sign-in, live model quality or workspace entitlement. An earlier configured-workspace request returned `subscription_not_active`. Current portal checks show Content Understanding active, but AI Providers inactive. No executable generative workflow is configured. Live generative AI remains blocked until the provider and workflow are enabled. The final access policy and sign-in-method choices remain pending.

An administrator should set these documented values in the local environment after arranging the workflow through the approved EAI administration process:

```dotenv
WORKFLOW_ONBOARDING_ID=<verified executable workflow ID>
WORKFLOW_ONBOARDING_ANSWER_STAGE=answer
WORKFLOW_ONBOARDING_GENERATE_STAGE=generate
WORKFLOW_ONBOARDING_REVIEW_STAGE=review
```

See `.env.example`. Stage values must match the actual workflow. The runtime uses the existing tenant configuration (`NEXT_PUBLIC_EAI_TENANT_ID`, `EAI_TENANT_ID`, or `TENANT_DEFAULT_ID`) and can fall back to `WORKFLOW_VENDING_MACHINE_APP_ID` for the workflow. No model key belongs in the browser. Restart the app after environment changes. Use AI setup and the existing EAI sign-in, then verify all three stages against the real service before describing AI as live. Setting an ID alone does not establish entitlement or successful execution.

## Data and export limits

There is no onboarding backend database. Profile values, documents, conversation and completion status live in browser memory and clear on refresh. Download required records before leaving. In AI mode, selected source text and employee details are sent through the signed-in EAI proxy to the company's workspace. The temporary-password and login fields are excluded from AI profile prompts; obvious credential-labelled lines are also redacted. This is not a guarantee that arbitrary uploaded text contains no sensitive information.

PDF exports currently use a Latin font. Latin accents are supported and common curly punctuation in prose is normalized. Unsupported glyphs cause an actionable error instead of silent replacement. Credentials are never rewritten: unsupported characters or whitespace in a temporary password prevent the IT PDF export; leave that field blank and obtain the password through IT's secure channel. Checked PDF copies append source page appearances; they do not preserve the original editable form structure.

## Verification

The recorded run passed 242 tests across 43 suites, eight real local browser scenarios and mocked browser requests for all three AI stages. Evidence is in `.specify/specs/001-onboarding/evidence/`. The feature's validation report distinguishes these results from pending live AI, actual sign-in, production-build and final-audit work.

Employee portal checks on 24 September 2026: 80 tests across six suites, typecheck and targeted lint pass. Real browser checks include desktop, mobile, preview and workflow gates. See `.specify/specs/004-employee-workflow/validation-report.md`.
