import { AppLink } from "@/components/AppLink";
import { FUEL_LABEL, KIND_LABEL, PILLAR_LABEL } from "@/lib/filters";
import { holdingsLine } from "@/lib/format";
import type { InvestigationSummary } from "@/lib/types";

/**
 * One ruled row of the investigations list: catalogue number, name, tags, summary, holdings.
 * The whole row opens the investigation: the title is the one link, stretched over the row, so
 * a click anywhere lands on it and keyboard and screen-reader users still meet a single link.
 */
export function InvestigationRow({ item }: { item: InvestigationSummary }) {
  return (
    <li
      data-testid="investigation-row"
      data-psi-id={item.psi_id}
      className="rise group relative grid gap-x-6 gap-y-1 border-b border-rule px-4 py-4 transition-colors duration-150 last:border-b-0 hover:bg-brand-soft/50 sm:grid-cols-[5.5rem_minmax(0,1fr)] xl:grid-cols-[5.5rem_minmax(0,1fr)_13rem]"
    >
      <p className="sm:pt-0.5">
        <span className="inline-flex h-6 items-center rounded-sm border border-line bg-surface-sunk px-2 font-mono text-[13px] font-medium text-ink">{item.psi_id}</span>
      </p>

      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold leading-snug">
          <AppLink href={`/investigations/${item.psi_id}`} className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:text-brand hover:underline group-hover:text-brand">
            {item.title}
          </AppLink>
          {item.acronym ? <span className="ml-2 font-normal text-ink-2">{item.acronym}</span> : null}
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">
          <span>{PILLAR_LABEL[item.pillar] ?? item.pillar}</span>
          <span aria-hidden="true" className="mx-2 text-control">|</span>
          <span>{FUEL_LABEL[item.fuel_phase] ?? item.fuel_phase}</span>
          <span aria-hidden="true" className="mx-2 text-control">|</span>
          <span>{item.hardware_group_label}</span>
          {item.ground_investigation ? (
            <>
              <span aria-hidden="true" className="mx-2 text-control">|</span>
              <span>Ground investigation</span>
            </>
          ) : null}
        </p>
        {item.summary_plain ? (
          <p className="mt-2 line-clamp-3 max-w-[70ch] text-ink">
            <span className="mr-1.5 text-[0.875rem] font-medium text-ink-2">SI-written summary:</span>
            {item.summary_plain}
          </p>
        ) : null}
      </div>

      <div className="mt-2 text-[0.875rem] text-ink-2 sm:col-start-2 xl:mt-0 xl:col-start-3 xl:text-right">
        <p className="tabular-nums text-ink">{holdingsLine(item.files_count, item.files_bytes, item.listed_bytes)}</p>
        <p className="mt-0.5">{item.data_kinds.map((kind) => KIND_LABEL[kind] ?? kind).join(", ") || "No data files"}</p>
      </div>
    </li>
  );
}
