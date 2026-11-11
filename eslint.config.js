import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'server/data/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // 逐步收敛：先只警告，不阻塞构建
      '@typescript-eslint/no-explicit-any': 'warn',
      // 未使用变量交给 tsc(noUnusedLocals) 管，避免两套规则打架
      '@typescript-eslint/no-unused-vars': 'off',
      // 现有代码大量使用空 catch / 条件短路，先不拦
      'no-empty': 'off',
      '@typescript-eslint/no-empty-function': 'off'
    }
  },
  {
    files: ['server/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
)
