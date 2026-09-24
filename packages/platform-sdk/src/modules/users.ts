/**
 * Users Module
 *
 * User provisioning and profile management via /v4/identity/*.
 */

import { platformFetch } from '../client';

export class UsersModule {
  constructor(private baseUrl: string) {}

  /** List tenant memberships available to the current user. */
  async listTenants<T = Record<string, unknown>>(): Promise<T> {
    const response = await platformFetch(`${this.baseUrl}/v4/identity/tenants`);
    return response.json();
  }

  /** Read the current custom user profile. */
  async getCustomUser<T = Record<string, unknown>>(): Promise<T> {
    const response = await platformFetch(
      `${this.baseUrl}/v4/identity/custom-user/me`,
    );
    return response.json();
  }

  /** Resolve product session routing for a direct app login. */
  async resolveSession<T = Record<string, unknown>>(
    request: Record<string, unknown>,
  ): Promise<T> {
    const response = await platformFetch(
      `${this.baseUrl}/v4/identity/session/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    return response.json();
  }

  /**
   * Self-provision the current user to a tenant.
   * tenant_id is REQUIRED.
   */
  async provisionMe(tenantId: string): Promise<Response> {
    return platformFetch(`${this.baseUrl}/v4/identity/me/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
  }

  /** Update the current user's profile. */
  async updateProfile(data: Record<string, unknown>): Promise<Response> {
    return platformFetch(`${this.baseUrl}/v4/identity/me/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  /** Remove the current user's membership from a tenant. */
  async deprovision(tenantId: string): Promise<Response> {
    return platformFetch(
      `${this.baseUrl}/v4/identity/tenants/${encodeURIComponent(tenantId)}/membership`,
      {
        method: 'DELETE',
      },
    );
  }
}
