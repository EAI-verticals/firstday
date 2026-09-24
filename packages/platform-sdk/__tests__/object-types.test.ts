import { toObjectTypeSlug } from '../src/object-types';
import { resourceRoutesBaseUrl } from '../src/resource-routing';

describe('toObjectTypeSlug', () => {
  // Mirrors the ordered normative vectors in
  // .specify/specs/039-canonical-object-type-routing/evidence/contract-seed-review.json.
  it.each([
    ['FeedItem', 'feed-item', true],
    ['APIKey', 'api-key', true],
    ['HTTPFeedItem', 'http-feed-item', true],
    ['V2FeedItem', 'v2-feed-item', true],
    ['GitHubConnection', 'github-connection', true],
    ['Sent_Post', 'sent-post', false],
    ['  Feed  Item  ', 'feed-item', false],
    ['Draft--Item', 'draft-item', false],
    ['operations', 'operations', false],
    ['', '', false],
    ['---', '', false],
  ])('derives %s as %s (manifest name valid: %s)', (input, expectedSlug) => {
    expect(toObjectTypeSlug(input)).toBe(expectedSlug);
  });

  it('handles consecutive capitals, underscores, spaces, and repeated separators', () => {
    expect(toObjectTypeSlug('APIKey')).toBe('api-key');
    expect(toObjectTypeSlug('Sent_Post')).toBe('sent-post');
    expect(toObjectTypeSlug('  Feed  Item  ')).toBe('feed-item');
    expect(toObjectTypeSlug('Draft--Item')).toBe('draft-item');
  });

  it('keeps routing normalization linear for long untrusted inputs', () => {
    expect(resourceRoutesBaseUrl(`/api/eai${'/'.repeat(20_000)}`)).toBe(
      '/api/eai/v4/data/resources',
    );
    expect(
      toObjectTypeSlug(`${'\t'.repeat(20_000)}FeedItem${' '.repeat(20_000)}`),
    ).toBe('feed-item');
  });
});
