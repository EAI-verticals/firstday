/**
 * Platform SDK Types
 *
 * Core types for v4 platform API contracts.
 */

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

export interface Resource<T = Record<string, unknown>> {
  id: string;
  tenant_id: string;
  object_type: string;
  data: T;
  version: number;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceUpdate {
  data: Record<string, unknown>;
  /** Required for optimistic locking. The platform returns 409 on mismatch. */
  version: number;
}

export interface ResourceActionResult<T = Record<string, unknown>> {
  id: string;
  object_type: string;
  action: string;
  data: T;
  /** The new version after the action mutation completes. */
  version: number;
}

export interface PaginatedResponse<T> {
  docs: T[];
  /** Null when the request disables exact totals. */
  totalDocs: number | null;
  page: number;
  limit: number;
  /** Null when the request disables exact totals. */
  totalPages: number | null;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor?: string | null;
}

export interface FilterExpression {
  equals?: unknown;
  not_equals?: unknown;
  greater_than?: unknown;
  greater_than_equal?: unknown;
  less_than?: unknown;
  less_than_equal?: unknown;
  in?: unknown[];
  not_in?: unknown[];
  exists?: boolean;
}

export interface ListOptions {
  page?: number;
  limit?: number;
  sort?: string;
  where?: Record<string, unknown>;
  cursor?: string;
  /** Omit to preserve the server's backward-compatible exact-count default. */
  includeTotal?: boolean;
}

export interface AggregateMetricDefinition {
  function: 'count' | 'sum' | 'avg' | 'count_distinct' | 'min' | 'max';
  field?: string;
}

export interface AggregateRequest {
  groupBy: string[];
  metrics: Record<string, AggregateMetricDefinition>;
  where?: Record<string, unknown>;
  limit?: number;
}

export interface AggregateResponse {
  rows: Array<Record<string, unknown>>;
  totalRows: number;
}

export interface BatchCreateItem<T = Record<string, unknown>> {
  data: T;
}

export interface BatchUpdateItem<T = Record<string, unknown>> {
  id: string;
  data: T;
  version: number;
}

export interface BatchResultItem {
  index: number;
  id?: string | null;
  success: boolean;
  version?: number | null;
  error?: string | null;
}

export interface BatchResponse {
  succeeded: number;
  failed: number;
  results: BatchResultItem[];
}

export interface RetryOptions {
  enabled?: boolean;
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface ObjectTypeManagementRequest {
  name?: string;
  displayName?: string;
  slug?: string;
  status?: string;
  tenant?: string;
  [key: string]: unknown;
}

export type ResourceSearchMode = 'fulltext' | 'hybrid' | 'vector';

export interface ResourceSearchRequest {
  query: string;
  objectTypes?: string[];
  mode?: ResourceSearchMode;
  limit?: number;
  includePayload?: boolean;
}

export interface ResourceSearchHit<T = Record<string, unknown>> {
  id: string;
  objectType: string;
  score?: number | null;
  rerankerScore?: number | null;
  content?: string | null;
  payload?: T | null;
}

export interface ResourceSearchResponse<T = Record<string, unknown>> {
  tenantId: string;
  query: string;
  mode: ResourceSearchMode;
  indexName: string;
  results: Array<ResourceSearchHit<T>>;
}

export interface ResourceFileUploadOptions {
  filename?: string;
  contentType?: string;
  storagePath?: string;
}

export interface ResourceFileSasOptions {
  expiresInSeconds?: number;
}

export interface ResourceFileUploadSessionOptions {
  expiresInSeconds?: number;
}

export interface ResourceFileResponse {
  tenantId: string;
  objectType: string;
  resourceId: string;
  propertyName: string;
  filename: string;
  contentType?: string | null;
  size: number;
  blobRef: string;
  blobUrl: string;
  version: number;
}

export interface ResourceFileDeleteResponse {
  tenantId: string;
  objectType: string;
  resourceId: string;
  propertyName: string;
  deleted: boolean;
  version: number;
}

export interface ResourceFileSasResponse {
  url: string;
  expiresInSeconds: number;
}

export interface ResourceFileIndexStatusResponse {
  tenantId: string;
  objectType: string;
  resourceId: string;
  propertyName: string;
  documentId: string;
  status: 'pending' | 'indexed' | string;
  indexName?: string | null;
}

export interface ResourceFileUploadSessionRequest {
  filename: string;
  contentType?: string;
  size?: number | null;
}

export interface ResourceFileUploadSessionResponse {
  tenantId: string;
  objectType: string;
  resourceId: string;
  propertyName: string;
  filename: string;
  contentType: string;
  size?: number | null;
  blobRef: string;
  uploadUrl: string;
  serviceUploadUrl?: string | null;
  expiresInSeconds: number;
  requiredHeaders: Record<string, string>;
}

export interface ResourceFileCompleteRequest {
  blobRef: string;
  filename: string;
  contentType?: string;
  size?: number | null;
  category?: string | null;
  workflowKey?: string | null;
  metadata?: Record<string, unknown>;
  queueIngestion?: boolean;
}

export interface ResourceFileRetryResponse {
  tenantId: string;
  objectType: string;
  resourceId: string;
  propertyName: string;
  latestRunId: string;
  ingestionStatus: 'queued' | string;
  version: number;
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  /** The user's message text. Maps to ChatRequest.message. */
  message: string;
  /** Conversation ID. Maps to ChatRequest.conversation_id. REQUIRED. */
  conversation_id: string;
  /** Parameters dict. Maps to ChatRequest.params. REQUIRED, use {} if none. */
  params: Record<string, unknown>;
  runtime_context?: Record<string, unknown>;
  message_history?: Array<{ role: string; content: string }>;
  ai_config?: Record<string, unknown>;
  vertical_key?: string;
  use_context_enrichment?: boolean;
  integrations?: Array<Record<string, unknown>>;
  document_scope?: 'all' | 'kb_only' | 'br_only' | 'kb_and_br' | 'none';
  business_request_id?: string;
  ultimate_parent_id?: string;
  tags?: string[];
  flags?: string[];
  document_type?: string | string[];
  documentType?: string | string[];
  search_context?: Record<string, unknown>;
  integration_id?: string;
  applicability_filter?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
}

export interface ChatStreamOptions {
  workflowId: string;
  stage: string;
  message: string;
  /** Auto-generated via crypto.randomUUID() if not provided. */
  conversationId?: string;
  /** Use {} if no params needed. */
  params?: Record<string, unknown>;
  runtime_context?: Record<string, unknown>;
  message_history?: Array<{ role: string; content: string }>;
  ai_config?: Record<string, unknown>;
  vertical_key?: string;
  use_context_enrichment?: boolean;
  integrations?: Array<Record<string, unknown>>;
  document_scope?: 'all' | 'kb_only' | 'br_only' | 'kb_and_br' | 'none';
  business_request_id?: string;
  ultimate_parent_id?: string;
  tags?: string[];
  flags?: string[];
  document_type?: string | string[];
  documentType?: string | string[];
  search_context?: Record<string, unknown>;
  integration_id?: string;
  applicability_filter?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// User types
// ---------------------------------------------------------------------------

export interface ProvisionMeRequest {
  tenant_id: string;
}

export interface EntraUser {
  oid: string;
  tid: string;
  email?: string;
  name?: string;
  azp?: string;
}

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------

export interface ChecklistRequest {
  tenant_id: string;
  /** REQUIRED - the type of development */
  development_type: string;
  zone?: string;
  lot_size?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

export interface JoinConfig {
  type?: string;
  /** Alias for from_type. Use "from" in JSON. */
  from: string;
  link_type: string;
  to: string;
}

export interface QueryRequest {
  /** List of object type names to query across. */
  object_types?: string[];
  /** Backward-compatible camelCase transport field used by existing callers. */
  objectTypes?: string[];
  /** Filters keyed by object type name, e.g. { Case: { status: { equals: 'open' } } } */
  where?: Record<string, Record<string, unknown>>;
  /** Optional join configuration for cross-type link queries. */
  join?: JoinConfig;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Link types
// ---------------------------------------------------------------------------

export interface CreateLinkRequest {
  target_id: string;
  /** Required by the platform — the object type of the target resource. */
  target_type: string;
}

export interface ResourceShareRequest {
  subject_id: string;
  role: string;
  [key: string]: unknown;
}

export interface ResourceParentAttachRequest {
  parent_object_type: string;
  parent_id: string;
  [key: string]: unknown;
}
