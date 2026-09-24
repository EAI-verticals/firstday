/**
 * Chat Module
 *
 * SSE streaming and non-streaming chat via /v4/ai/chat/*.
 *
 * CRITICAL field names for v4 chat requests:
 * - message (NOT chat_input)
 * - conversation_id (REQUIRED)
 * - params (REQUIRED, use {} if none)
 */

import type { ChatStreamOptions } from '../types';
import { platformFetch } from '../client';

export class ChatModule {
  constructor(
    private baseUrl: string,
    private streamBaseUrl: string,
    private tenantId: string,
  ) {}

  private chatPath(
    mode: 'send' | 'stream',
    workflowId: string,
    stage: string,
  ): string {
    const streamPath = mode === 'stream' ? '/stream' : '';
    const root = mode === 'stream' ? this.streamBaseUrl : this.baseUrl;
    return `${root}/v4/ai/chat${streamPath}/${this.tenantId}/${workflowId}/${stage}`;
  }

  private requestBody(options: ChatStreamOptions): string {
    const { message, params } = options;
    const conversationId = options.conversationId || crypto.randomUUID();
    const body: Record<string, unknown> = {
      message,
      conversation_id: conversationId,
      params: params || {},
    };
    const optionalFields = [
      'runtime_context',
      'message_history',
      'ai_config',
      'vertical_key',
      'use_context_enrichment',
      'integrations',
      'document_scope',
      'business_request_id',
      'ultimate_parent_id',
      'tags',
      'flags',
      'document_type',
      'documentType',
      'search_context',
      'integration_id',
      'applicability_filter',
      'tools',
      'tool_choice',
    ] as const;

    for (const field of optionalFields) {
      if (options[field] !== undefined) {
        body[field] = options[field];
      }
    }

    return JSON.stringify(body);
  }

  /**
   * Stream a chat response via SSE.
   * Uses the stream proxy path (streamBaseUrl) for proper SSE header handling.
   *
   * @returns ReadableStream of SSE events
   */
  async stream(
    options: ChatStreamOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const { workflowId, stage } = options;
    const url = this.chatPath('stream', workflowId, stage);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this.requestBody(options),
    });

    if (!response.ok || !response.body) {
      const { PlatformError } = await import('../errors');
      throw await PlatformError.fromResponse(response);
    }

    return response.body;
  }

  /**
   * Send a chat message and get a non-streaming response.
   * Uses the standard proxy path (baseUrl).
   */
  async send(options: ChatStreamOptions): Promise<Response> {
    const { workflowId, stage } = options;
    const url = this.chatPath('send', workflowId, stage);

    return platformFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this.requestBody(options),
    });
  }
}
