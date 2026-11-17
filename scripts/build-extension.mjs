// Bundles the extension host code (incl. the in-process MCP server) into dist/extension.js.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/extension/activate.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});
if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
