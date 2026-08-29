import type { BriefKind } from "../brief.types.js";

interface ClassifierRule {
  readonly kind: BriefKind;
  readonly pattern: RegExp;
}

const CASCADE: readonly ClassifierRule[] = [
  {
    kind: "risk",
    pattern:
      /\b(risk|danger|sensitive|confidential|privacy|security|vulnerability|threat)\b/i,
  },
  {
    kind: "constraint",
    pattern:
      /\b(must|required|shall|never|forbidden|prohibited|mandatory|constraint|invariant)\b/i,
  },
  {
    kind: "decision",
    pattern:
      /\b(decision|decided|chose|chosen|agreed|selected|adopted)\b/i,
  },
  {
    kind: "glossary",
    pattern:
      /\b(glossary|definition|terminology|means|refers to|defined as)\b/i,
  },
  {
    kind: "open-question",
    pattern:
      /\b(question|open question|pending|to be determined|tbd|to be confirmed|unresolved)\b/i,
  },
];

export function classifySection(title: string, body: string): BriefKind {
  const combined = `${title} ${body}`;

  for (const rule of CASCADE) {
    if (rule.pattern.test(combined)) {
      return rule.kind;
    }
  }

  return "principle";
}
