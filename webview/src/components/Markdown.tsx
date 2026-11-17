import { memo, type ReactNode } from 'react';

/**
 * Tiny, safe markdown subset for assistant text: fenced code, inline code, **bold**, bullet lists,
 * paragraphs. Builds React elements (never innerHTML), so model output can't inject markup.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith('`') ? <code key={`${key}-${i++}`}>{tok.slice(1, -1)}</code> : <strong key={`${key}-${i++}`}>{tok.slice(2, -2)}</strong>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      const body = part.replace(/^[\w+-]*\n/, '');
      blocks.push(
        <pre key={`c${pi}`}>
          <code>{body.replace(/\n$/, '')}</code>
        </pre>,
      );
      return;
    }
    const paras = part.split(/\n{2,}/);
    paras.forEach((p, i) => {
      const lines = p.split('\n').filter((l) => l.trim() !== '');
      if (!lines.length) return;
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        blocks.push(
          <ul key={`l${pi}-${i}`}>
            {lines.map((l, j) => (
              <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${pi}-${i}-${j}`)}</li>
            ))}
          </ul>,
        );
      } else {
        blocks.push(<p key={`p${pi}-${i}`}>{inline(lines.join('\n'), `${pi}-${i}`)}</p>);
      }
    });
  });
  return <>{blocks}</>;
});
