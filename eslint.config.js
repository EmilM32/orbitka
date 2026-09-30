import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const parentImport = {
  group: ['../*', '../**'],
  message:
    'Importy między warstwami idą przez alias (@sim/…, @core/…). Względne ../ jest zabronione; ./ w obrębie warstwy jest dozwolone.',
};

const simImport = {
  group: ['three/*', '@render', '@render/*', '@ui', '@ui/*'],
  message: 'src/sim nie importuje three, @render ani @ui.',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [parentImport],
        },
      ],
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              message: 'src/sim nie importuje three, @render ani @ui.',
            },
          ],
          patterns: [parentImport, simImport],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
