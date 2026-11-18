/**
 * AXIOM Forge glyphs: original, drawn on a 16-unit grid with a 1.5 stroke. Each encodes its area:
 * the overview is the AXIOM mark, context is a lens over a stack, activity is a stationed trace,
 * review is a split hunk, models is a fork with a dashed backup path, proof is a ledger with a tick.
 */
import type { ReactNode } from 'react';

const Svg = ({ children, label }: { children: ReactNode; label?: string }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
    {children}
  </svg>
);

export const MarkGlyph = () => (
  <Svg>
    <path d="M8 2 13.5 13.5h-11Z" />
    <path d="M5.4 10h5.2" stroke="var(--ax-act)" />
  </Svg>
);
export const WorkspaceGlyph = () => (
  <Svg>
    <path d="M2.5 3.5h11v6h-6l-3 2.5v-2.5h-2z" />
    <path d="M5 6.5h6" />
  </Svg>
);
export const ContextGlyph = () => (
  <Svg>
    <path d="M2.5 4h7M2.5 7h5M2.5 10h4" />
    <circle cx="11" cy="10" r="2.5" />
    <path d="m12.8 11.8 1.7 1.7" />
  </Svg>
);
export const ActivityGlyph = () => (
  <Svg>
    <path d="M4 2v12" />
    <circle cx="4" cy="4" r="1.3" fill="currentColor" />
    <circle cx="4" cy="8.5" r="1.3" fill="currentColor" />
    <path d="M7 4h6.5M7 8.5h4.5M7 12.5h5.5" />
  </Svg>
);
export const ReviewGlyph = () => (
  <Svg>
    <path d="M2.5 3h11v10h-11z" />
    <path d="M8 3v10" />
    <path d="M4.2 6.5h2M4.2 9.5h2M10.8 5.5v2M9.8 6.5h2" />
  </Svg>
);
export const ModelsGlyph = () => (
  <Svg>
    <circle cx="3.5" cy="8" r="1.6" />
    <path d="M5.1 8H8l3-3.5h2" />
    <path d="M8 8l3 3.5h2" strokeDasharray="1.6 1.6" />
  </Svg>
);
export const ProofGlyph = () => (
  <Svg>
    <path d="M3 2.5h8l2 2v9H3z" />
    <path d="M5.5 6h5M5.5 8.5h3" />
    <path d="m6 11.2 1.3 1.2 2.6-2.6" />
  </Svg>
);
export const ExpandGlyph = () => (
  <Svg>
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </Svg>
);
export const FileGlyph = () => (
  <Svg>
    <path d="M4 2h5.5L12 4.5V14H4z" />
    <path d="M9.5 2v2.5H12" />
  </Svg>
);
