import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("guided first-run tour", () => {
  it("is wired only when auth bypass is disabled", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/responsive-app.tsx"), "utf8");
    expect(source).toContain('import GuidedFirstRunTour from "./guided-first-run-tour"');
    expect(source).toContain("!AUTH_BYPASS && <GuidedFirstRunTour />");
  });

  it("keeps the mandatory company onboarding and replaces only the tutorial experience", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
    expect(source).toContain('resolveFirstRunStage(readCompanyProfile(window.localStorage))');
    expect(source).toContain('next === "tutorial"');
    expect(source).toContain("markTutorialComplete");
    expect(source).toContain("Passer");
    expect(source).toContain("Précédent");
    expect(source).toContain("Suivant");
  });

  it("contains distinct mobile and desktop tours with operational destinations", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
    expect(source).toContain("DESKTOP_STEPS");
    expect(source).toContain("MOBILE_STEPS");
    for (const destination of ["Clients", "Devis", "Factures", "Chantiers", "Paramètres", "Copilote"]) {
      expect(source).toContain(destination);
    }
  });

  it("teaches the voice-first workflow on desktop and mobile", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
    expect(source).toContain("Parlez. MANUFEO prépare. Vous validez.");
    expect(source).toContain(".pc-ai-launcher");
    expect(source).toContain(".pc-mobile-ai-fab");
    expect(source).toContain("Dicter avec l’IA");
    expect(source).toContain("transcription → lignes structurées → vérification → préremplissage");
  });

  it("clearly distinguishes voice entry from the trade copilot", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
    expect(source).toContain("Vocal IA =");
    expect(source).toContain("Copilote =");
    expect(source).toContain("coûts et marge");
    expect(source).toContain("oublis possibles");
  });
});
