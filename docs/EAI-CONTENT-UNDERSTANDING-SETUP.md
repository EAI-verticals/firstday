# Set up Content Understanding for employee identity documents

Verified: 28 September 2026. Scope: local onboarding app with hosted Enterprise AI (EAI).


## Update: working direct extraction and preview

The first driving-licence extraction now works in the local app. Use the [Firstday walkthrough](FIRSTDAY-DOCUMENT-CHECK-WALKTHROUGH.md) for the current steps. The older canonical document-lifecycle prerequisites below still apply to that separate queued workflow; they do not block the direct extraction route now implemented.

- Created an app-owned `OnboardingDocument` type with `owner_private` authorization, a Blob-backed file property, and fields for the extraction result.
- Published its app manifest and verified the queued runtime schema sync; all 57 previous schema types remain, plus the new type.
- Uploads use the normal user-delegated ResourceAPI file route. A five-minute read link is passed to v4 `classify-by-url` with app/workflow scope and `useCustomAnalyzer: true`.
- EAI resolves the selected document type's rules from Admin Portal. No schema, prompt, analyzer ID or provider credential is hard-coded in the request.
- Live API and signed-in browser returned `LicenceNumber: D1234567890`, confidence `0.98`, from the synthetic licence. File and typed fields were read back from the private resource.
- The selected PDF/image is previewed locally beside the fields; mobile stacks both views. This does not verify authenticity, complete identity review, or mark onboarding done. Passport has not yet had its own live test.

## Outcome

The employee uploads a passport or driving licence under **Your documents**. EAI classifies the file and extracts configured fields. The app compares those fields with the employee's basic details. It shows the extracted values, missing fields, mismatches and review status.

Use a clearly marked synthetic document for the first test. Extraction and consistency checks do not prove identity or document authenticity.

**Historical investigation below:** these sections describe the earlier canonical-lifecycle setup. See the update above for the now-tested direct extraction flow. No app deployment was needed.

## 1. Understand the current position

| Item | Evidence and status |
| --- | --- |
| Local app | Includes document upload, job polling, extracted-text review and basic name/date checks. |
| Content Understanding service | Previously observed Active/Ready for this company and app on 24 September. Recheck before execution. |
| Company document types | Fresh production read confirms **Drivers Licence** (`drivers-licence`) and **Passport** (`test2`), both active. Preserve these existing keys. |
| Extraction rules | Drivers Licence has only `LicenceNumber`. Passport has only `PassportNumber`. Both are active Extract/String rules. |
| Classifier | Fresh production read confirms `employee-onboarding-identity`, published version 2, minimum confidence 0.8, with both document types. |
| App/workflow association | Fresh production read confirms version 2 associated with `vending-machine-app` / `employee-onboarding`. |
| Standalone document lifecycle | The saved association has **no `documentLifecycle` selection**. |
| Required storage types | Fresh published schema lacks `business-document` and `business-document-analysis`. |
| Production setup support | The 24 September attempt to save `business-document-v1` failed with HTTP 422, Unexpected field. This mutation was not repeated today. |
| Live extraction | Not yet verified for this onboarding journey. A working chatbot does not establish document-processing readiness. |

The current first-party PublicAPI guide still calls the standalone lifecycle a candidate. It identifies unresolved deployment, storage and authorization prerequisites. Source support alone does not establish production readiness.

## 2. Check the service in Admin Portal

1. Open [EAI Admin Portal](https://admin-portal.myenterprise.ai).
2. Select the company that owns **Vending Machine App**.
3. Open the company's service configuration.
4. Check **Content Understanding** is active and ready.
5. Check **Vending Machine App** is active for that service.

Keep the local app on `http://localhost:3001/vending-machine-app`. App deployment is unnecessary. Hosted platform dependencies still need to support the requested workflow.

## 3. Configure fields to extract

Open **Document Intelligence** in Admin Portal. Current source uses that page title; some deployed navigation may group it under Content Understanding.

1. Find **Drivers Licence**.
2. Expand its row.
3. Open **Extraction & Generation Rules**.
4. Select **Add Rule**.
5. Enter the field name and description.
6. Set **Method** to **Extract**.
7. Select the field's **Type**.
8. Keep **Active** selected.
9. Save the rule.
10. Repeat for **Passport**.

Start with these fields. Reuse the existing document-number rules.

| Field Name | Type | Applies to | Field Description |
| --- | --- | --- | --- |
| `FullName` | String | Both | Extract the holder's complete name exactly as printed. Do not copy the expected employee name. |
| `DateOfBirth` | Date | Both | Extract the holder's date of birth. Leave missing or unreadable values empty. |
| `ExpiryDate` | Date | Both | Extract the document expiry date. Leave missing or unreadable values empty. |
| `LicenceNumber` | String | Drivers Licence | Extract the licence number printed on the document. |
| `PassportNumber` | String | Passport | Extract the passport number printed on the document. |
| `IssuingCountry` | String | Both | Extract the issuing country when shown. |
| `IssuingAuthority` | String | Drivers Licence | Extract the issuing state or authority when shown. |

Add address only if your onboarding process needs an address comparison. Passports may not show a residential address.

The current Admin source requests analyzer synchronization when saving a rule. Treat an analyzer-sync error as an incomplete save. Do not assume a rule stored in Admin is already running in the provider.

### Optional checks configured in Admin

The rule form also supports **Generate**, **Boolean**, **Compliance Check**, **Expected Value Placeholder**, **Extracted Value Placeholder**, **Pass Message** and **Fail Message**.

These controls allow configured assessment fields. They do not automatically connect the onboarding form to the analyzer. Establish and test the employee-context mapping first.

For example, a name-comparison rule must receive an expected name separately from the extracted name. A missing expected value must produce review or failure. It must not produce a pass.

Use deterministic application checks for date expiry and exact field comparisons where practical. If business checks must be controlled entirely in Admin, implement a configuration-driven mapping and consume the returned rule outcomes. The current app does not do this yet.

## 4. Check the classifier and app association

In **Document Intelligence**, open **Manage classifiers** and select the existing onboarding classifier.

1. Confirm **Drivers Licence** and **Passport** are selected under **Document types**.
2. Preserve the existing document type keys.
3. Save and publish if you change the classifier definition.
4. Confirm publication and provider materialization succeed.
5. Find **App & workflow targets**.
6. Select **Vending Machine App**.
7. Select the `employee-onboarding` workflow.
8. Associate the intended published classifier version.

Current source also includes **Document lifecycle → Business documents**. This maps to `business-document-v1`.

**Production prerequisite:** ask the EAI platform team to confirm this selection is supported on production before changing it. The last attempt was rejected, and the required object types remain absent today.

If the selector is absent, or saving returns HTTP 422, stop this part of setup. Do not select Planning Assist or create a dummy planning application. Employee onboarding needs the standalone business-document lifecycle.

The installed CLI supports this equivalent configuration command. Run it only after platform readiness is confirmed and configuration is authorized:

```sh
eai classifier target employee-onboarding-identity \
  --app vending-machine-app \
  --workflow employee-onboarding \
  --document-lifecycle business-document-v1 \
  --version 2 \
  --format json
```

Use the new published version if you changed the classifier. Verify `eai --describe` and `eai classifier target --help` on each agent's installation before use. Select the correct workspace without publishing its private identifier.

## 5. Give the EAI platform team this prerequisite request

> Enable the supported standalone `business-document-v1` lifecycle for Vending Machine App and its employee-onboarding workflow. The classifier is already published and associated. The current association has no documentLifecycle selection. The workspace's published schema lacks business-document and business-document-analysis. The last target update returned HTTP 422 Unexpected field. Please confirm the production target API, governed storage, app/install authorization, owner-private access, callbacks and persisted result readback are supported before we run a synthetic identity-document upload.

The team must use the supported platform release and provisioning process. Do not create guessed object schemas, weaken access checks, or write raw binding records to bypass validation.

## 6. Complete the local app integration

### Existing implementation

The current app:

- Accepts PDF, JPG and PNG files up to 10 MB.
- Uses the authenticated EAI app proxy.
- Uploads with `storage_target=resourceapi`, app key and workflow key.
- Retains a job reference and requests job status.
- Displays extracted text for review.
- Performs basic local text checks for name, birth date, document type and expiry.

### Required changes

1. Send the selected document category and employee reference details.
2. Parse typed extracted fields and rule results instead of flattening everything into text.
3. Preserve classification confidence, missing values, evidence and analysis status.
4. Compare the returned document type with the selected upload category.
5. Fetch the persisted document and analysis after job completion.
6. Distinguish **Processing**, **Needs review**, **Checks passed** and **Processing failed**.
7. Keep salary confirmation gated on the agreed review outcome.
8. Retain safe document/job references so refresh can restore the result.

The current `submitIdentityDocument` accepts only a file and runtime. It does **not** send the employee's basic details or selected document kind to EAI. Current comparison checks run locally after text extraction.

The current upload helper requests `processing_mode=full`. Full mode includes RAG indexing behavior. Identity checking should request the documented classification/custom-analysis lifecycle without indexing identity documents into the company's general handbook knowledge base.

Do not call the SDK's old context-free `/classify` helper. Use the scoped `/upload` contract. Update the upload helper to send the processing mode once; it currently appends a default `full` before appending metadata.

### Supported request shape

Send multipart data to the local authenticated proxy:

```text
POST /api/eai/v4/data/documents/upload

files: <synthetic document>
storage_target: resourceapi
verticalKey: vending-machine-app
workflowKey: employee-onboarding
processing_mode: classification
context_data: <JSON with agreed employee reference fields>
```

The proxy forwards to hosted PublicAPI `/v4/data/documents/upload`.

The current PublicAPI source accepts `context_data` as JSON for extraction. Standalone processing preserves caller context. It does not automatically load the onboarding profile.

An example application contract could use these reference fields:

```json
{
  "ExpectedFullName": "Alex Morgan",
  "ExpectedDateOfBirth": "1995-06-15",
  "ExpectedDocumentType": "drivers-licence",
  "CheckDate": "2026-09-28"
}
```

These names are a proposed app-to-rule contract, not preinstalled EAI fields. Configure the corresponding rule descriptions and verify their use. Derive authoritative context server-side where required. Never treat expected values as extracted evidence.

Clients must not send analyzer credentials, storage mappings, lifecycle mappings or an arbitrary classifier selection. EAI resolves the authorized app/workflow binding.

### Completion and readback

1. Retain the accepted job and document identifiers.
2. Poll `GET /v4/data/documents/jobs/{jobId}`.
3. Stop on success, failure, cancellation or a bounded timeout.
4. Read `GET /v4/data/documents/records/{id}` after completion.
5. Use `GET /v4/data/documents/records/{id}/content` for the authorized original file.

Configured record routes require tenant context and `storage_target=resourceapi`. The current lifecycle contract allows `job_id` to cross-check a retained record. A job ID does not grant access.

Confirm these routes in the deployed contract before implementation is marked complete. An accepted upload or completed queue job alone does not prove saved extraction results exist.

## 7. Run the first synthetic test

Use a clearly labelled sample licence with invented personal details. Match those details to the app's basic-info form.

1. Sign into the local app.
2. Complete and save **Basic details**.
3. Open **Your documents**.
4. Select the driving-licence upload category.
5. Upload the synthetic file.
6. Submit it for Content Understanding.
7. Confirm EAI returns document and job references.
8. Confirm the job reaches a terminal status.
9. Confirm classification selects Drivers Licence.
10. Confirm the configured fields contain values from the file.
11. Confirm saved results can be read back.
12. Confirm comparisons use the saved employee details.
13. Confirm the original file opens only for an authorized user.

Repeat with a synthetic passport. Then test these failures:

| Test | Expected result |
| --- | --- |
| Different name or birth date | Specific mismatch; no automatic completion. |
| Expired document | Expiry issue with the extracted date. |
| Missing number or unreadable expiry | Missing/unreadable field; review required. |
| Passport uploaded under licence | Document-type mismatch. |
| Blurred or unrelated image | Low-confidence or wrong-type result; review required. |
| Provider failure or timeout | Processing failure; no false pass. |
| Refresh after processing | Saved result restored from its authorized record. |
| Another employee tries the record | Access denied under the platform's ownership policy. |

Use the platform retention policy to remove only the synthetic files and outputs created for this test. Do not add these documents to the company handbook RAG collection.

## 8. Completion criteria

Call this feature working only when:

- Production supports the saved Business documents lifecycle and its storage/authorization dependencies.
- Admin rules affect a fresh upload.
- Employee context reaches the intended rules or documented app comparisons.
- Both licence and passport tests return persisted extraction results.
- Missing, mismatched and failed cases never pass silently.
- Original-file access and saved-result access are authorized.
- The UI explains what passed and what needs review.

## Evidence and primary sources

- [Current app Content Understanding adapter](../src/lib/onboarding/content-understanding.ts).
- [Previous production setup attempt](../.specify/specs/004-employee-workflow/evidence/standalone-setup-attempt.md).
- [Corrected standalone upload contract investigation](../.specify/specs/004-employee-workflow/evidence/upload-route-verification.md).
- [PublicAPI lifecycle guide](https://github.com/enterpriseaigroup/PublicAPI/blob/main/docs/document-lifecycle-3453.md).
- [PublicAPI document upload route](https://github.com/enterpriseaigroup/PublicAPI/blob/main/src/app/routers/v4/standalone_sources/documents.py).
- [Admin rule editor](https://github.com/enterpriseaigroup/Admin-Portal/blob/main/src/app/platform/document-intelligence/RuleDialog.tsx).
- [Admin document intelligence page and analyzer sync](https://github.com/enterpriseaigroup/Admin-Portal/blob/main/src/app/platform/document-intelligence/DocumentIntelligenceManager.tsx).
- [Admin classifier targets](https://github.com/enterpriseaigroup/Admin-Portal/blob/main/src/app/platform/document-intelligence/ClassifierManager.tsx).

Fresh read-only production checks used the installed CLI's verified classifier-list, resource-list and published-schema commands. GitHub `main` source describes current implementation intent; it is not proof that those features are deployed to production.
