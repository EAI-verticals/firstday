import {
  EXAMPLE_PROFILE,
  EXAMPLE_TERMS,
  EMPTY_PROFILE,
  profileIssues,
  personalProfileIssues,
  termsIssues,
  signSalaryDocument,
  type SalaryDocument,
} from './employee-workflow';
import {
  identityFindings,
  parseAnalysis,
  validateIdentityFile,
} from './content-understanding';
import { generateSalaryConfirmation } from './files';
import { PDFDocument } from 'pdf-lib';
describe('employee onboarding gates', () => {
  const doc: SalaryDocument = {
    id: 'test-salary',
    createdAt: '2026-09-24T00:00:00Z',
    profile: { ...EXAMPLE_PROFILE },
    terms: { ...EXAMPLE_TERMS },
  };
  it('requires full details and sensible dates and compensation', () => {
    expect(profileIssues(EMPTY_PROFILE).length).toBeGreaterThan(10);
    expect(profileIssues(EXAMPLE_PROFILE)).toEqual([]);
    expect(
      profileIssues({ ...EXAMPLE_PROFILE, birthDate: '2026-02-31' }).length,
    ).toBeGreaterThan(0);
    expect(
      termsIssues({ ...EXAMPLE_TERMS, amount: '-1' }).length,
    ).toBeGreaterThan(0);
    expect(
      termsIssues({ ...EXAMPLE_TERMS, amount: '1.001' }).length,
    ).toBeGreaterThan(0);
  });
  it('allows personal details before employer terms but requires the offer fields for signing', () => {
    const personalOnly = {
      ...EXAMPLE_PROFILE,
      department: '',
      role: '',
      manager: '',
      startDate: '',
    };
    expect(personalProfileIssues(personalOnly)).toEqual([]);
    expect(profileIssues(personalOnly)).toHaveLength(4);
    expect(() =>
      signSalaryDocument(
        { ...doc, profile: personalOnly },
        'Alex Morgan',
        true,
      ),
    ).toThrow();
  });
  it('requires consent and legal name and does not mutate the draft', () => {
    expect(() => signSalaryDocument(doc, 'Alex Morgan', false)).toThrow();
    expect(() => signSalaryDocument(doc, 'Someone else', true)).toThrow();
    const signed = signSalaryDocument(
      doc,
      ' Alex   Morgan ',
      true,
      new Date('2026-09-24T01:00:00Z'),
    );
    expect(signed.signature?.signedAt).toBe('2026-09-24T01:00:00.000Z');
    expect(doc.signature).toBeUndefined();
    expect(() => signSalaryDocument(signed, 'Alex Morgan', true)).toThrow();
  });
  it('creates a readable signed PDF with the existing creation tool', async () => {
    const signed = signSalaryDocument(doc, 'Alex Morgan', true);
    const pdf = await PDFDocument.load(
      await generateSalaryConfirmation(signed),
    );
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getTitle()).toBe('Employment and salary confirmation');
  });
  it('does not convert an accepted upload into completed verification', () => {
    expect(parseAnalysis({ jobId: 'job-1', status: 'queued' }).status).toBe(
      'processing',
    );
    expect(() => parseAnalysis({ success: true })).toThrow();
    expect(
      parseAnalysis({ jobId: 'job-1', status: 'completed', documents: [] })
        .status,
    ).toBe('failed');
    expect(
      parseAnalysis({ jobId: 'job-1', status: 'failed', text: 'anything' })
        .status,
    ).toBe('failed');
    expect(
      parseAnalysis({
        jobId: 'job-1',
        status: 'completed',
        documents: [{ extractedText: 'Example passport: Alex Morgan' }],
      }).status,
    ).toBe('review');
  });
  it('flags document mismatches, missing expiry and expired evidence', () => {
    const valid =
      'Passport\nName: Alex Morgan\nDate of birth: 1995-06-15\nExpiry: 2030-06-15';
    expect(
      identityFindings(
        valid,
        'Alex Morgan',
        '1995-06-15',
        'Passport',
        '2026-09-24',
      ),
    ).toEqual([]);
    expect(
      identityFindings(valid, 'Different Person', '1995-06-15', 'Passport')
        .length,
    ).toBeGreaterThan(0);
    expect(
      identityFindings(
        valid.replace('2030-06-15', '2020-06-15'),
        'Alex Morgan',
        '1995-06-15',
        'Passport',
      ).join(' '),
    ).toContain('past');
    expect(
      identityFindings(
        'Passport Alex Morgan',
        'Alex Morgan',
        '1995-06-15',
        'Passport',
      ).length,
    ).toBe(2);
  });
  it('rejects empty, executable and oversized files', () => {
    expect(() =>
      validateIdentityFile(
        new File([], 'empty.pdf', { type: 'application/pdf' }),
      ),
    ).toThrow();
    expect(() =>
      validateIdentityFile(
        new File(['test'], 'test.exe', { type: 'application/octet-stream' }),
      ),
    ).toThrow();
  });
});
