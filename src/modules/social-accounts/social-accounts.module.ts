import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SocialAccountsController } from './social-accounts.controller';
import { SocialAccountsService } from './social-accounts.service';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthStateService } from './oauth/oauth-state.service';
import { InstagramOAuthService } from './oauth/instagram-oauth.service';
import { TokenRefreshService } from './oauth/token-refresh.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SocialAccountsController, OAuthController],
  providers: [
    SocialAccountsService,
    OAuthStateService,
    InstagramOAuthService,
    TokenRefreshService,
  ],
  exports: [SocialAccountsService],
})
export class SocialAccountsModule {}
