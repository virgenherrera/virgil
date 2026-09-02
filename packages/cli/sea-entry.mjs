/**
 * SEA entry point wrapper (build-time only).
 *
 * Node's Single Executable Application (SEA) blob is produced from a CJS
 * bundle (see W1 in handoffs/H02_CLI_RUNTIME_SEA.md#sea-workarounds-reference).
 * CJS module format does not support top-level `await`, which `src/main.ts`
 * relies on for the standard Node ESM runtime entry point.
 *
 * This wrapper avoids top-level `await` by chaining `.catch()` on the
 * bootstrap promise instead. It imports the already-compiled `dist/`
 * output (produced by `pnpm build`) rather than TypeScript sources, and is
 * itself bundled to CJS by esbuild in scripts/build-sea.mjs. No application
 * source file under src/ is modified for SEA packaging.
 */
import { CommandFactory } from 'nest-commander';
import { AppModule } from './dist/app.module.js';

const bootstrap = async () => {
  await CommandFactory.run(AppModule, ['warn', 'error']);
};

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
