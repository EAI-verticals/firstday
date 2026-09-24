const assert = require('node:assert/strict');
const test = require('node:test');

const moderation = require('../scripts/issue-attachment-moderation.cjs');

test('detects unsafe GitHub issue attachment URLs', () => {
  assert.deepEqual(
    moderation.findUnsafeAttachments(
      '[fix](https://github.com/user-attachments/files/29783695/eai_fix_script.zip)'
    ),
    [
      {
        extension: '.zip',
        url: 'https://github.com/user-attachments/files/29783695/eai_fix_script.zip',
      },
    ]
  );
});

test('ignores safe image attachments', () => {
  assert.deepEqual(
    moderation.findUnsafeAttachments(
      '![screenshot](https://github.com/user-attachments/files/29783695/screenshot.png)'
    ),
    []
  );
});

test('deletes unsafe issue comments from unknown users', () => {
  const plan = moderation.buildModerationPlan({
    eventName: 'issue_comment',
    issue: { number: 188 },
    comment: {
      id: 4911414669,
      node_id: 'IC_kwDORh24NM8AAAABJL49jQ',
      author_association: 'NONE',
      body: '[eai_fix_script.zip](https://github.com/user-attachments/files/29783695/eai_fix_script.zip)',
    },
  });

  assert.equal(plan.action, 'delete-comment');
  assert.equal(plan.commentId, 4911414669);
  assert.equal(plan.reason, 'unsafe_issue_comment_attachment');
});

test('scrubs unsafe issue-body attachment links', () => {
  const plan = moderation.buildModerationPlan({
    eventName: 'issues',
    issue: {
      number: 188,
      author_association: 'NONE',
      body: 'Please run [installer](https://github.com/user-attachments/files/2/installer.exe)',
    },
  });

  assert.equal(plan.action, 'scrub-issue-body');
  assert.equal(plan.reason, 'unsafe_issue_body_attachment');
  assert.equal(plan.sanitizedBody, 'Please run [removed unsafe attachment: .exe]');
  assert.match(moderation.warningBody(plan), /do not open unsolicited ZIPs/);
});

test('does not moderate trusted maintainer comments', () => {
  const plan = moderation.buildModerationPlan({
    eventName: 'issue_comment',
    issue: { number: 188 },
    comment: {
      id: 1,
      node_id: 'node',
      author_association: 'MEMBER',
      body: '[debug.zip](https://github.com/user-attachments/files/1/debug.zip)',
    },
  });

  assert.equal(plan.action, 'skip');
  assert.equal(plan.reason, 'trusted_author');
});

test('skips pull request comments', () => {
  const plan = moderation.buildModerationPlan({
    eventName: 'issue_comment',
    issue: { number: 10, pull_request: {} },
    comment: {
      author_association: 'NONE',
      body: '[fix.zip](https://github.com/user-attachments/files/1/fix.zip)',
    },
  });

  assert.deepEqual(plan, { action: 'skip', reason: 'not_an_issue' });
});
