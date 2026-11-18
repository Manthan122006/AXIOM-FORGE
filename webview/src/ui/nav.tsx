import { createContext, useContext, type ReactNode } from 'react';
import { ActivityGlyph, ContextGlyph, MarkGlyph, ModelsGlyph, ProofGlyph, ReviewGlyph, WorkspaceGlyph } from './icons';

/** The seven product areas, named by what the user does there. */
export type ViewId = 'overview' | 'workspace' | 'context' | 'activity' | 'review' | 'models' | 'proof';

export const VIEWS: Array<{ id: ViewId; label: string; hint: string; glyph: () => ReactNode }> = [
  { id: 'overview', label: 'Overview', hint: 'Workspace health, recent runs and quick actions', glyph: MarkGlyph },
  { id: 'workspace', label: 'Task', hint: 'Describe a change and follow the run', glyph: WorkspaceGlyph },
  { id: 'context', label: 'Context', hint: 'Which files the agent was given, and why', glyph: ContextGlyph },
  { id: 'activity', label: 'Activity', hint: 'Every tool call, file and duration of each run', glyph: ActivityGlyph },
  { id: 'review', label: 'Review', hint: 'Accept or reject proposed changes, hunk by hunk', glyph: ReviewGlyph },
  { id: 'models', label: 'Models', hint: 'Primary and backup model, failures and fallback', glyph: ModelsGlyph },
  { id: 'proof', label: 'Proof', hint: 'Commands that ran, exit codes and test results', glyph: ProofGlyph },
];

export interface Nav {
  view: ViewId;
  go: (v: ViewId, opts?: { receiptId?: string }) => void;
  receiptId: string | null;
  /** Prefill the task box (examples, quick actions). */
  draft: (text: string) => void;
}
export const NavContext = createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside NavContext');
  return n;
}
