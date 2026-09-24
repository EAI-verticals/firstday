/**
 * Platform SDK Client
 *
 * Factory class providing typed access to platform API modules.
 * Uses BFF proxy paths by default — tokens are injected server-side.
 */

import { PlatformError } from './errors';
import { ResourcesModule } from './modules/resources';
import { ChatModule } from './modules/chat';
import { DocumentsModule } from './modules/documents';
import { UsersModule } from './modules/users';
import { AuthModule } from './modules/auth';
import { PlatformModule } from './modules/platform';

export interface PlatformClientConfig {
  /** Tenant ID for all requests. */
  tenantId: string;
  /** Base URL for standard API calls. Defaults to '/api/eai'. */
  baseUrl?: string;
  /**
   * Base URL for SSE streaming (chat.stream).
   * Defaults to '/api/eai/stream'.
   * Separate from baseUrl because SSE requires explicit headers
   * and must bypass the standard proxy's content-encoding stripping.
   */
  streamBaseUrl?: string;
}

export class EAIPlatformClient {
  readonly tenantId: string;
  readonly baseUrl: string;
  readonly streamBaseUrl: string;

  private _resources?: ResourcesModule;
  private _chat?: ChatModule;
  private _documents?: DocumentsModule;
  private _users?: UsersModule;
  private _auth?: AuthModule;
  private _platform?: PlatformModule;
  constructor(config: PlatformClientConfig) {
    const appBasePath = (process.env.NEXT_PUBLIC_APP_BASE_PATH ?? '').replace(
      /\/+$/,
      '',
    );
    this.tenantId = config.tenantId;
    this.baseUrl = config.baseUrl || `${appBasePath}/api/eai`;
    this.streamBaseUrl =
      config.streamBaseUrl || `${appBasePath}/api/eai/stream`;
  }

  /** CRUD operations through the canonical v4 resource routing owner. */
  get resources(): ResourcesModule {
    if (!this._resources) {
      this._resources = new ResourcesModule(this.baseUrl, this.tenantId);
    }
    return this._resources;
  }

  /** Chat streaming and messaging via /v4/ai/chat/* */
  get chat(): ChatModule {
    if (!this._chat) {
      this._chat = new ChatModule(
        this.baseUrl,
        this.streamBaseUrl,
        this.tenantId,
      );
    }
    return this._chat;
  }

  /** Document upload, classification, and indexing via /v4/data/documents/* */
  get documents(): DocumentsModule {
    if (!this._documents) {
      this._documents = new DocumentsModule(this.baseUrl, this.tenantId);
    }
    return this._documents;
  }

  /** User provisioning and profile management via /v4/identity/* */
  get users(): UsersModule {
    if (!this._users) {
      this._users = new UsersModule(this.baseUrl);
    }
    return this._users;
  }

  /** Auth information via /v4/identity/* */
  get auth(): AuthModule {
    if (!this._auth) {
      this._auth = new AuthModule(this.baseUrl);
    }
    return this._auth;
  }

  /** Platform management helpers via /v4/platform/* */
  get platform(): PlatformModule {
    if (!this._platform) {
      this._platform = new PlatformModule(this.baseUrl);
    }
    return this._platform;
  }
}

/**
 * Helper: make a fetch request and throw PlatformError on non-2xx responses.
 */
export async function platformFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw await PlatformError.fromResponse(response);
  }
  return response;
}
