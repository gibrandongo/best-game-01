// main.ts — entrypoint for the best-game-01 program (Node 22).
// Plain JavaScript syntax only, standard library only.
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-game.ts.
//
// The output directory itself is never removed: the grader runs as an
// unprivileged user with a read-only parent directory, so only the
// directory's CONTENTS are cleared before the fresh copy lands.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

const CAPS = {
  text_max_bytes: 163840,
  dossier_max_bytes: 1572864,
  max_images: 4,
};

function clearContents(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return;
  }
  for (const child of readdirSync(dir)) {
    rmSync(join(dir, child), { recursive: true, force: true });
  }
}

function copyTree(src, dest) {
  cpSync(src, dest, { recursive: true });
}

clearContents(outputDir);
copyTree(join(repoRoot, "game"), join(outputDir, "game"));
copyTree(join(repoRoot, "screenshots"), join(outputDir, "screenshots"));

const dossier = await buildDossier(outputDir, CAPS);
writeFileSync(join(outputDir, "dossier.json"), dossier);
console.log("wrote dossier.json (" + dossier.length + " bytes) to " + outputDir);
