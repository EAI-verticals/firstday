import { render, screen } from '@testing-library/react';

import Home from './page';
import { getAccessToken } from '@enterpriseaigroup/core/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  resolvePublicApiBaseUrl,
  getRoutingRedirectUrl,
  RoutingResolutionError,
} from '@/lib/platform/session-resolve';

jest.mock('@enterpriseaigroup/core/server', () => ({
  getAccessToken: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('./home-client', () => ({
  HomeClient: () => <div data-testid="home-client">home</div>,
}));

jest.mock('@/lib/platform/session-resolve', () => ({
  RoutingResolutionError: class RoutingResolutionError extends Error {
    statusCode: number;
    responseBody: unknown;

    constructor(message: string, statusCode: number, responseBody: unknown = null) {
      super(message);
      this.name = 'RoutingResolutionError';
      this.statusCode = statusCode;
      this.responseBody = responseBody;
    }
  },
  resolvePublicApiBaseUrl: jest.fn(),
  getRoutingRedirectUrl: jest.fn(),
}));

describe('Home routing bootstrap', () => {
  beforeEach(() => {
    process.env.BASE_URL_PUBLIC_API = 'https://api.test.example.com';
    process.env.EAI_PRODUCT_SLUG = 'eai-app-template';
    process.env.EAI_TENANT_ID = 'tenant-eu';
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => {
        if (key === 'x-forwarded-host') return null;
        if (key === 'host') return 'app.au.example.com';
        return null;
      },
    });
    jest.clearAllMocks();
  });

  it('redirects to the resolved app host when routing requires correction', async () => {
    (getAccessToken as jest.Mock).mockResolvedValue('user-token');
    (resolvePublicApiBaseUrl as jest.Mock).mockResolvedValue({
      baseUrl: 'https://api.eu.example.com',
      routing: { routingMode: 'redirect', status: 'resolved' },
    });
    (getRoutingRedirectUrl as jest.Mock).mockReturnValue('https://app.eu.example.com');

    await Home();

    expect(resolvePublicApiBaseUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'user-token',
        currentAppHost: 'app.au.example.com',
        fallbackBaseUrl: 'https://api.test.example.com',
        product: 'eai-app-template',
      }),
    );
    expect(redirect).toHaveBeenCalledWith('https://app.eu.example.com');
  });

  it('renders the home client when no redirect is required', async () => {
    (getAccessToken as jest.Mock).mockResolvedValue(null);

    render(await Home());

    expect(screen.getByTestId('home-client')).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('renders the home client when routing resolution is blocked', async () => {
    (getAccessToken as jest.Mock).mockResolvedValue('user-token');
    (resolvePublicApiBaseUrl as jest.Mock).mockRejectedValue(
      new RoutingResolutionError('tenant_selection_required', 409, {
        status: 'selection_required',
        userId: 'user-123',
        product: 'eai-app-template',
        productAllowed: false,
        routingMode: 'selection_required',
      }),
    );

    render(await Home());

    expect(screen.getByTestId('home-client')).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
