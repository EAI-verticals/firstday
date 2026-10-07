import {
  answerQuestion,
  verifyDocument,
  HR_FALLBACK,
  SAMPLE_DOCUMENTS,
  type KnowledgeDocument,
} from './core';

const complete = [
  'Employee signature: Zoë O’Connor',
  'Hire date: 2026-10-01',
  'Manager approval: José Martin',
  'Emergency contact: Alex Martin +61 412 345 678',
  'Tax forms completed: Completed',
  'Background check cleared: Cleared',
  'Equipment inventory signed: Signed',
].join('\n');
function withValue(label: string, value: string) {
  return complete
    .split('\n')
    .map((line) => (line.startsWith(`${label}:`) ? `${label}: ${value}` : line))
    .join('\n');
}

describe('grounded local source retrieval', () => {
  it.each([
    ["What's our PTO policy?", '20 days', 'handbook'],
    ['How do I set up my laptop?', 'multi-factor authentication', 'it-guide'],
    ["What's the probation period?", '90 days', 'handbook'],
  ])('answers %s using its actual source', (question, expected, id) => {
    const answer = answerQuestion(question, SAMPLE_DOCUMENTS);
    expect(answer.text).toContain(expected);
    expect(answer.source?.id).toBe(id);
    expect(answer.source?.text).toContain(answer.excerpt);
  });
  it.each([
    'What is the CEO salary?',
    'Can I carry over PTO?',
    'What is our probation period extension policy?',
    'How do I set up my laptop with Ubuntu?',
    'What is our PTO policy for contractors?',
    '',
    'When does dental insurance start?',
  ])('abstains on unsupported information: %s', (question) => {
    expect(answerQuestion(question, SAMPLE_DOCUMENTS)).toEqual({
      text: HR_FALLBACK,
    });
  });
  it('uses uploaded text rather than bundled policy values and abstains without documents', () => {
    const uploaded: KnowledgeDocument = {
      id: 'uploaded',
      title: 'Real company handbook',
      category: 'Company policies',
      text: 'PTO: Employees receive 25 days annually. Request leave using the HR portal.',
      sample: false,
    };
    expect(answerQuestion('PTO policy?', [uploaded]).text).toContain('25 days');
    expect(answerQuestion('PTO policy?', [uploaded]).source).toBe(uploaded);
    expect(answerQuestion('PTO policy?', [])).toEqual({ text: HR_FALLBACK });
  });
});

describe('document completeness checks', () => {
  it('fails a blank checklist and passes an explicitly completed checklist with a stable timestamp', () => {
    expect(
      verifyDocument(complete.replace(/: .*/g, ':'), 'blank.txt').passed,
    ).toBe(false);
    const result = verifyDocument(
      complete,
      'completed.txt',
      new Date('2026-09-24T00:00:00Z'),
    );
    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(7);
    expect(result.checkedAt).toBe('2026-09-24T00:00:00.000Z');
  });
  it.each([
    ['Employee signature', 'Signed'],
    ['Employee signature', 'Name here'],
    ['Employee signature', 'xxx'],
    ['Manager approval', 'Approved'],
    ['Manager approval', 'Approved by'],
    ['Manager approval', 'Manager'],
    ['Tax forms completed', 'Yes. Tax forms are outstanding'],
    ['Tax forms completed', 'Yes. Forms are omitted'],
    ['Tax forms completed', 'Completed by Friday'],
    ['Tax forms completed', 'Yes! Still outstanding'],
    ['Background check cleared', 'Cleared. Results are outstanding'],
    ['Background check cleared', 'Passed. Review ongoing'],
    ['Equipment inventory signed', 'Signed. Signature is outstanding'],
    ['Equipment inventory signed', 'Yes. Equipment omitted'],
    ['Tax forms completed', 'Not completed'],
    ['Tax forms completed', "Hasn't completed"],
    ['Tax forms completed', 'Will be completed'],
    ['Tax forms completed', 'Complete by Friday'],
    ['Tax forms completed', 'Pending'],
    ['Background check cleared', 'Not cleared'],
    ['Background check cleared', 'Completed'],
    ['Background check cleared', 'Unverified'],
    ['Equipment inventory signed', 'Unsigned'],
    ['Equipment inventory signed', 'To sign'],
    ['Equipment inventory signed', 'No'],
    ['Hire date', '2026-02-30'],
    ['Hire date', '2025-02-29'],
    ['Hire date', '2026-13-01'],
    ['Hire date', '01/10/2026'],
    ['Hire date', 'YYYY-MM-DD'],
    ['Emergency contact', 'Alex Martin'],
    ['Emergency contact', '+61 412 345 678'],
    ['Emergency contact', 'Phone: 123456789'],
    ['Emergency contact', 'Alex 123 abc 4567'],
    ['Emergency contact', 'Alex 12345678901234567'],
  ])('rejects incomplete %s: %s', (label, value) => {
    const result = verifyDocument(withValue(label, value), 'incomplete.txt');
    expect(result.passed).toBe(false);
    expect(result.items.find((item) => item.label === label)?.passed).toBe(
      false,
    );
  });
  it('accepts Unicode names, a valid leap date and explicit named approval', () => {
    const text = withValue('Hire date', '2028-02-29').replace(
      'Manager approval: José Martin',
      'Manager approval: Approved by José Martin',
    );
    expect(verifyDocument(text, 'completed.txt').passed).toBe(true);
  });
  it('fails contradictory duplicate values including aliases, while ignoring empty printed PDF labels', () => {
    const conflict = verifyDocument(
      `${complete}\nBackground check cleared: Not cleared`,
      'conflict.txt',
    );
    expect(conflict.passed).toBe(false);
    expect(
      conflict.items.find((item) => item.key === 'background')?.issue,
    ).toContain('Conflicting');
    expect(
      verifyDocument(`${complete}\nStart date: 2026-10-02`, 'conflict.txt')
        .passed,
    ).toBe(false);
    expect(
      verifyDocument(
        `${complete}\nEmployee signature: ______\nStart date: 2026-10-01 | Manager: José Martin`,
        'pdf.txt',
      ).passed,
    ).toBe(true);
  });
});
