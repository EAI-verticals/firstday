import {
  summarizeStorageProvisioning,
  summarizeTenantStorageProvisioning,
} from '@/lib/platform/storage-provisioning';

describe('storage provisioning summary', () => {
  it('HP001 requires PostgreSQL shadow storage for blob and documentdb types', () => {
    const summary = summarizeTenantStorageProvisioning('template', [
      {
        name: 'Document',
        slug: 'document',
        displayName: 'Document',
        properties: [],
        linkTypes: [],
        actions: [],
        storageBackend: 'blob',
        status: 'published',
      },
      {
        name: 'Transcript',
        slug: 'transcript',
        displayName: 'Transcript',
        properties: [],
        linkTypes: [],
        actions: [],
        storageBackend: 'documentdb',
        status: 'published',
      },
    ]);

    expect(summary.provision).toEqual({
      postgresql: true,
      documentdb: true,
      blob: true,
      search: false,
    });
    expect(summary.objectTypesByBackend.blob).toEqual(['Document']);
    expect(summary.objectTypesByBackend.documentdb).toEqual(['Transcript']);
  });

  it('BP001 flags search-only object types as requiring a canonical store decision', () => {
    const [summary] = summarizeStorageProvisioning({
      template: [
        {
          name: 'KnowledgeProjection',
          slug: 'knowledge-projection',
          displayName: 'Knowledge Projection',
          properties: [],
          linkTypes: [],
          actions: [],
          storageBackend: 'search',
          status: 'published',
        },
      ],
    });

    expect(summary.provision).toEqual({
      postgresql: false,
      documentdb: false,
      blob: false,
      search: true,
    });
    expect(summary.notes).toContain(
      'Search-only object type sets are not sufficient for canonical runtime data. Add a canonical backend before relying on runtime writes.',
    );
  });
});
