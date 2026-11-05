import type {
  PetitionCategory,
  PetitionSource,
  PetitionStatus,
  PetitionVoteValue,
} from './limits.js';

export interface PetitionInput {
  id: string;
  category: PetitionCategory;
  title: string;
  body: string;
  name: string;
  gameVersion: string;
  source: PetitionSource;
}

export interface PetitionDoc extends PetitionInput {
  createdAt: string;
  status: PetitionStatus;
}

export interface PetitionVote {
  petitionId: string;
  voterId: string;
  value: PetitionVoteValue;
}

/** Petition plus aggregated score for the UI. */
export interface PetitionCard extends PetitionDoc {
  score: number;
  up: number;
  down: number;
  /** This browser's vote, or 0 if none / cleared. */
  myVote: PetitionVoteValue;
}
