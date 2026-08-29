interface SummaryRule {
  readonly pattern: RegExp;
  readonly summary: string;
}

const CASCADE: readonly SummaryRule[] = [
  {
    pattern: /privacy|personal data|sensitive|confidential|consent/i,
    summary:
      "Source defines privacy or confidentiality obligations. Treat personal or sensitive data as local-only and cite the source instead of copying raw content.",
  },
  {
    pattern: /password|secret|token|api.?key|credential|certificate/i,
    summary:
      "Source contains credential or secret management guidance. Reference it by source ref without exposing values.",
  },
  {
    pattern: /must|shall|required|mandatory|never|forbidden|prohibited/i,
    summary:
      "Source establishes a mandatory constraint. Follow it and cite the sourceRef when explaining the decision.",
  },
  {
    pattern: /architecture|design|pattern|interface|contract|port|adapter/i,
    summary:
      "Source provides architecture or design guidance. Apply as a project principle and cite the sourceRef.",
  },
];

const MAX_SNIPPET_LENGTH = 200;

export function summarizeSection(body: string): string {
  const compacted = body.replace(/\s+/g, " ").trim();

  for (const rule of CASCADE) {
    if (rule.pattern.test(compacted)) {
      return rule.summary;
    }
  }

  if (compacted.length > MAX_SNIPPET_LENGTH) {
    return compacted.slice(0, MAX_SNIPPET_LENGTH) + "...";
  }

  return compacted;
}
