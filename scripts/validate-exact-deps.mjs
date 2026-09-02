#!/usr/bin/env node
/**
 * Rejects floating version specifiers (^, ~, >=, >, <=, <, "*", "latest") in
 * every "packages/<pkg>/package.json" dependencies and devDependencies field.
 *
 * The pnpm `catalog:` protocol is treated as exact: it resolves to a version
 * pinned once in `pnpm-workspace.yaml#catalog`, which is itself expected to
 * hold exact versions.
 *
 * Must be run from the workspace root (invoked via the root `package.json`
 * `validate:exact-deps` script).
 */
import { globSync, readFileSync } from 'node:fs';

const FLOATING_PREFIX_PATTERN = /^[\^~<>]/;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isFloatingSpec(spec) {
  if (typeof spec !== 'string' || spec.length === 0) {
    return true;
  }

  if (spec.startsWith('catalog:')) {
    return false;
  }

  if (spec === '*' || spec.toLowerCase() === 'latest') {
    return true;
  }

  return FLOATING_PREFIX_PATTERN.test(spec);
}

/**
 * @param {string} manifestPath
 * @returns {string[]}
 */
function validateManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const violations = [];

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];

    if (!dependencies) {
      continue;
    }

    for (const [name, spec] of Object.entries(dependencies)) {
      if (isFloatingSpec(spec)) {
        violations.push(`${manifestPath}: ${field}["${name}"] = "${spec}"`);
      }
    }
  }

  return violations;
}

const manifestPaths = globSync('packages/*/package.json').sort();

if (manifestPaths.length === 0) {
  console.error('Exact dependency-spec validation found no packages/*/package.json files.');
  process.exit(1);
}

const violations = manifestPaths.flatMap(validateManifest);

if (violations.length > 0) {
  console.error('Exact dependency-spec validation failed. Floating version specifiers found:\n');

  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }

  console.error(
    '\nAll dependencies must use exact versions (no ^, ~, >=, >, <=, <, *, "latest").',
  );
  process.exit(1);
}

console.log(
  `Exact dependency-spec validation passed for ${manifestPaths.length} package manifest(s).`,
);
