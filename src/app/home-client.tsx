'use client';

import { DemoPage } from '@enterpriseaigroup/demo';
import { GeneratedWorkflowForm } from '@/components/generated-workflow/workflow-form';
import type { GeneratedWorkflowRuntime } from '@/lib/generated-workflow/runtime-contract';

interface HomeClientProps {
  generatedWorkflow?: Pick<
    GeneratedWorkflowRuntime,
    'appKey' | 'binding' | 'snapshot' | 'branding'
  >;
  runtimeError?: string;
}

export function HomeClient({
  generatedWorkflow,
  runtimeError,
}: HomeClientProps) {
  if (runtimeError) {
    return (
      <main className='flex min-h-svh items-center justify-center bg-slate-50 p-6'>
        <section className='max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm'>
          <h1 className='text-xl font-semibold text-slate-950'>
            Workflow unavailable
          </h1>
          <p className='mt-2 text-sm text-slate-600'>
            The deployed workflow snapshot did not pass its integrity check.
          </p>
        </section>
      </main>
    );
  }
  if (!generatedWorkflow) {
    return <DemoPage />;
  }
  return (
    <div
      data-eai-workflow-ready='true'
      data-eai-workflow-digest={
        generatedWorkflow.binding.workflowTemplate.digest
      }
      data-eai-workflow-title={generatedWorkflow.binding.workflowTemplate.title}
    >
      <GeneratedWorkflowForm
        appKey={generatedWorkflow.appKey}
        binding={generatedWorkflow.binding}
        branding={generatedWorkflow.branding}
        snapshot={generatedWorkflow.snapshot}
      />
    </div>
  );
}
