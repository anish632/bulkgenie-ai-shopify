-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "aiProvider" TEXT NOT NULL DEFAULT 'cloud',
    "byokApiKey" TEXT,
    "brandVoice" TEXT,
    "sampleProductIds" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "monthlyUsage" INTEGER NOT NULL DEFAULT 0,
    "usageResetDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetLanguage" TEXT NOT NULL DEFAULT 'en',
    "descriptionLength" TEXT NOT NULL DEFAULT 'medium',
    "defaultFields" TEXT NOT NULL DEFAULT '["description","seoTitle","seoDescription","altText"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "generateFields" TEXT NOT NULL,
    "aiProvider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "productTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "originalDescription" TEXT,
    "originalSeoTitle" TEXT,
    "originalSeoDesc" TEXT,
    "originalAltTexts" TEXT,
    "generatedDescription" TEXT,
    "generatedSeoTitle" TEXT,
    "generatedSeoDesc" TEXT,
    "generatedAltTexts" TEXT,
    "editedDescription" TEXT,
    "editedSeoTitle" TEXT,
    "editedSeoDesc" TEXT,
    "editedAltTexts" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "JobItem_jobId_idx" ON "JobItem"("jobId");

-- CreateIndex
CREATE INDEX "JobItem_shopifyProductId_idx" ON "JobItem"("shopifyProductId");
