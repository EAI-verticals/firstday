---
sidebar_position: 2
slug: /tutorials/add-ai-chat
---

# Tutorial: Add AI Chat To Your App

Add a streaming AI chat interface to an EAI App Template project through the
template hooks and BFF routes. Browser code should call the local app boundary;
it should not call model providers or downstream platform services directly.

## What You'll Build

- A streaming chat interface using Server-Sent Events.
- Multi-turn conversations with a stable `conversation_id`.
- Document upload and RAG indexing through the template document hook.

## Prerequisites

- A working app project. See [Build a Task Tracker](/docs/tutorials/build-a-task-tracker).
- Authenticated with `eai login`.
- A selected tenant with Object Types seeded to the platform.
- A platform workflow ID supplied by onboarding, tenant configuration, or
  `eai workflow status`.

## Step 1: Understand The Public Boundary

```text
Browser
  -> useChat hook
  -> /api/eai/stream/...
  -> app BFF attaches auth and tenant context
  -> PublicAPI chat route
  -> SSE events stream back to the browser
```

Key concepts:

- **Workflow**: A named AI workflow available to the tenant.
- **Stage**: A step within that workflow, such as `chat`.
- **Conversation**: A stable `conversation_id` used for multi-turn context.

## Step 2: Confirm The Workflow

Use the CLI before wiring UI to the workflow:

```bash
eai workflow status <workflow-key> --tenant <tenant-id>
eai chat send "What can you help me with?" --workflow <workflow-id> --tenant <tenant-id>
```

Store runtime IDs in local or deployment environment configuration, not in
committed source.

## Step 3: Build The Chat Page

Create `src/app/(presentation)/chat/page.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/hooks/useChat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const workflowId = 'task-workflow';
const stage = 'chat';

export default function ChatPage() {
  const { stream } = useChat(workflowId, stage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();

    const userMessage = input.trim();
    if (!userMessage || isStreaming) return;

    setInput('');
    setMessages((current) => [
      ...current,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' },
    ]);
    setIsStreaming(true);

    try {
      const reader = await stream({
        message: userMessage,
        conversationId,
        params: {},
      });

      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        assistantText += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1
              ? { ...message, content: assistantText }
              : message,
          ),
        );
      }
    } catch {
      setMessages((current) =>
        current.map((message, index) =>
          index === current.length - 1
            ? {
                ...message,
                content: 'Sorry, something went wrong. Please try again.',
              }
            : message,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className='flex h-[calc(100vh-4rem)] flex-col'>
      <div className='flex-1 space-y-4 overflow-y-auto p-6'>
        {messages.length === 0 && (
          <div className='text-muted-foreground mt-20 text-center'>
            <h2 className='mb-2 text-xl font-medium'>AI Assistant</h2>
            <p>Ask me anything about this workspace.</p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[80%] rounded-lg p-4 ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground ml-auto'
                : 'bg-muted'
            }`}
          >
            {message.content ||
              (isStreaming && index === messages.length - 1 ? '...' : '')}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className='flex gap-2 border-t p-4'>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='Type your message...'
          className='flex-1 rounded-md border px-3 py-2'
          disabled={isStreaming}
        />
        <button
          type='submit'
          disabled={isStreaming || !input.trim()}
          className='bg-primary rounded-md px-4 py-2 text-white disabled:opacity-50'
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

## Step 4: Add Document Upload For RAG

Create a document upload component that feeds documents into the platform RAG
index. This uses the v4 document workflow, not a standalone blob upload:

```tsx
'use client';

import { useState } from 'react';
import { useDocuments } from '@/hooks/useDocuments';

export function DocumentUploader() {
  const { upload, ragIndex } = useDocuments();
  const [status, setStatus] = useState('');

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('Uploading...');
    const uploadResponse = await upload(file, { category: 'knowledge-source' });
    const uploaded = await uploadResponse.json();
    const documentId =
      uploaded.documentId ||
      uploaded.documents?.[0]?.documentId ||
      uploaded.documents?.[0]?.document_id;

    setStatus('Indexing for RAG...');
    await ragIndex({
      documentId,
      documentScope: 'kb',
    });

    setStatus(`Done. ${file.name} is now available to the workflow.`);
  }

  return (
    <div className='rounded-lg border p-4'>
      <h3 className='mb-2 font-medium'>Upload Knowledge Document</h3>
      <input type='file' onChange={handleUpload} accept='.pdf,.docx,.txt,.md' />
      {status && <p className='text-muted-foreground mt-2 text-sm'>{status}</p>}
    </div>
  );
}
```

When the chat workflow needs the uploaded document, pass document IDs and
business context in `params` or `runtime_context`. The workflow should answer
from indexed document context, not from a raw storage URL. For the full decision
tree, see [V4 Documents And Files](../platform/documents-and-files.md).

## Step 5: Wire It Into Config

Add the chat link through a normal registered component and the template slot
shape:

```ts
layout: {
  leftPane: {
    components: [
      {
        component: "NavLink",
        priority: 10,
        props: { href: "/chat", label: "AI Chat" },
      },
    ],
  },
}
```

## Step 6: Test It

```bash
eai dev
```

1. Navigate to `http://localhost:3000/chat`.
2. Send a message and confirm the response streams back.
3. Upload a document and ask a question that should use that document context.

You can also smoke test from the CLI:

```bash
eai chat send "What can you help me with?" --workflow <workflow-id>
eai chat stream "Summarise the uploaded documents" --workflow <workflow-id>
```

## What You Learned

- How to call chat through `useChat`.
- How to keep streaming behind `/api/eai/stream/...`.
- How to use `conversation_id` for multi-turn context.
- How to upload and index documents through `useDocuments`.

## Next Steps

- [EAI Service Patterns](/docs/platform/eai-service-patterns) — Choose resource,
  document, chat, and PublicAPI patterns.
- [Deploy An EAI App](/docs/tutorials/deploy-to-azure) — Ship the app using
  your organization's approved deployment path.
