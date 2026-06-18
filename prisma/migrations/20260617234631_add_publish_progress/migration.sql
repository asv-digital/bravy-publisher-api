-- AlterTable
ALTER TABLE "publish_targets" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progress_phase" TEXT;
