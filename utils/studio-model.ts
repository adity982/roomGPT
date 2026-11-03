export interface BudgetLine {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  supplier: string;
  url: string;
  status: "estimate" | "quoted";
}

export interface RoomVersion {
  id: string;
  label: string;
  kind: "source" | "concept";
  assetId: string;
  prompt: string;
  baseId?: string;
  createdAt: string;
}

export interface GenerationJob {
  id: string;
  predictionId?: string;
  callbackHash?: string;
  baseId: string;
  prompt: string;
  status: "starting" | "processing" | "succeeded" | "failed";
  error?: string;
  createdAt: string;
}

export interface ProposalSnapshot {
  projectName: string;
  client: string;
  version: RoomVersion;
  lines: BudgetLine[];
  budget: number;
  contingency: number;
  revision: number;
  createdAt: string;
}

export interface ReviewEntry {
  id: string;
  name: string;
  message: string;
  action: "comment" | "changes" | "approve";
  createdAt: string;
}

export interface Share {
  id: string;
  tokenHash: string;
  expiresAt: string;
  revoked: boolean;
  snapshot: ProposalSnapshot;
  entries: ReviewEntry[];
}

export interface StudioProject {
  id: string;
  ownerId: string;
  name: string;
  client: string;
  budget: number;
  brief: string;
  retain: string;
  measurements: string;
  contingency: number;
  lines: BudgetLine[];
  versions: RoomVersion[];
  selectedVersionId: string;
  jobs: GenerationJob[];
  shares: Share[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type PublicProject = Omit<StudioProject, "ownerId" | "shares"> & {
  shares: Omit<Share, "tokenHash">[];
};

export function budgetTotals(lines: BudgetLine[], contingency: number) {
  const subtotal =
    Math.round(
      lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) *
        100,
    ) / 100;
  const reserve = Math.round(subtotal * contingency) / 100;
  return {
    subtotal,
    reserve,
    total: Math.round((subtotal + reserve) * 100) / 100,
  };
}

export function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
