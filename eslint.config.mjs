import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'out/**', '**/*.mjs', 'fixtures/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          // Eligibility guard: the extension must never call a model provider directly.
          patterns: ['openai', '@google/generative-ai', '@google/genai', 'groq-sdk', '@anthropic-ai/*', 'ai', '@ai-sdk/*'],
        },
      ],
    },
  },
);
