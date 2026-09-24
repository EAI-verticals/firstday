'use client';

import type { GeneratedWorkflowField } from '@/lib/generated-workflow/runtime-contract';
import { SUBMISSION_FILE_ACCEPT } from '@/lib/generated-workflow/submission-files';

interface GeneratedWorkflowFieldInputProps {
  disabled: boolean;
  field: GeneratedWorkflowField;
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onFileSelect: (file: File | null) => void;
}

const INPUT_CLASS =
  'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100';

export function GeneratedWorkflowFieldInput({
  disabled,
  field,
  id,
  value,
  onChange,
  onFileSelect,
}: GeneratedWorkflowFieldInputProps) {
  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        className={`${INPUT_CLASS} min-h-32 resize-y`}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select
        id={id}
        className={INPUT_CLASS}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value=''>Select an option</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'boolean' || field.type === 'checkbox') {
    return (
      <input
        id={id}
        type='checkbox'
        className='mt-2 h-5 w-5 rounded border-slate-300 text-blue-600'
        checked={value === true}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (field.type === 'file') {
    return (
      <input
        id={id}
        type='file'
        accept={SUBMISSION_FILE_ACCEPT}
        className={`${INPUT_CLASS} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium`}
        disabled={disabled}
        onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
      />
    );
  }
  return (
    <input
      id={id}
      type={field.type === 'date' ? 'date' : 'text'}
      className={INPUT_CLASS}
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
