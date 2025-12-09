/*
  Warnings:

  - Changed the type of `queueNumber` on the `Queue` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Queue" DROP COLUMN "queueNumber",
ADD COLUMN     "queueNumber" INTEGER NOT NULL;
