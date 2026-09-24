import { DocumentsModule } from '../src/modules/documents';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DocumentsModule', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('HP001 uploads documents through the v4 data documents endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const documents = new DocumentsModule('/api/eai', 'tenant-a');
    await documents.upload(new File(['hello'], 'test.pdf'), {
      source: 'smoke',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/data/documents/upload',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
    const body = mockFetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('files')).toBeInstanceOf(File);
    expect(body.get('tenant_id')).toBe('tenant-a');
    expect(body.get('processing_mode')).toBe('full');
    expect(body.get('source')).toBe('smoke');
  });

  it('HP001b classifies documents with tenant and processing metadata', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const documents = new DocumentsModule('/api/eai', 'tenant-a');
    await documents.classify([new File(['hello'], 'test.pdf')]);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/data/documents/classify',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
    const body = mockFetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('files')).toBeInstanceOf(File);
    expect(body.get('tenant_id')).toBe('tenant-a');
    expect(body.get('processing_mode')).toBe('classification');
  });

  it('HP002 requests checklists through the v4 data documents endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const documents = new DocumentsModule('/api/eai', 'tenant-a');
    await documents.getChecklist({
      tenant_id: 'tenant-a',
      development_type: 'residential',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/data/documents/checklist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'tenant-a',
          development_type: 'residential',
        }),
      },
    );
  });

  it('HP003 sends the v4 RAG indexing payload with the SDK tenant fallback', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const documents = new DocumentsModule('/api/eai', 'tenant-a');
    await documents.ragIndex({
      documentId: 'DOC-123',
      storagePath: 'tenant-a/uploads/document.pdf',
      businessRequestId: 'br-123',
      enrichmentLevel: 'full',
      storageTarget: 'resourceapi',
      resourceObjectType: 'PlanningDocument',
      resourceId: 'resource-123',
      resourceFileProperty: 'file',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/data/documents/rag-index',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: 'DOC-123',
          storagePath: 'tenant-a/uploads/document.pdf',
          businessRequestId: 'br-123',
          enrichmentLevel: 'full',
          storageTarget: 'resourceapi',
          resourceObjectType: 'PlanningDocument',
          resourceId: 'resource-123',
          resourceFileProperty: 'file',
          tenantId: 'tenant-a',
        }),
      },
    );
  });

  it('HP004 reads document job status through the v4 data documents endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const documents = new DocumentsModule('/api/eai', 'tenant-a');
    await documents.getJobStatus('job/123');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/data/documents/jobs/job%2F123',
      undefined,
    );
  });
});
