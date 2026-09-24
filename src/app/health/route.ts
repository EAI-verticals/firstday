export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      service: process.env.NEXT_PUBLIC_APP_NAME || 'eai-app-template',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}
