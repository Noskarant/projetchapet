import { interpretInteriorPaintingDescription } from "./interior-painting";
import type { CopilotInterpretation } from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(",", "."))
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  return round(parsed, 2);
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeInteriorPaintingAiInterpretation(
  description: string,
  raw: unknown,
): CopilotInterpretation {
  const fallback = interpretInteriorPaintingDescription(description);
  if (!isRecord(raw)) return fallback;
  const rawFacts = isRecord(raw.facts) ? raw.facts : raw;

  const floorAreaM2 = finiteNumber(rawFacts.floor_area_m2 ?? rawFacts.floorAreaM2, 0.1, 100_000)
    ?? fallback.facts.floorAreaM2;
  let wallAreaM2 = finiteNumber(rawFacts.wall_area_m2 ?? rawFacts.wallAreaM2, 0.1, 100_000)
    ?? fallback.facts.wallAreaM2;
  let ceilingAreaM2 = finiteNumber(rawFacts.ceiling_area_m2 ?? rawFacts.ceilingAreaM2, 0.1, 100_000)
    ?? fallback.facts.ceilingAreaM2;
  const doorCount = Math.round(finiteNumber(rawFacts.door_count ?? rawFacts.doorCount, 0, 100)
    ?? fallback.facts.doorCount);
  const includeWalls = optionalBoolean(rawFacts.include_walls ?? rawFacts.includeWalls)
    ?? fallback.facts.includeWalls;
  const includeCeilings = optionalBoolean(rawFacts.include_ceilings ?? rawFacts.includeCeilings)
    ?? fallback.facts.includeCeilings;
  const includeDoors = optionalBoolean(rawFacts.include_doors ?? rawFacts.includeDoors)
    ?? (doorCount > 0 || fallback.facts.includeDoors);
  const hasCracks = optionalBoolean(rawFacts.has_cracks ?? rawFacts.hasCracks)
    ?? fallback.facts.hasCracks;
  const assumptions: string[] = [];

  if (includeWalls && wallAreaM2 === null && floorAreaM2 !== null) {
    wallAreaM2 = round(floorAreaM2 * 2.4, 2);
    assumptions.push(`Surface de murs estimée à ${wallAreaM2} m² à partir de ${floorAreaM2} m² au sol (coefficient 2,4).`);
  }
  if (includeCeilings && ceilingAreaM2 === null && floorAreaM2 !== null) {
    ceilingAreaM2 = floorAreaM2;
    assumptions.push(`Surface de plafonds estimée à ${ceilingAreaM2} m², égale à la surface au sol.`);
  }

  const missingInformation: string[] = [];
  if (includeWalls && wallAreaM2 === null) missingInformation.push("Indiquer la surface de murs à peindre.");
  if (includeCeilings && ceilingAreaM2 === null) missingInformation.push("Indiquer la surface de plafonds à peindre.");
  if (!includeWalls && !includeCeilings && !includeDoors) {
    missingInformation.push("Préciser les éléments à peindre : murs, plafonds ou portes.");
  }

  const understoodData: string[] = [];
  if (floorAreaM2 !== null) understoodData.push(`Surface au sol comprise : ${floorAreaM2} m².`);
  if (wallAreaM2 !== null) understoodData.push(`Surface de murs comprise : ${wallAreaM2} m².`);
  if (ceilingAreaM2 !== null) understoodData.push(`Surface de plafonds comprise : ${ceilingAreaM2} m².`);
  if (doorCount > 0) understoodData.push(`${doorCount} porte${doorCount > 1 ? "s" : ""} à peindre.`);
  if (hasCracks) understoodData.push("Présence de fissures ou reprises à traiter.");

  const confidence = finiteNumber(raw.confidence, 0, 1) ?? fallback.confidence;

  return {
    ...fallback,
    customerHint: cleanText(raw.customer_hint ?? raw.customerHint, 160) || fallback.customerHint,
    title: cleanText(raw.title, 180) || fallback.title,
    facts: {
      ...fallback.facts,
      floorAreaM2,
      wallAreaM2,
      ceilingAreaM2,
      doorCount,
      hasCracks,
      includeWalls,
      includeCeilings,
      includeDoors,
    },
    understoodData,
    assumptions,
    missingInformation,
    confidence,
  };
}
