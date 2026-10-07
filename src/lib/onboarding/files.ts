import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import {
  roleTasks,
  type DocumentKind,
  type Employee,
  type CheckResult,
} from './core';

const MAX_BYTES = 10 * 1024 * 1024;
const FIELD_LABELS = [
  'Employee signature',
  'Hire date',
  'Manager approval',
  'Emergency contact',
  'Tax forms completed',
  'Background check cleared',
  'Equipment inventory signed',
];
const violet = rgb(0.36, 0.22, 0.72);
const ink = rgb(0.16, 0.18, 0.25);
const muted = rgb(0.43, 0.45, 0.51);

// This lightweight export uses a Latin font. Reject unsupported characters
// rather than corrupting a person's name or source text. Curly punctuation is
// normalized in prose; credentials are separately required to remain exact.
function printable(text: string): string {
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...');
  if (/[^\x20-\x7e\xa0-\xff\n]/.test(normalized))
    throw new Error(
      'This PDF font cannot represent one or more characters in the document. Use a supported Latin spelling or plain-text equivalent, or keep the original document. No PDF was downloaded.',
    );
  return normalized;
}
function bytesOf(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('The file could not be read. Try selecting it again.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}
function fieldText(document: PDFDocument): string[] {
  return document
    .getForm()
    .getFields()
    .map((field) => {
      let value = '';
      if (field instanceof PDFTextField) value = field.getText() || '';
      else if (field instanceof PDFCheckBox)
        value = field.isChecked() ? 'Yes' : 'No';
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList)
        value = field.getSelected().join(', ');
      else if (field instanceof PDFRadioGroup)
        value = field.getSelected() || '';
      return `${field.getName()}: ${value.replace(/\r?\n/g, ' ')}`;
    });
}

export async function readDocument(file: File): Promise<string> {
  if (file.size > MAX_BYTES)
    throw new Error('This file is larger than 10 MB. Choose a smaller file.');
  if (!file.size)
    throw new Error('This file is empty. Choose a completed document.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'docx', 'txt', 'md'].includes(extension || ''))
    throw new Error(
      'Choose a PDF, Word (.docx), text (.txt), or Markdown (.md) document.',
    );
  const buffer = await bytesOf(file);
  let text = '';
  try {
    if (extension === 'pdf') {
      const pdf = await PDFDocument.load(buffer);
      const fields = fieldText(pdf);
      const pdfjs = await import('pdfjs-dist');
      const base = (process.env.NEXT_PUBLIC_APP_BASE_PATH || '').replace(
        /\/$/,
        '',
      );
      pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
      const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) });
      const document = await task.promise;
      try {
        const pages: string[] = [];
        for (let n = 1; n <= document.numPages; n++) {
          const page = await document.getPage(n);
          const content = await page.getTextContent();
          let line = '';
          let previousY: number | undefined;
          for (const item of content.items) {
            if (!('str' in item)) continue;
            const y = item.transform[5];
            if (previousY !== undefined && Math.abs(y - previousY) > 3)
              line += '\n';
            line += item.str + (item.hasEOL ? '\n' : ' ');
            previousY = y;
          }
          pages.push(line);
        }
        // Put canonical form values first: the checker must never prefer a blank printed label.
        text = [...fields, ...pages].join('\n');
        if (
          !pages.join('').trim() &&
          !fields.some((value) => value.split(':').slice(1).join(':').trim())
        )
          throw new Error(
            'This PDF has no readable text. Scanned documents need OCR first; upload a text-based PDF, Word document, or text file.',
          );
      } finally {
        await task.destroy();
      }
    } else if (extension === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
    } else text = new TextDecoder().decode(buffer);
  } catch (error) {
    if (error instanceof Error && error.message.includes('no readable text'))
      throw error;
    throw new Error(
      `Could not read this ${extension?.toUpperCase()} document. Make sure it is valid, unencrypted, and saved in the selected format.`,
    );
  }
  if (!text.trim())
    throw new Error(
      'No readable text was found. Upload a document containing selectable text.',
    );
  return text.trim();
}

class Layout {
  document: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  page!: PDFPage;
  y = 0;
  title: string;
  constructor(
    document: PDFDocument,
    regular: PDFFont,
    bold: PDFFont,
    title: string,
  ) {
    this.document = document;
    this.regular = regular;
    this.bold = bold;
    this.title = title;
    this.newPage();
  }
  newPage() {
    this.page = this.document.addPage([595.28, 841.89]);
    this.page.drawRectangle({
      x: 0,
      y: 754,
      width: 595.28,
      height: 88,
      color: violet,
    });
    this.page.drawText('ONBOARD / YOUR NEXT CHAPTER', {
      x: 44,
      y: 809,
      size: 9,
      font: this.bold,
      color: rgb(0.85, 0.81, 1),
    });
    this.page.drawText(this.title, {
      x: 44,
      y: 778,
      size: 23,
      font: this.bold,
      color: rgb(1, 1, 1),
    });
    this.page.drawText(`Firstday  |  ${this.document.getPageCount()}`, {
      x: 44,
      y: 27,
      size: 8,
      font: this.regular,
      color: muted,
    });
    this.y = 726;
  }
  room(height: number) {
    if (this.y - height < 55) this.newPage();
  }
  text(value: string, bold = false, size = 10.5) {
    const font = bold ? this.bold : this.regular;
    const maxWidth = 507;
    for (const paragraph of printable(value).split('\n')) {
      let line = '';
      const words = paragraph.split(/\s+/);
      for (let word of words) {
        while (font.widthOfTextAtSize(word, size) > maxWidth) {
          if (line) {
            this.line(line, font, size);
            line = '';
          }
          let end = 1;
          while (
            end < word.length &&
            font.widthOfTextAtSize(word.slice(0, end + 1), size) <= maxWidth
          )
            end++;
          this.line(word.slice(0, end), font, size);
          word = word.slice(end);
        }
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxWidth) {
          this.line(line, font, size);
          line = word;
        } else line = next;
      }
      this.line(line, font, size);
    }
    this.y -= 6;
  }
  line(text: string, font: PDFFont, size: number) {
    this.room(size + 5);
    this.page.drawText(text, { x: 44, y: this.y, font, size, color: ink });
    this.y -= size + 5;
  }
  heading(value: string) {
    this.room(42);
    this.y -= 9;
    this.text(value, true, 12);
  }
  field(label: string, value = '', hint?: string) {
    this.room(hint ? 77 : 64);
    this.text(label, true, 10);
    const field = this.document.getForm().createTextField(label);
    field.setText(printable(value));
    field.addToPage(this.page, {
      x: 44,
      y: this.y - 27,
      width: 507,
      height: 29,
      borderWidth: 0.7,
      borderColor: rgb(0.77, 0.74, 0.85),
      backgroundColor: rgb(0.98, 0.97, 1),
      font: this.regular,
    });
    field.setFontSize(10);
    this.y -= 39;
    if (hint) this.text(hint, false, 8.5);
  }
}
async function layout(title: string) {
  const document = await PDFDocument.create();
  document.setTitle(title);
  document.setAuthor('Firstday');
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  return new Layout(document, regular, bold, title);
}
function employeeSummary(pdf: Layout, employee: Employee) {
  pdf.text(employee.name || 'New employee', true, 15);
  pdf.text(
    `${employee.role || 'Role to be confirmed'} / ${employee.department || 'Department to be confirmed'}`,
  );
  pdf.text(
    `Start date: ${employee.startDate || 'To be confirmed'}    |    Manager: ${employee.manager || 'To be confirmed'}`,
  );
}
export async function generateDocument(
  kind: DocumentKind,
  employee: Employee,
  aiDraft?: { title: string; sections: { heading: string; body: string }[] },
): Promise<Uint8Array> {
  if (kind === 'it' && employee.temporaryPassword) {
    let exact = false;
    try {
      exact =
        employee.temporaryPassword === printable(employee.temporaryPassword) &&
        !/\s/.test(employee.temporaryPassword);
    } catch {
      /* Report the credential-specific action below. */
    }
    if (!exact)
      throw new Error(
        'The temporary password contains characters this PDF cannot preserve exactly. Leave the password field blank and obtain it through your IT team’s secure channel. Do not change your password to fit this form.',
      );
  }
  const titles = {
    checklist: 'Onboarding checklist',
    welcome: 'Welcome to the team',
    it: 'IT setup sheet',
    deposit: 'Direct deposit form',
  };
  const pdf = await layout(titles[kind]);
  if (kind !== 'deposit') employeeSummary(pdf, employee);
  if (aiDraft) {
    pdf.text('AI-assisted draft. Review the details before use.', false, 9);
    for (const section of aiDraft.sections) {
      pdf.heading(section.heading);
      pdf.text(section.body);
    }
    if (kind === 'welcome') return pdf.document.save();
  }
  if (kind === 'checklist') {
    pdf.heading('Your first steps');
    if (!aiDraft)
      roleTasks(employee).forEach((task, index) =>
        pdf.text(`${index + 1}. ${task}`),
      );
    pdf.heading('Completion record');
    pdf.text(
      'Fill all seven fields below, save this PDF, then upload it to verify completion. Typed names record completeness; they do not authenticate a signature.',
      false,
      9,
    );
    for (const label of FIELD_LABELS) {
      const hint =
        label === 'Emergency contact'
          ? 'Enter the contact name and phone number in this field.'
          : label === 'Hire date'
            ? 'Use YYYY-MM-DD.'
            : label === 'Tax forms completed'
              ? 'Enter Yes or Completed after completing the required tax forms.'
              : label === 'Background check cleared'
                ? 'Enter Cleared or Passed only after clearance is confirmed.'
                : label === 'Equipment inventory signed'
                  ? 'Enter Signed after acknowledging the equipment inventory.'
                  : label === 'Manager approval'
                    ? 'Enter the approving manager name.'
                    : 'Enter the employee name as a typed signature.';
      pdf.field(label, label === 'Hire date' ? employee.startDate : '', hint);
    }
  } else if (kind === 'welcome') {
    pdf.heading('Email draft');
    pdf.text(`To: ${employee.email || employee.name || 'New employee'}`);
    pdf.text(
      `Subject: Welcome to ${employee.department || 'the team'}, ${employee.name || 'our new colleague'}!`,
      true,
    );
    pdf.text(`Hi ${employee.name || 'there'},`);
    pdf.text(
      `Welcome to the ${employee.department || 'team'} team! We look forward to having you join us as ${employee.role || 'our newest team member'} on ${employee.startDate || 'your agreed start date'}.`,
    );
    pdf.text(
      `Your manager, ${employee.manager || 'to be confirmed'}, will help you get settled and agree on your first priorities. Please contact them to confirm your arrival time and location.`,
    );
    pdf.text(
      'Before your first day, review the employee handbook, prepare your onboarding documents, and follow the IT setup guide. Bring any outstanding questions to your manager or HR.',
    );
    pdf.text(
      `We look forward to meeting you!\n${employee.manager || 'Your onboarding team'}`,
    );
  } else if (kind === 'it') {
    pdf.heading('Assigned accounts and equipment');
    pdf.text(`Work email: ${employee.email || 'Request from IT'}`);
    pdf.text(
      `Login / account: ${employee.login || 'Request from IT through an approved channel'}`,
    );
    if (employee.temporaryPassword.trim())
      pdf.text(`Temporary password: ${employee.temporaryPassword}`);
    pdf.text(
      `Equipment assigned: ${employee.equipment || 'Confirm equipment and asset numbers with IT'}`,
    );
    pdf.heading('Setup steps');
    [
      'Connect to a trusted network and sign in with the account supplied by IT.',
      'Change any temporary password and enable multi-factor authentication.',
      'Install approved updates and confirm device enrollment with IT.',
      'Verify access to the tools required for your role.',
      'Review the equipment inventory and sign the completion record.',
    ].forEach((step, i) => pdf.text(`${i + 1}. ${step}`));
    pdf.text(
      'Keep account details private. Store or share this sheet only through approved company channels.',
      false,
      9,
    );
  } else {
    pdf.text(
      'Complete your payroll details and return this form through the secure channel specified by HR. Confirm local payroll requirements with HR before submission.',
      false,
      10,
    );
    for (const label of [
      'Employee full name',
      'Employee ID (if assigned)',
      'Bank name',
      'Account holder name',
      'Account number / IBAN',
      'Routing / branch / BSB code',
      'Account type',
      'Employee signature',
      'Date',
    ])
      pdf.field(label);
    pdf.text(
      'Authorization: I authorize payroll deposits to the account identified above. Confirm the entered details before signing.',
      false,
      9,
    );
  }
  pdf.document.getForm().updateFieldAppearances(pdf.regular);
  return pdf.document.save();
}
export async function generateCheckedDocument(
  result: CheckResult,
  original?: File,
): Promise<Uint8Array> {
  const pdf = await layout('Onboarding check report');
  pdf.text(
    result.passed
      ? 'PASS - All required fields completed'
      : 'FAIL - Action required',
    true,
    15,
  );
  pdf.text(`Source: ${result.filename}`);
  pdf.text(`Checked at: ${result.checkedAt}`);
  pdf.text(
    'This report checks document completeness only. It does not authenticate signatures, approvals, or background-check results.',
    false,
    9,
  );
  pdf.heading('Field-by-field findings');
  for (const item of result.items) {
    pdf.text(`${item.passed ? 'PASS' : 'FAIL'} / ${item.label}`, true);
    pdf.text(`Value: ${item.value || '(missing)'}`);
    pdf.text(item.issue);
    if (item.evidence) pdf.text(`Source evidence: ${item.evidence}`, false, 9);
  }
  if (original && original.name.toLowerCase().endsWith('.pdf')) {
    const source = await PDFDocument.load(await bytesOf(original));
    const pages = await pdf.document.copyPages(source, source.getPageIndices());
    pages.forEach((page) => pdf.document.addPage(page));
  } else {
    pdf.heading('Original document text');
    pdf.text(result.text || '(No source text available)');
  }
  return pdf.document.save();
}
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const url = URL.createObjectURL(
    new Blob([copy.buffer], { type: 'application/pdf' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith('.pdf')
    ? filename
    : `${filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Creates a frozen salary confirmation using the workspace document creation tool. */
export async function generateSalaryConfirmation(
  record: import('./employee-workflow').SalaryDocument,
): Promise<Uint8Array> {
  const { salaryLabel, profileIssues, termsIssues } =
    await import('./employee-workflow');
  if (profileIssues(record.profile).length || termsIssues(record.terms).length)
    throw new Error(
      'Complete the employee details and salary terms before creating a document.',
    );
  const pdf = await layout('Employment and salary confirmation');
  pdf.text(
    record.signature ? 'SIGNED CONFIRMATION' : 'DRAFT — NOT SIGNED',
    true,
    11,
  );
  pdf.text(`Document reference: ${record.id}`);
  pdf.text(`Created: ${new Date(record.createdAt).toISOString()}`);
  pdf.heading('Employment details');
  for (const [label, value] of Object.entries({
    Employer: record.terms.company,
    Employee: record.profile.legalName,
    'Job title': record.profile.role,
    Department: record.profile.department,
    Manager: record.profile.manager,
    'Start date': record.profile.startDate,
    'Employment type': record.terms.employmentType,
    'Ordinary weekly hours': record.terms.hours,
  }))
    pdf.text(`${label}: ${value}`);
  pdf.heading('Salary');
  pdf.text(salaryLabel(record.terms), true, 15);
  pdf.text(`Payment frequency: ${record.terms.payFrequency}`);
  pdf.text(`Superannuation / pension: ${record.terms.retirement}`);
  pdf.text(
    'Amounts are gross, before applicable deductions. This document records the supplied employment and salary terms. It does not replace the complete employment agreement.',
  );
  pdf.heading('Employee acknowledgement');
  if (record.signature) {
    pdf.text(record.signature.consent);
    pdf.text(`Signed by: ${record.signature.name}`, true);
    pdf.text(`Signed at (UTC): ${record.signature.signedAt}`);
    pdf.text(
      'Method: typed-name electronic acknowledgement in the Firstday local demo.',
    );
  } else
    pdf.text(
      'Review the pay terms in Firstday and sign to confirm your acceptance.',
    );
  pdf.text(
    'Prepared from the information supplied in Firstday. This document does not verify identity authenticity.',
    false,
    9,
  );
  return pdf.document.save();
}
