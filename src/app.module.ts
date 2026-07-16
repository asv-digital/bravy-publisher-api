import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './database/prisma.module';
import { MinioModule } from './database/minio.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { SocialAccountsModule } from './modules/social-accounts/social-accounts.module';
import { ContentModule } from './modules/content/content.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { FactCheckModule } from './modules/fact-check/fact-check.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { GenerationModule } from './modules/generation/generation.module';
import { FilesModule } from './modules/files/files.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { BrandKitModule } from './modules/brand-kit/brand-kit.module';
import { FontsModule } from './modules/fonts/fonts.module';
import { PersonasModule } from './modules/personas/personas.module';
import redisConfig from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [redisConfig],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),
    ScheduleModule.forRoot(),
    // Um único throttler global. NÃO definir buckets nomeados extras aqui:
    // o ThrottlerGuard aplica TODOS os throttlers do forRoot em TODAS as
    // rotas — um bucket "auth" de 10/min aqui limitava o app inteiro a
    // 10 req/min (429 no estúdio). O limite estrito de auth vive como
    // @Throttle() no AuthController. O default é alto porque o estúdio
    // dispara rajadas legítimas (2 reqs/slide no Aprovar + autosaves).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    CommonModule,
    PrismaModule,
    MinioModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TemplatesModule,
    SocialAccountsModule,
    ContentModule,
    DatasetsModule,
    SchedulesModule,
    AnalyticsModule,
    FactCheckModule,
    PublishingModule,
    GenerationModule,
    FilesModule,
    UploadsModule,
    BrandKitModule,
    FontsModule,
    PersonasModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
