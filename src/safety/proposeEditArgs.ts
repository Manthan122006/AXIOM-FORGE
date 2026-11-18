import { z } from 'zod';

/**
 * Arguments of the `propose_edit` MCP tool. Two forms:
 * - `edits`: exact search/replace blocks (preferred: robust for LLMs, minimal diffs)
 * - `new_content`: full file content (for new files or rewrites)
 */
export const proposeEditShape = {
  path: z.string().min(1).describe('Workspace-relative path of the file to change or create.'),
  rationale: z.string().min(1).max(2000).describe('One or two sentences: why this change is needed.'),
  edits: z
    .array(
      z.object({
        old_text: z
          .string()
          .describe('Exact existing text to replace, including indentation. Must occur exactly once in the file.'),
        new_text: z.string().describe('Replacement text.'),
      }),
    )
    .max(50)
    .optional()
    .describe('Search/replace edits applied in order. Use this for changes to existing files.'),
  new_content: z
    .string()
    .max(500_000)
    .optional()
    .describe('Complete new file content. Use only for new files or whole-file rewrites.'),
};

export const proposeEditSchema = z.object(proposeEditShape);
export type ProposeEditArgs = z.infer<typeof proposeEditSchema>;

export class EditSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditSpecError';
  }
}

/** Compute the proposed file text from current text + edit spec. Throws EditSpecError with an actionable message. */
export function computeProposedText(current: string | null, args: ProposeEditArgs): string {
  const hasEdits = Array.isArray(args.edits) && args.edits.length > 0;
  const hasContent = typeof args.new_content === 'string';
  if (hasEdits === hasContent) throw new EditSpecError('Provide exactly one of `edits` or `new_content`.');
  if (hasContent) return args.new_content!;
  if (current === null) throw new EditSpecError(`File "${args.path}" does not exist; use \`new_content\` to create it.`);

  // Match against LF-normalised text so CRLF files still accept LF edits; restore EOL afterwards.
  const crlf = current.includes('\r\n');
  let text = crlf ? current.replace(/\r\n/g, '\n') : current;
  args.edits!.forEach((edit, i) => {
    const oldText = edit.old_text.replace(/\r\n/g, '\n');
    const newText = edit.new_text.replace(/\r\n/g, '\n');
    if (oldText === '') throw new EditSpecError(`Edit ${i + 1}: old_text is empty.`);
    const first = text.indexOf(oldText);
    if (first === -1) {
      throw new EditSpecError(
        `Edit ${i + 1}: old_text was not found in ${args.path}. ${nearestMatchHint(text, oldText)}Copy old_text exactly from the file, including indentation.`,
      );
    }
    if (text.indexOf(oldText, first + 1) !== -1) {
      throw new EditSpecError(`Edit ${i + 1}: old_text occurs more than once in ${args.path}; include more surrounding lines.`);
    }
    text = text.slice(0, first) + newText + text.slice(first + oldText.length);
  });
  return crlf ? text.replace(/\n/g, '\r\n') : text;
}

/**
 * When old_text isn't in the file, show the model where its first lines DO match and what the file
 * actually contains there, so it can fix the edit in one step instead of guessing again (seen live:
 * a model invented the third line of a function three times in a row, burning quota each time).
 */
export function nearestMatchHint(fileText: string, oldText: string): string {
  const want = oldText.split('\n');
  const have = fileText.split('\n');
  let best = { at: -1, len: 0 };
  for (let i = 0; i < have.length; i++) {
    let n = 0;
    while (n < want.length && i + n < have.length && have[i + n] === want[n]) n++;
    if (n > best.len) best = { at: i, len: n };
  }
  if (best.len === 0) return 'None of its lines match the file. ';
  const show = have.slice(best.at, best.at + Math.min(want.length + 2, 40));
  return (
    `Its first ${best.len} line(s) match at line ${best.at + 1}, but line ${best.at + best.len + 1} differs. ` +
    `The file there actually reads (lines ${best.at + 1}-${best.at + show.length}):\n${show.join('\n')}\n`
  );
}
