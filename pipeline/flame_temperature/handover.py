"""module.json, evidence.json and findings.json: the hand-over to the web app.

Every value is read from flex_tests.json, flex_checks.json, flex_gaps.json (the coverage
headline, the designed batch) or flex_doe.json (the design-of-experiments checks) by this script; none is typed by hand. Shapes follow the contract in contracts/ (DOB-82); check with
`python3 contracts/validate.py data/modules/flame-temperature`.

Written with SI assistance (Claude Code).
"""

import json
from pathlib import Path

MODULE_ID = "flame-temperature"
PSI69_FILE = "PSI-69_Experimental table_FLEX.csv"
PSI10_FILE = "PSI-10_Experimental table_Flame Design_Normal Flame.csv"
PROVENANCE = {"MODEL", "PSI_TABLE", "VIDEO_MEASURED", "PUBLISHED", "HAND_MEASURED", "SI_EXTRACTED"}

CANNOT_TELL = [
    "Single liquid droplets only: nothing here says how a spreading fire on a solid surface behaves.",
    "Microgravity only: no test was run in Moon or Mars gravity.",
    "Helium is supported by 50 tests but not proven: helium does not line up with nitrogen and carbon dioxide on temperature alone.",
    "The ceiling temperature is calculated, not measured. It is not the flame's real temperature.",
    "Visible flame only: a flame that goes out of sight (for example a cool flame) counts as out.",
    "Tested ranges only: oxygen 12 to 34%, carbon dioxide up to 70%, helium up to 45%, pressure 0.7 to 1 atm.",
    "The gap list says how far a condition is from the nearest real test. It is not a prediction of what a flame would do there.",
    "The gap list checks only PSI's droplet tables (FLEX PSI-69, CFI PSI-39, FLEX-2 PSI-68). The ACME gas-flame tables were not checked.",
    "FLEX-2 (PSI-68) lists only a planned range, no per-test rows, so PSI cannot say which FLEX-2 conditions flew.",
]

# Quantities written per test: (quantity, field in flex_tests.json, unit, provenance).
QUANTITIES = [
    ("ceiling_temperature", "ceiling_temperature_k", "K", "MODEL"),
    ("heat_spreading_speed", "heat_spreading_m2_s", "m^2/s", "MODEL"),
    ("share_burned", "share_burned", "fraction of fuel volume", "PSI_TABLE"),
]


def _source(psi_id: str, header: dict) -> dict:
    return {"psi_id": psi_id, "file": PSI69_FILE if psi_id == "PSI-69" else PSI10_FILE,
            "link": header["psi_ids"][psi_id]}


def module(status: str = "built") -> dict:
    return {
        "id": MODULE_ID,
        "title": "Flame temperature",
        "stage": "suppress",
        "psi_ids": ["PSI-69", "PSI-10", "PSI-39", "PSI-68"],
        "question": "What puts it out?",
        "summary": ("For every FLEX droplet test we compute how hot the flame could get in that gas "
                    "(ceiling temperature) and how fast the gas spreads heat, then check how well those "
                    "two numbers explain how much fuel burned before the flame went out. The check "
                    "against NASA's own flame temperatures in PSI-10 and the checks on unseen tests "
                    "are listed beside every number."),
        "cannot_tell": CANNOT_TELL,
        "status": status,
        "files": [
            {"name": "flex_tests.json", "kind": "tests", "description": "One row per FLEX test with both computed numbers and the measured outcome."},
            {"name": "flex_grid.json", "kind": "grid", "description": "Slider grid with predictions and the nearest real tests."},
            {"name": "flex_checks.json", "kind": "checks", "description": "The seven checks with counts and the 14 Nov trial-run values."},
            {"name": "flex_gaps.json", "kind": "table", "description": "Next test to fly: grid cells at 30 to 34% oxygen and about 0.7 atm ranked by distance to the nearest real FLEX or CFI test, and the next tests picked as one designed batch."},
            {"name": "flex_doe.json", "kind": "checks", "description": "Design-of-experiments checks on the fitted link: its error against the scatter of repeated tests, and the replay of batch picking on tests already flown."},
        ],
    }


def evidence(tests_doc: dict) -> list[dict]:
    header, tests = tests_doc["header"], tests_doc["tests"]
    usable = [t for t in tests if not t["flags"]["dropped"]]
    complete = [t for t in usable if t["share_burned"] is not None]
    out = []
    for t in usable:
        for quantity, field, unit, prov in QUANTITIES:
            if t[field] is None:  # share of fuel burned is empty for incomplete tests
                continue
            out.append({
                "id": f"{MODULE_ID}/{t['test_id']}/{quantity}",
                "module": MODULE_ID,
                "test_id": t["test_id"],
                "quantity": quantity,
                "value": t[field],
                "unit": unit,
                "n": 1,
                "conditions": {k: t[k] for k in ("fuel", "pressure_atm", "x_o2", "x_n2", "x_co2", "x_he",
                                                 "gas_label", "d0_mm")},
                "provenance": prov,
                "source": _source("PSI-69", header),
                "flags": [k for k, v in t["flags"].items() if v and k != "dropped"],  # only the true ones
            })
    # Two computed numbers for every usable test; share burned only where both diameters exist.
    assert len(out) == 2 * len(usable) + len(complete), (len(out), len(usable), len(complete))
    ids = [r["id"] for r in out]
    assert len(ids) == len(set(ids)), "duplicate evidence ids"
    assert all(r["provenance"] in PROVENANCE and r["source"]["psi_id"] and r["source"]["file"] and r["test_id"]
               for r in out)
    return out


def _check_text(c: dict) -> tuple[str, float, str, int]:
    """One sentence, a value, its unit and its count for each check."""
    r, cid = c["result"], c["id"]
    if cid == "air_temperatures":
        return ("In normal air at 1 atm the computed flame temperatures are methane %.0f K, heptane %.0f K "
                "and methanol %.0f K." % (r["Methane"], r["Heptane"], r["Methanol"]),
                r["Methanol"], "K (methanol)", c["n"])
    if cid == "psi10_tad":
        return ("Against NASA's own flame temperatures in PSI-10 our values are off by %.1f K at the median "
                "and %.1f K at worst over %d flames (mean %.0f K ours against %.0f K NASA's)."
                % (r["median_abs_offset_k"], r["worst_abs_offset_k"], c["n"], c["mean_ours_k"], c["mean_nasa_k"]),
                c["mean_ours_k"], "K (mean over compared flames)", c["n"])
    if cid == "conduction":
        return ("Heat conduction of pure nitrogen, carbon dioxide and helium at 300 K is within 10%% of textbook "
                "values (%.4f, %.4f and %.4f W/(m K))." % (r["nitrogen"], r["carbon dioxide"], r["helium"]),
                r["helium"], "W/(m K) (helium)", c["n"])
    if cid == "fitted_link":
        f, o = r["fitted_link"], r["oxygen_only"]
        return ("On tests from days it never saw, the two numbers explain %.0f%% of the variation in fuel burned "
                "(error about %.0f points), against %.0f%% for the oxygen level alone."
                % (f["r2"] * 100, f["mean_abs_error_points"], o["r2"] * 100), f["r2"], "R2", c["n"])
    if cid == "carry_over_nitrogen_to_co2":
        t, o = r["temperature"], r["oxygen"]
        return ("Trained on nitrogen-only tests, ceiling temperature predicts burning rate in carbon dioxide tests "
                "(R2 %.2f) better than the oxygen level does (R2 %.2f)." % (t["r2"], o["r2"]),
                t["r2"], "R2", c["n_test"])
    if cid == "carry_over_helium":
        t, b = r["temperature_only"], r["both_numbers"]
        return ("For methanol tests with helium, temperature alone fails (R2 %.2f); adding heat-spreading speed "
                "gives R2 %.2f, so helium is not explained by temperature alone." % (t["r2"], b["r2"]),
                b["r2"], "R2", c["n_test"])
    if cid == "repeatability":
        return ("Near-identical tests end %.1f points apart in share of fuel burned (median), the noise floor for "
                "any model." % r["median_points_apart"], r["median_points_apart"], "points", c["n_pairs"])
    raise KeyError(cid)


def findings(tests_doc: dict, checks_doc: dict) -> list[dict]:
    header, tests = tests_doc["header"], tests_doc["tests"]
    out = []
    # One record of kind check per check in flex_checks.json.
    for c in checks_doc["checks"]:
        text, value, unit, n = _check_text(c)
        psi = "PSI-10" if c["id"] in ("psi10_tad",) else "PSI-69"
        rec = {"id": f"{MODULE_ID}/check/{c['id']}", "module": MODULE_ID, "kind": "check", "text": text,
               "value": value, "unit": unit, "n": n, "provenance": "MODEL",
               "source": _source(psi, checks_doc["header"]), "passed": bool(c["passed"])}
        out.append(rec)
    # Headlines: the numbers the page puts into words.
    usable = [t for t in tests if not t["flags"]["dropped"]]
    out.append({"id": f"{MODULE_ID}/headline/usable_tests", "module": MODULE_ID, "kind": "headline",
                "text": f"{len(usable)} of the {len(tests)} FLEX tests have both computed numbers; one test (114) lists a pressure of 0 and is left out.",
                "value": len(usable), "unit": "tests", "n": len(tests), "provenance": "PSI_TABLE",
                "source": _source("PSI-69", header)})
    for key, t in sorted(header["coldest_ceiling_temperature_k"].items()):
        fuel, label = key.split(" / ")
        n = sum(1 for r in usable if r["fuel"] == fuel and r["gas_label"] == label)
        slug = (fuel + "_" + label).lower().replace(" ", "_")
        out.append({"id": f"{MODULE_ID}/headline/coldest_{slug}", "module": MODULE_ID, "kind": "headline",
                    "text": f"The coldest {fuel.lower()} mixture ({label}) that still gave a recorded test has a ceiling temperature of {t:.0f} K; this is the edge of what was tested, not a measured limit.",
                    "value": t, "unit": "K", "n": n, "provenance": "MODEL", "source": _source("PSI-69", header)})
    by_id = {c["id"]: c for c in checks_doc["checks"]}
    link = by_id["fitted_link"]
    out.append({"id": f"{MODULE_ID}/headline/link_error", "module": MODULE_ID, "kind": "headline",
                "text": f"The fitted link is off by about {link['result']['fitted_link']['mean_abs_error_points']:.0f} points of fuel burned on unseen test days.",
                "value": link["result"]["fitted_link"]["mean_abs_error_points"], "unit": "points", "n": link["n"],
                "provenance": "MODEL", "source": _source("PSI-69", header)})
    for rec in out:
        assert rec["kind"] in ("headline", "check") and rec["provenance"] in PROVENANCE
        assert rec["source"]["psi_id"] and rec["source"]["file"] and rec["text"] and rec["n"] is not None
        assert (rec["kind"] == "check") == ("passed" in rec)
    assert sum(r["kind"] == "check" for r in out) == len(checks_doc["checks"]) == 7
    return out


def coverage_headline(gaps_doc: dict, evidence_ids: set) -> dict:
    """The coverage headline (DOB-113), from the counts gaps.py measured in the PSI tables.

    Value: the highest oxygen mole fraction among the diluted per-test rows of FLEX and CFI.
    n: how many diluted rows were counted. Evidence: the FLEX tests at that oxygen level."""
    h = gaps_doc["header"]
    if not h["headline_holds"]:
        raise ValueError("the PSI tables contradict the coverage headline: " + "; ".join(h["headline_problems"]))
    cov = h["coverage"]
    ev = []
    for tid in cov["flex"]["tests_at_max_x_o2_diluted"]:
        for quantity in ("share_burned", "ceiling_temperature"):  # the table value first
            eid = f"{MODULE_ID}/{tid}/{quantity}"
            if eid in evidence_ids:
                ev.append(eid)
                break
    return {"id": f"{MODULE_ID}/headline/coverage_diluted_oxygen", "module": MODULE_ID, "kind": "headline",
            "text": h["headline"], "value": cov["max_x_o2_diluted_per_test"],
            "unit": "mole fraction of oxygen (highest among diluted per-test rows)",
            "n": cov["diluted_rows_counted"], "provenance": "PSI_TABLE",
            "source": {"psi_id": "PSI-69", "file": PSI69_FILE, "link": h["psi_ids"]["PSI-69"]},
            "evidence_ids": ev}


def designed_batch_headline(gaps_doc: dict) -> dict:
    """The designed batch (DOB-114) in one sentence, every number read from flex_gaps.json.

    Value: the largest gap left in the region once the default batch is flown, in slider widths.
    n: the real per-test rows the distances were measured against."""
    h = gaps_doc["header"]
    c = h["campaign"]
    k = c["default_tests"]
    start, at = c["curve"][0], c["curve"][k]
    text = (f"Flown as one designed batch, {k} tests would leave no condition at 30 to 34% oxygen farther than "
            f"{at['designed_batch']:.2f} of a slider width from a test (today: {start['designed_batch']:.2f}). "
            f"The first {k} conditions of a one-by-one ranking would leave {at['ranked_list']:.2f}. "
            "This is coverage of the tested conditions, not a prediction of what a flame would do.")
    return {"id": f"{MODULE_ID}/headline/designed_batch", "module": MODULE_ID, "kind": "headline",
            "text": text, "value": at["designed_batch"],
            "unit": f"slider widths (largest gap left after {k} tests)",
            "n": sum(h["reference_rows"].values()), "provenance": "PSI_TABLE",
            "source": {"psi_id": "PSI-69", "file": PSI69_FILE, "link": h["psi_ids"]["PSI-69"]}}


def doe_findings(doe_doc: dict) -> list[dict]:
    """One record of kind check per check in flex_doe.json, every number read from the file."""
    h = doe_doc["header"]
    source = {"psi_id": "PSI-69", "file": PSI69_FILE, "link": h["psi_ids"]["PSI-69"]}
    out = []
    for c in doe_doc["checks"]:
        r = c["result"]
        if c["id"] == "lack_of_fit":
            lo, hi = r["ratio_interval_95"]
            text = (f"On unseen test days the model misses by about {r['ratio']:.1f} times the scatter between "
                    f"repeated tests ({r['model_rmse_points']:.1f} against {r['pure_error_sd_points']:.1f} points; "
                    f"95% interval {lo:.1f} to {hi:.1f}, from {c['n_pairs']} pairs). About "
                    f"{r['share_of_squared_error_that_is_scatter'] * 100:.0f}% of its squared error is scatter no "
                    "model could remove; the rest is something the two physical numbers do not capture.")
            value, unit, n = r["ratio"], "times the scatter between repeated tests", c["n_pairs"]
        elif c["id"] == "batch_replay":
            first = r["replays"][0]
            m, n_ahead = first["summary"]["mean_over_sizes"], len(r["batch_ahead_in"])
            names = {x["id"]: x["region"] for x in r["replays"]}
            behind = "; it was behind for " + " and ".join(names[i] for i in r["batch_behind_in"]) if r["batch_behind_in"] else ""
            text = (f"Replayed on tests already flown: with the {first['n_region']} {first['region']} treated as never "
                    f"flown, the model is {first['summary']['none_handed_back_points']:.1f} points off on them. Handed "
                    f"back as a designed batch they leave it {m['batch']:.1f} points off on average over batch sizes "
                    f"{m['sizes']}, against {m['ranked_list']:.1f} for the top of a one-by-one ranking and "
                    f"{first['all_candidates_points']:.1f} with every test handed back. The batch was ahead of the "
                    f"ranking in {n_ahead} of {c['n_replays']} replays{behind}.")
            value, unit, n = m["batch"], f"points of fuel burned (mean error over batch sizes {m['sizes']})", first["n_region"]
        else:
            raise KeyError(c["id"])
        out.append({"id": f"{MODULE_ID}/check/{c['id']}", "module": MODULE_ID, "kind": "check", "text": text,
                    "value": value, "unit": unit, "n": n, "provenance": "MODEL", "source": source,
                    "passed": bool(c["passed"])})
    return out


def write_all(out_dir: Path) -> dict:
    tests_doc = json.loads((out_dir / "flex_tests.json").read_text(encoding="utf-8"))
    checks_doc = json.loads((out_dir / "flex_checks.json").read_text(encoding="utf-8"))
    gaps_doc = json.loads((out_dir / "flex_gaps.json").read_text(encoding="utf-8"))  # written by gaps.py
    ev, fi = evidence(tests_doc), findings(tests_doc, checks_doc)
    fi.append(coverage_headline(gaps_doc, {r["id"] for r in ev}))
    fi.append(designed_batch_headline(gaps_doc))
    doe_doc = json.loads((out_dir / "flex_doe.json").read_text(encoding="utf-8"))  # written by doe.py
    fi.extend(doe_findings(doe_doc))
    for name, payload in (("module.json", module()), ("evidence.json", ev), ("findings.json", fi)):
        (out_dir / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"evidence": len(ev), "findings": len(fi)}
