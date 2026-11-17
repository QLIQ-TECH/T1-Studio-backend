/**
 * One-off backfill migration.
 *
 * Context: the `order` field on project cards (projectPage.model.ts ->
 * projectCardSchema) is new. Existing project-page documents don't have it
 * set, so every item would fall back to the schema default (9999) and tie —
 * the sort in getProjectPageService would then rely on a secondary stable
 * sort, which coincidentally matches current array order in Node/V8, but we
 * don't want to depend on that implicitly. This backfills `order = index + 1`
 * for every project in the "projects" ProjectPage document, matching the
 * current on-site listing order exactly, so nothing visually shifts.
 *
 * Idempotent: skips any project that already has a numeric `order` set, so
 * re-running after someone has manually reordered via direct DB edits (or a
 * future CMS UI) won't clobber their changes.
 *
 * Usage (from T1-Studio-backend):
 *   MONGODB_URI="<your-connection-string>" npx tsx src/scripts/backfillProjectOrder.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import ProjectPage from "../models/projectPage.model.ts";

const SLUG = "projects";

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  const page = await ProjectPage.findOne({ slug: SLUG });
  if (!page) {
    throw new Error(`ProjectPage with slug "${SLUG}" not found`);
  }

  const projects = page.sections?.projects?.projects ?? [];
  if (projects.length === 0) {
    console.log("No projects found on this page — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let skipped = 0;

  projects.forEach((project: any, index: number) => {
    const hasOrder = typeof project.order === "number" && project.order !== 9999;
    if (hasOrder) {
      skipped += 1;
      return;
    }
    project.order = index + 1;
    updated += 1;
  });

  if (updated > 0) {
    page.markModified("sections.projects.projects");
    await page.save();
  }

  console.log(
    `Backfill complete: ${updated} project(s) given an order, ${skipped} already had one and were left alone.`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
