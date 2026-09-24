---
sidebar_position: 1
slug: /tutorials/build-a-task-tracker
---

# Tutorial: Build a Task Tracker

Build a fully functional task tracking application on the Enterprise AI platform in under 30 minutes. You'll learn how to define data models, create CRUD pages, and wire up AI-powered assistance.

## What You'll Build

A task tracker with:

- Task list with filtering and pagination
- Task creation and editing
- Status workflow (draft → in-progress → done)
- AI assistant to help write task descriptions

## Prerequisites

- Node.js 18+ installed
- `eai` CLI installed (`npm install -g @enterpriseai/cli`)
- Authenticated with `eai login`

## Step 1: Scaffold the Project

```bash
eai init task-tracker
cd task-tracker
```

This clones the EAI App Template and sets up the project structure.

## Step 2: Create Your Tenant

Create a tenant configuration at `src/eai.config/tenants/tracker.config.ts`:

```typescript
import { defineConfig } from '@enterpriseaigroup/core/config/server';

export const trackerConfig = defineConfig({
  tenantId: 'task-tracker',
  workflowId: 'task-workflow',
  defaultEmail: 'support@example.com',
  meta: {
    title: 'Task Tracker',
    description: 'AI-powered task management',
  },
  store: {
    user: { initialState: { name: null }, persist: true },
    tasks: {
      initialState: { items: [], isLoading: false, selectedId: null },
      persist: true,
    },
  },
  layout: {
    header: {
      components: [{ component: 'Header', priority: 1 }],
    },
    middlePane: {
      components: [
        {
          component: 'Dashboard',
          priority: 1,
          storeBindings: [
            { prop: 'tasks', storePath: 'tasks.items' },
            { prop: 'isLoading', storePath: 'tasks.isLoading' },
          ],
        },
      ],
    },
  },
});
```

Register it in `src/eai.config/index.ts`:

```typescript
import { trackerConfig } from './tenants/tracker.config';

export const tenantConfigs = {
  default: trackerConfig,
  'task-tracker': trackerConfig,
};
```

## Step 3: Define Object Types

Edit `src/eai.config/object-types.ts`:

```typescript
export const objectTypes = {
  'task-tracker': [
    {
      name: 'Task',
      displayName: 'Task',
      description: 'A trackable unit of work',
      ...appSqlStorage('tasks'),
      properties: [
        { name: 'title', type: 'text', required: true, indexed: true },
        { name: 'description', type: 'text', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'In Progress', value: 'in-progress' },
            { label: 'Done', value: 'done' },
          ],
        },
        {
          name: 'priority',
          type: 'select',
          required: true,
          defaultValue: 'medium',
          options: [
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
          ],
        },
        { name: 'assignee', type: 'text', required: false },
        { name: 'dueDate', type: 'date', required: false },
      ],
      actions: [
        {
          name: 'start',
          displayName: 'Start Work',
          requiredRole: 'tenant-viewer',
          validationRules: { requiredStatus: 'draft' },
          sideEffects: [
            { type: 'set_field', field: 'status', value: 'in-progress' },
            { type: 'set_timestamp', field: 'startedAt' },
          ],
        },
        {
          name: 'complete',
          displayName: 'Mark Done',
          requiredRole: 'tenant-viewer',
          validationRules: { requiredStatus: 'in-progress' },
          sideEffects: [
            { type: 'set_field', field: 'status', value: 'done' },
            { type: 'set_timestamp', field: 'completedAt' },
          ],
        },
      ],
      status: 'published',
    },
  ],
};
```

`appSqlStorage('tasks')` is the template helper that produces the current
tenant-app storage contract: `tenant-postgres` plus an app-owned table name. Do
not replace it with `resourceapi-postgres` or a generic table name. After
`eai app provision`, the helper uses the generated `.eai/storage-bindings.json`
contract and local prefix env values written by the CLI.

Validate, publish, and verify:

```bash
eai login
eai tenant list --format json
eai tenant select <tenant-slug>
eai whoami
eai app provision task-tracker --tenant-id <tenant-id> --select --format json
eai types validate --tenant-key task-tracker --tenant-id <tenant-id>
eai types seed --tenant-key task-tracker --tenant-id <tenant-id> --format json
eai types diff --tenant-key task-tracker --tenant-id <tenant-id>
eai resources schema --tenant-id <tenant-id> --format json
```

Do not continue until `eai types diff` shows that the remote tenant matches the local source.

## Step 4: Create the Task List Page

Create `src/app/(presentation)/tasks/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useResources } from '@/hooks/useResources';

interface TaskData {
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee?: string;
  dueDate?: string;
}

export default function TasksPage() {
  const { list } = useResources<TaskData>('Task');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    list({ page: 1, limit: 50, sort: '-created_at' })
      .then((res) => setTasks(res.docs))
      .finally(() => setLoading(false));
  }, []);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
  };

  if (loading) return <div className='p-8 text-center'>Loading tasks...</div>;

  return (
    <div className='p-6'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Tasks</h1>
        <a
          href='/tasks/new'
          className='bg-primary rounded-md px-4 py-2 text-white'
        >
          New Task
        </a>
      </div>
      <div className='space-y-3'>
        {tasks.map((task) => (
          <div
            key={task.id}
            className='hover:bg-muted/30 rounded-lg border p-4'
          >
            <div className='flex items-start justify-between'>
              <div>
                <h3 className='font-medium'>{task.data.title}</h3>
                {task.data.description && (
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {task.data.description}
                  </p>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${statusColors[task.data.status]}`}
              >
                {task.data.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 5: Create the New Task Form

Create `src/app/(presentation)/tasks/new/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useRouter } from 'next/navigation';

interface TaskData {
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee?: string;
}

export default function NewTaskPage() {
  const { create } = useResources<TaskData>('Task');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create({ title, description, status: 'draft', priority });
    router.push('/tasks');
  }

  return (
    <div className='max-w-lg p-6'>
      <h1 className='mb-6 text-2xl font-bold'>New Task</h1>
      <form onSubmit={handleSubmit} className='space-y-4'>
        <div>
          <label className='mb-1 block text-sm font-medium'>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
            required
          />
        </div>
        <div>
          <label className='mb-1 block text-sm font-medium'>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
            rows={3}
          />
        </div>
        <div>
          <label className='mb-1 block text-sm font-medium'>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
          >
            <option value='low'>Low</option>
            <option value='medium'>Medium</option>
            <option value='high'>High</option>
          </select>
        </div>
        <button
          type='submit'
          className='bg-primary rounded-md px-4 py-2 text-white'
        >
          Create Task
        </button>
      </form>
    </div>
  );
}
```

## Step 6: Verify

Start the dev server and test:

```bash
eai dev
```

Open http://localhost:3000/tasks and:

1. Click "New Task" to create a task
2. See the task appear in the list
3. Check `eai resources list Task` to verify platform storage

## Step 7: Add AI Assistance (Optional)

Add a chat component to help users write better task descriptions using the `useChat` hook:

```tsx
import { useChat } from '@/hooks/useChat';

function DescriptionHelper({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  const { send } = useChat();
  const [loading, setLoading] = useState(false);

  async function suggest(title: string) {
    setLoading(true);
    const response = await send(`Write a clear task description for: ${title}`);
    onSuggestion(response);
    setLoading(false);
  }

  return (
    <button onClick={() => suggest(title)} disabled={loading}>
      {loading ? 'Thinking...' : 'AI Suggest Description'}
    </button>
  );
}
```

## What You Learned

- **Object Types**: How to define your data model in TypeScript and seed it to the platform
- **useResources Hook**: CRUD operations against ResourceAPI from React components
- **Config-Driven Architecture**: Tenant config, layout, and store setup
- **eai CLI**: Scaffold, validate, seed, and develop workflows

## Next Steps

- [Add AI Chat to Your Vertical](/docs/tutorials/add-ai-chat) — Full AI integration guide
- [Deploy to Azure](/docs/tutorials/deploy-to-azure) — Ship your app to production
- [Configuration Deep Dive](/docs/configuration/overview) — Advanced tenant configuration
