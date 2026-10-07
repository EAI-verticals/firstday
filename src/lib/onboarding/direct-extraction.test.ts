import {
  extractIdentityDocument,
  parseDirectExtraction,
} from './direct-extraction';
import {
  EAIPlatformClient,
  platformFetch,
} from '@enterpriseaigroup/platform-sdk';
jest.mock('@enterpriseaigroup/platform-sdk', () => ({
  EAIPlatformClient: jest.fn(),
  platformFetch: jest.fn(),
}));
const resources = {
  create: jest.fn(),
  uploadFile: jest.fn(),
  getFileSas: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
};
const runtime = {
  tenantId: 'test-workspace',
  appKey: 'test-app',
  workflowKey: 'onboarding',
  configured: true,
  mode: 'direct' as const,
};
const result = {
  status: 'succeeded',
  extractedFields: [
    { name: 'LicenceNumber', value: 'D1234567890', confidence: 0.98 },
  ],
};
const file = new File(['synthetic'], 'test.pdf', { type: 'application/pdf' });
beforeEach(() => {
  jest.resetAllMocks();
  (EAIPlatformClient as jest.Mock).mockImplementation(() => ({
    baseUrl: '/test-app/api/eai',
    resources,
  }));
  resources.create.mockResolvedValue({ id: 'doc-1', version: 1 });
  resources.uploadFile.mockResolvedValue({ version: 2 });
  resources.getFileSas.mockResolvedValue({
    url: 'https://example.blob.core.windows.net/private/test.pdf?sig=temporary',
  });
  resources.get.mockResolvedValue({
    id: 'doc-1',
    version: 2,
    data: { filename: 'test.pdf', documentTypeKey: 'drivers-licence' },
  });
  resources.update.mockResolvedValue({ id: 'doc-1', version: 3 });
  (platformFetch as jest.Mock).mockResolvedValue({ json: async () => result });
});
it('uses configured tenant rules, private attachment and short-lived link; stores fields without the URL', async () => {
  const answer = await extractIdentityDocument(
    file,
    runtime,
    'drivers-licence',
  );
  expect(resources.getFileSas).toHaveBeenCalledWith(
    'onboarding-document',
    'doc-1',
    'file',
    { expiresInSeconds: 300 },
  );
  const [url, request] = (platformFetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/test-app/api/eai/v4/data/documents/classify-by-url');
  expect(JSON.parse(request.body)).toEqual({
    documentUrl: expect.any(String),
    tenantId: 'test-workspace',
    verticalKey: 'test-app',
    workflowKey: 'onboarding',
    useCustomAnalyzer: true,
    documentTypeCode: 'drivers-licence',
  });
  expect(answer).toMatchObject({
    scope: 'extraction',
    status: 'review',
    fields: [{ name: 'LicenceNumber', value: 'D1234567890', confidence: 0.98 }],
  });
  expect(resources.update.mock.calls[0][2]).toMatchObject({
    status: 'extracted',
    extractedFields: answer.fields,
  });
  expect(JSON.stringify(resources.update.mock.calls)).not.toContain('sig=');
  expect(answer.jobId).toBe('');
});
it.each([
  { status: 'succeeded', markdownContent: 'Licence Number: 123' },
  { status: 'succeeded', extractedFields: [] },
  { status: 'succeeded', extractedFields: [{ name: 'Number', value: null }] },
  { status: 'running', extractedFields: result.extractedFields },
  { status: 'skipped' },
  { ...result, error: 'provider failed' },
])(
  'does not confuse receipts/OCR/failed analysis with extracted fields',
  (value) => {
    expect(() => parseDirectExtraction(value)).toThrow();
  },
);
it('keeps a failure visible without retrying inference or returning success', async () => {
  (platformFetch as jest.Mock).mockRejectedValue(
    new Error('Analysis unavailable'),
  );
  await expect(
    extractIdentityDocument(file, runtime, 'drivers-licence'),
  ).rejects.toThrow('Analysis unavailable');
  expect(platformFetch).toHaveBeenCalledTimes(1);
  expect(resources.update.mock.calls[0][2].status).toBe('failed');
});
it('rejects an unsafe file link before sending it to analysis', async () => {
  resources.getFileSas.mockResolvedValue({ url: 'http://example.test/file' });
  await expect(
    extractIdentityDocument(file, runtime, 'drivers-licence'),
  ).rejects.toThrow('secure');
  expect(platformFetch).not.toHaveBeenCalled();
});
it('does not claim results saved when persistence fails', async () => {
  resources.update.mockRejectedValue(new Error('Save failed'));
  await expect(
    extractIdentityDocument(file, runtime, 'drivers-licence'),
  ).rejects.toThrow('Save failed');
});
it('refuses unknown document types before storing a file', async () => {
  await expect(
    extractIdentityDocument(file, runtime, 'unapproved-type'),
  ).rejects.toThrow('Choose');
  expect(resources.create).not.toHaveBeenCalled();
});

it.each([
  'employment-agreement',
  'qualifications-role-licences',
  'superannuation-choice',
  'tfn-declaration',
  'bank-details',
  'equipment-acknowledgement',
  'policy-acknowledgement',
  'visa-evidence',
])(
  'forwards the selected supporting document type %s to Admin-driven extraction',
  async (key) => {
    await extractIdentityDocument(file, runtime, key);
    expect(resources.create).toHaveBeenCalledWith(
      'onboarding-document',
      expect.objectContaining({ documentTypeKey: key }),
    );
    const body = JSON.parse((platformFetch as jest.Mock).mock.calls[0][1].body);
    expect(body.documentTypeCode).toBe(key);
    expect(body.useCustomAnalyzer).toBe(true);
    expect(body.schemaFields).toBeUndefined();
  },
);

it('keeps negative presence flags visible for review', () => {
  expect(
    parseDirectExtraction({
      status: 'succeeded',
      extractedFields: [{ name: 'EmployeeSignaturePresent', value: false }],
    }),
  ).toEqual([{ name: 'EmployeeSignaturePresent', value: 'false' }]);
});
