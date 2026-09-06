import {
  CREDENTIAL_PATTERNS,
  DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH,
  DEFAULT_OBJECTIVE_MAX_LENGTH,
  matchesCredentialPattern,
} from '../../src/handoff/handoff-protocol.constants.js';

describe('handoff protocol constants', () => {
  describe('length limits', () => {
    it('exposes DEFAULT_OBJECTIVE_MAX_LENGTH as 4096', () => {
      expect(DEFAULT_OBJECTIVE_MAX_LENGTH).toBe(4096);
    });

    it('exposes DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH as 2048', () => {
      expect(DEFAULT_ACCEPTANCE_CRITERION_MAX_LENGTH).toBe(2048);
    });
  });

  describe('CREDENTIAL_PATTERNS', () => {
    it('is a non-empty readonly array of RegExp', () => {
      expect(CREDENTIAL_PATTERNS.length).toBeGreaterThan(0);
      for (const pattern of CREDENTIAL_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('matchesCredentialPattern', () => {
    it('detects Bearer tokens', () => {
      expect(matchesCredentialPattern('bearer eyJhbGciOiJIUzI1NiJ9')).toBe(
        true,
      );
    });

    it('detects Bearer tokens case-insensitively', () => {
      expect(matchesCredentialPattern('Bearer abc1234567890')).toBe(true);
    });

    it('detects AWS access key ids', () => {
      expect(matchesCredentialPattern('AKIAIOSFODNN7EXAMPLE')).toBe(true);
    });

    it('detects PEM private key headers', () => {
      expect(
        matchesCredentialPattern('-----BEGIN RSA PRIVATE KEY-----'),
      ).toBe(true);
      expect(matchesCredentialPattern('-----BEGIN PRIVATE KEY-----')).toBe(
        true,
      );
    });

    it('detects connection strings with embedded credentials', () => {
      expect(
        matchesCredentialPattern('postgresql://user:s3cret@localhost:5432/db'),
      ).toBe(true);
    });

    it('detects api_key=value assignments', () => {
      expect(matchesCredentialPattern('api_key=sk-abc12345678')).toBe(true);
    });

    it('detects secret: value assignments', () => {
      expect(matchesCredentialPattern("secret: 'my-secret-value123'")).toBe(
        true,
      );
    });

    it('detects password=value assignments', () => {
      expect(matchesCredentialPattern('password=hunter2hunter')).toBe(true);
    });

    it('detects token=value assignments', () => {
      expect(matchesCredentialPattern('token=ghp_abcdef123456')).toBe(true);
    });

    it('returns false for ordinary prose', () => {
      expect(
        matchesCredentialPattern('This is a sentence about token management'),
      ).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(matchesCredentialPattern('')).toBe(false);
    });

    it('returns false for a short word resembling a keyword', () => {
      expect(matchesCredentialPattern('secret')).toBe(false);
    });
  });
});
