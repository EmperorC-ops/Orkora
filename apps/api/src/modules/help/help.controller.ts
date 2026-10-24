import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { helpSectionsForRole } from './help-content';

/**
 * Organizer help, filtered by the caller's role in the organization. Served
 * from the API (not bundled into the web page) so a section only ever reaches
 * someone whose role may read it.
 */
@ApiTags('help')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/help')
export class HelpController {
  @Get()
  @Roles('staff')
  list(
    @Param('orgId') _orgId: string,
    @Req() req: { user?: { activeRole?: string } },
  ) {
    const role = req.user?.activeRole ?? null;
    return { role, sections: helpSectionsForRole(role) };
  }
}
