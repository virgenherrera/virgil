import { Module } from '@nestjs/common';
import { VersionCommand } from './commands/version.command.js';
import { HandoffProtocolModule } from './handoff/handoff-protocol.module.js';
import { PersistenceModule } from './persistence/index.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    HandoffProtocolModule,
    // NestJS instantiates every provider in an imported module eagerly at
    // bootstrap, regardless of a command's needs — so every CLI invocation
    // (including `version`) would otherwise open/create a real SQLite file
    // as a side effect, violating the "never mutates the caller's cwd"
    // invariant `test/sea-isolation.e2e-spec.ts` enforces for the SEA
    // binary. AppModule wires the persistence layer with an in-memory
    // database so the module graph, schema, and repositories are fully
    // available for DI without any filesystem side effect; a durable,
    // workspace-scoped `databasePath` is a wiring decision for whichever
    // handoff adds the first command that actually needs to persist
    // knowledge (H03 workspace identity / H07 retrieval / H08 discovery).
    PersistenceModule.forRoot({ databasePath: ':memory:' }),
    WorkspaceModule,
  ],
  providers: [VersionCommand],
})
export class AppModule {}
