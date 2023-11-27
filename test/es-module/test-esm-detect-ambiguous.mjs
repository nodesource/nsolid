import { spawnPromisified } from '../common/index.mjs';
import * as fixtures from '../common/fixtures.mjs';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { strictEqual, match } from 'node:assert';

describe('--experimental-detect-module', { concurrency: true }, () => {
  describe('string input', { concurrency: true }, () => {
    it('permits ESM syntax in --eval input without requiring --input-type=module', async () => {
      const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
        '--experimental-detect-module',
        '--eval',
        'import { version } from "node:process"; console.log(version);',
      ]);

      strictEqual(stderr, '');
      strictEqual(stdout, `${process.version}\n`);
      strictEqual(code, 0);
      strictEqual(signal, null);
    });

    // ESM is unsupported for --print via --input-type=module

    it('permits ESM syntax in STDIN input without requiring --input-type=module', async () => {
      const child = spawn(process.execPath, [
        '--experimental-detect-module',
      ]);
      child.stdin.end('console.log(typeof import.meta.resolve)');

      match((await child.stdout.toArray()).toString(), /^function\r?\n$/);
    });

    it('should be overridden by --input-type', async () => {
      const { code, signal, stdout, stderr } = await spawnPromisified(process.execPath, [
        '--experimental-detect-module',
        '--input-type=commonjs',
        '--eval',
        'import.meta.url',
      ]);

      match(stderr, /SyntaxError: Cannot use 'import\.meta' outside a module/);
      strictEqual(stdout, '');
      strictEqual(code, 1);
      strictEqual(signal, null);
    });

    it('should be overridden by --experimental-default-type', async () => {
      const { code, signal, stdout, stderr } = await spawnPromisified(process.execPath, [
        '--experimental-detect-module',
        '--experimental-default-type=commonjs',
        '--eval',
        'import.meta.url',
      ]);

      match(stderr, /SyntaxError: Cannot use 'import\.meta' outside a module/);
      strictEqual(stdout, '');
      strictEqual(code, 1);
      strictEqual(signal, null);
    });

    it('does not trigger detection via source code `eval()`', async () => {
      const { code, signal, stdout, stderr } = await spawnPromisified(process.execPath, [
        '--experimental-detect-module',
        '--eval',
        'eval("import \'nonexistent\';");',
      ]);

      match(stderr, /SyntaxError: Cannot use import statement outside a module/);
      strictEqual(stdout, '');
      strictEqual(code, 1);
      strictEqual(signal, null);
    });
  });

  describe('.js file input in a typeless package', { concurrency: true }, () => {
    for (const { testName, entryPath } of [
      {
        testName: 'permits CommonJS syntax in a .js entry point',
        entryPath: fixtures.path('es-modules/package-without-type/commonjs.js'),
      },
      {
        testName: 'permits ESM syntax in a .js entry point',
        entryPath: fixtures.path('es-modules/package-without-type/module.js'),
      },
      {
        testName: 'permits CommonJS syntax in a .js file imported by a CommonJS entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-commonjs.cjs'),
      },
      {
        testName: 'permits ESM syntax in a .js file imported by a CommonJS entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-esm.js'),
      },
      {
        testName: 'permits CommonJS syntax in a .js file imported by an ESM entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-commonjs.mjs'),
      },
      {
        testName: 'permits ESM syntax in a .js file imported by an ESM entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-esm.mjs'),
      },
    ]) {
      it(testName, async () => {
        const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
          '--experimental-detect-module',
          entryPath,
        ]);

        strictEqual(stderr, '');
        strictEqual(stdout, 'executed\n');
        strictEqual(code, 0);
        strictEqual(signal, null);
      });
    }
  });

  describe('extensionless file input in a typeless package', { concurrency: true }, () => {
    for (const { testName, entryPath } of [
      {
        testName: 'permits CommonJS syntax in an extensionless entry point',
        entryPath: fixtures.path('es-modules/package-without-type/noext-cjs'),
      },
      {
        testName: 'permits ESM syntax in an extensionless entry point',
        entryPath: fixtures.path('es-modules/package-without-type/noext-esm'),
      },
      {
        testName: 'permits CommonJS syntax in an extensionless file imported by a CommonJS entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-noext-cjs.js'),
      },
      {
        testName: 'permits ESM syntax in an extensionless file imported by a CommonJS entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-noext-esm.js'),
      },
      {
        testName: 'permits CommonJS syntax in an extensionless file imported by an ESM entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-noext-cjs.mjs'),
      },
      {
        testName: 'permits ESM syntax in an extensionless file imported by an ESM entry point',
        entryPath: fixtures.path('es-modules/package-without-type/imports-noext-esm.mjs'),
      },
    ]) {
      it(testName, async () => {
        const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
          '--experimental-detect-module',
          entryPath,
        ]);

        strictEqual(stderr, '');
        strictEqual(stdout, 'executed\n');
        strictEqual(code, 0);
        strictEqual(signal, null);
      });
    }

    it('should not hint wrong format in resolve hook', async () => {
      let writeSync;
      const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
        '--experimental-detect-module',
        '--no-warnings',
        '--loader',
        `data:text/javascript,import { writeSync } from "node:fs"; export ${encodeURIComponent(
          async function resolve(s, c, next) {
            const result = await next(s, c);
            writeSync(1, result.format + '\n');
            return result;
          }
        )}`,
        fixtures.path('es-modules/package-without-type/noext-esm'),
      ]);

      strictEqual(stderr, '');
      strictEqual(stdout, 'null\nexecuted\n');
      strictEqual(code, 0);
      strictEqual(signal, null);

    });
  });

  describe('file input in a "type": "commonjs" package', { concurrency: true }, () => {
    for (const { testName, entryPath } of [
      {
        testName: 'disallows ESM syntax in a .js entry point',
        entryPath: fixtures.path('es-modules/package-type-commonjs/module.js'),
      },
      {
        testName: 'disallows ESM syntax in a .js file imported by a CommonJS entry point',
        entryPath: fixtures.path('es-modules/package-type-commonjs/imports-esm.js'),
      },
      {
        testName: 'disallows ESM syntax in a .js file imported by an ESM entry point',
        entryPath: fixtures.path('es-modules/package-type-commonjs/imports-esm.mjs'),
      },
    ]) {
      it(testName, async () => {
        const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
          '--experimental-detect-module',
          entryPath,
        ]);

        match(stderr, /SyntaxError: Unexpected token 'export'/);
        strictEqual(stdout, '');
        strictEqual(code, 1);
        strictEqual(signal, null);
      });
    }
  });

  describe('file input in a "type": "module" package', { concurrency: true }, () => {
    for (const { testName, entryPath } of [
      {
        testName: 'disallows CommonJS syntax in a .js entry point',
        entryPath: fixtures.path('es-modules/package-type-module/cjs.js'),
      },
      {
        testName: 'disallows CommonJS syntax in a .js file imported by a CommonJS entry point',
        entryPath: fixtures.path('es-modules/package-type-module/imports-commonjs.cjs'),
      },
      {
        testName: 'disallows CommonJS syntax in a .js file imported by an ESM entry point',
        entryPath: fixtures.path('es-modules/package-type-module/imports-commonjs.mjs'),
      },
    ]) {
      it(testName, async () => {
        const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
          '--experimental-detect-module',
          entryPath,
        ]);

        match(stderr, /ReferenceError: module is not defined in ES module scope/);
        strictEqual(stdout, '');
        strictEqual(code, 1);
        strictEqual(signal, null);
      });
    }
  });
});
