/**
 * Platform Module
 *
 * V4 platform-management routes through the app BFF.
 */

import { platformFetch } from '../client';

export type PlatformHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface PlatformRequestOptions {
  method?: PlatformHttpMethod;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export class PlatformModule {
  constructor(private baseUrl: string) {}

  private encode(value: string): string {
    return encodeURIComponent(value);
  }

  private path(path: string, params?: Record<string, unknown>): string {
    const normalized = path.replace(/^\/+/, '');
    const url = new URL(
      `${this.baseUrl}/v4/platform/${normalized}`,
      globalThis.location?.origin || 'http://localhost',
    );
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      );
    }
    return url.pathname + url.search;
  }

  async request(
    path: string,
    options: PlatformRequestOptions = {},
  ): Promise<Response> {
    const hasBody = options.body !== undefined;
    return platformFetch(this.path(path, options.params), {
      method: options.method ?? (hasBody ? 'POST' : 'GET'),
      headers: hasBody
        ? { 'Content-Type': 'application/json', ...options.headers }
        : options.headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  }

  async json<T = Record<string, unknown>>(
    path: string,
    options?: PlatformRequestOptions,
  ): Promise<T> {
    const response = await this.request(path, options);
    return response.json();
  }

  listTenants<T = Record<string, unknown>>(params?: Record<string, unknown>) {
    return this.json<T>('/tenants', { params });
  }

  getTenant<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}`);
  }

  createTenant(body: Record<string, unknown>) {
    return this.request('/tenants', { method: 'POST', body });
  }

  createChildTenant(parentId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(parentId)}/children`, {
      method: 'POST',
      body,
    });
  }

  deleteTenant(tenantId: string) {
    return this.request(`/tenants/${this.encode(tenantId)}/delete`, {
      method: 'POST',
    });
  }

  getTenantResourceMetadata<T = Record<string, unknown>>(
    tenantId: string,
    params?: Record<string, unknown>,
  ) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/resource-metadata`, {
      params,
    });
  }

  upsertTenantResourceMetadata(
    tenantId: string,
    body: Record<string, unknown>,
  ) {
    return this.request(`/tenants/${this.encode(tenantId)}/resource-metadata`, {
      method: 'POST',
      body,
    });
  }

  getTenantUsage<T = Record<string, unknown>>(
    tenantId: string,
    timeframe: string,
  ) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/billing/usage`, {
      params: { timeframe },
    });
  }

  listIndustryDefaults<T = Record<string, unknown>>() {
    return this.json<T>('/industry-defaults');
  }

  listAppCatalog<T = Record<string, unknown>>() {
    return this.json<T>('/app-catalog');
  }

  listCapabilityCatalog<T = Record<string, unknown>>() {
    return this.json<T>('/capabilities/catalog');
  }

  evaluateCapability<T = Record<string, unknown>>(
    body: Record<string, unknown>,
  ) {
    return this.json<T>('/capabilities/evaluate', { method: 'POST', body });
  }

  getCurrentCapabilities<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(
      `/tenants/${this.encode(tenantId)}/capabilities/current`,
    );
  }

  getTenantBilling<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/billing`);
  }

  getTenantBillingCatalog<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/billing/catalog`);
  }

  getTenantBillingUsage<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/billing/usage`);
  }

  runBillingAction(
    tenantId: string,
    action: string,
    body?: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/billing/${this.encode(action)}`,
      { method: 'POST', body: body ?? {} },
    );
  }

  cancelBilling(tenantId: string) {
    return this.request(`/tenants/${this.encode(tenantId)}/billing/cancel`, {
      method: 'DELETE',
    });
  }

  getTenantDashboard<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/dashboard`);
  }

  listTenantChildren<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/children`);
  }

  updateTenantSettings(tenantId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(tenantId)}/settings`, {
      method: 'PATCH',
      body,
    });
  }

  updateTenantLimits(tenantId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(tenantId)}/limits`, {
      method: 'PATCH',
      body,
    });
  }

  suspendTenant(tenantId: string) {
    return this.request(`/tenants/${this.encode(tenantId)}/suspend`, {
      method: 'POST',
    });
  }

  listTenantMembers<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/members`);
  }

  inviteTenantMember(tenantId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(tenantId)}/members/invite`, {
      method: 'POST',
      body,
    });
  }

  updateTenantMemberRoles(
    tenantId: string,
    memberId: string,
    body: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/members/${this.encode(memberId)}/roles`,
      { method: 'PATCH', body },
    );
  }

  removeTenantMember(tenantId: string, memberId: string) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/members/${this.encode(memberId)}`,
      { method: 'DELETE' },
    );
  }

  listTenantRoleDefinitions<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/role-definitions`);
  }

  getTenantManagement<T = Record<string, unknown>>(tenantId: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/management`);
  }

  updateTenantAuthorizedApps(tenantId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(tenantId)}/authorized-apps`, {
      method: 'PATCH',
      body,
    });
  }

  updateTenantPlan(tenantId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(tenantId)}/plan`, {
      method: 'PATCH',
      body,
    });
  }

  listTenantAuditLogs<T = Record<string, unknown>>(
    tenantId: string,
    params?: Record<string, unknown>,
  ) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/audit-logs`, {
      params,
    });
  }

  documentChecklist(
    tenantId: string,
    checklistPath = '',
    options: PlatformRequestOptions = {},
  ) {
    const encodedPath = checklistPath
      .split('/')
      .filter(Boolean)
      .map((part) => this.encode(part))
      .join('/');
    const suffix = encodedPath ? `/${encodedPath}` : '';
    return this.request(
      `/tenants/${this.encode(tenantId)}/document-checklist${suffix}`,
      options,
    );
  }

  provisionUserToTenant(
    tenantId: string,
    userOid: string,
    body?: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/users/${this.encode(userOid)}/provision`,
      { method: 'POST', body: body ?? {} },
    );
  }

  createTenantApp(tenantId: string, body: Record<string, unknown>) {
    return this.request(`/tenants/${this.encode(tenantId)}/apps`, {
      method: 'POST',
      body,
    });
  }

  listAppProvisioningJobs<T = Record<string, unknown>>(
    tenantId: string,
    appKey: string,
  ) {
    return this.json<T>(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/provisioning-jobs`,
    );
  }

  createAppProvisioningJob(
    tenantId: string,
    appKey: string,
    body: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/provisioning-jobs`,
      { method: 'POST', body },
    );
  }

  getAppProvisioningJob<T = Record<string, unknown>>(
    tenantId: string,
    appKey: string,
    jobId: string,
  ) {
    return this.json<T>(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/provisioning-jobs/${this.encode(jobId)}`,
    );
  }

  listAppObjectTypes<T = Record<string, unknown>>(
    tenantId: string,
    appKey: string,
  ) {
    return this.json<T>(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/object-types`,
    );
  }

  createAppObjectType(
    tenantId: string,
    appKey: string,
    body: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/object-types`,
      { method: 'POST', body },
    );
  }

  getAppObjectTypesManifest<T = Record<string, unknown>>(
    tenantId: string,
    appKey: string,
  ) {
    return this.json<T>(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/object-types/manifest`,
    );
  }

  saveAppObjectTypesManifest(
    tenantId: string,
    appKey: string,
    body: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/object-types/manifest`,
      { method: 'PUT', body },
    );
  }

  publishAppObjectTypes(
    tenantId: string,
    appKey: string,
    body?: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/object-types/publish`,
      { method: 'POST', body: body ?? {} },
    );
  }

  updateAppObjectType(
    tenantId: string,
    appKey: string,
    objectTypeName: string,
    body: Record<string, unknown>,
  ) {
    return this.request(
      `/tenants/${this.encode(tenantId)}/apps/${this.encode(appKey)}/object-types/${this.encode(objectTypeName)}`,
      { method: 'PATCH', body },
    );
  }

  getUserMemberships<T = Record<string, unknown>>(
    tenantId: string,
    oid: string,
  ) {
    return this.json<T>(
      `/tenants/${this.encode(tenantId)}/users/${this.encode(oid)}/memberships`,
    );
  }

  getUserByEmail<T = Record<string, unknown>>(tenantId: string, email: string) {
    return this.json<T>(`/tenants/${this.encode(tenantId)}/users/by-email`, {
      params: { email },
    });
  }

  submitSupportContact(body: Record<string, unknown>) {
    return this.request('/support/contact', { method: 'POST', body });
  }

  provisionEntraApp<T = Record<string, unknown>>(body: Record<string, unknown>) {
    return this.json<T>('/provisioning/entra-apps', { method: 'POST', body });
  }

  rotateEntraAppSecret<T = Record<string, unknown>>(
    clientId: string,
    body: Record<string, unknown>,
  ) {
    return this.json<T>(
      `/provisioning/entra-apps/${this.encode(clientId)}/rotate-secret`,
      { method: 'POST', body },
    );
  }

  accountSignup(body: Record<string, unknown>) {
    return this.request('/accounts/signup', { method: 'POST', body });
  }
}
