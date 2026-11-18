/**
 * WCAG 2.x contrast for the AXIOM Forge palette (docs/AXIOM_DESIGN_SYSTEM.md): every semantic colour
 * and the muted text must reach 4.5:1 on BOTH our base background and our raised surface, in dark and
 * light; white on the primary button too. Values are read from styles.css so drift fails the test.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const block = (selectorStart: string) => css.slice(css.indexOf(selectorStart), css.indexOf('}', css.indexOf(selectorStart)));
const read = (src: string, name: string) => new RegExp(`--ax-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(src)![1]!;

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const TEXT = ['fg', 'muted', 'act', 'run', 'ok', 'wait', 'bad'];

describe.each([
  ['dark', block(':root {')],
  ['light', block('body.vscode-light,')],
])('%s palette', (_name, src) => {
  for (const surface of ['bg', 'surface', 'surface-2']) {
    it.each(TEXT)(`--ax-%s on --ax-${surface} ≥ 4.5:1`, (n) => {
      expect(contrast(read(src, n), read(src, surface))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('white on the primary button ≥ 4.5:1', () => {
    expect(contrast('#ffffff', read(src, 'act-strong'))).toBeGreaterThanOrEqual(4.5);
  });
});
