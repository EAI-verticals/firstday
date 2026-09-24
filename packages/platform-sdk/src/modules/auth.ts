/**
 * Auth Module
 *
 * Authentication information via /v4/identity/*.
 */

import type { EntraUser } from '../types';
import { platformFetch } from '../client';

export class AuthModule {
  constructor(private baseUrl: string) {}

  /** Get the current authenticated user's information. */
  async me(): Promise<EntraUser> {
    const response = await platformFetch(`${this.baseUrl}/v4/identity/me`);
    return response.json();
  }
}
