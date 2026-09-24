/**
 * Resources Module
 *
 * CRUD operations on domain resources through the canonical resource router.
 * V4 data resource routes tenant-scoped records to the configured backend while
 * preserving a consistent REST contract.
 */

import type {
  AggregateRequest,
  AggregateResponse,
  BatchCreateItem,
  BatchResponse,
  BatchUpdateItem,
  RetryOptions,
  Resource,
  ResourceActionResult,
  PaginatedResponse,
  ListOptions,
  QueryRequest,
  CreateLinkRequest,
  ResourceFileCompleteRequest,
  ResourceFileDeleteResponse,
  ResourceFileIndexStatusResponse,
  ResourceFileResponse,
  ResourceFileRetryResponse,
  ResourceFileSasOptions,
  ResourceFileSasResponse,
  ResourceFileUploadOptions,
  ResourceFileUploadSessionOptions,
  ResourceFileUploadSessionRequest,
  ResourceFileUploadSessionResponse,
  ResourceSearchRequest,
  ResourceSearchResponse,
  ObjectTypeManagementRequest,
  ResourceParentAttachRequest,
  ResourceShareRequest,
} from '../types';
import { PlatformError } from '../errors';
import { platformFetch } from '../client';
import {
  createResourceRouting,
  type ResourceRouting,
} from '../resource-routing';

export class ResourcesModule {
  private readonly routing: ResourceRouting;

  constructor(baseUrl: string, tenantId: string) {
    this.routing = createResourceRouting({ baseUrl, tenantId });
  }

  private objectTypesUrl(options?: ListOptions): string {
    const url = new URL(
      this.routing.objectTypes(),
      globalThis.location?.origin || 'http://localhost',
    );
    if (options?.page) url.searchParams.set('page', String(options.page));
    if (options?.limit) url.searchParams.set('limit', String(options.limit));
    if (options?.sort) url.searchParams.set('sort', options.sort);
    if (options?.where)
      url.searchParams.set('where', JSON.stringify(options.where));
    if (options?.cursor) url.searchParams.set('cursor', options.cursor);
    return url.pathname + url.search;
  }

  private async retryingUpdate<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    data: T,
    version: number,
    retry?: RetryOptions,
  ): Promise<Resource<T>> {
    const enabled = retry?.enabled ?? true;
    const maxRetries = retry?.maxRetries ?? 3;
    const baseDelayMs = retry?.baseDelayMs ?? 100;

    let nextVersion = version;
    let attempt = 0;
    while (true) {
      try {
        const response = await platformFetch(
          this.routing.member(objectType, id),
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, version: nextVersion }),
          },
        );
        return response.json();
      } catch (error) {
        if (
          !(error instanceof PlatformError) ||
          !error.isConflict ||
          !enabled ||
          attempt >= maxRetries
        ) {
          throw error;
        }

        // A 409 means another writer won the optimistic-lock race. Refresh the
        // latest version and retry so callers can opt into safe write retries
        // without reimplementing conflict handling at every call site.
        const latest = await this.get(objectType, id);
        nextVersion = latest.version;
        const delayMs = baseDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        attempt += 1;
      }
    }
  }

  /** Create a new resource. */
  async create<T = Record<string, unknown>>(
    objectType: string,
    data: T,
  ): Promise<Resource<T>> {
    const response = await platformFetch(this.routing.collection(objectType), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    return response.json();
  }

  /** Get a single resource by ID. */
  async get<T = Record<string, unknown>>(
    objectType: string,
    id: string,
  ): Promise<Resource<T>> {
    const response = await platformFetch(this.routing.member(objectType, id));
    return response.json();
  }

  /** List resources with optional pagination, sorting, and filtering. */
  async list<T = Record<string, unknown>>(
    objectType: string,
    options?: ListOptions,
  ): Promise<PaginatedResponse<Resource<T>>> {
    const url = new URL(
      this.routing.collection(objectType),
      globalThis.location?.origin || 'http://localhost',
    );
    if (options?.page) url.searchParams.set('page', String(options.page));
    if (options?.limit) url.searchParams.set('limit', String(options.limit));
    if (options?.sort) url.searchParams.set('sort', options.sort);
    if (options?.where)
      url.searchParams.set('where', JSON.stringify(options.where));
    if (options?.cursor) url.searchParams.set('cursor', options.cursor);
    if (options?.includeTotal !== undefined) {
      url.searchParams.set('includeTotal', String(options.includeTotal));
    }

    const response = await platformFetch(url.pathname + url.search);
    return response.json();
  }

  async stream(
    objectType: string,
    options?: Pick<ListOptions, 'limit' | 'sort' | 'where' | 'cursor'>,
  ): Promise<Response> {
    const url = new URL(
      this.routing.collectionOperation(objectType, 'stream'),
      globalThis.location?.origin || 'http://localhost',
    );
    if (options?.limit) url.searchParams.set('limit', String(options.limit));
    if (options?.sort) url.searchParams.set('sort', options.sort);
    if (options?.where)
      url.searchParams.set('where', JSON.stringify(options.where));
    if (options?.cursor) url.searchParams.set('cursor', options.cursor);
    return platformFetch(url.pathname + url.search);
  }

  /** List Object Types through the v4 data resource route. */
  async listObjectTypes<T = Record<string, unknown>>(
    options?: ListOptions,
  ): Promise<PaginatedResponse<T>> {
    const response = await platformFetch(this.objectTypesUrl(options));
    return response.json();
  }

  /** Create an Object Type through the v4 data resource route. */
  async createObjectType<T = Record<string, unknown>>(
    request: ObjectTypeManagementRequest,
  ): Promise<T> {
    const response = await platformFetch(this.objectTypesUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return response.json();
  }

  /** Update an Object Type through the v4 data resource route. */
  async updateObjectType<T = Record<string, unknown>>(
    objectTypeId: string,
    request: ObjectTypeManagementRequest,
  ): Promise<T> {
    const response = await platformFetch(
      this.routing.objectType(objectTypeId),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    return response.json();
  }

  /** Delete an Object Type through the v4 data resource route. */
  async deleteObjectType(objectTypeId: string): Promise<void> {
    await platformFetch(this.routing.objectType(objectTypeId), {
      method: 'DELETE',
    });
  }

  /**
   * Update a resource. Version is REQUIRED for optimistic locking.
   * The platform returns 409 on version mismatch.
   */
  async update<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    data: T,
    version: number,
    retry?: RetryOptions,
  ): Promise<Resource<T>> {
    return this.retryingUpdate(objectType, id, data, version, retry);
  }

  /**
   * Update from a resource or action result without copying its version into
   * separate state that can become stale.
   */
  async updateFrom<T = Record<string, unknown>>(
    objectType: string,
    current: Pick<Resource<T>, 'id' | 'version'>,
    data: T,
    retry?: RetryOptions,
  ): Promise<Resource<T>> {
    return this.retryingUpdate(
      objectType,
      current.id,
      data,
      current.version,
      retry,
    );
  }

  /** Delete a resource by ID. */
  async delete(objectType: string, id: string): Promise<void> {
    await platformFetch(this.routing.member(objectType, id), {
      method: 'DELETE',
    });
  }

  async batchCreate<T = Record<string, unknown>>(
    objectType: string,
    items: Array<BatchCreateItem<T>>,
  ): Promise<BatchResponse> {
    const response = await platformFetch(
      this.routing.collectionOperation(objectType, 'batch', 'create'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      },
    );
    return response.json();
  }

  /** Import a finite batch of resources. */
  async batchImport<T = Record<string, unknown>>(
    objectType: string,
    items: Array<BatchCreateItem<T>>,
  ): Promise<BatchResponse> {
    const response = await platformFetch(
      this.routing.collectionOperation(objectType, 'batch', 'import'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      },
    );
    return response.json();
  }

  async batchUpdate<T = Record<string, unknown>>(
    objectType: string,
    items: Array<BatchUpdateItem<T>>,
  ): Promise<BatchResponse> {
    const response = await platformFetch(
      this.routing.collectionOperation(objectType, 'batch', 'update'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      },
    );
    return response.json();
  }

  async batchDelete(objectType: string, ids: string[]): Promise<BatchResponse> {
    const response = await platformFetch(
      this.routing.collectionOperation(objectType, 'batch', 'delete'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      },
    );
    return response.json();
  }

  async aggregate(
    objectType: string,
    request: AggregateRequest,
  ): Promise<AggregateResponse> {
    const response = await platformFetch(
      this.routing.collectionOperation(objectType, 'aggregate'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    return response.json();
  }

  /** Search across tenant resource projections. */
  async search<T = Record<string, unknown>>(
    request: ResourceSearchRequest,
  ): Promise<ResourceSearchResponse<T>> {
    const body = {
      ...request,
      objectTypes: request.objectTypes
        ? this.routing.transportSlugs(request.objectTypes)
        : undefined,
    };
    const response = await platformFetch(this.routing.search(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  /** Upload a file into a Blob-backed resource file property. */
  async uploadFile(
    objectType: string,
    id: string,
    propertyName: string,
    file: BodyInit,
    options?: ResourceFileUploadOptions,
  ): Promise<ResourceFileResponse> {
    const url = new URL(
      this.routing.subresource(objectType, id, 'files', propertyName),
      globalThis.location?.origin || 'http://localhost',
    );
    if (options?.filename) url.searchParams.set('filename', options.filename);
    if (options?.storagePath)
      url.searchParams.set('storagePath', options.storagePath);

    const contentType =
      options?.contentType ||
      (typeof Blob !== 'undefined' && file instanceof Blob && file.type
        ? file.type
        : 'application/octet-stream');

    const response = await platformFetch(url.pathname + url.search, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    return response.json();
  }

  /** Download a Blob-backed resource file property. */
  async downloadFile(
    objectType: string,
    id: string,
    propertyName: string,
  ): Promise<Response> {
    return platformFetch(
      this.routing.subresource(objectType, id, 'files', propertyName),
    );
  }

  /** Delete a Blob-backed resource file property. */
  async deleteFile(
    objectType: string,
    id: string,
    propertyName: string,
  ): Promise<ResourceFileDeleteResponse> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'files', propertyName),
      { method: 'DELETE' },
    );
    return response.json();
  }

  /** Create a short-lived read SAS for a resource file property. */
  async getFileSas(
    objectType: string,
    id: string,
    propertyName: string,
    options?: ResourceFileSasOptions,
  ): Promise<ResourceFileSasResponse> {
    const url = new URL(
      this.routing.subresource(objectType, id, 'files', propertyName, 'sas'),
      globalThis.location?.origin || 'http://localhost',
    );
    if (options?.expiresInSeconds) {
      url.searchParams.set(
        'expires_in_seconds',
        String(options.expiresInSeconds),
      );
    }
    const response = await platformFetch(url.pathname + url.search);
    return response.json();
  }

  /** Read Search indexing status for a resource file property. */
  async getFileIndexStatus(
    objectType: string,
    id: string,
    propertyName: string,
  ): Promise<ResourceFileIndexStatusResponse> {
    const response = await platformFetch(
      this.routing.subresource(
        objectType,
        id,
        'files',
        propertyName,
        'index-status',
      ),
    );
    return response.json();
  }

  /** Create a direct-to-Blob upload session for large resource files. */
  async createFileUploadSession(
    objectType: string,
    id: string,
    propertyName: string,
    request: ResourceFileUploadSessionRequest,
    options?: ResourceFileUploadSessionOptions,
  ): Promise<ResourceFileUploadSessionResponse> {
    const url = new URL(
      this.routing.subresource(
        objectType,
        id,
        'files',
        propertyName,
        'upload-session',
      ),
      globalThis.location?.origin || 'http://localhost',
    );
    if (options?.expiresInSeconds) {
      url.searchParams.set(
        'expires_in_seconds',
        String(options.expiresInSeconds),
      );
    }
    const response = await platformFetch(url.pathname + url.search, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return response.json();
  }

  /** Attach a completed Blob upload to the resource and queue ingestion. */
  async completeFileUpload<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    propertyName: string,
    request: ResourceFileCompleteRequest,
  ): Promise<Resource<T>> {
    const response = await platformFetch(
      this.routing.subresource(
        objectType,
        id,
        'files',
        propertyName,
        'complete',
      ),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    return response.json();
  }

  /** Requeue ingestion for an already attached resource file. */
  async retryFileIngestion(
    objectType: string,
    id: string,
    propertyName: string,
  ): Promise<ResourceFileRetryResponse> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'files', propertyName, 'retry'),
      { method: 'POST' },
    );
    return response.json();
  }

  /** Execute a named action on a resource. */
  async executeAction<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<ResourceActionResult<T>> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'actions', action),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: params ?? {} }),
      },
    );
    return response.json();
  }

  /** Get linked resources. */
  async getLinks<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    linkType: string,
  ): Promise<Resource<T>[]> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'links', linkType),
    );
    return response.json();
  }

  /** Create a link between two resources. */
  async createLink(
    objectType: string,
    id: string,
    linkType: string,
    targetId: string,
    targetType: string,
  ): Promise<Response> {
    const body: CreateLinkRequest = {
      target_id: targetId,
      target_type: this.routing.transportSlug(targetType),
    };
    return platformFetch(
      this.routing.subresource(objectType, id, 'links', linkType),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }

  /** Return the effective permissions for one resource. */
  async getPermissions<T = Record<string, unknown>>(
    objectType: string,
    id: string,
  ): Promise<T> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'permissions'),
    );
    return response.json();
  }

  /** Grant a share using the canonical resource route. */
  async grantShare<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    request: ResourceShareRequest,
  ): Promise<T> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'shares'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    return response.json();
  }

  /** Revoke a share using encoded role and subject path segments. */
  async revokeShare(
    objectType: string,
    id: string,
    role: string,
    subjectId: string,
  ): Promise<void> {
    await platformFetch(
      this.routing.subresource(objectType, id, 'shares', role, subjectId),
      { method: 'DELETE' },
    );
  }

  /** Attach a canonical parent Object Type to a resource. */
  async attachParent<T = Record<string, unknown>>(
    objectType: string,
    id: string,
    parentObjectType: string,
    parentId: string,
  ): Promise<T> {
    const request: ResourceParentAttachRequest = {
      parent_object_type: this.routing.transportSlug(parentObjectType),
      parent_id: parentId,
    };
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'parents'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    return response.json();
  }

  /** Detach a parent using its canonical Object Type slug. */
  async detachParent(
    objectType: string,
    id: string,
    parentObjectType: string,
    parentId: string,
  ): Promise<void> {
    await platformFetch(
      this.routing.parent(objectType, id, parentObjectType, parentId),
      { method: 'DELETE' },
    );
  }

  /** Delete a link between two resources. */
  async deleteLink(
    objectType: string,
    id: string,
    linkType: string,
    targetId: string,
  ): Promise<void> {
    await platformFetch(
      this.routing.subresource(objectType, id, 'links', linkType, targetId),
      { method: 'DELETE' },
    );
  }

  /** Execute a query against resources. */
  async query<T = Record<string, unknown>>(
    request: QueryRequest,
  ): Promise<PaginatedResponse<Resource<T>>> {
    const body = {
      ...request,
      ...(request.object_types
        ? { object_types: this.routing.transportSlugs(request.object_types) }
        : {}),
      ...(request.objectTypes
        ? { objectTypes: this.routing.transportSlugs(request.objectTypes) }
        : {}),
    };
    const response = await platformFetch(this.routing.query(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  /** Get the schema for all object types in this tenant. */
  async getSchema(): Promise<Record<string, unknown>> {
    const response = await platformFetch(this.routing.schema());
    return response.json();
  }

  /** Get the change history for a resource. */
  async getHistory(
    objectType: string,
    id: string,
  ): Promise<Record<string, unknown>[]> {
    const response = await platformFetch(
      this.routing.subresource(objectType, id, 'history'),
    );
    return response.json();
  }
}
