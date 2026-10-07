/** @jest-environment node */
import { PDFDocument } from 'pdf-lib';
import { EMPTY_EMPLOYEE, verifyDocument } from './core';
import {
  generateDocument,
  generateCheckedDocument,
  readDocument,
} from './files';

// PDF text rendering requires a browser worker. These tests exercise actual PDF
// form serialization and parsing; browser QA covers worker text extraction.
jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: async () => {},
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [
            {
              str: 'Employee signature: ',
              transform: [1, 0, 0, 1, 0, 700],
              hasEOL: true,
            },
          ],
        }),
      }),
      destroy: async () => {},
    }),
  }),
}));
const employee = {
  ...EMPTY_EMPLOYEE,
  name: 'Zoë O’Connor',
  role: 'Engineer',
  manager: 'José Martin',
  startDate: '2026-10-01',
};
function fileOf(data: Uint8Array | string, name: string): File {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  } as File;
}

describe('onboarding document files', () => {
  it('exports a fillable checklist, defaults only hire date and fails until fields are filled', async () => {
    const bytes = await generateDocument('checklist', employee);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getForm().getFields()).toHaveLength(7);
    expect(pdf.getForm().getTextField('Hire date').getText()).toBe(
      '2026-10-01',
    );
    expect(
      verifyDocument(
        await readDocument(fileOf(bytes, 'checklist.pdf')),
        'checklist.pdf',
      ).passed,
    ).toBe(false);
    const values = {
      'Employee signature': 'Zoe OConnor',
      'Manager approval': 'Jose Martin',
      'Emergency contact': 'Alex Martin +61 412 345 678',
      'Tax forms completed': 'Yes',
      'Background check cleared': 'Cleared',
      'Equipment inventory signed': 'Signed',
    };
    for (const [label, value] of Object.entries(values))
      pdf.getForm().getTextField(label).setText(value);
    const completed = await pdf.save();
    const text = await readDocument(fileOf(completed, 'completed.pdf'));
    expect(text.indexOf('Employee signature: Zoe OConnor')).toBeLessThan(
      text.lastIndexOf('Employee signature:'),
    );
    expect(verifyDocument(text, 'completed.pdf').passed).toBe(true);
    pdf
      .getForm()
      .getTextField('Background check cleared')
      .setText('Not cleared');
    expect(
      verifyDocument(
        await readDocument(fileOf(await pdf.save(), 'pending.pdf')),
        'pending.pdf',
      ).passed,
    ).toBe(false);
  });

  it('creates every PDF, leaves direct deposit blank and appends every original PDF page', async () => {
    for (const kind of ['welcome', 'it', 'deposit'] as const) {
      const pdf = await PDFDocument.load(
        await generateDocument(kind, employee),
      );
      expect(pdf.getPageCount()).toBeGreaterThan(0);
      if (kind === 'deposit') {
        expect(pdf.getForm().getFields()).toHaveLength(9);
        expect(
          pdf.getForm().getTextField('Employee full name').getText() || '',
        ).toBe('');
      }
    }
    const original = await generateDocument('checklist', employee);
    const source = await PDFDocument.load(original);
    const result = verifyDocument(
      'Employee signature: Zoe OConnor',
      'original.pdf',
      new Date('2026-09-24T05:00:00Z'),
    );
    const reportOnly = await PDFDocument.load(
      await generateCheckedDocument({ ...result, text: '' }),
    );
    const checked = await PDFDocument.load(
      await generateCheckedDocument(result, fileOf(original, 'original.pdf')),
    );
    expect(checked.getPageCount()).toBe(
      reportOnly.getPageCount() + source.getPageCount(),
    );
  });

  it('never silently rewrites credentials or unsupported personal/source characters', async () => {
    for (const password of [
      'pass’word',
      'pass—word',
      '密碼',
      'line\nbreak',
      'two  spaces',
    ]) {
      await expect(
        generateDocument('it', { ...employee, temporaryPassword: password }),
      ).rejects.toThrow('password');
    }
    await expect(
      generateDocument('welcome', { ...employee, name: '山田太郎' }),
    ).rejects.toThrow('cannot represent');
    await expect(
      generateCheckedDocument(
        verifyDocument('Employee signature: 山田太郎', 'source.txt'),
      ),
    ).rejects.toThrow('cannot represent');
    // Latin accents and safe punctuation in personal prose still export.
    await expect(generateDocument('welcome', employee)).resolves.toBeInstanceOf(
      Uint8Array,
    );
    await expect(
      generateDocument('it', {
        ...employee,
        temporaryPassword: 'Exact-Pass!23',
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('reads text, paginates long source text and rejects oversized and unsupported files', async () => {
    expect(
      await readDocument(
        fileOf('Employee signature: Jane Smith', 'completed.txt'),
      ),
    ).toBe('Employee signature: Jane Smith');
    await expect(
      readDocument({ name: 'large.pdf', size: 10 * 1024 * 1024 + 1 } as File),
    ).rejects.toThrow('10 MB');
    await expect(readDocument(fileOf('hello', 'photo.png'))).rejects.toThrow(
      'Choose a PDF',
    );
    await expect(readDocument(fileOf('', 'blank.txt'))).rejects.toThrow(
      'empty',
    );
    const report = await PDFDocument.load(
      await generateCheckedDocument(
        verifyDocument('A long original line. '.repeat(2000), 'long.txt'),
      ),
    );
    expect(report.getPageCount()).toBeGreaterThan(2);
  });
});
