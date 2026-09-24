import type {
  GeneratedWorkflowSmartBlockInstance,
  GeneratedWorkflowSmartBlockOutput,
  GeneratedWorkflowSourceBinding,
} from '@/lib/generated-workflow/runtime-contract';

const SUPPORTED_BLOCKS: Record<string, string> = {
  'ai-chat': 'AI guided conversation',
  approvals: 'Approval',
  'comparison-table': 'Comparison table',
  'compliance-rules': 'Compliance check',
  'document-analysis': 'Document analysis',
  'document-checklist': 'Document checklist',
  'smart.approval': 'Approval',
  'smart.table': 'Comparison table',
};

function textConfig(
  block: GeneratedWorkflowSmartBlockInstance,
  key: string,
): string | undefined {
  const value = block.config.presentationConfig[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function outputKey(blockId: string, outputName: string): string {
  return `${blockId}.${outputName}`;
}

/** Reports whether the external template supports a canonical block contract. */
export function isSupportedGeneratedWorkflowBlock(blockId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_BLOCKS, blockId);
}

/** Resolves JSON-safe block inputs without evaluating platform-only adapters. */
export function resolveGeneratedWorkflowBlockBinding(
  binding: GeneratedWorkflowSourceBinding,
  args: {
    currentStepId: string;
    formData: Record<string, Record<string, unknown>>;
  },
): unknown {
  if (binding.kind === 'literal') return binding.value;
  if (binding.kind === 'workflow-field') {
    return args.formData[binding.stepId || args.currentStepId]?.[
      binding.fieldId
    ];
  }
  if (binding.kind === 'block-output') {
    const values = args.formData[args.currentStepId]?.__blocks;
    return values && typeof values === 'object'
      ? (values as Record<string, unknown>)[
          outputKey(binding.blockInstanceId, binding.outputName)
        ]
      : undefined;
  }
  return undefined;
}

function OutputInput({
  block,
  disabled,
  output,
  value,
  onChange,
}: {
  block: GeneratedWorkflowSmartBlockInstance;
  disabled: boolean;
  output: GeneratedWorkflowSmartBlockOutput;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `block-${block.id}-${output.name}`;
  const label = output.name.replace(/[-_]+/g, ' ');
  if (output.valueType === 'boolean') {
    return (
      <label htmlFor={id} className='flex items-center gap-2 text-sm'>
        <input
          id={id}
          type='checkbox'
          disabled={disabled}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }
  if (
    output.valueType === 'file' ||
    output.valueType === 'object' ||
    output.valueType === 'unknown' ||
    output.collection
  ) {
    return (
      <p role='alert' className='text-sm text-amber-800'>
        The output “{label}” needs a block adapter that this app does not
        provide.
      </p>
    );
  }
  const type =
    output.valueType === 'number'
      ? 'number'
      : output.valueType === 'date'
        ? 'date'
        : output.valueType === 'datetime'
          ? 'datetime-local'
          : 'text';
  return (
    <label htmlFor={id} className='block text-sm font-medium text-slate-800'>
      {label}
      {output.required ? <span className='ml-1 text-red-600'>*</span> : null}
      <input
        id={id}
        type={type}
        disabled={disabled}
        value={
          typeof value === 'string' || typeof value === 'number' ? value : ''
        }
        onChange={(event) =>
          onChange(
            type === 'number' && event.target.value !== ''
              ? Number(event.target.value)
              : event.target.value,
          )
        }
        className='mt-2 w-full rounded-lg border border-slate-300 px-3 py-2'
      />
    </label>
  );
}

/** Renders one canonical block and writes declared outputs into submission data. */
export function GeneratedWorkflowSmartBlock({
  block,
  disabled,
  formData,
  stepId,
  values,
  onOutputChange,
}: {
  block: GeneratedWorkflowSmartBlockInstance;
  disabled: boolean;
  formData: Record<string, Record<string, unknown>>;
  stepId: string;
  values: Record<string, unknown>;
  onOutputChange: (outputName: string, value: unknown) => void;
}) {
  if (!isSupportedGeneratedWorkflowBlock(block.blockId)) {
    return (
      <div
        role='alert'
        className='rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900'
      >
        This workflow uses unsupported block “{block.blockId}”. The app owner
        must add its runtime adapter and republish before respondents can
        continue.
      </div>
    );
  }
  const resolvedBindings = Object.entries(block.bindings)
    .map(([name, binding]) => [
      name,
      resolveGeneratedWorkflowBlockBinding(binding, {
        currentStepId: stepId,
        formData,
      }),
    ])
    .filter(([, value]) => value !== undefined);
  const title =
    textConfig(block, 'title') ||
    textConfig(block, 'heading') ||
    SUPPORTED_BLOCKS[block.blockId];
  const description = textConfig(block, 'description');

  return (
    <section className='rounded-lg border border-blue-100 bg-blue-50 p-4 text-blue-950'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      {description ? <p className='mt-1 text-sm'>{description}</p> : null}
      {resolvedBindings.length > 0 ? (
        <dl className='mt-3 grid gap-1 text-xs text-blue-900'>
          {resolvedBindings.map(([name, value]) => (
            <div key={String(name)} className='flex gap-2'>
              <dt className='font-semibold'>{String(name)}:</dt>
              <dd>
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {block.outputs?.length ? (
        <div className='mt-4 space-y-4'>
          {block.outputs.map((output) => (
            <OutputInput
              key={output.name}
              block={block}
              disabled={disabled}
              output={output}
              value={values[output.name]}
              onChange={(value) => onOutputChange(output.name, value)}
            />
          ))}
        </div>
      ) : (
        <p className='mt-2 text-sm'>
          This guided activity has no respondent output.
        </p>
      )}
    </section>
  );
}
