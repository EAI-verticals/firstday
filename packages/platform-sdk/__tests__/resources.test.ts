import { ResourcesModule } from '../src/modules/resources';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ResourcesModule', () => {
  const baseUrl = '/api/eai';
  const tenantId = 'test-tenant';
  let resources: ResourcesModule;

  beforeEach(() => {
    resources = new ResourcesModule(baseUrl, tenantId);
    mockFetch.mockReset();
  });

  function mockOkResponse(data: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    });
  }

  describe('create', () => {
    it('sends POST to correct URL with data wrapper', async () => {
      const resourceData = { applicantName: 'Jane', status: 'draft' };
      mockOkResponse({ id: '123', data: resourceData });

      await resources.create('Application', resourceData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: resourceData }),
        },
      );
    });
  });

  describe('get', () => {
    it('sends GET to correct URL with ID', async () => {
      mockOkResponse({ id: '123', data: {} });

      await resources.get('Application', '123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123',
        undefined,
      );
    });
  });

  describe('list', () => {
    it('includes cursor when provided', async () => {
      mockOkResponse({
        docs: [],
        totalDocs: 0,
        page: 1,
        totalPages: 1,
        nextCursor: null,
      });

      await resources.list('Application', { limit: 5, cursor: 'cursor-1' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application?limit=5&cursor=cursor-1',
        undefined,
      );
    });

    it('forwards an explicit count-free policy', async () => {
      mockOkResponse({ docs: [], totalDocs: null, page: 1, totalPages: null });

      const response = await resources.list('Application', {
        limit: 5,
        includeTotal: false,
      });

      expect(response.totalDocs).toBeNull();
      expect(response.totalPages).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application?limit=5&includeTotal=false',
        undefined,
      );
    });

    it('uses the v4 data resource route for sorted project lists', async () => {
      mockOkResponse({
        docs: [],
        totalDocs: 0,
        page: 1,
        totalPages: 1,
        nextCursor: null,
      });

      await resources.list('Project', { limit: 20, sort: '-updated_at' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/project?limit=20&sort=-updated_at',
        undefined,
      );
    });
  });

  describe('object type management', () => {
    it('lists object types through the v4 data resources route', async () => {
      mockOkResponse({ docs: [], totalDocs: 0 });

      await resources.listObjectTypes({ limit: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/object-types?limit=1',
        undefined,
      );
    });

    it('creates and updates object types through v4 management routes', async () => {
      mockOkResponse({ id: 'object-type-1' });
      await resources.createObjectType({
        name: 'Application',
        displayName: 'Application',
        tenant: tenantId,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/object-types',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Application',
            displayName: 'Application',
            tenant: tenantId,
          }),
        },
      );

      mockOkResponse({ id: 'object-type-1' });
      await resources.updateObjectType('object/type/1', { status: 'active' });

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/object-types/object%2Ftype%2F1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        },
      );
    });
  });

  describe('update', () => {
    it('sends PUT with data AND version (required for optimistic locking)', async () => {
      const data = { status: 'submitted' };
      mockOkResponse({ id: '123', data, version: 2 });

      await resources.update('Application', '123', data, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, version: 1 }),
        },
      );
    });

    it('retries conflicts using the latest resource version', async () => {
      const data = { status: 'submitted' };
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          json: () => Promise.resolve({ message: 'Version conflict' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: '123',
              data: { status: 'draft' },
              version: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '123', data, version: 3 }),
        });

      const updated = await resources.update('Application', '123', data, 1, {
        maxRetries: 2,
        baseDelayMs: 0,
      });

      expect(updated.version).toBe(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        '/api/eai/v4/data/resources/test-tenant/application/123',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, version: 1 }),
        },
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/eai/v4/data/resources/test-tenant/application/123',
        undefined,
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        '/api/eai/v4/data/resources/test-tenant/application/123',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, version: 2 }),
        },
      );
    });

    it('updates from an action result using the post-action version', async () => {
      const actionResult = {
        id: '123',
        object_type: 'application',
        action: 'submit',
        data: { status: 'submitted' },
        version: 4,
      };
      const data = { status: 'submitted', reviewNote: 'checked' };
      mockOkResponse({ ...actionResult, data, version: 5 });

      await resources.updateFrom('Application', actionResult, data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, version: 4 }),
        },
      );
    });
  });

  describe('delete', () => {
    it('sends DELETE to correct URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await resources.delete('Application', '123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123',
        { method: 'DELETE' },
      );
    });
  });

  describe('executeAction', () => {
    it('sends POST to action endpoint with params wrapper', async () => {
      const actionResult = {
        id: '123',
        object_type: 'application',
        action: 'submit',
        data: { status: 'submitted' },
        version: 2,
      };
      mockOkResponse(actionResult);

      const result = await resources.executeAction(
        'Application',
        '123',
        'submit',
        {
          note: 'test',
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123/actions/submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: { note: 'test' } }),
        },
      );
      expect(result).toEqual(actionResult);
    });

    it('sends empty params when none provided', async () => {
      mockOkResponse({
        id: '123',
        object_type: 'application',
        action: 'submit',
        data: { status: 'submitted' },
        version: 2,
      });

      await resources.executeAction('Application', '123', 'submit');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123/actions/submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: {} }),
        },
      );
    });
  });

  describe('getLinks', () => {
    it('sends GET to links endpoint', async () => {
      mockOkResponse([]);

      await resources.getLinks('Application', '123', 'documents');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123/links/documents',
        undefined,
      );
    });
  });

  describe('createLink', () => {
    it('sends POST with target_id and target_type', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      await resources.createLink(
        'Application',
        '123',
        'documents',
        '456',
        'Document',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123/links/documents',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: '456', target_type: 'document' }),
        },
      );
    });
  });

  describe('deleteLink', () => {
    it('sends DELETE to link target endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await resources.deleteLink('Application', '123', 'documents', '456');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123/links/documents/456',
        { method: 'DELETE' },
      );
    });
  });

  describe('query', () => {
    it('sends POST to query endpoint with object_types and where', async () => {
      mockOkResponse({ results: [], totalResults: 0 });

      await resources.query({
        object_types: ['Application'],
        where: { Application: { status: { equals: 'draft' } } },
        limit: 50,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/query',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            object_types: ['application'],
            where: { Application: { status: { equals: 'draft' } } },
            limit: 50,
          }),
        },
      );
    });
  });

  describe('batchCreate', () => {
    it('sends batch create payload to the batch endpoint', async () => {
      mockOkResponse({
        succeeded: 1,
        failed: 0,
        results: [{ index: 0, id: '123', success: true, version: 1 }],
      });

      await resources.batchCreate('Application', [
        { data: { applicantName: 'Jane' } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/batch/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ data: { applicantName: 'Jane' } }],
          }),
        },
      );
    });
  });

  describe('batchUpdate', () => {
    it('sends batch update payload to the batch endpoint', async () => {
      mockOkResponse({
        succeeded: 1,
        failed: 0,
        results: [{ index: 0, id: '123', success: true, version: 2 }],
      });

      await resources.batchUpdate('Application', [
        { id: '123', data: { status: 'submitted' }, version: 1 },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/batch/update',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ id: '123', data: { status: 'submitted' }, version: 1 }],
          }),
        },
      );
    });
  });

  describe('batchDelete', () => {
    it('sends batch delete ids to the batch endpoint', async () => {
      mockOkResponse({
        succeeded: 1,
        failed: 0,
        results: [{ index: 0, id: '123', success: true }],
      });

      await resources.batchDelete('Application', ['123']);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/batch/delete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ['123'] }),
        },
      );
    });
  });

  describe('aggregate', () => {
    it('sends aggregate requests to the aggregate endpoint', async () => {
      mockOkResponse({ rows: [{ status: 'draft', count: 3 }], totalRows: 1 });

      await resources.aggregate('Application', {
        groupBy: ['status'],
        metrics: { count: { function: 'count' } },
        limit: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/aggregate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupBy: ['status'],
            metrics: { count: { function: 'count' } },
            limit: 10,
          }),
        },
      );
    });
  });

  describe('search', () => {
    it('sends resource search requests to the v4 tenant search endpoint', async () => {
      mockOkResponse({
        tenantId,
        query: 'stormwater',
        mode: 'hybrid',
        indexName: 'idx',
        results: [],
      });

      await resources.search({
        query: 'stormwater',
        objectTypes: ['PlanningDocument'],
        mode: 'hybrid',
        limit: 5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'stormwater',
            objectTypes: ['planning-document'],
            mode: 'hybrid',
            limit: 5,
          }),
        },
      );
    });
  });

  describe('files', () => {
    it('uploads files through the resource file property endpoint', async () => {
      mockOkResponse({
        tenantId,
        objectType: 'planning-document',
        resourceId: 'res-1',
        propertyName: 'file',
        filename: 'hello.txt',
        contentType: 'text/plain',
        size: 5,
        blobRef: 'blob-ref',
        blobUrl: 'https://example.test/blob',
        version: 2,
      });

      const file = new Blob(['hello'], { type: 'text/plain' });
      await resources.uploadFile('PlanningDocument', 'res-1', 'file', file, {
        filename: 'hello.txt',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/planning-document/res-1/files/file?filename=hello.txt',
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: file,
        },
      );
    });

    it('creates direct upload sessions with expiry options', async () => {
      mockOkResponse({
        tenantId,
        objectType: 'planning-document',
        resourceId: 'res-1',
        propertyName: 'file',
        filename: 'large.pdf',
        contentType: 'application/pdf',
        size: 1024,
        blobRef: 'blob-ref',
        uploadUrl: 'https://example.test/upload',
        expiresInSeconds: 900,
        requiredHeaders: {},
      });

      await resources.createFileUploadSession(
        'PlanningDocument',
        'res-1',
        'file',
        {
          filename: 'large.pdf',
          contentType: 'application/pdf',
          size: 1024,
        },
        { expiresInSeconds: 1200 },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/planning-document/res-1/files/file/upload-session?expires_in_seconds=1200',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'large.pdf',
            contentType: 'application/pdf',
            size: 1024,
          }),
        },
      );
    });

    it('completes direct uploads and queues ingestion', async () => {
      mockOkResponse({ id: 'res-1', version: 3, data: {} });

      await resources.completeFileUpload('PlanningDocument', 'res-1', 'file', {
        blobRef: 'blob-ref',
        filename: 'large.pdf',
        contentType: 'application/pdf',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/planning-document/res-1/files/file/complete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobRef: 'blob-ref',
            filename: 'large.pdf',
            contentType: 'application/pdf',
          }),
        },
      );
    });

    it('reads SAS and index status from file helper endpoints', async () => {
      mockOkResponse({
        url: 'https://example.test/sas',
        expiresInSeconds: 900,
      });
      await resources.getFileSas('PlanningDocument', 'res-1', 'file', {
        expiresInSeconds: 900,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/planning-document/res-1/files/file/sas?expires_in_seconds=900',
        undefined,
      );

      mockOkResponse({
        tenantId,
        objectType: 'planning-document',
        resourceId: 'res-1',
        propertyName: 'file',
        documentId: 'DOC-1',
        status: 'indexed',
      });
      await resources.getFileIndexStatus('PlanningDocument', 'res-1', 'file');

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/planning-document/res-1/files/file/index-status',
        undefined,
      );
    });
  });

  describe('getSchema', () => {
    it('sends GET to schema endpoint', async () => {
      mockOkResponse({});

      await resources.getSchema();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/schema/test-tenant',
        undefined,
      );
    });
  });

  describe('getHistory', () => {
    it('sends GET to history endpoint', async () => {
      mockOkResponse([]);

      await resources.getHistory('Application', '123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/application/123/history',
        undefined,
      );
    });
  });

  describe('error handling', () => {
    it('throws PlatformError on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () =>
          Promise.resolve({ message: 'Resource not found', code: 'NOT_FOUND' }),
      });

      await expect(resources.get('Application', 'missing')).rejects.toThrow();
    });
  });

  describe('object type slug conversion', () => {
    it('converts PascalCase object types to kebab-case in the URL', async () => {
      mockOkResponse({ id: '1', data: {}, version: 1 });

      await resources.get('TrendDigest', '1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/trend-digest/1',
        undefined,
      );
    });

    it('handles consecutive capitals in object type names', async () => {
      mockOkResponse({ id: '1', data: {}, version: 1 });

      await resources.get('APIKey', '1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/v4/data/resources/test-tenant/api-key/1',
        undefined,
      );
    });
  });

  describe('routing contract coverage', () => {
    it('encodes dynamic segments exactly once and transports only canonical slugs', async () => {
      mockOkResponse({});
      await resources.executeAction('FeedItem', 'record/a b', 'publish/now');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2Fa%20b/actions/publish%2Fnow',
        expect.objectContaining({ method: 'POST' }),
      );

      mockOkResponse({});
      await resources.createLink(
        'FeedItem',
        'record/a b',
        'related items',
        'target/1',
        'APIKey',
      );
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2Fa%20b/links/related%20items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            target_id: 'target/1',
            target_type: 'api-key',
          }),
        }),
      );
    });

    it('routes every remaining finite resource operation through canonical references', async () => {
      mockOkResponse({});
      await resources.stream('FeedItem');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/stream',
        undefined,
      );

      mockOkResponse({});
      await resources.batchImport('FeedItem', [{ data: { title: 'one' } }]);
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/batch/import',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ items: [{ data: { title: 'one' } }] }),
        }),
      );

      mockOkResponse({});
      await resources.getPermissions('FeedItem', 'record/1');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/permissions',
        undefined,
      );

      mockOkResponse({});
      await resources.grantShare('FeedItem', 'record/1', {
        subject_id: 'user/1',
        role: 'viewer',
      });
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/shares',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ subject_id: 'user/1', role: 'viewer' }),
        }),
      );

      mockOkResponse({});
      await resources.revokeShare(
        'FeedItem',
        'record/1',
        'viewer/admin',
        'user/1',
      );
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/shares/viewer%2Fadmin/user%2F1',
        { method: 'DELETE' },
      );

      mockOkResponse({});
      await resources.attachParent(
        'FeedItem',
        'record/1',
        'APIKey',
        'parent/1',
      );
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/parents',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            parent_object_type: 'api-key',
            parent_id: 'parent/1',
          }),
        }),
      );

      mockOkResponse({});
      await resources.detachParent(
        'FeedItem',
        'record/1',
        'APIKey',
        'parent/1',
      );
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/parents/api-key/parent%2F1',
        { method: 'DELETE' },
      );

      mockOkResponse({});
      await resources.downloadFile('FeedItem', 'record/1', 'source/file');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/files/source%2Ffile',
        undefined,
      );

      mockOkResponse({ deleted: true });
      await resources.deleteFile('FeedItem', 'record/1', 'source/file');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/files/source%2Ffile',
        { method: 'DELETE' },
      );

      mockOkResponse({});
      await resources.retryFileIngestion('FeedItem', 'record/1', 'source/file');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/feed-item/record%2F1/files/source%2Ffile/retry',
        { method: 'POST' },
      );

      mockOkResponse({});
      await resources.deleteObjectType('object/type/1');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/object-types/object%2Ftype%2F1',
        { method: 'DELETE' },
      );

      mockOkResponse({});
      await resources.query({ object_types: ['FeedItem'], limit: 1 });
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/query',
        expect.objectContaining({
          body: JSON.stringify({ object_types: ['feed-item'], limit: 1 }),
        }),
      );

      mockOkResponse({ results: [], totalResults: 0 });
      await resources.query({ objectTypes: ['APIKey'], limit: 1 });
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/eai/v4/data/resources/test-tenant/query',
        expect.objectContaining({
          body: JSON.stringify({ objectTypes: ['api-key'], limit: 1 }),
        }),
      );
    });
  });
});
