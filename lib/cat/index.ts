// mynclex/lib/cat/index.ts
//
// Public barrel for the CAT engine's pure maths layer. Call sites should
// import from '@/lib/cat', not from the internal files.
//
// This module is deliberately pure: no database access, no clock, no
// randomness. The engine's persistence and item selection live in the
// cat_next_item RPC — see bank-consumption-cat.html §10.6 for the split.

export {
  expectedScore,
  itemInformation,
  estimateAbility,
  readinessProbability,
  PASSING_THETA,
  PRIOR_MEAN,
  PRIOR_SD,
} from './rasch';

export {
  checkTermination,
  bandClearsStandard,
  MIN_ITEMS,
  MAX_ITEMS,
  TIME_LIMIT_SECONDS,
  SE_THRESHOLD,
  CONFIDENCE_Z,
} from './termination';

export type {
  CatResponse,
  AbilityEstimate,
  CatTerminationReason,
  CatVerdict,
  TerminationInput,
  TerminationResult,
} from './types';
