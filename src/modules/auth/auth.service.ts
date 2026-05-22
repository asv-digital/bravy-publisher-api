import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email ja cadastrado');
    }

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictException('Slug ja esta em uso');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.tenantName,
        slug: dto.tenantSlug,
        users: {
          create: {
            name: dto.name,
            email: dto.email,
            password: hashedPassword,
            role: 'OWNER',
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    return this.buildSession(user, tenant);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenant: true },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    return this.buildSession(user, user.tenant);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });
      if (!user) {
        throw new UnauthorizedException('Usuario nao encontrado');
      }
      return this.buildSession(user, user.tenant);
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }
  }

  private buildSession(
    user: { id: string; tenantId: string; role: string; email: string; name: string; createdAt: Date },
    tenant: { id: string; name: string },
  ) {
    const payload = { sub: user.id, tenantId: user.tenantId, role: user.role };
    const expiresInStr = process.env.JWT_EXPIRES_IN || '15m';

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: expiresInStr,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationToSeconds(expiresInStr),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
        tenantName: tenant.name,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}

function parseDurationToSeconds(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const n = parseInt(match[1], 10);
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[match[2]] ?? 1);
}
