export type StructuredCopilotTrade =
  | "plumbing_heating"
  | "electrician"
  | "carpentry_joinery"
  | "tiling_flooring"
  | "roofing"
  | "masonry"
  | "landscaping"
  | "locksmith_metalwork";

export type CopilotTrade = "interior_painting" | "upholstery_decorator" | StructuredCopilotTrade;
export type CopilotJobType = "interior_painting_apartment" | "upholstery_furniture" | "structured_trade_job";
export type CopilotProposalStatus = "ready_for_review" | "needs_information";
export type CopilotSourceKind = "user_input" | "company_catalog" | "template_default" | "calculated";
export type CopilotUnit = "m2" | "m" | "ml" | "l" | "h" | "jour" | "unite" | "forfait";

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

export type UpholsteryDecoratorFacts = {
  itemKind: "fauteuil" | "canape" | "chaise" | "rideau" | "tenture" | "autre" | null;
  itemLabel: string;
  itemCount: number;
  technique: "traditionnelle" | "mousse" | "mixte" | null;
  includeStripping: boolean;
  includeUpholsteryWork: boolean;
  includeCovering: boolean;
  fabricProvidedBy: "client" | "artisan" | "unknown";
  fabricMeters: number | null;
  includeTrim: boolean;
  trimProvidedBy: "client" | "artisan" | "unknown";
  includePickup: boolean;
  includeDelivery: boolean;
  labourHours: number | null;
};

export type StructuredTradeServiceFact = {
  serviceCode: string;
  quantity: number | null;
  unit: CopilotUnit | null;
  detail: string;
};

export type StructuredTradeFacts = {
  services: StructuredTradeServiceFact[];
};

type CopilotInterpretationBase<TTrade extends CopilotTrade, TJobType extends CopilotJobType, TFacts> = {
  trade: TTrade;
  jobType: TJobType;
  customerHint: string;
  title: string;
  facts: TFacts;
  understoodData: string[];
  assumptions: string[];
  missingInformation: string[];
  potentialOmissions: string[];
  confidence: number;
};

export type CopilotInterpretation = CopilotInterpretationBase<
  "interior_painting",
  "interior_painting_apartment",
  InteriorPaintingFacts
>;

export type UpholsteryDecoratorInterpretation = CopilotInterpretationBase<
  "upholstery_decorator",
  "upholstery_furniture",
  UpholsteryDecoratorFacts
>;

export type StructuredTradeInterpretation = CopilotInterpretationBase<
  StructuredCopilotTrade,
  "structured_trade_job",
  StructuredTradeFacts
>;

export type AnyCopilotInterpretation = CopilotInterpretation | UpholsteryDecoratorInterpretation | StructuredTradeInterpretation;

export type CopilotCatalogService = {
  code: string;
  label: string;
  description: string;
  unit: CopilotUnit;
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
  unit: CopilotUnit;
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

export type CopilotProposal<TInterpretation extends AnyCopilotInterpretation = CopilotInterpretation> = {
  status: CopilotProposalStatus;
  interpretation: TInterpretation;
  lines: CopilotProposalLine[];
  questions: string[];
  metrics: CopilotProposalMetrics;
};

export type AnyCopilotProposal = CopilotProposal<AnyCopilotInterpretation>;
