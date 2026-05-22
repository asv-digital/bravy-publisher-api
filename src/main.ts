import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

function assertEnv(): void {
  const errors: string[] = [];
  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === 'change-me-in-production' || jwt.length < 32) {
    errors.push(
      'JWT_SECRET must be set to a strong value (>= 32 chars, not the default placeholder)',
    );
  }

  const isProd = process.env.NODE_ENV === 'production';
  const enc = process.env.ENCRYPTION_KEY;
  if (isProd && (!enc || enc.length < 32)) {
    errors.push(
      'ENCRYPTION_KEY must be set to a base64 32-byte value in production',
    );
  }

  if (isProd) {
    if (!process.env.FRONTEND_URL) {
      errors.push('FRONTEND_URL must be set in production (used by OAuth + CORS)');
    }
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      errors.push('META_APP_ID and META_APP_SECRET must be set in production');
    }
  }

  if (errors.length > 0) {
    const logger = new Logger('Bootstrap');
    for (const err of errors) logger.error(err);
    throw new Error(`Refusing to boot: ${errors.length} env validation error(s)`);
  }
}

function parseCorsOrigins(): string[] | true {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '';
  if (!isProd && !raw) return true; // dev: allow all
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function bootstrap() {
  assertEnv();

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  app.use(helmet());

  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(`API running on port ${port}`);
}

bootstrap();
