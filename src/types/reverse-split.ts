export type SplitConfidence = "High" | "Medium" | "Low";

export type ReverseSplitEvent = {
  id: string;
  symbol: string;
  companyName: string;
  splitDate: string;
  ratio: string;
  ratioFrom: number;
  ratioTo: number;
  sources: string[];
  confidence?: SplitConfidence;
  roundingUp?: boolean;
  filingUrl?: string;
  summary?: string;
  lastUpdated: string;
};

export type DashboardTab = "day" | "month" | "table";
