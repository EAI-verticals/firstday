import { submitSupportingDocument } from './content-understanding';
import { extractIdentityDocument } from './direct-extraction';
jest.mock('./direct-extraction', () => ({
  extractIdentityDocument: jest.fn(),
}));
const file = new File(['synthetic'], 'bank.png', { type: 'image/png' });
const runtime = {
  configured: true,
  mode: 'direct' as const,
  tenantId: 'test',
  appKey: 'test',
  workflowKey: 'onboarding',
};
beforeEach(() => jest.clearAllMocks());
it('requires configured direct mode before uploading supporting evidence', async () => {
  await expect(
    submitSupportingDocument(
      file,
      { ...runtime, mode: undefined },
      'bank-details',
    ),
  ).rejects.toThrow('not connected');
  await expect(
    submitSupportingDocument(
      file,
      { ...runtime, configured: false },
      'bank-details',
    ),
  ).rejects.toThrow('not connected');
  expect(extractIdentityDocument).not.toHaveBeenCalled();
});
it('rejects invalid files before sending them to EAI', async () => {
  await expect(
    submitSupportingDocument(
      new File(['x'], 'invalid.txt', { type: 'text/plain' }),
      runtime,
      'bank-details',
    ),
  ).rejects.toThrow('PDF');
  expect(extractIdentityDocument).not.toHaveBeenCalled();
});
it('sends the selected type without sending rule definitions', async () => {
  await submitSupportingDocument(file, runtime, 'bank-details');
  expect(extractIdentityDocument).toHaveBeenCalledWith(
    file,
    runtime,
    'bank-details',
  );
});
