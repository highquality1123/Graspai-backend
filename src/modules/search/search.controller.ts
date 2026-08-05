import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { SearchResult } from './model/search.types';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiQuery({ name: 'q', required: true, description: 'Terme de recherche par nom/titre (full-text simple).' })
  globalSearch(@CurrentUser() user: AuthUser, @Query('q') q: string): Promise<SearchResult> {
    return this.search.search(user.userId, q);
  }
}
