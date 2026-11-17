/**
 * One-off backfill migration.
 *
 * Context: the `kitchens` field on project cards (projectPage.model.ts ->
 * projectCardSchema) is new. Existing project-page documents don't have it
 * set. Every current project's description text already states its kitchen
 * count (e.g. "Supplied and installed 96 Keller kitchens at Bluewaters..."),
 * so the counts below were read directly from each project's live
 * shortDescription (en) rather than guessed — this backfill just promotes
 * that already-correct number into its own structured field.
 *
 * Idempotent: skips any project that already has a non-zero `kitchens`
 * value, so re-running after a manual/CMS edit won't clobber it.
 *
 * Usage (from T1-Studio-backend):
 *   MONGODB_URI="<your-connection-string>" npx tsx src/scripts/backfillProjectKitchens.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import ProjectPage from "../models/projectPage.model.ts";

const SLUG = "projects";

// Kitchen counts read from each project's existing shortDescription (en).
const KITCHENS_BY_SLUG: Record<string, number> = {
  "nadia-saeed-bespoke-kitchen-renovation": 1,
  "madinat-jumeirah-living-phase-4-dubai": 378,
  "blue-waters-dubai": 96,
  "city-walk-medical-centre": 501,
  "apartment-kitchen-fit-out-in-palm-jumeirah": 131,
  "al-yasmeen-sharjah": 68,
  "almafi-villas-dubai": 400,
  "nas-building-dubai": 95,
  "soho-properties-dubai": 187,
  "safa-townhouses-al-safa-first-dubai": 30,
  "golf-grand-dubai": 323,
  "club-drive-residence-dubai-hills-estate": 529,
  "avolina-bayline": 312,
  "farm-grove": 482,
  "rose-hills": 555,
  "the-gramercy-dubai-hills-estate": 70,
  "g5-residential-building-nad-al-sheba": 18,
  "private-villas-jumeirah-1-and-3": 14,
  "medical-centre-dubai": 71,
  "saeed-bin-omar-building": 168,
  "jumeirah-gate-dubai": 975,
  "elvira-residential-apartments-dubai-hills-estate": 892,
};

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
  const unmatched: string[] = [];

  projects.forEach((project: any) => {
    const alreadySet = typeof project.kitchens === "number" && project.kitchens > 0;
    if (alreadySet) {
      skipped += 1;
      return;
    }

    const count = KITCHENS_BY_SLUG[project.slug];
    if (count === undefined) {
      unmatched.push(project.slug);
      return;
    }

    project.kitchens = count;
    updated += 1;
  });

  if (updated > 0) {
    page.markModified("sections.projects.projects");
    await page.save();
  }

  console.log(
    `Backfill complete: ${updated} project(s) given a kitchens count, ${skipped} already had one and were left alone.`,
  );

  if (unmatched.length > 0) {
    console.warn(
      `No kitchens count mapped for these slugs (not present in KITCHENS_BY_SLUG) — left untouched: ${unmatched.join(", ")}`,
    );
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
