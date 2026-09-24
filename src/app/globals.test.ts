import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('global document scrolling', () => {
  const globalStyles = readFileSync(
    join(process.cwd(), 'src/app/globals.css'),
    'utf8',
  );

  it('lets long generated workflows extend and scroll the document', () => {
    expect(globalStyles).not.toMatch(
      /(?:html|body)[^{}]*\{[^}]*overflow-hidden/,
    );
    expect(globalStyles).toMatch(/html\s*\{[^}]*h-full/);
    expect(globalStyles).toMatch(/body\s*\{[^}]*min-h-full/);
  });
});
