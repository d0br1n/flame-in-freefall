"""A small fake data/raw/json folder for the catalog tests (no download, no real PSI file).

Every value here is made up for the tests and never reaches the product. It has the shape of
the PSI detail records: one record per investigation in the curation file.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import json
from pathlib import Path

from pipeline.catalog.curation import validate as curation

GROUND = {"PSI-60", "PSI-62"}


def fake_record(pid: str) -> dict:
    n = int(pid.split("-")[1])
    return {
        "accession": pid,
        "investigationAcronym": "" if pid in GROUND else f"FAKE{n}",
        "title": f"Fake investigation {n}",
        "researchArea": "Combustion Science",
        "subResearchArea": "Spacecraft Fire Safety" if n % 2 else "Droplets",
        "projectType": "Ground Investigation" if pid in GROUND else "Microgravity Investigation",
        "related_glds": "PSI-26, PSI-25" if n == 25 else "",
        "flightProgram": "International Space Station (ISS)",
        "experimentHardware": "Fake rack",
        "experimentHardwareLink": "https://example.org/a, https://example.org/b",
        "managingNasaCenter": "Fake Center",
        "investigationStartDate": "08-01-2007",
        "investigationEndDate": "07-31-2016",
        "releaseDate": "31-Jul-2016",
        "modifiedDate": "06-Jun-2025",
        "doi": f"10.0000/fake-{n}",
        "licenseIdentifier": "CC0-1.0",
        "licenseName": "Creative Commons Zero v1.0 Universal",
        "licenseLink": "https://spdx.org/licenses/CC0-1.0.html",
        "objective": f"Objective of fake {n} about candle wax.",
        "approach": "Approach text.",
        "hypothesis": "",
        "researchImpacts": "",
        "totalFileSize": 923832535657.0,
        "experimentalTable": [
            {"file_name": f"{pid}_Experimental table_Fake.csv", "file_size": 2000, "subcategory": "",
             "version": 1, "visible": True},
        ] if n % 3 else [],
        "added": [
            {"file_name": "b.csv", "file_size": "300", "subcategory": "Run 1", "version": 1, "visible": True,
             "remote_path": f"/Home/psi-data/{pid}/Raw Data/Run 1/b.csv"},
            {"file_name": "a.mp4", "file_size": 100, "subcategory": "Run 1", "version": 1, "visible": True,
             "remote_path": f"/Home/psi-data/{pid}/Raw Data/Run 1/a.mp4"},
            {"file_name": "a.mp4", "file_size": 100, "subcategory": "Run 1", "version": 1, "visible": True},
            {"file_name": "report.pdf", "file_size": 50, "subcategory": "", "version": 1, "visible": True,
             "remote_path": f"/Home/psi-data/{pid}/Reports/report.pdf"},
            {"file_name": "hidden.csv", "file_size": 5, "subcategory": "", "version": 1, "visible": False},
        ],
        "removed": [{"file_name": "retracted.csv", "file_size": 9, "subcategory": "", "version": 1}],
        "publications": [
            {"title": "Paper one", "authorList": "A Author, B Author", "doi": "",
             "status": {"annotationValue": "published"}},
        ],
        "contacts": [
            {"firstName": "Ada", "midInitials": "B", "lastName": "Cole", "affiliation": "Fake University",
             "email": "ada@example.org", "phone": "123", "address": "Street 1",
             "roles": [{"annotationValue": "Principal Investigator (PI)"}]},
        ],
    }


def write_raw(root: Path) -> Path:
    """Fake root/json (one record per curated investigation) and root/tables. Returns root."""
    folder = Path(root) / "json"
    folder.mkdir(parents=True, exist_ok=True)
    for pid in curation.load():
        (folder / f"{pid}.json").write_text(json.dumps(fake_record(pid)), encoding="utf-8")
    write_tables(root)
    return Path(root)


def write_tables(root: Path) -> Path:
    """One fake row per experimental table, under root/tables, each in the table's own encoding."""
    from pipeline.catalog import tables

    folder = Path(root) / "tables"
    folder.mkdir(parents=True, exist_ok=True)
    for i, (name, a) in enumerate(sorted(tables.ADAPTERS.items())):
        cells = {}
        if a.test:
            cells[a.test] = f"T{i}"
        if a.fuel:
            cells[a.fuel] = "Fuel – A"           # an en dash: byte 0x96 in Windows-1252
        if a.o2:
            cells[a.o2[0]] = "0.21" if a.o2[1] == "fraction" else "21"
        if a.pressure:
            cells[a.pressure[0]] = "760" if a.pressure[1] == "mmHg" else "1"
        if a.flow:
            cells[a.flow[0]] = "20"
        if a.outcome:
            cells[a.outcome[0]] = "Extinction"
        if name == "PSI-69_Experimental table_FLEX.csv":
            cells.update({c: "0" for c in tables.FLEX_GASES})
            cells["N initial ambient composition; mole fraction"] = "0.79"
        if not cells:
            cells["Notes"] = "only text"
        header = ",".join(f'"{c}"' for c in cells)
        row = ",".join(f'"{v}"' for v in cells.values())
        encoding = "utf-8" if a.encoding == "utf-8-sig" else a.encoding
        (folder / name).write_bytes(f"{header}\r\n{row}\r\n\r\n".encode(encoding))
    return Path(root)
