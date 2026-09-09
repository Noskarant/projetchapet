import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const roots = ["app", "lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function extension(path: string) {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index) : "";
}

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : sourceExtensions.has(extension(path)) ? [path] : [];
  });
}

function matches(pattern: RegExp) {
  return roots.flatMap(sourceFiles).flatMap((path) => {
    const content = readFileSync(path, "utf8");
    return pattern.test(content) ? [relative(process.cwd(), path)] : [];
  });
}

test("aucune adresse historique de l’ancien environnement ne reste dans le code produit", () => {
  assert.deepEqual(matches(/@saschapet\.com/i), []);
});

test("les libellés visibles liés à l’ancienne présentation ne reviennent pas", () => {
  assert.deepEqual(matches(/(?:Démo locale|compléments de démo|compléments de démonstration|écrans de démonstration|test de Philippe)/i), []);
});

test("les principaux messages d’interface utilisent le vouvoiement", () => {
  assert.deepEqual(matches(/\b(?:ton|ta|tes|toi|tu)\b|\b(?:Renseigne|Utilise|Réessaie)\b/i), []);
});
