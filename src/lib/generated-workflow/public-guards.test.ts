import {
  requestClientFingerprint,
  requestClientIp,
  validateSubmissionPatch,
} from './public-guards';

describe('generated workflow public request guards', () => {
  it('accepts bounded autosave and completion fields', () => {
    expect(
      validateSubmissionPatch({
        status: 'completed',
        currentStep: 2,
        formData: { contact: { name: 'Alex' } },
        userName: 'Alex',
        userEmail: 'alex@example.com',
      }),
    ).toEqual({
      ok: true,
      value: {
        status: 'completed',
        currentStep: 2,
        formData: { contact: { name: 'Alex' } },
        userName: 'Alex',
        userEmail: 'alex@example.com',
      },
    });
  });

  it('rejects invalid status, email, and oversized form data', () => {
    expect(validateSubmissionPatch({ status: 'approved' })).toMatchObject({
      ok: false,
    });
    expect(
      validateSubmissionPatch({ userEmail: 'not-an-email' }),
    ).toMatchObject({ ok: false });
    expect(
      validateSubmissionPatch({ formData: { value: 'x'.repeat(300_000) } }),
    ).toMatchObject({ ok: false });
  });

  it('uses the proxy-appended address instead of a spoofed forwarded prefix', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.88, 192.0.2.10',
    });

    expect(requestClientIp(headers)).toBe('192.0.2.10');
    expect(requestClientFingerprint(headers)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
