'use client';

import { useCallback, useMemo } from 'react';
import {
  EAIPlatformClient,
  type RagIndexRequest,
} from '@enterpriseaigroup/platform-sdk';

/**
 * Document processing hook using Platform SDK.
 *
 * @param tenantId - Optional tenant ID override
 *
 * @example
 * ```tsx
 * const { upload, classify, classifyByUrl } = useDocuments();
 *
 * await upload(file, { category: 'permit' });
 * const results = await classify(files);
 * ```
 */
export function useDocuments(tenantId?: string) {
  const resolvedTenantId =
    tenantId || process.env.NEXT_PUBLIC_EAI_TENANT_ID || '';
  const client = useMemo(
    () => new EAIPlatformClient({ tenantId: resolvedTenantId }),
    [resolvedTenantId],
  );

  const upload = useCallback(
    (file: File, metadata?: Record<string, string>) =>
      client.documents.upload(file, metadata),
    [client],
  );

  const classify = useCallback(
    (files: File[]) => client.documents.classify(files),
    [client],
  );

  const classifyByUrl = useCallback(
    (url: string) => client.documents.classifyByUrl(url),
    [client],
  );

  const ragIndex = useCallback(
    (request: string | RagIndexRequest) => client.documents.ragIndex(request),
    [client],
  );

  const getJobStatus = useCallback(
    (jobId: string) => client.documents.getJobStatus(jobId),
    [client],
  );

  return { upload, classify, classifyByUrl, ragIndex, getJobStatus };
}
