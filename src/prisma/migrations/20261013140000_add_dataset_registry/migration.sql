-- AlterTable: published pin for the registry plane (sync-v2 §7/§8.4, INV-8/INV-17).
-- Registry reads resolve to this version instead of the mutable live dir; NULL means
-- nothing is published, so those reads 404.
ALTER TABLE "dataset" ADD COLUMN     "current_version" INTEGER;

-- Backfill: pin every existing non-deleted dataset to its newest uploaded version so
-- current shares stay adoptable once `registry_reads` is advertised. Going forward only
-- an explicit publish moves the pin.
UPDATE "dataset" d
   SET "current_version" = (
        SELECT MAX(v."version") FROM "dataset_version" v WHERE v."dataset_uuid" = d."uuid"
   )
 WHERE d."deleted" = 'N'
   AND d."current_version" IS NULL
   AND EXISTS (SELECT 1 FROM "dataset_version" v WHERE v."dataset_uuid" = d."uuid");
