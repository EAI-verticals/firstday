import {
  hasSubmissionSession,
  setSubmissionSession,
} from './submission-session';

describe('anonymous generated workflow submission session', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      EAI_GENERATED_WORKFLOW_SESSION_SECRET: 's'.repeat(48),
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('binds an HttpOnly cookie to one submission and workflow digest', () => {
    const set = jest.fn();
    setSubmissionSession(
      { cookies: { set } } as never,
      'submission-1',
      `sha256:${'a'.repeat(64)}`,
    );
    const cookie = set.mock.calls[0][0] as {
      name: string;
      value: string;
      httpOnly: boolean;
      sameSite: string;
    };
    const request = {
      cookies: {
        get: () => ({ value: cookie.value }),
      },
    } as never;

    expect(cookie).toMatchObject({
      name: expect.stringMatching(
        /^eai_generated_workflow_submission_[A-Za-z0-9_-]{43}$/,
      ),
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(
      hasSubmissionSession(request, 'submission-1', `sha256:${'a'.repeat(64)}`),
    ).toBe(true);
    expect(
      hasSubmissionSession(request, 'submission-2', `sha256:${'a'.repeat(64)}`),
    ).toBe(false);
    expect(
      hasSubmissionSession(request, 'submission-1', `sha256:${'b'.repeat(64)}`),
    ).toBe(false);
  });

  it('keeps concurrent submission capabilities isolated by cookie name', () => {
    const cookies = new Map<string, string>();
    const response = {
      cookies: {
        set: (cookie: { name: string; value: string }) => {
          cookies.set(cookie.name, cookie.value);
        },
        delete: (name: string) => {
          cookies.delete(name);
        },
      },
    } as never;
    const request = {
      cookies: {
        get: (name: string) => {
          const value = cookies.get(name);
          return value ? { value } : undefined;
        },
        getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      },
    } as never;
    const workflowDigest = `sha256:${'a'.repeat(64)}`;

    setSubmissionSession(response, 'submission-1', workflowDigest, request);
    setSubmissionSession(response, 'submission-2', workflowDigest, request);

    expect(cookies.size).toBe(2);
    expect(hasSubmissionSession(request, 'submission-1', workflowDigest)).toBe(
      true,
    );
    expect(hasSubmissionSession(request, 'submission-2', workflowDigest)).toBe(
      true,
    );
    expect(hasSubmissionSession(request, 'submission-3', workflowDigest)).toBe(
      false,
    );
  });

  it('bounds active submission cookies without removing the newest forms', () => {
    const cookies = new Map<string, string>();
    const response = {
      cookies: {
        set: (cookie: { name: string; value: string }) => {
          cookies.set(cookie.name, cookie.value);
        },
        delete: (name: string) => {
          cookies.delete(name);
        },
      },
    } as never;
    const request = {
      cookies: {
        get: (name: string) => {
          const value = cookies.get(name);
          return value ? { value } : undefined;
        },
        getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      },
    } as never;
    const workflowDigest = `sha256:${'a'.repeat(64)}`;

    for (let index = 1; index <= 10; index += 1) {
      setSubmissionSession(
        response,
        `submission-${index}`,
        workflowDigest,
        request,
      );
    }

    expect(cookies.size).toBe(8);
    expect(hasSubmissionSession(request, 'submission-10', workflowDigest)).toBe(
      true,
    );
    expect(hasSubmissionSession(request, 'submission-1', workflowDigest)).toBe(
      false,
    );
  });
});
