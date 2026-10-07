import {
  SUPPORTING_DOCUMENT_TYPES,
  type SupportingDocumentKey,
} from './document-catalog';
import { EAIPlatformClient } from '@enterpriseaigroup/platform-sdk';
import {
  extractIdentityDocument,
  type ExtractedField,
} from './direct-extraction';
export interface ContentRuntime {
  tenantId: string;
  appKey: string;
  workflowKey: string;
  configured: boolean;
  mode?: 'direct';
}
export interface DocumentAnalysis {
  jobId: string;
  status: 'processing' | 'review' | 'failed';
  text: string;
  message: string;
  recordId?: string;
  scope?: 'extraction';
  fields?: ExtractedField[];
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
export function parseAnalysis(value: unknown, jobId = ''): DocumentAnalysis {
  if (!record(value))
    throw new Error('Content Understanding returned an unreadable result.');
  const data = record(value.data) ? value.data : value;
  const id =
    typeof data.jobId === 'string'
      ? data.jobId
      : typeof data.job_id === 'string'
        ? data.job_id
        : jobId;
  const status = String(data.status || '').toLowerCase();
  if (
    ['failed', 'error', 'cancelled'].includes(status) ||
    (typeof data.failedDocuments === 'number' && data.failedDocuments > 0)
  )
    return {
      jobId: id,
      status: 'failed',
      text: '',
      message:
        'Content Understanding could not process this file. Check the document and try again.',
    };
  // Only accept actual extracted content, never an upload receipt or document identifier.
  const parts: string[] = [];
  const extract = (node: unknown, depth = 0): void => {
    if (depth > 8 || parts.join('').length > 16000) return;
    if (Array.isArray(node)) {
      node.slice(0, 30).forEach((x) => extract(x, depth + 1));
      return;
    }
    if (!record(node)) return;
    for (const [key, v] of Object.entries(node)) {
      if (
        /^(text|content|markdown|extractedText|fullText)$/i.test(key) &&
        typeof v === 'string'
      )
        parts.push(v.slice(0, 10000));
      else if (
        /^(fields|extractedFields|extractedData)$/i.test(key) &&
        record(v)
      )
        for (const [field, val] of Object.entries(v)) {
          const text =
            typeof val === 'string'
              ? val
              : record(val)
                ? (val.valueString ?? val.content ?? val.valueDate ?? val.value)
                : undefined;
          if (typeof text === 'string' || typeof text === 'number')
            parts.push(`${field}: ${text}`);
        }
      else if (typeof v === 'object') extract(v, depth + 1);
    }
  };
  extract(data.documents ?? data.results ?? data);
  const text = [...new Set(parts)].join('\n').slice(0, 16000);
  if (
    ['completed', 'complete', 'succeeded', 'success', 'processed'].includes(
      status,
    )
  )
    return text
      ? {
          jobId: id,
          status: 'review',
          text,
          message:
            'Processing complete. Review the extracted information against your original document.',
        }
      : {
          jobId: id,
          status: 'failed',
          text: '',
          message:
            'Processing finished without readable extracted information. HR review is required.',
        };
  if (!id)
    throw new Error(
      'The service did not return a document job reference. No successful check has been recorded.',
    );
  return {
    jobId: id,
    status: 'processing',
    text: '',
    message: 'The document is being processed by Content Understanding.',
  };
}
export function validateIdentityFile(file: File): void {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error('Choose a non-empty file up to 10 MB.');
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type))
    throw new Error('Choose a PDF, JPG or PNG file.');
}
export async function submitIdentityDocument(
  file: File,
  runtime: ContentRuntime,
  documentTypeKey = 'drivers-licence',
): Promise<DocumentAnalysis> {
  validateIdentityFile(file);
  if (!runtime.configured)
    throw new Error(
      'The onboarding document workflow is not connected yet. Your file has not been uploaded.',
    );
  if (runtime.mode === 'direct')
    return extractIdentityDocument(file, runtime, documentTypeKey);
  const client = new EAIPlatformClient({ tenantId: runtime.tenantId });
  const response = await client.documents.upload(file, {
    storage_target: 'resourceapi',
    verticalKey: runtime.appKey,
    workflowKey: runtime.workflowKey,
    processing_mode: 'full',
  });
  return parseAnalysis(await response.json());
}
/** Supporting types require explicit Admin-selected direct extraction, not generic queued classification. */
export async function submitSupportingDocument(
  file: File,
  runtime: ContentRuntime,
  documentTypeKey: SupportingDocumentKey,
): Promise<DocumentAnalysis> {
  validateIdentityFile(file);
  if (!SUPPORTING_DOCUMENT_TYPES.some((type) => type.key === documentTypeKey))
    throw new Error('Choose a supported onboarding document type.');
  if (!runtime.configured || runtime.mode !== 'direct')
    throw new Error(
      'Supporting document extraction is not connected yet. Your file has not been uploaded.',
    );
  return extractIdentityDocument(file, runtime, documentTypeKey);
}

export async function refreshIdentityDocument(
  jobId: string,
  runtime: ContentRuntime,
): Promise<DocumentAnalysis> {
  if (!runtime.configured || !jobId)
    throw new Error('The document job is not configured.');
  const client = new EAIPlatformClient({ tenantId: runtime.tenantId });
  return parseAnalysis(
    await (await client.documents.getJobStatus(jobId)).json(),
    jobId,
  );
}

/** Flags obvious omissions and mismatches for human review; never establishes identity authenticity. */
export function identityFindings(
  text: string,
  legalName: string,
  birthDate: string,
  kind: string,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const findings: string[] = [];
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const names = legalName.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!names.length || !names.every((n) => normalized.split(' ').includes(n)))
    findings.push(
      'The extracted name does not match your full legal name. Check the file or your profile.',
    );
  const date = new Date(birthDate);
  const dates = [birthDate];
  if (!Number.isNaN(date.valueOf()))
    dates.push(
      `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`,
      `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`,
    );
  if (!dates.some((d) => d && text.includes(d)))
    findings.push(
      'The date of birth could not be matched. A clearer document or HR review is required.',
    );
  if (
    kind === 'Passport or driving licence' &&
    !/passport|licen[cs]e/i.test(text)
  )
    findings.push(
      'The result does not clearly identify a passport or driving licence.',
    );
  if (kind === 'Passport' && !/passport/i.test(text))
    findings.push('The result does not clearly identify a passport.');
  if (kind === 'Driving licence' && !/licen[cs]e/i.test(text))
    findings.push('The result does not clearly identify a driving licence.');
  const expiry = text.match(
    /(?:expiry|expiration|expires|date of expiry)[^\n\d]{0,30}(\d{4}-\d{2}-\d{2}|\d{2}[/.]\d{2}[/.]\d{4})/i,
  )?.[1];
  if (!expiry)
    findings.push(
      'An expiry date was not extracted. HR needs to review the original.',
    );
  else {
    const iso = expiry.includes('-')
      ? expiry
      : expiry.split(/[/.]/).reverse().join('-');
    if (iso < today)
      findings.push(
        'The extracted expiry date is in the past. Provide a current document or ask HR to review.',
      );
  }
  return findings;
}
