export type CopilotTrade = "interior_painting";
export type CopilotJobType = "interior_painting_apartment";
export type CopilotProposalStatus = "ready_for_review" | "needs_information";
export type CopilotSourceKind = "user_input" | "company_catalog" | "template_default" | "calculated";

export type InteriorPaintingFacts = {
  floorAreaM2: number | null;
  wallAreaM2: number | null;
  ceilingAreaM2: number | null;
  doorCount: number;
  hasCracks: boolean;
  includeWalls: boolean;
  includeCeilings: boolean;
  includeDoors: boolean;
  includeProtection: boolean;
  includeCleaning: boolean;
  finishLevel: "standard" | "premium";
};

export type CopilotInterpretation = {
  trade: CopilotTrade;
  jobType: CopilotJobType;
  customerHint: string;
  title: string;
  facts: InteriorPaintingFacts;
  understoodData: string[];
  assumptions: string[];
  missingInformation: string[];
  potentialOmissions: string[];
  confidence: number;
};

export type CopilotCatalogService = {
  code: string;
  label: string;
  description: string;
  unit: "m2" | "unite" | "forfait";
  unitPriceHt: number;
  materialCostPerUnit: number;
  labourHoursPerUnit: number;
  taxRate: number;
  source: "company_catalog" | "template_default";
};

export type CopilotCompanySettings = {
  hourlyCost: number;
  targetMarginRate: number;
  defaultTaxRate: number;
  includeTravelFee: boolean;
};

export type CopilotProposalLine = {
  code: string;
  label: string;
  description: string;
  quantity: number;
  unit: "m2" | "unite" | "forfait";
  unitPriceHt: number;
  taxRate: number;
  saleTotalHt: number;
  materialCost: number;
  labourHours: number;
  labourCost: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginRate: number;
  source: CopilotSourceKind;
  sourceLabel: string;
};

export type CopilotProposalMetrics = {
  saleTotalHt: number;
  materialCost: number;
  labourHours: number;
  labourCost: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginRate: number;
  targetMarginRate: number;
  marginAlert: string | null;
};

export type CopilotProposal = {
  status: CopilotProposalStatus;
  interpretation: CopilotInterpretation;
  lines: CopilotProposalLine[];
  questions: string[];
  metrics: CopilotProposalMetrics;
};
