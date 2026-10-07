import { NextResponse } from 'next/server';
import { getOnboardingRuntime } from '@/lib/onboarding/runtime';

export const dynamic = 'force-dynamic';
export function GET(): NextResponse {
  return NextResponse.json(getOnboardingRuntime(process.env), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
