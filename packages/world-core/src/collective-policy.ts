export interface CollectivePolicy {
  version: 1;
  campaign: string;
  arm: 'A' | 'B';
  shortRounds: number;
  shortBudgets: { ordinary: number; world: number; development: number };
  tokens: { short: number; total: number; output: number };
  contextCharacters: number;
  maxDecisionWait: number;
  reconsiderAfter: number;
  coordinationInterval: number;
}
export interface CollectiveIntent {
  goal: string;
  reason: string;
  progress: string;
  next: string;
  pause: string;
  updatedAt: number;
}
export interface CollectiveMember {
  intent: CollectiveIntent | null;
  group: string;
  species: 'human';
  tendencies: {
    curiosity: number;
    risk: number;
    social: number;
    comfort: number;
  };
  trust: Record<string, number>;
  knownAbilities: string[];
  commitments: Record<
    string,
    { response: string; reason: string; tick: number }
  >;
  received: { tick: number; source: string; subject: string; text: string }[];
  lastSocial: number;
  lastProgress: number;
  updates: { tick: number; reason: string; evidence: string }[];
}
