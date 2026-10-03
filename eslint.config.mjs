import globals from 'globals';

export default [{
  files: ['js/**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
  rules: {
    'no-undef': 'error',
    'no-dupe-args': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'constructor-super': 'error',
    'valid-typeof': 'error',
  },
}];
