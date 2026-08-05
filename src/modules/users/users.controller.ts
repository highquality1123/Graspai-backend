import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { UpdateMeDto } from './model/update-me.dto';
import { UserProfile } from './model/user-profile.types';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.getMe(user);
  }

  @Patch()
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<UserProfile> {
    return this.users.updateMe(user, dto);
  }
}
