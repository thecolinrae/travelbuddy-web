-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN     "legId" TEXT;

-- CreateTable
CREATE TABLE "TransportLeg" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT,
    "nameIsCustom" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportLeg_tripId_order_idx" ON "TransportLeg"("tripId", "order");

-- CreateIndex
CREATE INDEX "TimelineEvent_tripId_legId_idx" ON "TimelineEvent"("tripId", "legId");

-- AddForeignKey
ALTER TABLE "TransportLeg" ADD CONSTRAINT "TransportLeg_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
