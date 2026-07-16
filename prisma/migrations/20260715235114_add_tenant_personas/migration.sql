-- CreateTable
CREATE TABLE "personas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Users',
    "accent_hex" TEXT NOT NULL,
    "soft_hex" TEXT NOT NULL,
    "accent_label" TEXT,
    "vocab" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personas_tenant_id_archived_at_idx" ON "personas"("tenant_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "personas_tenant_id_slug_key" ON "personas"("tenant_id", "slug");

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
