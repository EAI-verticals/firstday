import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { objectTypes } from '@/eai.config/object-types';
import { seedObjectTypes } from '@/lib/platform/seed-object-types';
import { summarizeTenantStorageProvisioning } from '@/lib/platform/storage-provisioning';

export const dynamic = 'force-dynamic';

/**
 * POST /api/eai/seed
 *
 * Seeds object types from eai.config to Configurator via PublicAPI.
 * Protected by auth — requires authenticated user.
 *
 * Request body:
 * {
 *   tenantKey: string;  // Key in objectTypes map (e.g., 'template')
 *   tenantId: string;   // Configurator tenant record ID (from TENANT_*_ID env var)
 * }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tenantKey, tenantId } = await request.json();

    if (!tenantKey || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required fields: tenantKey, tenantId' },
        { status: 400 },
      );
    }

    const results = await seedObjectTypes(tenantKey, tenantId);
    const tenantTypes =
      objectTypes[tenantKey as keyof typeof objectTypes] || [];
    const provisioning = summarizeTenantStorageProvisioning(
      tenantKey,
      tenantTypes,
    );

    return NextResponse.json({ results, provisioning });
  } catch (error) {
    console.error('[Seed] Failed:', error);
    return NextResponse.json(
      {
        error: 'Seeding failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
