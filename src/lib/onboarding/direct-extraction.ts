import {
  EAIPlatformClient,
  platformFetch,
} from '@enterpriseaigroup/platform-sdk';
import type { ContentRuntime, DocumentAnalysis } from './content-understanding';
import { isSupportedDocumentKey } from './document-catalog';

export interface ExtractedField {
  name: string;
  value: string;
  confidence?: number;
}
const objectType = 'onboarding-document';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Accept typed rule output only. OCR text and upload receipts are not extraction success. */
export function parseDirectExtraction(value: unknown): ExtractedField[] {
  if (!isRecord(value) || value.status !== 'succeeded' || value.error)
    throw new Error(
      'Enterprise AI could not extract the document details. Please try again.',
    );
  const source = value.extractedFields ?? value.extracted_fields;
  if (!Array.isArray(source))
    throw new Error(
      'No fields were returned. Check the active document rules in Admin Portal.',
    );
  const fields: ExtractedField[] = [];
  for (const field of source.slice(0, 50)) {
    if (!isRecord(field) || typeof field.name !== 'string') continue;
    if (!['string', 'number', 'boolean'].includes(typeof field.value)) continue;
    const text = String(field.value).trim();
    if (!text) continue;
    fields.push({
      name: field.name.slice(0, 100),
      value: text.slice(0, 2000),
      ...(typeof field.confidence === 'number' &&
      Number.isFinite(field.confidence) &&
      field.confidence >= 0 &&
      field.confidence <= 1
        ? { confidence: field.confidence }
        : {}),
    });
  }
  if (!fields.length)
    throw new Error(
      'No readable fields were extracted. Try a clearer document or check its Admin rules.',
    );
  return fields;
}

export async function extractIdentityDocument(
  file: File,
  runtime: ContentRuntime,
  documentTypeKey: string,
): Promise<DocumentAnalysis> {
  if (!isSupportedDocumentKey(documentTypeKey))
    throw new Error('Choose a supported onboarding document type.');
  const client = new EAIPlatformClient({ tenantId: runtime.tenantId });
  const resource = await client.resources.create(objectType, {
    filename: file.name,
    documentTypeKey,
    status: 'uploading',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    await client.resources.uploadFile(objectType, resource.id, 'file', file, {
      filename: file.name,
      contentType: file.type,
    });
    const link = await client.resources.getFileSas(
      objectType,
      resource.id,
      'file',
      {
        expiresInSeconds: 300,
      },
    );
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Enterprise AI did not return a secure file link.');
    // User-delegated BFF call. EAI resolves the analyzer and rules from Admin Portal.
    const response = await platformFetch(
      `${client.baseUrl}/v4/data/documents/classify-by-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          documentUrl: link.url,
          tenantId: runtime.tenantId,
          verticalKey: runtime.appKey,
          workflowKey: runtime.workflowKey,
          useCustomAnalyzer: true,
          documentTypeCode: documentTypeKey,
        }),
      },
    );
    const fields = parseDirectExtraction(await response.json());
    const latest = await client.resources.get(objectType, resource.id);
    await client.resources.update(
      objectType,
      resource.id,
      {
        ...latest.data,
        status: 'extracted',
        extractedFields: fields,
        analysedAt: new Date().toISOString(),
      },
      latest.version,
      { enabled: false },
    );
    return {
      jobId: '',
      recordId: resource.id,
      scope: 'extraction',
      status: 'review',
      fields,
      text: fields.map((f) => `${f.name}: ${f.value}`).join('\n'),
      message: 'Details extracted using your document rules in Enterprise AI.',
    };
  } catch (error) {
    // Preserve a failed record for recovery. Never retry inference automatically.
    try {
      const latest = await client.resources.get(objectType, resource.id);
      await client.resources.update(
        objectType,
        resource.id,
        {
          ...latest.data,
          status: 'failed',
        },
        latest.version,
        { enabled: false },
      );
    } catch {
      /* The original error is the actionable failure. */
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
