-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL DEFAULT '',
    "destinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TEXT,
    "endDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "coverEmoji" TEXT NOT NULL DEFAULT '✈️',
    "itineraryMd" TEXT,
    "budgetGoal" DOUBLE PRECISION,
    "categoryGoals" JSONB,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'USD',
    "ownerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventSubtype" TEXT,
    "data" JSONB NOT NULL,
    "eventDate" TEXT,
    "sortUtc" TIMESTAMP(3),
    "journeyId" TEXT,
    "artifactSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activities" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "destination" TEXT,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "size" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripShare" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithEmail" TEXT NOT NULL,
    "sharedWithUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_email_key" ON "Profile"("email");

-- CreateIndex
CREATE INDEX "Trip_userId_createdAt_idx" ON "Trip"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TimelineEvent_tripId_eventDate_idx" ON "TimelineEvent"("tripId", "eventDate");

-- CreateIndex
CREATE INDEX "TimelineEvent_tripId_sortUtc_idx" ON "TimelineEvent"("tripId", "sortUtc");

-- CreateIndex
CREATE INDEX "TimelineEvent_tripId_journeyId_idx" ON "TimelineEvent"("tripId", "journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "Activities_tripId_key" ON "Activities"("tripId");

-- CreateIndex
CREATE INDEX "Artifact_tripId_idx" ON "Artifact"("tripId");

-- CreateIndex
CREATE INDEX "TripShare_sharedWithEmail_idx" ON "TripShare"("sharedWithEmail");

-- CreateIndex
CREATE INDEX "TripShare_sharedWithUserId_idx" ON "TripShare"("sharedWithUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TripShare_tripId_sharedWithEmail_key" ON "TripShare"("tripId", "sharedWithEmail");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activities" ADD CONSTRAINT "Activities_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShare" ADD CONSTRAINT "TripShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShare" ADD CONSTRAINT "TripShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
