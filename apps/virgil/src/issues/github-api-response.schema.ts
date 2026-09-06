import { z } from 'zod';

export const GitHubUserSchema = z.object({
  login: z.string().min(1),
  id: z.number().int(),
  html_url: z.string().url(),
});

export const GitHubLabelSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
});

export const GitHubMilestoneSchema = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  html_url: z.string().url(),
});

export const GitHubPullRequestRefSchema = z.object({
  url: z.string().url(),
  html_url: z.string().url(),
});

export const GitHubIssueSchema = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.enum(['open', 'closed']),
  state_reason: z.enum(['completed', 'not_planned', 'reopened']).nullable().optional(),
  html_url: z.string().url(),
  user: GitHubUserSchema.nullable().optional(),
  assignee: GitHubUserSchema.nullable().optional(),
  assignees: z.array(GitHubUserSchema).optional(),
  labels: z.array(z.union([GitHubLabelSchema, z.string()])),
  milestone: GitHubMilestoneSchema.nullable().optional(),
  pull_request: GitHubPullRequestRefSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable().optional(),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

export const GitHubIssueCommentSchema = z.object({
  id: z.number().int(),
  body: z.string().nullable().optional(),
  user: GitHubUserSchema.nullable().optional(),
  html_url: z.string().url(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type GitHubIssueComment = z.infer<typeof GitHubIssueCommentSchema>;

export interface GitHubPaginationLinks {
  readonly next?: string;
  readonly prev?: string;
  readonly first?: string;
  readonly last?: string;
}

export function parseLinkHeader(header: string | null): GitHubPaginationLinks {
  if (!header) return {};
  const links: Record<string, string> = {};
  const parts = header.split(',');
  for (const part of parts) {
    const urlMatch = /<([^>]+)>/.exec(part);
    const relMatch = /rel="([^"]+)"/.exec(part);
    if (urlMatch && relMatch) {
      links[relMatch[1]] = urlMatch[1];
    }
  }
  return links;
}
