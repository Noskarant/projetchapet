import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
mkdirSync("public", { recursive: true });
copyFileSync(require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"), "public/pdf.worker.min.mjs");
cpSync(join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts"), "public/pdf-standard-fonts", { recursive: true });
