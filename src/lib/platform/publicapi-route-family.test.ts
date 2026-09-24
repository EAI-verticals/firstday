import {
  resolvePublicApiRoutePath,
  UnsupportedPublicApiRouteError,
} from './publicapi-route-family';

describe('publicApi route-family resolver', () => {
  it('HP001 forwards v4 PublicAPI paths without legacy translation', () => {
    expect(resolvePublicApiRoutePath('/v4/identity/me')).toBe(
      'v4/identity/me',
    );
    expect(resolvePublicApiRoutePath('v4/data/resources/tenant-a/application')).toBe(
      'v4/data/resources/tenant-a/application',
    );
    expect(resolvePublicApiRoutePath('v4/ai/chat/tenant-a/wf/chat?debug=1')).toBe(
      'v4/ai/chat/tenant-a/wf/chat?debug=1',
    );
  });

  it('BP001 rejects retired PublicAPI route families', () => {
    expect(() =>
      resolvePublicApiRoutePath('v3/orchestrate'),
    ).toThrow(UnsupportedPublicApiRouteError);
    expect(() => resolvePublicApiRoutePath('v1/users/me')).toThrow(
      UnsupportedPublicApiRouteError,
    );
  });
});
