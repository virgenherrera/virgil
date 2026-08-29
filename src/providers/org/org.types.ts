export interface OrgMember {
  readonly ref: string;
  readonly name: string;
  readonly role: string;
  readonly team: string;
  readonly email?: string;
  readonly slackId?: string;
}

export interface OrgSnapshot {
  readonly members: readonly OrgMember[];
  readonly teamCount: number;
}
