// Shapes the site reads from the backend (apps/api).
// Engine shapes mirror contracts/*.schema.json (frozen, DOB-82). Catalog shapes are the ones
// documented in apps/web/fixtures/README.md and served by the catalog routes (DOB-66).

export type Provenance =
  | "VIDEO_MEASURED"
  | "PUBLISHED"
  | "PSI_TABLE"
  | "HAND_MEASURED"
  | "SI_EXTRACTED"
  | "MODEL";

export type Stage = "spread" | "detect" | "suppress";
export type Value = number | string | boolean;

export interface Source {
  psi_id: string;
  file: string;
  link?: string;
}

export interface ModuleFile {
  name: string;
  kind: string;
  description: string;
}

/** module.json */
export interface EngineModule {
  id: string;
  title: string;
  stage: Stage;
  psi_ids: string[];
  question: string;
  summary: string;
  cannot_tell: string[];
  status: "example" | "built";
  files: ModuleFile[];
}

/** One row of GET /modules. A not_built engine carries no numbers. */
export interface ModuleSummary {
  id: string;
  status: "example" | "built" | "not_built";
  title?: string;
  stage?: Stage;
  question?: string;
  evidence_count?: number;
  findings_count?: number;
  problems?: number;
}

/** One record of evidence.json */
export interface Evidence {
  id: string;
  module: string;
  test_id: string;
  segment?: string;
  quantity: string;
  value: Value;
  unit: string;
  uncertainty?: { interval: [number, number]; method: string };
  n: number;
  conditions: Record<string, unknown>;
  provenance: Provenance;
  source: Source;
  reference?: { value: Value; citation: string };
  assets?: string[];
  flags: string[];
}

/** One record of findings.json */
export interface Finding {
  id: string;
  module: string;
  kind: "headline" | "check";
  text: string;
  value: Value;
  unit: string;
  n: number;
  provenance: Provenance;
  source: Source;
  evidence_ids?: string[];
  passed?: boolean;
}

// ---------------------------------------------------------------- catalog

export type Pillar = "prevention" | "detection" | "suppression" | "related" | "fundamentals";
export type FuelPhase = "solid" | "liquid" | "gas" | "aerosol";
export type DataKind = "table" | "data_files" | "video" | "images" | "documents" | "archives";

/** One row of GET /catalog/investigations */
export interface InvestigationSummary {
  psi_id: string;
  acronym: string | null;
  title: string;
  ground_investigation: boolean;
  pillar: Pillar;
  stage: Stage | null;
  fuel_phase: FuelPhase;
  hardware_group: string;
  hardware_group_label: string;
  psi_sub_area: string | null;
  summary_plain: string | null;
  data_kinds: DataKind[];
  table_count: number;
  files_count: number;
  files_bytes: number;
  listed_bytes: number | null;
  publications_count: number;
  psi_url: string;
}

export interface InvestigationList {
  count: number;
  items: InvestigationSummary[];
}

export interface Tagged<T> {
  value: T;
  source: string;
}

export interface FileGroup {
  category: string;
  count: number;
  bytes: number;
}

export interface Publication {
  title: string;
  authors: string | null;
  doi: string | null;
}

/** GET /catalog/investigations/{psi_id} */
export interface InvestigationDetail extends InvestigationSummary {
  /** PSI's own text, copied unchanged from the record. */
  psi_text: {
    objective: string | null;
    approach: string | null;
    hypothesis: string | null;
    research_impacts: string | null;
  };
  summary_written_by: string | null;
  tags: {
    pillar: Tagged<Pillar>;
    fuel_phase: Tagged<FuelPhase>;
    hardware_group: Tagged<string>;
    measurements: Tagged<string[]>;
  };
  cannot_tell: string[];
  conditions: {
    hardware: string | null;
    hardware_link: string | null;
    flight_program: string | null;
    managing_center: string | null;
    start_date: string | null;
    end_date: string | null;
    release_date: string | null;
  };
  licence: { id: string | null; name: string | null; link: string | null };
  doi: string | null;
  files: {
    count: number;
    bytes: number;
    listed_bytes: number | null;
    by_category: FileGroup[];
    tables: { file_name: string; bytes: number }[];
  };
  publications: Publication[];
  related: string[];
  engines: { id: string; title: string; stage: Stage; status: "example" | "built" }[];
}

// ---------------------------------------------------------------- cabin air (DOB-83, DOB-84)

/** One side of the window may be open (null). Oxygen is a mole fraction, pressure is in kPa. */
export interface AirWindow {
  o2_min: number | null;
  o2_max: number | null;
  pressure_kpa_min: number | null;
  pressure_kpa_max: number | null;
  flow_cm_s_min: number | null;
  flow_cm_s_max: number | null;
}

export interface AirPreset {
  id: string;
  label: string;
  /** The window in plain words, written by the backend. */
  plain: string;
  /** The tolerance in plain words, written by the backend. */
  tolerance_plain: string;
  /** Where this atmosphere comes from, in one sentence (a PSI record or the challenge page). */
  source: string;
  window: AirWindow;
  /** Only on a custom air (GET /air/window): the point the visitor chose. */
  point?: { o2_mole_fraction: number; pressure_kpa: number };
}

/** The slider ranges of a custom air (oxygen as a mole fraction, pressure in kPa). */
export interface CustomAirRange {
  o2_min: number;
  o2_max: number;
  o2_step: number;
  pressure_kpa_min: number;
  pressure_kpa_max: number;
  pressure_kpa_step: number;
}

/** GET /air/presets */
export interface AirPresets {
  default: string;
  presets: AirPreset[];
  /** Present once the backend accepts a custom air (GET /air/window). */
  custom?: CustomAirRange;
  /** One sentence on what the sliders cover, written by the backend. */
  custom_plain?: string;
}

export type CoverageStatus = "tested" | "never_tested" | "not_stated";

export interface CoverageCount {
  status: CoverageStatus;
  /** Tests inside the window; null when the tables state no oxygen or pressure. */
  inside: number | null;
  /** Tests that state both oxygen and pressure. */
  stated: number;
}

export interface StageCoverage extends CoverageCount {
  investigations: (CoverageCount & { psi_id: string })[];
}

/** A key of the coverage answer: the three fire stages, plus `other` (no fire stage). */
export type CoverageStage = Stage | "other";

/** GET /air/coverage?air=<preset id>, or ?o2=&pressure_kpa= for a custom air (then `air` is "custom") */
export interface AirCoverage {
  air: string;
  window?: AirWindow;
  /** The shared columns the window bounds, for example ["o2_mole_fraction", "pressure_kpa"]. */
  constrains?: string[];
  /** `other` holds the investigations with no fire stage; a pillar never shows it. */
  stages: Partial<Record<CoverageStage, StageCoverage>>;
}

// ---------------------------------------------------------------- tests explorer (DOB-72, DOB-77)

/** A value as the source table writes it, before conversion to the site's unit. */
export interface OriginalValue {
  text: string;
  /** Null when the cell has no unit (an outcome, for example). */
  unit: string | null;
  column: string;
}

/** One row of GET /catalog/tests. Empty values are null, never 0. */
export interface TestRow {
  test_id: string;
  psi_id: string;
  acronym: string | null;
  /** The short name of the PSI table the row comes from, for example "FLEX" or "CFI-G, inverse flames". */
  table_name: string;
  /** Null when the table has no test-number column. */
  test_number: string | null;
  fuel: string | null;
  fuel_phase: FuelPhase | null;
  o2_mole_fraction: number | null;
  pressure_kpa: number | null;
  flow_cm_s: number | null;
  diluent: string | null;
  outcome: string | null;
  comparable: boolean;
  original: Partial<Record<"o2_mole_fraction" | "pressure_kpa" | "flow_cm_s" | "outcome" | "diluent", OriginalValue>>;
  flags: string[];
  source_file: string;
  source_row: number;
  /** The row's cells exactly as published; with include=raw, and always on GET /catalog/tests/{test_id}. */
  raw?: Record<string, string>;
  /** Every analysis evidence record about this test; with include=evidence, and always on the one-test route. */
  evidence?: Evidence[];
}

export interface FacetCount {
  value: string;
  count: number;
  /** The investigation's acronym, on the psi_id facet. */
  label?: string | null;
}

export type TestFacetKey = "psi_id" | "fuel" | "fuel_phase" | "outcome" | "diluent";

/** [test_id, psi_id, o2 mole fraction, pressure kPa] */
export type TestPoint = [string, string, number, number];

/** GET /catalog/tests */
export interface TestsResponse {
  total: number;
  limit: number;
  offset: number;
  items: TestRow[];
  facets: Partial<Record<TestFacetKey, FacetCount[]>>;
  excluded: { o2: number; pressure: number; flow: number };
  /** Only with include=points: every matching test that states both oxygen and pressure. */
  points?: { items: TestPoint[]; not_plotted: number };
}

// ---------------------------------------------------------------- ranking (DOB-73, DOB-78)

export type RankPartKey = "pillar" | "evidence" | "data" | "fuel";

export interface RankPart {
  /** From 0 to 1. */
  score: number;
  reason: string;
}

/** The evidence part also says how many tests ran inside the air, out of those that state it. */
export interface RankEvidencePart extends RankPart {
  /** Null when no table states what the air bounds (then `stated` is 0). */
  inside: number | null;
  stated: number;
}

export interface RankItem {
  rank: number;
  psi_id: string;
  acronym: string | null;
  pillar: Pillar;
  stage: Stage | null;
  score: number;
  parts: { pillar: RankPart; evidence: RankEvidencePart; data: RankPart; fuel: RankPart };
  /** One sentence a visitor reads. */
  reason: string;
}

/** GET /catalog/rank?air=<preset id> */
export interface RankResponse {
  air: string;
  weights: Record<RankPartKey, number>;
  weights_are_default: boolean;
  formula: string;
  items: RankItem[];
}

// ---------------------------------------------------------------- compare (DOB-75)

/** One cell of GET /catalog/compare: `value` null means the source does not state it. */
export interface CompareCell {
  value: unknown;
  source?: string;
  [extra: string]: unknown;
}

/** One aligned row: one cell per investigation, in the order asked. */
export interface CompareRow {
  key: string;
  label: string;
  unit?: string;
  same: boolean;
  cells: CompareCell[];
}

/** GET /catalog/compare?ids=PSI-69,PSI-68 */
export interface CompareResponse {
  ids: string[];
  investigations: { psi_id: string; acronym: string | null; title: string; ground_investigation: boolean; psi_url: string }[];
  rows: CompareRow[];
  not_stated: string;
  note: string;
}
