import { memo } from 'react';
import type { ContextReceipt, RelevanceCategory } from '../../../src/shared/contracts';

const CAT: Record<RelevanceCategory, string> = {
  explicit_mention: 'mentioned',
  selection: 'selection',
  implementation: 'code',
  definition: 'definition',
  dependency: 'import',
  test: 'test',
  documentation: 'docs',
  configuration: 'config',
};
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The Context Receipt ledger: what the agent was given, why, what was left out, and the budget. */
export const Receipt = memo(function Receipt({ receipt }: { receipt: ContextReceipt }) {
  const max = Math.max(...receipt.selected.map((s) => s.score), 1);
  const pct = Math.min(100, Math.round((receipt.budget.usedTokens / receipt.budget.limitTokens) * 100));
  return (
    <section className="receipt" aria-label="Context receipt">
      <div className="receipt-title">
        <span>Why these files</span>
        <span className="muted num">
          {receipt.selected.length} of {receipt.repo.files} files
        </span>
      </div>
      <table className="ledger">
        <tbody>
          {receipt.selected.map((s) => (
            <tr key={s.path}>
              <td className="rel" aria-label={`relevance ${Math.round((s.score / max) * 100)}%`}>
                <div className="relbar">
                  <i style={{ width: `${Math.max(8, (s.score / max) * 100)}%` }} />
                </div>
              </td>
              <td>
                <div className="path" title={s.path}>
                  {s.path}
                  <span className="cat">{CAT[s.category]}</span>
                </div>
                <div className="why">
                  {s.reason}
                  {s.inclusion.mode === 'ranges' ? ` · sent L${s.inclusion.ranges.map(([a, b]) => `${a}–${b}`).join(', L')}` : s.inclusion.mode === 'outline' ? ' · outline only' : ''}
                </div>
              </td>
              <td className="tok num">{fmt(s.estTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="budget">
        <div className="budget-row">
          <span>Context budget</span>
          <span className="num">
            {fmt(receipt.budget.usedTokens)} / {fmt(receipt.budget.limitTokens)} tokens
          </span>
        </div>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={receipt.budget.limitTokens} aria-valuenow={receipt.budget.usedTokens} aria-label="Context budget used">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="muted">
          Repository is ~{fmt(receipt.repo.estTokensTotal)} tokens ({receipt.repo.indexedLines.toLocaleString()} lines); {receipt.budget.truncated ? 'large files sent as focused line ranges' : 'all selected files sent whole'}. Estimate: characters ÷ 4.
        </div>
      </div>
      {receipt.excluded.length > 0 && (
        <details className="left-out">
          <summary>Left out ({receipt.excluded.length})</summary>
          <ul>
            {receipt.excluded.map((e) => (
              <li key={e.path}>
                <span className="code">{e.path}</span>: {e.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
});
