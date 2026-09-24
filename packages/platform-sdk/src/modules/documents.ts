/**
 * Documents Module
 *
 * Document upload, classification, and indexing via /v4/data/documents/*.
 */

import type { ChecklistRequest } from '../types';
import { platformFetch } from '../client';

export interface RagIndexRequest {
  documentId: string;
  storagePath: string;
  tenantId?: string;
  businessRequestId?: string;
  title?: string;
  enrichmentLevel?: 'basic' | 'contextual' | 'full';
  userId?: string;
  parentTenantId?: string;
  ultimateParentId?: string;
  spaceId?: string;
  documentScope?: 'kb' | 'br';
  visibleToChildren?: boolean;
  storageTarget?: string;
  resourceObjectType?: string;
  resourceId?: string;
  resourceFileProperty?: string;
  integrationId?: string;
  canonicalDocumentId?: string;
  documentType?: string;
  sourceAuthority?: string;
  tags?: string[];
  flags?: string[];
  effectiveDate?: string;
  expiryDate?: string;
  extractionTemplate?: string;
  contentClassification?: string;
  classificationConfidence?: number;
  documentStatus?: string;
  scopeTypes?: string[];
  jurisdictions?: string[];
  localities?: string[];
  entityRefs?: string[];
  conditions?: string[];
  themes?: string[];
  applicabilityPriority?: number;
  jobId?: string;
  recordId?: string;
}

export interface RagIndexResponse {
  success: boolean;
  documentId: string;
  status: 'indexed' | 'failed' | 'skipped' | string;
  chunkCount: number;
  pageCount: number;
  error?: string | null;
}

export interface BatchJobStatusResponse {
  jobId: string;
  tenantId: string;
  status: string;
  phase: string;
  processingMode: string;
  totalFiles: number;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  documents: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class DocumentsModule {
  constructor(
    private baseUrl: string,
    private tenantId: string,
  ) {}

  private docsUrl(path: string): string {
    return `${this.baseUrl}/v4/data/documents${path}`;
  }

  /** Upload a document (multipart/form-data). */
  async upload(
    file: File,
    metadata?: Record<string, string>,
  ): Promise<Response> {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('tenant_id', this.tenantId);
    formData.append('processing_mode', 'full');
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        formData.append(key, value);
      }
    }

    return platformFetch(this.docsUrl('/upload'), {
      method: 'POST',
      body: formData,
    });
  }

  /** Classify a batch of files. */
  async classify(files: File[]): Promise<Response> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('tenant_id', this.tenantId);
    formData.append('processing_mode', 'classification');

    return platformFetch(this.docsUrl('/classify'), {
      method: 'POST',
      body: formData,
    });
  }

  /** Classify a single document by URL. */
  async classifyByUrl(url: string): Promise<Response> {
    return platformFetch(this.docsUrl('/classify-by-url'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  }

  /** Index a document for RAG (retrieval-augmented generation). */
  async ragIndex(request: string | RagIndexRequest): Promise<Response> {
    const body =
      typeof request === 'string'
        ? { documentId: request, tenantId: this.tenantId }
        : { ...request, tenantId: request.tenantId || this.tenantId };

    return platformFetch(this.docsUrl('/rag-index'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** Get status for a document upload/indexing job. */
  async getJobStatus(jobId: string): Promise<Response> {
    return platformFetch(this.docsUrl(`/jobs/${encodeURIComponent(jobId)}`));
  }

  /** Index a document (general indexing). */
  async index(documentId: string): Promise<Response> {
    return platformFetch(this.docsUrl('/index'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId }),
    });
  }

  /**
   * Get a development checklist.
   * development_type is REQUIRED.
   */
  async getChecklist(request: ChecklistRequest): Promise<Response> {
    return platformFetch(this.docsUrl('/checklist'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }
}
