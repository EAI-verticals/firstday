export type DocumentKind = 'checklist' | 'welcome' | 'it' | 'deposit';
export interface Employee {
  name: string;
  department: string;
  role: string;
  manager: string;
  startDate: string;
  email: string;
  equipment: string;
  login: string;
  temporaryPassword: string;
}
export interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  text: string;
  sample: boolean;
}
export interface Answer {
  text: string;
  source?: KnowledgeDocument;
  excerpt?: string;
  citations?: { name: string; page?: number; url?: string }[];
}
export interface CheckItem {
  key: string;
  label: string;
  passed: boolean;
  value: string;
  issue: string;
  evidence?: string;
}
export interface CheckResult {
  filename: string;
  checkedAt: string;
  passed: boolean;
  items: CheckItem[];
  text: string;
}
export const EMPTY_EMPLOYEE: Employee = {
  name: '',
  department: 'Engineering',
  role: '',
  manager: '',
  startDate: '',
  email: '',
  equipment: '',
  login: '',
  temporaryPassword: '',
};
export const HR_FALLBACK = "I don't have that information. Please contact HR.";
export const DOCUMENTS: {
  id: DocumentKind;
  title: string;
  description: string;
  tag: string;
}[] = [
  {
    id: 'checklist',
    title: 'Onboarding checklist',
    description: 'Your step-by-step plan, tailored to your role.',
    tag: 'PERSONALIZED',
  },
  {
    id: 'welcome',
    title: 'Welcome email',
    description: 'A warm introduction to your team and first day.',
    tag: 'READY TO SHARE',
  },
  {
    id: 'it',
    title: 'IT setup sheet',
    description: 'Accounts, access, and equipment in one place.',
    tag: 'GET CONNECTED',
  },
  {
    id: 'deposit',
    title: 'Direct deposit form',
    description: 'A blank form for your payroll information.',
    tag: 'FILLABLE PDF',
  },
];
export const SAMPLE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: 'handbook',
    title: 'Employee handbook',
    category: 'People & culture',
    sample: true,
    text: 'Paid time off (PTO): In this sample company, full-time employees receive 20 days of paid time off per year. Submit a PTO request to your manager at least two weeks in advance.\n\nProbation period: The sample probation period is 90 days. Your manager will schedule a review before the end of this period.\n\nWorking hours: Sample core collaboration hours are 10 am to 3 pm. Agree on your working schedule with your manager.',
  },
  {
    id: 'policies',
    title: 'Company policies',
    category: 'Ways of working',
    sample: true,
    text: 'Remote work: The sample hybrid policy allows two remote days per week with manager approval. Confirm your schedule with your manager.\n\nCode of conduct: Treat colleagues with respect and protect confidential company information. Report concerns to HR.\n\nExpense reimbursement: Keep itemized receipts and submit expenses to your manager for approval within 30 days.',
  },
  {
    id: 'benefits',
    title: 'Benefits overview',
    category: 'Your wellbeing',
    sample: true,
    text: 'Health benefits: In this sample plan, benefits start on the first day of the month after your start date. Contact HR for enrollment forms and plan details.\n\nLearning allowance: The sample annual professional development allowance is $1,000. Get manager approval before booking a course.\n\nEmployee assistance: Contact HR for the confidential employee assistance program details.',
  },
  {
    id: 'it-guide',
    title: 'IT setup guide',
    category: 'Tools & technology',
    sample: true,
    text: 'Laptop setup: Connect your laptop to a trusted Wi-Fi network. Sign in using the account provided by IT, change your temporary password, and enable multi-factor authentication (MFA). Install approved updates, then contact IT to confirm device enrollment.\n\nAccount access: IT provides your work email and initial account details through a secure channel. Contact IT if you have not received them. Never share your password.\n\nVPN setup: Ask IT for the approved VPN client and installation instructions. Enable MFA before connecting.',
  },
  {
    id: 'compliance',
    title: 'Compliance requirements',
    category: 'Required learning',
    sample: true,
    text: 'Required training: Complete the sample information security and workplace conduct training in your first week. Send completion confirmation to your manager.\n\nOnboarding requirements: Provide your employee signature, hire date, manager approval, emergency contact, completed tax forms, cleared background check, and signed equipment inventory.\n\nData protection: Use approved tools for company data. Report suspected security incidents to IT immediately.',
  },
  {
    id: 'procedures',
    title: 'Role-specific procedures',
    category: 'Your team',
    sample: true,
    text: 'Engineering onboarding: Request repository access from your manager, set up your development environment with IT, and pair with a teammate on your first task.\n\nSales onboarding: Request CRM access, review the product guide, and shadow a customer call with your manager.\n\nOperations onboarding: Review operating procedures, request access to team tools, and shadow a colleague.\n\nPeople onboarding: Review HR procedures, request the appropriate HR system permissions, and schedule a handover with your manager.',
  },
];

const STOP = new Set(
  'what whats is are our the a an do does how i we to for of in my me can could would should please tell about company policy policies get have when where much many with and on you your it'.split(
    ' ',
  ),
);
const SYNONYMS: Record<string, string[]> = {
  pto: ['paid', 'leave', 'vacation', 'holiday'],
  laptop: ['computer', 'device'],
  probation: ['probationary', 'trial'],
  benefits: ['insurance', 'health'],
  manager: ['supervisor'],
  equipment: ['inventory'],
  remote: ['hybrid', 'home'],
  tax: ['taxes'],
  setup: ['configure', 'install'],
  training: ['compliance', 'course'],
};
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/set\s+up/g, 'setup')
    .replace(/paid\s+time\s+off/g, 'pto')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}
/** Extractive retrieval: answers always come from indexed source text, never invented company policy. */
export function answerQuestion(
  question: string,
  documents: KnowledgeDocument[],
): Answer {
  const original = [...new Set(tokens(question))];
  if (!original.length) return { text: HR_FALLBACK };
  const expanded = new Set(original);
  for (const [root, aliases] of Object.entries(SYNONYMS))
    if (original.some((t) => t === root || aliases.includes(t))) {
      expanded.add(root);
      aliases.forEach((t) => expanded.add(t));
    }
  const candidates = documents
    .flatMap((source) =>
      source.text
        .split(/\n\s*\n|\n(?=[A-Z][^\n]{2,45}:)/)
        .filter((p) => p.trim())
        .map((paragraph) => {
          const words = new Set(tokens(paragraph));
          const matched = original.filter(
            (t) =>
              words.has(t) ||
              Object.entries(SYNONYMS).some(
                ([k, v]) =>
                  (k === t || v.includes(t)) &&
                  [k, ...v].some((s) => words.has(s)),
              ),
          );
          const score = [...expanded].reduce(
            (n, t) => n + (words.has(t) ? 1 : 0),
            0,
          );
          return {
            source,
            paragraph: paragraph.trim(),
            score,
            coverage: matched.length / original.length,
          };
        }),
    )
    .sort((a, b) => b.coverage - a.coverage || b.score - a.score);
  const best = candidates[0];
  if (!best || best.score === 0 || best.coverage < 1)
    return { text: HR_FALLBACK };
  const text =
    best.paragraph.length > 750
      ? best.paragraph.slice(0, 747).replace(/\s+\S*$/, '') + '…'
      : best.paragraph;
  return { text, source: best.source, excerpt: best.paragraph };
}

const CHECK_FIELDS = [
  {
    key: 'signature',
    label: 'Employee signature',
    aliases: ['employee signature', 'employee signed', 'signature of employee'],
  },
  {
    key: 'hire',
    label: 'Hire date',
    aliases: ['hire date', 'start date', 'date of hire'],
  },
  {
    key: 'approval',
    label: 'Manager approval',
    aliases: ['manager approval', 'manager signature', 'approved by manager'],
  },
  {
    key: 'emergency',
    label: 'Emergency contact',
    aliases: ['emergency contact', 'emergency contact details'],
  },
  {
    key: 'tax',
    label: 'Tax forms completed',
    aliases: ['tax forms completed', 'tax forms', 'tax form completed'],
  },
  {
    key: 'background',
    label: 'Background check cleared',
    aliases: [
      'background check cleared',
      'background check',
      'background screening',
    ],
  },
  {
    key: 'equipment',
    label: 'Equipment inventory signed',
    aliases: [
      'equipment inventory signed',
      'equipment inventory',
      'equipment sign off',
    ],
  },
] as const;
const NEGATIVE =
  /\b(no|not|never|incomplete|pending|missing|unsigned|unchecked|uncleared|unapproved|unverified|awaiting|false|todo|tbd|unknown|n\/a|none|failed|rejected|unsure|scheduled|requested|will|should|must|need|needs)\b|\b(?:isn|wasn|hasn|haven|don|doesn|didn|can|couldn|wouldn)['’]?t\b|\b(?:in progress|to be|to do|to complete|to sign)\b/i;
function filled(value: string): boolean {
  return (
    value.replace(/[\s_\-.[\]()☐]/g, '').length > 1 &&
    !NEGATIVE.test(value) &&
    !/^(enter|type|please|your name|name here|dd|mm|yyyy|select|optional|placeholder)\b/i.test(
      value,
    ) &&
    !/^(?:x+|[-_.?\s]+)$/i.test(value)
  );
}
export function verifyDocument(
  text: string,
  filename: string,
  now = new Date(),
): CheckResult {
  const lines = text.replace(/\r/g, '').split('\n');
  const items: CheckItem[] = CHECK_FIELDS.map((field) => {
    const values: string[] = [];
    for (const line of lines.flatMap((line) => line.split(/\s+\|\s+/))) {
      for (const alias of [...field.aliases].sort(
        (a, b) => b.length - a.length,
      )) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
          `^\\s*(?:[-*•]\\s*)?${escaped}\\s*[:=|]\\s*`,
          'i',
        );
        if (pattern.test(line)) {
          values.push(line.replace(pattern, '').trim());
          break;
        }
      }
    }
    // A PDF can repeat an empty printed label after a filled AcroForm field.
    // Ignore only truly blank labels; contradictory filled statuses always fail.
    const nonblank = values.filter(
      (value) => value.replace(/[\s_\-.\[\]()☐]/g, '').length > 0,
    );
    const distinct = [
      ...new Set(
        nonblank.map((value) => value.toLocaleLowerCase().replace(/\s+/g, ' ')),
      ),
    ];
    const conflict = distinct.length > 1;
    const value = conflict ? nonblank.join(' / ') : nonblank[0] || '';
    let passed = filled(value);
    let issue = 'Add a completed value using this field label.';
    if (field.key === 'hire') {
      const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const parsed = dateMatch ? new Date(`${value}T00:00:00Z`) : null;
      passed =
        passed &&
        !!parsed &&
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value;
      issue = 'Provide a valid hire date in YYYY-MM-DD format.';
    } else if (field.key === 'emergency') {
      const phone = value.match(/\+?\d[\d\s().-]{5,}\d/);
      const name = phone
        ? value
            .replace(phone[0], '')
            .replace(
              /\b(name|phone|telephone|mobile|contact|emergency)\b/gi,
              '',
            )
            .trim()
        : '';
      const digits = phone?.[0].replace(/\D/g, '').length || 0;
      passed = passed && /\p{L}{2,}/u.test(name) && digits >= 7 && digits <= 15;
      issue = 'Provide the contact’s name and phone number.';
    } else if (['tax', 'background'].includes(field.key)) {
      const status =
        field.key === 'tax'
          ? /^(yes|true|complete|completed)[.!]?$/i
          : /^(yes|true|cleared|passed|verified)[.!]?$/i;
      passed = passed && status.test(value);
      issue =
        field.key === 'tax'
          ? 'Confirm tax forms are completed (Yes or Completed).'
          : 'Confirm the background check is cleared (Cleared or Passed).';
    } else if (field.key === 'equipment') {
      passed = passed && /^(signed|yes|acknowledged)[.!]?$/i.test(value);
      issue = 'Confirm the equipment inventory is signed.';
    } else {
      const name = value.replace(/^(?:signed|approved)\s+by(?:\s+|$)/i, '');
      passed =
        passed &&
        /\p{L}{2,}/u.test(name) &&
        !/^(yes|signed|approved|complete[d]?|true|done|name|signature|employee|manager|employee name|manager name)$/i.test(
          name,
        );
      issue =
        field.key === 'signature'
          ? 'Provide the employee’s typed signature/name.'
          : 'Provide the approving manager’s name.';
    }
    if (conflict) {
      passed = false;
      issue =
        'Conflicting values were found. Keep one clear, consistent value for this field.';
    }
    return {
      key: field.key,
      label: field.label,
      passed,
      value,
      issue: passed ? 'Complete' : issue,
    };
  });
  return {
    filename,
    checkedAt: now.toISOString(),
    passed: items.every((i) => i.passed),
    items,
    text,
  };
}

export function roleTasks(employee: Employee): string[] {
  const department = employee.department.toLowerCase();
  const specific =
    department === 'engineering'
      ? [
          'Request repository and development tool access',
          'Set up your development environment',
          'Pair with a teammate on your first task',
        ]
      : department === 'sales'
        ? [
            'Request CRM access',
            'Review the product and customer guide',
            'Shadow a customer call',
          ]
        : department === 'people'
          ? [
              'Review HR procedures',
              'Request HR system permissions',
              'Schedule a team handover',
            ]
          : [
              'Review your team’s operating procedures',
              'Request access to role-specific tools',
              'Shadow a teammate',
            ];
  return [
    'Read the employee handbook and company policies',
    'Review benefits and submit enrollment forms',
    'Complete IT setup and security training',
    ...specific,
    `Meet ${employee.manager || 'your manager'} to agree on priorities for ${employee.role || 'your role'}`,
  ];
}
export function formatDate(value: string): string {
  if (!value) return 'Not set';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
