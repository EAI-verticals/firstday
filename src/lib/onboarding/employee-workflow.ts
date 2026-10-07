export interface EmployeeProfile {
  legalName: string;
  preferredName: string;
  email: string;
  phone: string;
  birthDate: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  department: string;
  role: string;
  manager: string;
  startDate: string;
}
export interface EmploymentTerms {
  company: string;
  amount: string;
  currency: string;
  basis: string;
  employmentType: string;
  hours: string;
  retirement: string;
  payFrequency: string;
}
export interface SalaryDocument {
  id: string;
  createdAt: string;
  profile: EmployeeProfile;
  terms: EmploymentTerms;
  signature?: { name: string; signedAt: string; consent: string };
}
export const EMPTY_PROFILE: EmployeeProfile = {
  legalName: '',
  preferredName: '',
  email: '',
  phone: '',
  birthDate: '',
  address: '',
  city: '',
  postcode: '',
  country: 'Australia',
  emergencyName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
  department: '',
  role: '',
  manager: '',
  startDate: '',
};
export const EMPTY_TERMS: EmploymentTerms = {
  company: '',
  amount: '',
  currency: 'AUD',
  basis: 'per year',
  employmentType: 'Full-time',
  hours: '38',
  retirement: 'Plus statutory superannuation',
  payFrequency: 'Fortnightly',
};
export const EXAMPLE_PROFILE: EmployeeProfile = {
  legalName: 'Alex Morgan',
  preferredName: 'Alex',
  email: 'alex.morgan@example.com',
  phone: '0400 000 000',
  birthDate: '1995-06-15',
  address: '10 Example Street',
  city: 'Sydney',
  postcode: '2000',
  country: 'Australia',
  emergencyName: 'Jamie Morgan',
  emergencyRelationship: 'Sibling',
  emergencyPhone: '0400 000 001',
  department: 'Operations',
  role: 'Operations coordinator',
  manager: 'Sam Taylor',
  startDate: '2026-10-12',
};
export const EXAMPLE_TERMS: EmploymentTerms = {
  ...EMPTY_TERMS,
  company: 'Example Company Pty Ltd',
  amount: '85000',
};
export const SIGNATURE_CONSENT =
  'I have reviewed the employment and salary details shown above and confirm my acceptance. I intend my typed name to be my electronic signature on this salary confirmation.';
export function personalProfileIssues(p: EmployeeProfile): string[] {
  const issues: string[] = [];
  const required: Array<[keyof EmployeeProfile, string]> = [
    ['legalName', 'Legal name'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['birthDate', 'Date of birth'],
    ['address', 'Street address'],
    ['city', 'City'],
    ['postcode', 'Postcode'],
    ['country', 'Country'],
    ['emergencyName', 'Emergency contact'],
    ['emergencyRelationship', 'Emergency contact relationship'],
    ['emergencyPhone', 'Emergency contact phone'],
  ];
  required.forEach(([k, label]) => {
    if (!p[k].trim()) issues.push(`${label} is required.`);
  });
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
    issues.push('Enter a valid email address.');
  for (const k of ['phone', 'emergencyPhone'] as const)
    if (p[k] && p[k].replace(/\D/g, '').length < 7)
      issues.push('Enter a complete phone number.');
  if (
    p.birthDate &&
    (!validDate(p.birthDate) ||
      p.birthDate >= new Date().toISOString().slice(0, 10))
  )
    issues.push('Enter a valid date of birth in the past.');
  return issues;
}
export function profileIssues(p: EmployeeProfile): string[] {
  const issues = personalProfileIssues(p);
  for (const [key, label] of [
    ['department', 'Department'],
    ['role', 'Job title'],
    ['manager', 'Manager'],
    ['startDate', 'Start date'],
  ] as const)
    if (!p[key].trim()) issues.push(`${label} is required.`);
  if (p.startDate && !validDate(p.startDate))
    issues.push('Enter a valid start date.');
  return issues;
}
function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function termsIssues(t: EmploymentTerms): string[] {
  const issues: string[] = [];
  if (!t.company.trim()) issues.push('Employer name is required.');
  if (!/^\d+(\.\d{1,2})?$/.test(t.amount) || Number(t.amount) <= 0)
    issues.push(
      'Enter a positive salary amount with no more than two decimal places.',
    );
  if (!['AUD', 'NZD', 'GBP', 'USD', 'CAD', 'EUR'].includes(t.currency))
    issues.push('Select a supported currency.');
  if (!['per year', 'per hour'].includes(t.basis))
    issues.push('Select a pay basis.');
  if (
    !Number.isFinite(Number(t.hours)) ||
    Number(t.hours) <= 0 ||
    Number(t.hours) > 168
  )
    issues.push('Weekly hours must be between 0 and 168.');
  if (!t.retirement.trim())
    issues.push('Specify superannuation or pension treatment.');
  return issues;
}
export function salaryLabel(t: EmploymentTerms): string {
  return `${new Intl.NumberFormat('en-AU', { style: 'currency', currency: t.currency }).format(Number(t.amount) || 0)} ${t.currency} ${t.basis}`;
}
export function signSalaryDocument(
  doc: SalaryDocument,
  name: string,
  consent: boolean,
  now = new Date(),
): SalaryDocument {
  if (doc.signature) throw new Error('This document has already been signed.');
  if (profileIssues(doc.profile).length || termsIssues(doc.terms).length)
    throw new Error('Complete the employee and employment details first.');
  const normalize = (s: string) =>
    s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!consent || normalize(name) !== normalize(doc.profile.legalName))
    throw new Error('Enter your full legal name and confirm your acceptance.');
  return {
    ...doc,
    profile: { ...doc.profile },
    terms: { ...doc.terms },
    signature: {
      name: name.trim(),
      signedAt: now.toISOString(),
      consent: SIGNATURE_CONSENT,
    },
  };
}
