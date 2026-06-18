import { PrismaClient, SlideType } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const HOME = process.env.HOME ?? '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePersona(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.includes('contador') || lower.includes('contabil')) return 'contador';
  if (lower.includes('advogado')) return 'advogado';
  if (lower.includes('empresario')) return 'empresario';
  if (lower.includes('engenheiro')) return 'engenheiro';
  if (lower.includes('arquiteto')) return 'arquiteto';
  if (lower.includes('agencia')) return 'agencia';
  if (lower.includes('clinica')) return 'clinica';
  if (lower.includes('cowork')) return 'cowork';
  return null;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 1. Tenant + User
// ---------------------------------------------------------------------------

async function seedTenantAndUser() {
  console.log('[1/7] Creating default Tenant and User...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'bravy' },
    update: {},
    create: { name: 'Bravy', slug: 'bravy' },
  });
  console.log(`  Tenant: ${tenant.id} (${tenant.slug})`);

  const hashedPassword = bcrypt.hashSync('admin123456', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@bravy.com.br' },
    update: {},
    create: {
      email: 'admin@bravy.com.br',
      password: hashedPassword,
      name: 'Admin Bravy',
      role: 'OWNER',
      tenantId: tenant.id,
    },
  });
  console.log(`  User: ${user.id} (${user.email})`);

  return { tenant, user };
}

// ---------------------------------------------------------------------------
// 2. Templates
// ---------------------------------------------------------------------------

// Legado: o model Template agora guarda só templates CUSTOM do usuário (fase 2).
// Os templates de sistema (Editorial/Twitter/Terminal) são código no frontend.
// O import de HTML de design/ foi aposentado.
async function seedTemplates() {
  console.log('[2/7] Templates de sistema são código no frontend — nada a semear.');
  void parsePersona;
}

// ---------------------------------------------------------------------------
// 3. Queue content (draft)
// ---------------------------------------------------------------------------

async function seedQueueContent(tenantId: string) {
  console.log('[3/7] Importing queue content (DRAFT) ...');

  const queueDir = path.join(HOME, 'codigos/marketing/posts/queue');
  if (!fs.existsSync(queueDir)) {
    console.log('  Queue directory not found, skipping.');
    return;
  }

  const jsonFiles = fs
    .readdirSync(queueDir)
    .filter((f) => /^\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b));

  console.log(`  Found ${jsonFiles.length} queue JSON files.`);

  let count = 0;
  for (const file of jsonFiles) {
    const raw = fs.readFileSync(path.join(queueDir, file), 'utf-8');
    const data = JSON.parse(raw);

    const slug = data.slug ?? file.replace('.json', '');

    // Create content (slug is not unique, so always create)
    const content = await prisma.content.create({
      data: {
        tenantId,
        slug,
        contentType: 'CAROUSEL',
        status: 'DRAFT',
        persona: data.persona ?? null,
        pattern: data.padrao ?? null,
        template: data.template ?? null,
        hookCapa: data.hook_capa ?? null,
        caption: data.caption ?? null,
        slidesData: data as any,
      },
    });

    // Build slides
    const slides: Array<{
      contentId: string;
      position: number;
      slideType: SlideType;
      bodyData: any;
    }> = [];

    // COVER (position 0)
    slides.push({
      contentId: content.id,
      position: 0,
      slideType: 'COVER',
      bodyData: {
        label_topo_capa: data.label_topo_capa ?? null,
        label_capa: data.label_capa ?? null,
        hook_capa: data.hook_capa ?? null,
      } as any,
    });

    // BODY slides (position 1..N)
    if (Array.isArray(data.slides)) {
      data.slides.forEach((slide: any, idx: number) => {
        slides.push({
          contentId: content.id,
          position: idx + 1,
          slideType: 'BODY',
          bodyData: slide as any,
        });
      });
    }

    // CTA (last position)
    slides.push({
      contentId: content.id,
      position: slides.length,
      slideType: 'CTA',
      bodyData: {
        cta_label_topo: data.cta_label_topo ?? null,
        cta_label: data.cta_label ?? null,
        cta_text: data.cta_text ?? null,
        cta_sub: data.cta_sub ?? null,
      } as any,
    });

    await prisma.slide.createMany({ data: slides });
    count++;
  }

  console.log(`  Created ${count} draft contents with slides.`);
}

// ---------------------------------------------------------------------------
// 4. Posted content (published)
// ---------------------------------------------------------------------------

async function seedPostedContent(tenantId: string, socialAccountId: string | null) {
  console.log('[4/7] Importing posted content (PUBLISHED) ...');

  const postedDir = path.join(HOME, 'codigos/marketing/posts/queue/posted');
  if (!fs.existsSync(postedDir)) {
    console.log('  Posted directory not found, skipping.');
    return;
  }

  const subdirs = fs
    .readdirSync(postedDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => parseInt(a) - parseInt(b));

  console.log(`  Found ${subdirs.length} posted subdirectories.`);

  let count = 0;
  for (const dir of subdirs) {
    const dirPath = path.join(postedDir, dir);
    const contentFile = path.join(dirPath, `${dir}.json`);
    const resultFile = path.join(dirPath, 'result.json');

    if (!fs.existsSync(contentFile) || !fs.existsSync(resultFile)) {
      console.log(`  Skipping ${dir}: missing json or result.json`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(contentFile, 'utf-8'));
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));

    const slug = data.slug ?? `posted-${dir}`;

    // Create content as PUBLISHED
    const content = await prisma.content.create({
      data: {
        tenantId,
        slug,
        contentType: 'CAROUSEL',
        status: 'PUBLISHED',
        persona: data.persona ?? null,
        pattern: data.padrao ?? null,
        template: data.template ?? null,
        hookCapa: data.hook_capa ?? null,
        caption: data.caption ?? null,
        slidesData: data as any,
      },
    });

    // Build slides
    const slides: Array<{
      contentId: string;
      position: number;
      slideType: SlideType;
      bodyData: any;
    }> = [];

    // COVER
    slides.push({
      contentId: content.id,
      position: 0,
      slideType: 'COVER',
      bodyData: {
        label_topo_capa: data.label_topo_capa ?? null,
        label_capa: data.label_capa ?? null,
        hook_capa: data.hook_capa ?? null,
      } as any,
    });

    // BODY slides
    if (Array.isArray(data.slides)) {
      data.slides.forEach((slide: any, idx: number) => {
        slides.push({
          contentId: content.id,
          position: idx + 1,
          slideType: 'BODY',
          bodyData: slide as any,
        });
      });
    }

    // CTA
    slides.push({
      contentId: content.id,
      position: slides.length,
      slideType: 'CTA',
      bodyData: {
        cta_label_topo: data.cta_label_topo ?? null,
        cta_label: data.cta_label ?? null,
        cta_text: data.cta_text ?? null,
        cta_sub: data.cta_sub ?? null,
      } as any,
    });

    await prisma.slide.createMany({ data: slides });

    // Create PublishTarget if we have a social account
    if (socialAccountId && result.media_id) {
      await prisma.publishTarget.create({
        data: {
          contentId: content.id,
          socialAccountId,
          status: 'COMPLETED',
          externalMediaId: String(result.media_id),
          publishedAt: result.posted_at ? new Date(result.posted_at) : new Date(),
        },
      });
    }

    count++;
  }

  console.log(`  Created ${count} published contents with slides and publish targets.`);
}

// ---------------------------------------------------------------------------
// 5. Datasets
// ---------------------------------------------------------------------------

async function seedDatasets() {
  console.log('[5/7] Importing dataset entries ...');

  const datasetDir = path.join(HOME, 'codigos/marketing/posts/dataset');
  if (!fs.existsSync(datasetDir)) {
    console.log('  Dataset directory not found, skipping.');
    return;
  }

  let totalCount = 0;

  // padroes_validados.json -> entryType='pattern'
  const padroesFile = path.join(datasetDir, 'padroes_validados.json');
  if (fs.existsSync(padroesFile)) {
    const padroes: any[] = JSON.parse(fs.readFileSync(padroesFile, 'utf-8'));
    for (const entry of padroes) {
      await prisma.datasetEntry.create({
        data: {
          entryType: 'pattern',
          code: entry.id ?? null,
          data: entry as any,
          score: entry.score_referencia != null ? Number(entry.score_referencia) : null,
        },
      });
      totalCount++;
    }
    console.log(`  padroes_validados.json: ${padroes.length} entries`);
  }

  // vocab.json -> entryType='vocab', one entry per persona key
  const vocabFile = path.join(datasetDir, 'vocab.json');
  if (fs.existsSync(vocabFile)) {
    const vocab = JSON.parse(fs.readFileSync(vocabFile, 'utf-8'));
    const keys = Object.keys(vocab);
    for (const key of keys) {
      await prisma.datasetEntry.create({
        data: {
          entryType: 'vocab',
          persona: key,
          data: vocab[key] as any,
        },
      });
      totalCount++;
    }
    console.log(`  vocab.json: ${keys.length} entries`);
  }

  // top_carrosseis.json -> entryType='top_carousel'
  const topFile = path.join(datasetDir, 'top_carrosseis.json');
  if (fs.existsSync(topFile)) {
    const tops: any[] = JSON.parse(fs.readFileSync(topFile, 'utf-8'));
    for (const entry of tops) {
      await prisma.datasetEntry.create({
        data: {
          entryType: 'top_carousel',
          code: entry.code ?? null,
          data: entry as any,
          score: entry.score != null ? Number(entry.score) : null,
        },
      });
      totalCount++;
    }
    console.log(`  top_carrosseis.json: ${tops.length} entries`);
  }

  // meta.json -> entryType='meta', single entry
  const metaFile = path.join(datasetDir, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const metaData = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    await prisma.datasetEntry.create({
      data: {
        entryType: 'meta',
        data: metaData as any,
      },
    });
    totalCount++;
    console.log(`  meta.json: 1 entry`);
  }

  console.log(`  Total dataset entries: ${totalCount}`);
}

// ---------------------------------------------------------------------------
// 6. Social Account
// ---------------------------------------------------------------------------

async function seedSocialAccount(tenantId: string): Promise<string | null> {
  console.log('[6/7] Importing SocialAccount from jpasv.env ...');

  const envFile = path.join(HOME, '.credentials/clients/jpasv.env');
  if (!fs.existsSync(envFile)) {
    console.log('  jpasv.env not found, skipping.');
    return null;
  }

  const env = parseEnvFile(envFile);
  const accountId = env.IG_USER_ID ?? '';
  const accountName = env.IG_USERNAME ? `@${env.IG_USERNAME}` : '@jp.asv';
  const accessToken = env.IG_TOKEN ?? '';

  if (!accountId) {
    console.log('  IG_USER_ID not found in env file, skipping.');
    return null;
  }

  // Upsert by platform + accountId (no unique constraint, so find first)
  let socialAccount = await prisma.socialAccount.findFirst({
    where: { accountId, platform: 'INSTAGRAM' },
  });

  if (!socialAccount) {
    socialAccount = await prisma.socialAccount.create({
      data: {
        tenantId,
        platform: 'INSTAGRAM',
        accountName,
        accountId,
        accessToken,
        tokenExpiresAt: env.IG_TOKEN_EXPIRES_AT
          ? new Date(env.IG_TOKEN_EXPIRES_AT)
          : null,
      },
    });
    console.log(`  Created SocialAccount: ${socialAccount.id} (${accountName})`);
  } else {
    console.log(`  SocialAccount already exists: ${socialAccount.id} (${accountName})`);
  }

  return socialAccount.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Bravy Maestria Seed ===\n');

  // 1. Tenant + User
  const { tenant } = await seedTenantAndUser();

  // 6. Social Account (needed before posted content)
  let socialAccountId: string | null = null;
  try {
    socialAccountId = await seedSocialAccount(tenant.id);
  } catch (err) {
    console.error('[6/7] Error importing social account:', err);
  }

  // 2. Templates
  try {
    await seedTemplates();
  } catch (err) {
    console.error('[2/7] Error importing templates:', err);
  }

  // 3. Queue content (draft)
  try {
    await seedQueueContent(tenant.id);
  } catch (err) {
    console.error('[3/7] Error importing queue content:', err);
  }

  // 4. Posted content (published)
  try {
    await seedPostedContent(tenant.id, socialAccountId);
  } catch (err) {
    console.error('[4/7] Error importing posted content:', err);
  }

  // 5. Datasets
  try {
    await seedDatasets();
  } catch (err) {
    console.error('[5/7] Error importing datasets:', err);
  }

  console.log('\n=== Seed complete ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
