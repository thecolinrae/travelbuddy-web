-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN     "gmailLabelId" TEXT,
ADD COLUMN     "gmailLabelName" TEXT,
ADD COLUMN     "gmailMessageId" TEXT;

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "preferredCurrency" SET DEFAULT 'CAD';

-- AlterTable
ALTER TABLE "Trip" ALTER COLUMN "preferredCurrency" SET DEFAULT 'CAD';

-- CreateIndex
CREATE INDEX "Artifact_tripId_gmailLabelId_idx" ON "Artifact"("tripId", "gmailLabelId");
