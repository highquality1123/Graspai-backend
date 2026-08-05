import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Domaine V2 Search (GET /search). SupabaseService est global (pas d'import).
 * Ajouté à V2_MODULES pour apparaître dans le Swagger V2.
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
