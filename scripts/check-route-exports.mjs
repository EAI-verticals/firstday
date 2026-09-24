#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = process.cwd();
const appRoot = path.join(projectRoot, 'src', 'app');

const ALLOWED_EXPORTS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolutePath));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(absolutePath);
    }
  }

  return files;
}

function hasExportModifier(node) {
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function collectBindingNames(name, names = []) {
  if (ts.isIdentifier(name)) {
    names.push(name.text);
    return names;
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, names);
      }
    }
  }

  return names;
}

function collectNamedExports(exportClause) {
  if (!exportClause || !ts.isNamedExports(exportClause)) {
    return [];
  }

  return exportClause.elements.map((element) => element.name.text);
}

function collectInvalidExports(sourceFile) {
  const invalid = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement)) {
      const exportName = statement.name?.text ?? '(anonymous)';
      if (!ALLOWED_EXPORTS.has(exportName)) {
        invalid.push(exportName);
      }
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const exportName of collectBindingNames(declaration.name)) {
          if (!ALLOWED_EXPORTS.has(exportName)) {
            invalid.push(exportName);
          }
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      for (const exportName of collectNamedExports(statement.exportClause)) {
        if (!ALLOWED_EXPORTS.has(exportName)) {
          invalid.push(exportName);
        }
      }
      continue;
    }

    if (hasExportModifier(statement)) {
      invalid.push(statement.getText(sourceFile).split('\n', 1)[0]?.trim() || '(unsupported export)');
    }
  }

  return invalid;
}

async function main() {
  const routeFiles = await walk(appRoot);
  const violations = [];

  for (const routeFile of routeFiles) {
    const contents = await readFile(routeFile, 'utf8');
    const sourceFile = ts.createSourceFile(routeFile, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const invalid = collectInvalidExports(sourceFile);
    if (invalid.length > 0) {
      violations.push({
        routeFile: path.relative(projectRoot, routeFile),
        invalid: [...new Set(invalid)].sort(),
      });
    }
  }

  if (violations.length === 0) {
    console.log('All App Router route.ts exports are valid.');
    return;
  }

  console.error('Invalid exports found in App Router route.ts files.');
  console.error('Move reusable helpers, dependency interfaces, and test seams into a sibling handler.ts or lib module.');
  for (const violation of violations) {
    console.error(`- ${violation.routeFile}: ${violation.invalid.join(', ')}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
