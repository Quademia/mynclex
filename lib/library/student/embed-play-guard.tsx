// mynclex/lib/library/student/embed-play-guard.tsx
//
// Bridge between the embed players (which know when a practice set is
// mid-run) and the read view (which owns the page chrome — back pill,
// breadcrumb, chips — and the beforeunload guard). Each player reports
// its mid-play state by block id; the read view warns before leaving
// while any block is mid-play.
//
// Lives in its own file so the player and the read view can both import
// it without a circular dependency (read-view → read-blocks → player,
// and player → this).

'use client';

import { createContext, useContext } from 'react';

export type EmbedPlayGuard = {
  /** A player reports whether its block is mid-run (started, not finished). */
  setBlockPlaying: (blockId: string, playing: boolean) => void;
};

export const EmbedPlayGuardContext = createContext<EmbedPlayGuard | null>(null);

export function useEmbedPlayGuard(): EmbedPlayGuard | null {
  return useContext(EmbedPlayGuardContext);
}
