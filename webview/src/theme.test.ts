/**
 * WCAG 2.x contrast check for the five semantic colours (docs/DESIGN_SYSTEM.md claims ≥ 4.5:1 as text)
 * against the default VS Code sidebars: Dark Modern #181818 and Light Modern #F8F8F8.
 * Values are read from styles.css so the test fails if the CSS drifts.
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

const NAMES = ['act', 'run', 'ok', 'wait', 'bad'];

describe('semantic colour contrast (WCAG AA, 4.5:1)', () => {
  const dark = block(':root {');
  const light = block("body.vscode-light,");
  it.each(NAMES)('dark --ax-%s on #181818', (n) => {
    expect(contrast(read(dark, n), '#181818')).toBeGreaterThanOrEqual(4.5);
  });
  it.each(NAMES)('light --ax-%s on #F8F8F8', (n) => {
    expect(contrast(read(light, n), '#f8f8f8')).toBeGreaterThanOrEqual(4.5);
  });
});
