/** App upload slots. Field definitions and extraction rules remain in EAI Admin. */
export const SUPPORTING_DOCUMENT_TYPES = [
  {
    key: 'employment-agreement',
    name: 'Signed employment agreement',
    hint: 'Your signed employment terms.',
  },
  {
    key: 'qualifications-role-licences',
    name: 'Qualifications and role licences',
    hint: 'Certificates or licences relevant to your role.',
  },
  {
    key: 'superannuation-choice',
    name: 'Superannuation choice form',
    hint: 'Your completed superannuation selection.',
  },
  {
    key: 'tfn-declaration',
    name: 'TFN declaration',
    hint: 'Your completed employee tax declaration.',
  },
  {
    key: 'bank-details',
    name: 'Bank details form',
    hint: 'Your nominated payroll account.',
  },
  {
    key: 'equipment-acknowledgement',
    name: 'Equipment acknowledgement',
    hint: 'Your acknowledgement of assigned equipment.',
  },
  {
    key: 'policy-acknowledgement',
    name: 'Policy acknowledgement',
    hint: 'Your acknowledgement of company policies.',
  },
  {
    key: 'visa-evidence',
    name: 'Visa evidence',
    hint: 'Visa evidence, if requested by your employer.',
  },
] as const;

export type SupportingDocumentKey =
  (typeof SUPPORTING_DOCUMENT_TYPES)[number]['key'];

export function isSupportedDocumentKey(key: string): boolean {
  return (
    key === 'drivers-licence' ||
    key === 'test2' ||
    SUPPORTING_DOCUMENT_TYPES.some((type) => type.key === key)
  );
}
