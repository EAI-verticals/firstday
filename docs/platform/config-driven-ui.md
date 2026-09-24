---
sidebar_position: 5
slug: /platform/config-driven-ui
---

# Config-Driven UI Pattern

Use this pattern when an app needs tenant-specific layout, copy, feature flags,
store state, or service wiring without forking page code for every tenant.

## Source Files

| File                        | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `src/eai.config/default.ts` | Default tenant config, store slices, API paths, storage keys, and layout slots. |
| `src/eai.config/index.ts`   | Maps tenant keys to config objects. Add new tenant configs here.                |
| `src/eai.blocks.tsx`        | Registers app-local or package components that config can reference by name.    |
| `src/app/providers.tsx`     | Provides auth/session context and the EAI config runtime.                       |
| `src/hooks/useResources.ts` | ResourceAPI-backed business data access.                                        |
| `src/hooks/useDocuments.ts` | Document upload, classification, and RAG indexing access.                       |
| `src/hooks/useChat.ts`      | Streaming and non-streaming chat access.                                        |

## Construction Pattern

1. Put tenant-specific data in config: branding, feature flags, API endpoints,
   storage keys, initial store state, and layout slots.
2. Register renderable components in `src/eai.blocks.tsx`.
3. Reference components from config by their registered string name.
4. Bind store paths into component props with `storeBindings`.
5. Hide or show components with JSON-safe `showWhen` conditions.
6. Keep callbacks, React nodes, and live browser behavior in code-level
   overrides, not in config.
7. Keep browser service calls behind template hooks and BFF routes.

## Component Config Shape

Each slot component follows this shape:

```ts
{
  component: 'TaskSummary',
  priority: 10,
  props: {
    title: 'Open tasks',
  },
  storeBindings: [
    { prop: 'tasks', storePath: 'tasks.items' },
    { prop: 'isLoading', storePath: 'tasks.isLoading' },
  ],
  showWhen: { path: 'user.isAuthenticated', equals: true },
}
```

Rules:

- `component` must match a registered component name.
- Lower `priority` renders first.
- `props` are static, tenant-configurable values.
- `storeBindings` map global store paths to component prop paths. Dot notation is
  supported for both sides.
- `showWhen` supports simple `equals`, `notEquals`, `exists`, plus compound
  `and` and `or` conditions.

## Slot Pattern

The template uses slots for predictable app composition:

```ts
layout: {
  header: {
    className: 'bg-white border-b',
    components: [
      { component: 'AppHeader', priority: 1 },
    ],
  },
  middlePane: {
    className: 'flex-1 p-6',
    components: [
      { component: 'TaskSummary', priority: 1 },
      { component: 'TaskList', priority: 2 },
    ],
  },
  rightPane: {
    className: 'hidden w-80 border-l p-4 lg:block',
    components: [
      { component: 'AssistantPanel', priority: 1 },
    ],
  },
}
```

Use `header`, `leftPane`, `middlePane`, and `rightPane` for the starter app.
If a future package exposes canonical zone names, keep the aliasing explicit in
the app rather than mixing unrelated layout vocabularies in one config.

## Store Slice Pattern

Config owns the initial global store shape:

```ts
store: {
  tasks: {
    initialState: {
      items: [],
      selectedId: null,
      isLoading: false,
    },
    persist: true,
  },
  ui: {
    initialState: {
      showWelcome: true,
    },
    persist: false,
  },
}
```

Persist only tenant-safe UI or workflow state. Keep access tokens, direct
service credentials, and raw downstream connection details out of the store.

## Runtime Overrides

Config should stay data-only. Put functions and live React behavior in a wrapper
component and pass them as overrides:

```tsx
const componentOverrides = {
  TaskList: {
    onSelectTask: (taskId: string) => setSelectedTaskId(taskId),
  },
  AssistantPanel: {
    onSendMessage: sendMessage,
  },
};
```

Use overrides for:

- event handlers
- router navigation callbacks
- auth actions
- analytics callbacks
- render props
- React nodes that cannot be serialized safely

## Service Wiring Pattern

The UI config and service hooks should describe one coherent app:

- Business data: `useResources('Task')`
- Documents and RAG: `useDocuments()`
- Chat workflows: `useChat(workflowId, stage)`
- Browser fetch path: `/api/eai/...`
- Browser streaming path: `/api/eai/stream/...`

Do not call PublicAPI, ResourceAPI, Azure services, database backends, blob
stores, search services, or model providers directly from browser components.

## eai-gofer Checklist

When generating or modifying this template, eai-gofer should:

1. Read `src/eai.config/default.ts`, `src/eai.config/index.ts`, and
   `src/eai.blocks.tsx` before adding UI components.
2. Reuse registered components where possible.
3. Add app-local components through `clientBlockExtensions` when no registered
   block fits.
4. Add store slices before adding `storeBindings`.
5. Validate component names and store paths before completion.
6. Put functions and non-serializable values in overrides, not config.
7. Choose `useResources`, `useDocuments`, or `useChat` from the service need.
8. Keep examples public-safe and free of private platform details.
