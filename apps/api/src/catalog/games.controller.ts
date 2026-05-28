import { Controller, Get, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('games')
export class GamesController {
  constructor(private catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.listGames();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.catalog.getGameWithCatalog(slug);
  }
}
