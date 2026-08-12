import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production deployment configuration', function () {
  it('builds with Vite and deploys only the generated dist directory', function () {
    const workflow = readFileSync(
      new URL('../.github/workflows/deploy-cloudflare.yml', import.meta.url),
      'utf8'
    );
    const wranglerJson = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const wranglerToml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('run: npm test');
    expect(workflow).toContain('run: npm run build');
    expect(workflow.indexOf('run: npm test')).toBeLessThan(workflow.indexOf('run: npm run build'));
    expect(workflow).toContain("if: ${{ steps.deploy_credentials.outputs.enabled == 'true' }}");
    expect(workflow).toContain('command: pages deploy dist ');
    expect(workflow).not.toContain('command: pages deploy . ');
    expect(wranglerJson).toContain('"command": "npm run build"');
    expect(wranglerJson).toContain('"directory": "./dist"');
    expect(wranglerToml).toContain('pages_build_output_dir = "dist"');
    expect(wranglerToml).toContain('command = "npm run build"');
  });
});
