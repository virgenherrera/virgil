import {
  type DynamicModule,
  Module,
  type Provider as NestProvider,
} from "@nestjs/common";
import { ContentHasherService } from "./content-hasher.service.js";
import { CloudSourceDetectorService } from "./cloud-source-detector.service.js";
import { MetadataService } from "./metadata.service.js";
import { ExtractorRegistryService } from "./extractor-registry.service.js";
import { FileWatcherService } from "./file-watcher.service.js";
import { IndexingPipelineService } from "./indexing-pipeline.service.js";
import { LocalKnowledgeProviderService } from "./local-knowledge-provider.service.js";
import { InMemoryArtifactStore } from "./artifact-store.js";
import {
  type IndexerModuleOptions,
  INDEXER_OPTIONS,
  ARTIFACT_STORE,
} from "./types.js";

@Module({})
export class IndexerModule {
  static forRoot(
    options: IndexerModuleOptions,
    artifactStoreProvider?: NestProvider,
  ): DynamicModule {
    return {
      module: IndexerModule,
      providers: [
        { provide: INDEXER_OPTIONS, useValue: options },
        artifactStoreProvider ?? {
          provide: ARTIFACT_STORE,
          useClass: InMemoryArtifactStore,
        },
        ContentHasherService,
        CloudSourceDetectorService,
        MetadataService,
        ExtractorRegistryService,
        FileWatcherService,
        IndexingPipelineService,
        LocalKnowledgeProviderService,
      ],
      exports: [
        IndexingPipelineService,
        LocalKnowledgeProviderService,
        ExtractorRegistryService,
        FileWatcherService,
        ContentHasherService,
        MetadataService,
        CloudSourceDetectorService,
        ARTIFACT_STORE,
      ],
    };
  }
}
