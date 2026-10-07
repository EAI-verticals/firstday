export type WorkspaceRole = 'employee' | 'admin';

/** Only these app-specific Entra roles can unlock privileged workspaces. */
export function resolveWorkspaceRole(claims: unknown): WorkspaceRole {
  if (!Array.isArray(claims)) return 'employee';
  const roles = claims.filter(
    (claim): claim is string => typeof claim === 'string',
  );
  if (roles.includes('Firstday.Admin')) return 'admin';
  return 'employee';
}

/** A chooser selection never grants an app role. */
export function canOpenWorkspaceRole(
  selected: WorkspaceRole,
  assigned: WorkspaceRole,
): boolean {
  return selected === 'employee' || selected === assigned;
}
