import { canOpenWorkspaceRole, resolveWorkspaceRole } from './roles';

describe('Firstday workspace roles', () => {
  it('grants privileged views only for exact app role claims', () => {
    expect(resolveWorkspaceRole(['Firstday.Admin'])).toBe('admin');
    expect(resolveWorkspaceRole(['Firstday.Employer'])).toBe('employee');
    expect(resolveWorkspaceRole(['Firstday.Employee'])).toBe('employee');
    expect(resolveWorkspaceRole(['tenant-admin'])).toBe('employee');
    expect(resolveWorkspaceRole(['firstday.admin'])).toBe('employee');
  });

  it('keeps unknown or missing claims in the employee view', () => {
    expect(resolveWorkspaceRole(undefined)).toBe('employee');
    expect(resolveWorkspaceRole('Firstday.Admin')).toBe('employee');
    expect(resolveWorkspaceRole([42, null, {}])).toBe('employee');
  });

  it('uses the highest assigned role', () => {
    expect(
      resolveWorkspaceRole(['Firstday.Employee', 'Firstday.Employer']),
    ).toBe('employee');
    expect(resolveWorkspaceRole(['Firstday.Employer', 'Firstday.Admin'])).toBe(
      'admin',
    );
  });

  it('does not turn a chooser selection into a privileged role', () => {
    expect(canOpenWorkspaceRole('employee', 'employee')).toBe(true);
    expect(canOpenWorkspaceRole('employee', 'admin')).toBe(true);
    expect(canOpenWorkspaceRole('admin', 'employee')).toBe(false);
    expect(canOpenWorkspaceRole('admin', 'employee')).toBe(false);
    expect(canOpenWorkspaceRole('admin', 'admin')).toBe(true);
  });
});
