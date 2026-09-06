import { Module } from '@nestjs/common';
import { GitHubAdapterSelectorService } from './github-adapter-selector.service.js';
import { FetchHttpClient, HTTP_CLIENT } from './issues-http-client.js';

@Module({
  providers: [
    GitHubAdapterSelectorService,
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
  ],
  exports: [GitHubAdapterSelectorService, HTTP_CLIENT],
})
export class IssuesModule {}
