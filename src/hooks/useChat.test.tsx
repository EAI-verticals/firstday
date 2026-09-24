import { renderHook } from '@testing-library/react';

import { useChat } from './useChat';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useChat', () => {
  const originalTenantId = process.env.NEXT_PUBLIC_EAI_TENANT_ID;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    if (originalTenantId === undefined) {
      delete process.env.NEXT_PUBLIC_EAI_TENANT_ID;
    } else {
      process.env.NEXT_PUBLIC_EAI_TENANT_ID = originalTenantId;
    }
  });

  it('uses NEXT_PUBLIC_EAI_TENANT_ID for chat sends when no tenant override is passed', async () => {
    process.env.NEXT_PUBLIC_EAI_TENANT_ID = 'env-tenant';

    const { result } = renderHook(() => useChat('workflow-a', 'chat'));
    await result.current.send({
      message: 'hello',
      conversationId: 'conversation-a',
      params: {},
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/ai/chat/env-tenant/workflow-a/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'hello',
          conversation_id: 'conversation-a',
          params: {},
        }),
      },
    );
  });

  it('prefers an explicit tenant override over NEXT_PUBLIC_EAI_TENANT_ID', async () => {
    process.env.NEXT_PUBLIC_EAI_TENANT_ID = 'env-tenant';

    const { result } = renderHook(() =>
      useChat('workflow-a', 'chat', 'explicit-tenant'),
    );
    await result.current.send({
      message: 'hello',
      conversationId: 'conversation-a',
      params: {},
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/ai/chat/explicit-tenant/workflow-a/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'hello',
          conversation_id: 'conversation-a',
          params: {},
        }),
      },
    );
  });
});
