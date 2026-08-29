import { Global, Module } from "@nestjs/common";
import { RefResolverService } from "./ref-resolver.service.js";

@Global()
@Module({
  providers: [RefResolverService],
  exports: [RefResolverService],
})
export class RefResolverModule {}
