"use client";

// One page of the matching tests as a ruled table (rules between rows only). The head sticks from
// 1280 px (xl), where the table fits its column; below that the wrapper scrolls sideways, which
// would cancel a sticky head, so it has none. Converted values show the value as published under
// them; empty values read "not stated"; flags are words, never colour only, and sit under the
// test ID. A reason a flag badge already gives is not printed a second time (DOB-125).
import {
  NOT_STATED,
  flagExplanation,
  flagLabel,
  formatValue,
  originalValue,
  textOrNotStated,
  unflaggedReason,
  type ValueField,
} from "@/lib/tests";
import type { TestRow } from "@/lib/types";

const TH = "px-2.5 py-2 text-left align-bottom text-[0.875rem] font-semibold";
const TD = "px-2.5 py-2 align-top";

export function TestsTable({ rows, onOpen, stale = false }: { rows: TestRow[]; onOpen: (testId: string) => void; stale?: boolean }) {
  return (
    <div
      className={`mt-3 overflow-x-auto rounded-md border border-rule bg-card transition-opacity duration-200 xl:overflow-visible ${stale ? "opacity-50" : ""}`}
    >
      <table data-testid="tests-table" className="w-full min-w-[46rem] border-collapse text-[0.875rem] xl:min-w-0">
        <caption className="sr-only">
          Matching tests, one per row. Flags sit under the test ID. The line under a value is how the source table writes it.
        </caption>
        <thead className="border-b border-line bg-surface-sunk xl:sticky xl:top-0 xl:z-10">
          <tr>
            <th scope="col" className={TH}>Test and flags</th>
            <th scope="col" className={TH}>Investigation</th>
            <th scope="col" className={TH}>Fuel</th>
            <th scope="col" className={`${TH} text-right`}>Oxygen</th>
            <th scope="col" className={`${TH} text-right`}>Pressure</th>
            <th scope="col" className={`${TH} text-right`}>Airflow</th>
            <th scope="col" className={TH}>Added gas (diluent)</th>
            <th scope="col" className={TH}>How it ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.test_id} data-testid="test-row" data-test-id={row.test_id} className="rise border-b border-rule transition-colors duration-150 last:border-b-0 hover:bg-accent-wash">
              <td className={TD}>
                <button
                  type="button"
                  onClick={() => onOpen(row.test_id)}
                  aria-label={`Open test ${row.test_id}`}
                  className="cursor-pointer whitespace-nowrap rounded-sm font-mono text-[0.875rem] text-accent underline underline-offset-[3px] hover:text-accent-hover"
                >
                  {row.test_id}
                </button>
                <Flags flags={row.flags} />
                <NotComparable row={row} />
              </td>
              <td className={TD}>
                {row.acronym ? <span className="block">{row.acronym}</span> : null}
                <span className="block font-mono text-[0.875rem] text-ink-2">{row.psi_id}</span>
                {row.table_name && row.table_name !== row.acronym ? (
                  <span className="block text-[0.875rem] text-ink-2">
                    <span className="sr-only">Table: </span>
                    {row.table_name}
                  </span>
                ) : null}
              </td>
              <td className={TD}>
                <span>{textOrNotStated(row.fuel)}</span>
                {row.fuel_phase ? <span className="block text-[0.875rem] text-ink-2">{row.fuel_phase}</span> : null}
              </td>
              <ValueCell row={row} field="o2_mole_fraction" value={row.o2_mole_fraction} />
              <ValueCell row={row} field="pressure_kpa" value={row.pressure_kpa} />
              <ValueCell row={row} field="flow_cm_s" value={row.flow_cm_s} />
              <td className={TD}>
                <Stated text={row.diluent} />
              </td>
              <td className={TD}>
                <Stated text={row.outcome} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A test that lacks oxygen or pressure is not on the chart: said in words, unless a flag badge already says why. */
function NotComparable({ row }: { row: TestRow }) {
  const reason = unflaggedReason(row);
  if (!reason) return null;
  return (
    <span data-testid="not-comparable" className="mt-1 block max-w-[12rem] text-[0.875rem] leading-snug text-ink-2">
      <span className="font-medium text-ink">Not on the chart:</span> {reason}.
    </span>
  );
}

function Stated({ text }: { text: string | null }) {
  const shown = textOrNotStated(text);
  return shown === NOT_STATED ? <span className="whitespace-nowrap text-ink-2">{NOT_STATED}</span> : <span>{shown}</span>;
}

function ValueCell({ row, field, value }: { row: TestRow; field: ValueField; value: number | null }) {
  const original = originalValue(row, field, value);
  return (
    <td className={`${TD} text-right tabular-nums`}>
      <span className={`whitespace-nowrap ${value === null ? "text-ink-2" : ""}`}>{formatValue(field, value)}</span>
      {original ? (
        <span className="block whitespace-nowrap text-[0.875rem] text-ink-2">
          <span className="sr-only">As published: </span>
          {original}
        </span>
      ) : null}
    </td>
  );
}

export function Flags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  // Words, never colour only. The badge is short; its title (hover) gives the explanation, as the test dialog does.
  return (
    <ul aria-label="Flags" className="mt-1 flex max-w-[12rem] flex-wrap gap-1">
      {flags.map((flag) => (
        <li
          key={flag}
          data-flag={flag}
          title={flagExplanation(flag)}
          className="inline-block cursor-help rounded-sm border border-warn bg-warn-wash px-1.5 text-[0.875rem] leading-snug text-warn"
        >
          {flagLabel(flag)}
        </li>
      ))}
    </ul>
  );
}
