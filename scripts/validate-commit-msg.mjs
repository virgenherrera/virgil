#!/usr/bin/env node
/**
 * Validates a commit message subject line against Virgil's Conventional
 * Commits contract (see AGENTS.md):
 *
 *   <type>: <title>
 *
 * where `type` is one of feat|fix|chore|task|spike|release, the subject is
 * lowercase, has no trailing period, and is at most 72 characters.
 *
 * Invoked by `.husky/commit-msg` as: node scripts/validate-commit-msg.mjs "$1"
 */
import { readFileSync } from 'node:fs';

const COMMIT_TYPES = ['feat', 'fix', 'chore', 'task', 'spike', 'release'];
const MAX_SUBJECT_LENGTH = 72;
const COMMIT_SUBJECT_PATTERN = new RegExp(`^(${COMMIT_TYPES.join('|')}): [a-z0-9].*$`);

const [, , commitMessageFilePath] = process.argv;

if (!commitMessageFilePath) {
  console.error('validate-commit-msg: missing commit message file path argument.');
  process.exit(1);
}

const rawMessage = readFileSync(commitMessageFilePath, 'utf-8');
const subjectLine = rawMessage.split('\n')[0].trim();

/**
 * @param {string} reason
 * @returns {never}
 */
function fail(reason) {
  console.error(`Invalid commit message: ${reason}`);
  console.error(`  Subject: "${subjectLine}"`);
  console.error(
    `  Expected format: "<type>: <title>" (type: ${COMMIT_TYPES.join('|')}; lowercase; no trailing period; max ${MAX_SUBJECT_LENGTH} chars).`,
  );
  process.exit(1);
}

if (subjectLine.length === 0) {
  fail('subject line is empty');
}

if (subjectLine.length > MAX_SUBJECT_LENGTH) {
  fail(`subject line exceeds ${MAX_SUBJECT_LENGTH} characters (${subjectLine.length})`);
}

if (subjectLine.endsWith('.')) {
  fail('subject line must not end with a trailing period');
}

if (subjectLine !== subjectLine.toLowerCase()) {
  fail('subject line must be lowercase');
}

if (!COMMIT_SUBJECT_PATTERN.test(subjectLine)) {
  fail(`subject line does not match "<type>: <title>" (type: ${COMMIT_TYPES.join('|')})`);
}

process.exit(0);
