import type { CompanyProfile } from "./company-profile";

export type FirstRunStage = "company" | "tutorial" | null;

export function companyOnboardingMissingFields(profile: CompanyProfile) {
  const missing: string[] = [];
  if (profile.legalName.trim().length < 2) missing.push("legalName");
  if (profile.siret.replace(/\D/g, "").length !== 14) missing.push("siret");
  if (!/^\S+@\S+\.\S+$/.test(profile.email.trim())) missing.push("email");
  if (profile.phone.trim().length < 6) missing.push("phone");
  if (profile.address.trim().length < 3) missing.push("address");
  if (profile.postalCode.trim().length < 4) missing.push("postalCode");
  if (profile.city.trim().length < 2) missing.push("city");
  return missing;
}

export function isCompanyOnboardingComplete(profile: CompanyProfile) {
  return companyOnboardingMissingFields(profile).length === 0;
}

export function resolveFirstRunStage(profile: CompanyProfile): FirstRunStage {
  if (!profile.onboardingCompletedAt && !isCompanyOnboardingComplete(profile)) return "company";
  if (profile.onboardingCompletedAt && !profile.tutorialCompletedAt) return "tutorial";
  return null;
}

export function markCompanyOnboardingComplete(profile: CompanyProfile, now = new Date().toISOString()): CompanyProfile {
  return {
    ...profile,
    onboardingCompletedAt: now,
  };
}

export function markTutorialComplete(profile: CompanyProfile, now = new Date().toISOString()): CompanyProfile {
  return {
    ...profile,
    tutorialCompletedAt: now,
  };
}
