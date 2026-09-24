import { NextRequest } from 'next/server';
import { handleEaiProxyRequest, type RouteContext } from './handler';

export async function GET(request: NextRequest, context: RouteContext) {
  return handleEaiProxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleEaiProxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleEaiProxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleEaiProxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleEaiProxyRequest(request, context);
}
