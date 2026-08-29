export interface ExtractedSection {
  readonly title: string;
  readonly body: string;
  readonly index: number;
}

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;

export function extractSections(text: string): ExtractedSection[] {
  const normalized = text.replace(/\r\n/g, "\n");

  const headings: { title: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = HEADING_REGEX.exec(normalized)) !== null) {
    headings.push({
      title: match[2]!.trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (headings.length > 0) {
    return extractByHeadings(normalized, headings);
  }

  return extractByParagraphs(normalized);
}

function extractByHeadings(
  text: string,
  headings: { title: string; start: number; end: number }[],
): ExtractedSection[] {
  const sections: ExtractedSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    const nextStart = i + 1 < headings.length ? headings[i + 1]!.start : text.length;
    const body = text.slice(heading.end, nextStart).trim();

    if (body.length > 0) {
      sections.push({
        title: heading.title,
        body,
        index: sections.length,
      });
    }
  }

  return sections;
}

function extractByParagraphs(text: string): ExtractedSection[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);

  return paragraphs.map((body, i) => ({
    title: `Section ${i + 1}`,
    body,
    index: i,
  }));
}
