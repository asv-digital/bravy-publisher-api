-- Templates CUSTOM (designer free-form, fase 2): layout/styleData por tenant.
-- Só os templates custom vivem nesta tabela; os de sistema são código no front.

-- AlterTable: novas colunas do template custom
ALTER TABLE "templates" ADD COLUMN     "format" TEXT NOT NULL DEFAULT '1:1',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'post',
ADD COLUMN     "layout" JSONB,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Template',
ADD COLUMN     "style_data" JSONB,
ADD COLUMN     "tenant_id" TEXT,
ADD COLUMN     "thumbnail_url" TEXT;

-- Legado vira opcional; family de enum → texto (in-place, sem perder dados)
ALTER TABLE "templates" ALTER COLUMN "slug" DROP NOT NULL;
ALTER TABLE "templates" ALTER COLUMN "html_content" DROP NOT NULL;
ALTER TABLE "templates" ALTER COLUMN "family" DROP NOT NULL;
ALTER TABLE "templates" ALTER COLUMN "family" TYPE TEXT USING "family"::TEXT;

-- DropEnum (não há mais coluna usando)
DROP TYPE "TemplateFamily";

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
