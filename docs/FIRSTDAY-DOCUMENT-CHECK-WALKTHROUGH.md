# Firstday: upload a document and review extracted details

Updated 28 September 2026. The app runs locally and uses hosted EAI Content Understanding.

## What you need to do

Your document types and extraction rules are already set up in Admin Portal. **Keep those records; you do not need to recreate them.** Start with the existing driving-licence number rule.

1. Open [Firstday locally](http://localhost:3001/vending-machine-app) and sign in with EAI if prompted.
2. Open the employee onboarding process and select **Your documents**.
3. Click **Upload** beside **Passport or driving licence**, then choose `Test_Driver_License.pdf`. The document preview lets you see the original file.
4. Set **Document type** to **Driving licence**. Check the consent box to send the file to your Enterprise AI workspace for processing and storage.
5. Click **Extract details**. Wait for the result; uploading or previewing alone does not run extraction.
6. Compare the **Extracted details** with the document preview. For this test file, the expected licence number is **D1234567890**. Use **Replace** to try a different file, then extract again.

PDF, JPG and PNG files up to 10 MB are supported. If your browser cannot display a PDF inline, use the preview's **Open original** link.

## What has been verified

- Direct EAI analysis and the signed-in local app both returned **LicenceNumber: D1234567890**, with **98% confidence**, for the supplied test PDF.
- The analyzer uses the saved Admin Portal document rules. The app does not supply a replacement extraction schema or prompt.
- The app stores the submitted file in an app-owned, owner-private document resource and gives EAI a temporary read URL.

Confidence is the extraction service's score, not proof that the licence is genuine. This first test extracts the number only; it does **not** finish identity verification or mark onboarding complete.

The PDF preview and extracted fields were visually checked in the signed-in app on desktop and mobile. The preview appears beside the fields on desktop and above them on a narrow screen.

## If you want another field later

1. In Admin Portal, open **Document Intelligence → Drivers Licence → Extraction & Generation Rules**.
2. Add or edit the desired field, such as `FullName` or `ExpiryDate`, with **Method: Extract** and **Active** selected.
3. Save the rule and ensure analyzer synchronization succeeds. A saved rule with a synchronization error is not ready for use.
4. Return to Firstday and run **Extract details** again. Existing results do not change just because a rule changed.

Leave the current document-type keys unchanged. The existing keys are `drivers-licence` for Drivers Licence and `test2` for Passport. Passport extraction still needs its own live test using a synthetic passport.

## If something does not work

| What you see                 | What to do                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Extract button unavailable   | Select a file, choose its type, sign in and tick processing consent.                                               |
| New rule absent from results | Confirm successful analyzer synchronization, then start a fresh extraction.                                        |
| Missing or incorrect value   | Compare the original; use a clearer sample and check the rule description. Do not treat it as a pass.              |
| Processing error             | Keep the displayed error and request reference for diagnosis. A preview is not evidence that extraction succeeded. |

## Technical note for the team

The working direct flow uploads to the owner-private `OnboardingDocument` file resource, obtains a temporary file URL, and calls `/v4/data/documents/classify-by-url` with the tenant context, `verticalKey: vending-machine-app`, `workflowKey: employee-onboarding`, `useCustomAnalyzer: true` and the selected `documentTypeCode`. It sends no inline analyzer or schema override.

This direct extraction flow does not require creating a planning application. The separate Business documents lifecycle issue in the earlier setup investigation concerns the full persisted onboarding workflow and does not block this tested extraction route. Do not interpret the direct extraction result as completion of that broader lifecycle.
