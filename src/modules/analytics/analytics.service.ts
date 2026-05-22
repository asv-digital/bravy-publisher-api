import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { QueryComparisonDto } from './dto/query-comparison.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(tenantId: string, dto: QueryDashboardDto) {
    const period = dto.period ?? '30d';
    const days = parseInt(period.replace('d', ''), 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const now = new Date();

    const where: any = {
      status: 'COMPLETED',
      publishedAt: { gte: since },
      content: { tenantId },
    };
    if (dto.socialAccountId) where.socialAccountId = dto.socialAccountId;

    const targets = await this.prisma.publishTarget.findMany({
      where,
      include: {
        analytics: { orderBy: { fetchedAt: 'desc' }, take: 1 },
        content: true,
      },
      orderBy: { publishedAt: 'asc' },
    });

    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSaves = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let engagementSum = 0;
    let engagementCount = 0;

    const dailyMap = new Map<
      string,
      {
        date: string;
        engagement: number;
        reach: number;
        impressions: number;
        likes: number;
        comments: number;
        newFollowers: number;
        unfollowers: number;
        postsByDay: number;
      }
    >();
    const postsPerDayMap = new Map<string, number>();
    const breakdownMap = new Map<string, { count: number; engagement: number }>();

    for (const target of targets) {
      const latest = target.analytics[0];
      const dateKey = target.publishedAt
        ? target.publishedAt.toISOString().slice(0, 10)
        : 'unknown';

      postsPerDayMap.set(dateKey, (postsPerDayMap.get(dateKey) ?? 0) + 1);

      const contentType = target.content.contentType;
      const b = breakdownMap.get(contentType) ?? { count: 0, engagement: 0 };
      b.count += 1;
      if (latest?.engagementRate != null) b.engagement += latest.engagementRate;
      breakdownMap.set(contentType, b);

      if (!latest) continue;

      totalLikes += latest.likes;
      totalComments += latest.comments;
      totalShares += latest.shares;
      totalSaves += latest.saves;
      totalReach += latest.reach;
      totalImpressions += latest.impressions;
      if (latest.engagementRate != null) {
        engagementSum += latest.engagementRate;
        engagementCount += 1;
      }

      const existing = dailyMap.get(dateKey) ?? {
        date: dateKey,
        engagement: 0,
        reach: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        newFollowers: 0,
        unfollowers: 0,
        postsByDay: 0,
      };
      existing.likes += latest.likes;
      existing.comments += latest.comments;
      existing.reach += latest.reach;
      existing.impressions += latest.impressions;
      existing.engagement += latest.engagementRate ?? 0;
      existing.postsByDay += 1;
      dailyMap.set(dateKey, existing);
    }

    const avgEngagementRate =
      engagementCount > 0 ? engagementSum / engagementCount : 0;

    const scheduledTargets = await this.prisma.publishTarget.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { gte: now },
        content: { tenantId },
      },
      include: { content: true },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    });

    const recentPublished = [...targets]
      .filter((t) => t.publishedAt)
      .sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      )
      .slice(0, 5)
      .map((t) => ({
        id: t.content.id,
        slug: t.content.slug,
        publishedAt: t.publishedAt!.toISOString(),
        engagement: t.analytics[0]?.engagementRate ?? 0,
      }));

    const topPosts = [...targets]
      .filter((t) => t.analytics[0])
      .sort(
        (a, b) =>
          (b.analytics[0].engagementRate ?? 0) -
          (a.analytics[0].engagementRate ?? 0),
      )
      .slice(0, 5)
      .map((t) => ({
        contentId: t.content.id,
        slug: t.content.slug,
        persona: (t.content.persona ?? 'empresario') as any,
        pattern: (t.content.pattern ?? 'A') as any,
        publishedAt: t.publishedAt?.toISOString() ?? '',
        analytics: {
          likes: t.analytics[0].likes,
          comments: t.analytics[0].comments,
          shares: t.analytics[0].shares,
          saves: t.analytics[0].saves,
          reach: t.analytics[0].reach,
          impressions: t.analytics[0].impressions,
          engagementRate: t.analytics[0].engagementRate ?? 0,
        },
      }));

    return {
      totalPublished: targets.length,
      avgEngagement: avgEngagementRate,
      totalReach,
      scheduledCount: scheduledTargets.length,
      totalFollowersGained: 0,
      totalUnfollowers: 0,
      totalLikes,
      totalComments,
      totalShares,
      totalSaves,
      avgEngagementRate,
      contentTypeBreakdown: Array.from(breakdownMap.entries()).map(
        ([type, v]) => ({
          type,
          count: v.count,
          engagement: v.count > 0 ? v.engagement / v.count : 0,
        }),
      ),
      postsPerDay: Array.from(postsPerDayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      dailyEngagement: Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      topPosts,
      recentPublished,
      upcoming: scheduledTargets.map((t) => ({
        id: t.content.id,
        slug: t.content.slug,
        scheduledAt: t.scheduledAt!.toISOString(),
        persona: (t.content.persona ?? 'empresario') as any,
      })),
    };
  }

  async ranking(tenantId: string, dto: QueryRankingDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const contentWhere: any = { tenantId };
    if (dto.persona) contentWhere.persona = dto.persona;
    if (dto.pattern) contentWhere.pattern = dto.pattern;

    const sortField = dto.sortBy || 'engagementRate';

    const targets = await this.prisma.publishTarget.findMany({
      where: {
        status: 'COMPLETED',
        content: contentWhere,
      },
      include: {
        analytics: {
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
        content: true,
        socialAccount: true,
      },
    });

    const ranked = targets
      .filter((t) => t.analytics.length > 0)
      .map((t) => ({
        publishTargetId: t.id,
        content: t.content,
        socialAccount: t.socialAccount,
        analytics: t.analytics[0],
      }))
      .sort((a, b) => {
        const aVal = (a.analytics as any)[sortField] ?? 0;
        const bVal = (b.analytics as any)[sortField] ?? 0;
        return bVal - aVal;
      });

    const total = ranked.length;
    const data = ranked.slice(skip, skip + limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async comparison(tenantId: string, dto: QueryComparisonDto) {
    const ids = dto.contentIds.split(',').map((id) => id.trim());
    const metric = dto.metric || 'engagementRate';

    const targets = await this.prisma.publishTarget.findMany({
      where: {
        content: {
          id: { in: ids },
          tenantId,
        },
        status: 'COMPLETED',
      },
      include: {
        analytics: {
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
        content: true,
      },
    });

    return targets.map((t) => ({
      contentId: t.contentId,
      contentSlug: t.content.slug,
      publishTargetId: t.id,
      metric,
      value: t.analytics[0] ? (t.analytics[0] as any)[metric] ?? 0 : 0,
      analytics: t.analytics[0] || null,
    }));
  }
}
