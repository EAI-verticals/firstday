'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { apiUrl } from '@/lib/api-helpers';
import type {
  GeneratedAppRuntimeBinding,
  GeneratedWorkflowBranding,
  GeneratedWorkflowSnapshot,
  GeneratedWorkflowStep,
} from '@/lib/generated-workflow/runtime-contract';
import { validateSubmissionFile } from '@/lib/generated-workflow/submission-files';
import { GeneratedWorkflowFieldInput } from './field-input';
import {
  GeneratedWorkflowSmartBlock,
  isSupportedGeneratedWorkflowBlock,
} from './smart-block';

interface GeneratedWorkflowFormProps {
  appKey: string;
  binding: GeneratedAppRuntimeBinding;
  snapshot: GeneratedWorkflowSnapshot;
  branding?: GeneratedWorkflowBranding;
}

type SubmitState = 'starting' | 'idle' | 'submitting' | 'submitted' | 'error';

function detectDevice(): 'Desktop' | 'Mobile' | 'Tablet' {
  if (window.innerWidth < 640) return 'Mobile';
  if (window.innerWidth < 1024) return 'Tablet';
  return 'Desktop';
}

function readableTextColor(background: string): string {
  const red = Number.parseInt(background.slice(1, 3), 16);
  const green = Number.parseInt(background.slice(3, 5), 16);
  const blue = Number.parseInt(background.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 160
    ? '#0f172a'
    : '#ffffff';
}

function normalizeSteps(
  snapshot: GeneratedWorkflowSnapshot,
): GeneratedWorkflowStep[] {
  return snapshot.steps.map((step, stepIndex) => ({
    ...step,
    id: step.id || `step-${stepIndex + 1}`,
    title: step.title || step.name || `Step ${stepIndex + 1}`,
    fields: (step.fields ?? []).map((field, fieldIndex) => ({
      ...field,
      id: field.id || `step-${stepIndex + 1}-field-${fieldIndex + 1}`,
      label: field.label || field.name || `Field ${fieldIndex + 1}`,
      type: field.type || 'text',
    })),
    blocks: [...(step.blocks ?? [])].sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    ),
  }));
}

function fieldKey(stepId: string, fieldId: string): string {
  return `${stepId}.${fieldId}`;
}

function blockKey(stepId: string, blockId: string): string {
  return `${stepId}.__blocks.${blockId}`;
}

function blockOutputValues(
  data: Record<string, Record<string, unknown>>,
  stepId: string,
  blockId: string,
): Record<string, unknown> {
  const blockValues = data[stepId]?.__blocks;
  if (!blockValues || typeof blockValues !== 'object') return {};
  const prefix = `${blockId}.`;
  return Object.fromEntries(
    Object.entries(blockValues as Record<string, unknown>)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
}

function submissionEndpoint(submissionId?: string, files = false): string {
  const base = '/api/eai/workflow-submissions';
  if (!submissionId) return apiUrl(base);
  return apiUrl(
    `${base}/${encodeURIComponent(submissionId)}${files ? '/files' : ''}`,
  );
}

export function GeneratedWorkflowForm({
  appKey,
  binding,
  snapshot,
  branding,
}: GeneratedWorkflowFormProps) {
  const steps = useMemo(() => normalizeSteps(snapshot), [snapshot]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const initialized = useRef(false);
  const formDataRef = useRef(formData);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const startSubmission = useCallback(async () => {
    const response = await fetch(submissionEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: detectDevice() }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      submissionId?: string;
    };
    if (!response.ok || !payload.submissionId) {
      throw new Error(
        response.status === 429
          ? 'Too many attempts. Please wait and reload.'
          : 'Could not start this form. Please reload and try again.',
      );
    }
    setSubmissionId(payload.submissionId);
    setSubmitState('idle');
    const url = new URL(window.location.href);
    url.searchParams.set('submission', payload.submissionId);
    window.history.replaceState(null, '', url.toString());
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const resumeId = new URLSearchParams(window.location.search).get(
      'submission',
    );
    const initialize = resumeId
      ? fetch(submissionEndpoint(resumeId))
          .then(async (response) => {
            if (!response.ok) throw new Error('resume-failed');
            const payload = (await response.json()) as {
              submission?: {
                status?: string;
                currentStep?: number;
                formData?: Record<string, Record<string, unknown>>;
                userName?: string;
                userEmail?: string;
              };
            };
            if (
              !payload.submission ||
              payload.submission.status !== 'in_progress'
            ) {
              throw new Error('resume-failed');
            }
            setSubmissionId(resumeId);
            setFormData(payload.submission.formData ?? {});
            setCurrentStepIndex(
              Math.min(
                Math.max(payload.submission.currentStep ?? 0, 0),
                Math.max(steps.length - 1, 0),
              ),
            );
            setUserName(payload.submission.userName ?? '');
            setUserEmail(payload.submission.userEmail ?? '');
            setSubmitState('idle');
          })
          .catch(() => startSubmission())
      : startSubmission();

    void initialize.catch((error) => {
      setSubmitState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not start this form.',
      );
    });
  }, [startSubmission, steps.length]);

  const currentStep = steps[currentStepIndex];
  const setFieldValue = useCallback(
    (stepId: string, fieldId: string, value: unknown) => {
      setFormData((current) => ({
        ...current,
        [stepId]: { ...current[stepId], [fieldId]: value },
      }));
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[fieldKey(stepId, fieldId)];
        return next;
      });
    },
    [],
  );

  const setBlockOutputValue = useCallback(
    (stepId: string, blockId: string, outputName: string, value: unknown) => {
      setFormData((current) => {
        const step = current[stepId] ?? {};
        const existing =
          step.__blocks && typeof step.__blocks === 'object'
            ? (step.__blocks as Record<string, unknown>)
            : {};
        return {
          ...current,
          [stepId]: {
            ...step,
            __blocks: {
              ...existing,
              [`${blockId}.${outputName}`]: value,
            },
          },
        };
      });
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[blockKey(stepId, blockId)];
        return next;
      });
    },
    [],
  );

  const validateStep = useCallback(
    (step: GeneratedWorkflowStep): boolean => {
      const errors: Record<string, string> = {};
      for (const field of step.fields ?? []) {
        if (field.type === 'smart_block') continue;
        const stepId = step.id ?? '';
        const fieldId = field.id ?? '';
        const value = formData[stepId]?.[fieldId];
        if (
          field.required &&
          (value === undefined || value === null || value === '')
        ) {
          errors[fieldKey(stepId, fieldId)] = 'This field is required.';
        }
      }
      for (const block of step.blocks ?? []) {
        const stepId = step.id ?? '';
        const key = blockKey(stepId, block.id);
        if (!isSupportedGeneratedWorkflowBlock(block.blockId)) {
          errors[key] = `Unsupported workflow block: ${block.blockId}`;
          continue;
        }
        const values = blockOutputValues(formData, stepId, block.id);
        const missingRequiredOutput = (block.outputs ?? []).some((output) => {
          if (!output.required) return false;
          if (
            output.valueType === 'file' ||
            output.valueType === 'object' ||
            output.valueType === 'unknown' ||
            output.collection
          ) {
            return true;
          }
          const value = values[output.name];
          return value === undefined || value === null || value === '';
        });
        if (missingRequiredOutput) {
          errors[key] = 'Complete the required guided activity outputs.';
        }
      }
      setFieldErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [formData],
  );

  const saveProgress = useCallback(
    async (nextStep: number, data = formDataRef.current) => {
      if (!submissionId) return;
      await fetch(submissionEndpoint(submissionId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep: nextStep,
          formData: data,
          ...(userName ? { userName } : {}),
          ...(userEmail ? { userEmail } : {}),
        }),
      }).catch(() => undefined);
    },
    [submissionId, userEmail, userName],
  );

  const uploadFile = useCallback(
    async (stepId: string, fieldId: string, file: File | null) => {
      if (!file) {
        setFieldValue(stepId, fieldId, '');
        return;
      }
      const key = fieldKey(stepId, fieldId);
      const validationError = validateSubmissionFile(file);
      if (validationError) {
        setFieldErrors((current) => ({
          ...current,
          [key]: validationError,
        }));
        return;
      }
      if (!submissionId) {
        setFieldErrors((current) => ({
          ...current,
          [key]: 'This form is still starting. Please try again.',
        }));
        return;
      }
      setUploadingField(key);
      try {
        const body = new FormData();
        body.set('file', file);
        body.set('stepId', stepId);
        body.set('fieldId', fieldId);
        const response = await fetch(submissionEndpoint(submissionId, true), {
          method: 'POST',
          body,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          file?: unknown;
          message?: string;
        };
        if (!response.ok || !payload.file) {
          throw new Error(payload.message || 'File upload failed.');
        }
        setFieldValue(stepId, fieldId, payload.file);
        const merged = {
          ...formDataRef.current,
          [stepId]: { ...formDataRef.current[stepId], [fieldId]: payload.file },
        };
        await saveProgress(currentStepIndex, merged);
      } catch (error) {
        setFieldErrors((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : 'File upload failed.',
        }));
      } finally {
        setUploadingField(null);
      }
    },
    [currentStepIndex, saveProgress, setFieldValue, submissionId],
  );

  const submit = useCallback(async () => {
    if (!currentStep || !validateStep(currentStep) || !submissionId) return;
    setSubmitState('submitting');
    setErrorMessage(null);
    try {
      const response = await fetch(submissionEndpoint(submissionId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          currentStep: currentStepIndex,
          formData,
          ...(userName ? { userName } : {}),
          ...(userEmail ? { userEmail } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || 'Submission failed.');
      }
      setSubmitState('submitted');
    } catch (error) {
      setSubmitState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Submission failed.',
      );
    }
  }, [
    currentStep,
    currentStepIndex,
    formData,
    submissionId,
    userEmail,
    userName,
    validateStep,
  ]);

  if (steps.length === 0) {
    return <p className='p-8 text-center'>This workflow has no steps.</p>;
  }
  if (submitState === 'submitted') {
    return (
      <div className='mx-auto max-w-xl px-6 py-24 text-center'>
        <div className='mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700'>
          ✓
        </div>
        <h1 className='text-2xl font-semibold text-slate-950'>Submitted</h1>
        <p className='mt-2 text-slate-600'>
          Thank you. Your response has been received.
        </p>
      </div>
    );
  }

  const isLastStep = currentStepIndex === steps.length - 1;
  const currentStepHasUnsupportedBlocks =
    currentStep?.blocks?.some(
      (block) => !isSupportedGeneratedWorkflowBlock(block.blockId),
    ) ?? false;
  const primaryColor = branding?.primaryColor ?? '#1d4ed8';
  const secondaryColor = branding?.secondaryColor ?? '#f8fafc';
  const accentColor = branding?.accentColor ?? primaryColor;
  const brandStyle = {
    backgroundColor: secondaryColor,
  } satisfies CSSProperties;
  return (
    <div className='min-h-svh overflow-y-auto' style={brandStyle}>
      <header className='border-b border-slate-200 bg-white'>
        <div className='mx-auto max-w-3xl px-5 py-7'>
          <div className='flex items-center gap-4'>
            {branding?.logoDataUrl ? (
              <Image
                alt={`${branding.displayName ?? binding.workflowTemplate.title} logo`}
                className='h-12 w-12 rounded-lg border bg-white object-contain p-1'
                height={48}
                src={branding.logoDataUrl}
                style={{ borderColor: accentColor }}
                unoptimized
                width={48}
              />
            ) : null}
            <div>
              <p
                className='text-xs font-semibold tracking-widest uppercase'
                style={{ color: primaryColor }}
              >
                {branding?.displayName ?? appKey.replace(/-/g, ' ')}
              </p>
              <h1 className='mt-2 text-2xl font-semibold text-slate-950'>
                {binding.workflowTemplate.title}
              </h1>
            </div>
          </div>
          <div className='mt-5 flex gap-2' aria-label='Workflow progress'>
            {steps.map((step, index) => (
              <div
                key={step.id}
                className='h-1.5 flex-1 rounded-full'
                style={{
                  backgroundColor:
                    index <= currentStepIndex ? primaryColor : '#e2e8f0',
                }}
              />
            ))}
          </div>
        </div>
      </header>

      <main className='mx-auto max-w-3xl px-5 py-8'>
        <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8'>
          <p className='text-sm font-medium text-slate-500'>
            Step {currentStepIndex + 1} of {steps.length}
          </p>
          <h2 className='mt-2 text-xl font-semibold text-slate-950'>
            {currentStep?.title}
          </h2>
          {currentStep?.description ? (
            <p className='mt-2 text-sm leading-6 text-slate-600'>
              {currentStep.description}
            </p>
          ) : null}

          <div className='mt-7 space-y-6'>
            {currentStep?.fields?.map((field) => {
              const stepId = currentStep.id ?? '';
              const fieldId = field.id ?? '';
              const key = fieldKey(stepId, fieldId);
              if (field.type === 'smart_block') {
                return (
                  <div
                    key={key}
                    className='rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900'
                  >
                    {field.label || 'Guided workflow activity'}
                  </div>
                );
              }
              return (
                <label
                  key={key}
                  htmlFor={key}
                  className='block text-sm font-medium text-slate-800'
                >
                  {field.label}
                  {field.required ? (
                    <span className='ml-1 text-red-600'>*</span>
                  ) : null}
                  {field.helpText ? (
                    <span className='mt-1 block text-xs font-normal text-slate-500'>
                      {field.helpText}
                    </span>
                  ) : null}
                  <GeneratedWorkflowFieldInput
                    id={key}
                    disabled={
                      submitState === 'starting' ||
                      submitState === 'submitting' ||
                      uploadingField === key
                    }
                    field={field}
                    value={formData[stepId]?.[fieldId]}
                    onChange={(value) => setFieldValue(stepId, fieldId, value)}
                    onFileSelect={(file) =>
                      void uploadFile(stepId, fieldId, file)
                    }
                  />
                  {uploadingField === key ? (
                    <span className='mt-1 block text-xs text-slate-500'>
                      Uploading…
                    </span>
                  ) : null}
                  {fieldErrors[key] ? (
                    <span className='mt-1 block text-xs text-red-600'>
                      {fieldErrors[key]}
                    </span>
                  ) : null}
                </label>
              );
            })}
            {currentStep?.blocks?.map((block) => {
              const stepId = currentStep.id ?? '';
              const key = blockKey(stepId, block.id);
              return (
                <div key={key}>
                  <GeneratedWorkflowSmartBlock
                    block={block}
                    disabled={
                      submitState === 'starting' || submitState === 'submitting'
                    }
                    formData={formData}
                    stepId={stepId}
                    values={blockOutputValues(formData, stepId, block.id)}
                    onOutputChange={(outputName, value) =>
                      setBlockOutputValue(stepId, block.id, outputName, value)
                    }
                  />
                  {fieldErrors[key] ? (
                    <span className='mt-1 block text-xs text-red-600'>
                      {fieldErrors[key]}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {isLastStep ? (
            <div className='mt-8 grid gap-5 border-t border-slate-200 pt-7 sm:grid-cols-2'>
              <label className='text-sm font-medium text-slate-800'>
                Name
                <input
                  className='mt-2 w-full rounded-lg border border-slate-300 px-3 py-2'
                  value={userName}
                  maxLength={200}
                  onChange={(event) => setUserName(event.target.value)}
                />
              </label>
              <label className='text-sm font-medium text-slate-800'>
                Email
                <input
                  type='email'
                  className='mt-2 w-full rounded-lg border border-slate-300 px-3 py-2'
                  value={userEmail}
                  maxLength={200}
                  onChange={(event) => setUserEmail(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {errorMessage ? (
            <p
              role='alert'
              className='mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700'
            >
              {errorMessage}
            </p>
          ) : null}

          <div className='mt-8 flex justify-between'>
            <button
              type='button'
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40'
              disabled={currentStepIndex === 0 || submitState === 'submitting'}
              onClick={() => {
                setFieldErrors({});
                setCurrentStepIndex((current) => Math.max(0, current - 1));
              }}
            >
              Back
            </button>
            <button
              type='button'
              className='rounded-lg px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
              style={{
                backgroundColor: primaryColor,
                color: readableTextColor(primaryColor),
              }}
              disabled={
                submitState === 'starting' ||
                submitState === 'submitting' ||
                Boolean(uploadingField) ||
                currentStepHasUnsupportedBlocks
              }
              onClick={() => {
                if (!currentStep || !validateStep(currentStep)) return;
                if (isLastStep) {
                  void submit();
                  return;
                }
                const next = currentStepIndex + 1;
                setCurrentStepIndex(next);
                void saveProgress(next);
              }}
            >
              {submitState === 'starting'
                ? 'Starting…'
                : submitState === 'submitting'
                  ? 'Submitting…'
                  : isLastStep
                    ? 'Submit'
                    : 'Next'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
