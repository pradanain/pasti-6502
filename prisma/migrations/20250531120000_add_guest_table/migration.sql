-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "LastEducation" AS ENUM ('SD', 'SMP', 'SMA_SMK', 'D1', 'D2', 'D3', 'D4_S1', 'S2', 'S3');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('KONSULTASI_STATISTIK', 'PERPUSTAKAAN', 'REKOMENDASI_STATISTIK', 'LAINNYA');

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "phone" TEXT NOT NULL,
    "age" INTEGER,
    "institution" TEXT,
    "gender" "Gender",
    "lastEducation" "LastEducation",
    "occupation" TEXT,
    "purpose" "Purpose",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Queue" ADD COLUMN     "guestId" TEXT;

-- CreateIndex
CREATE INDEX "Queue_guestId_idx" ON "Queue"("guestId");

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
