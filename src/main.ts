#!/usr/bin/env node
import "reflect-metadata";
import { CommandFactory } from "nest-commander";
import { AppModule } from "./app.module.js";
import { loadConfigFile } from "./config/config-file.js";

async function bootstrap(): Promise<void> {
  loadConfigFile();
  await CommandFactory.run(AppModule, {
    logger: ["error", "warn"],
  });
}

bootstrap();
