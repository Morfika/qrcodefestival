import csv
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "control_boletas.csv"
BATCH_SIZE = 100


def load_rows():
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as source:
        rows = [
            {
                "numero": row["numero"],
                "grupo": int(row["grupo"]),
                "contenido_qr": row["contenido_qr"].strip(),
            }
            for row in csv.DictReader(source)
        ]

    if not rows:
        raise ValueError("El CSV no contiene boletas.")
    if any(row["grupo"] not in (1, 2) or not row["contenido_qr"] for row in rows):
        raise ValueError("El CSV contiene una boleta con grupo o código inválido.")
    if len({row["contenido_qr"] for row in rows}) != len(rows):
        raise ValueError("El CSV contiene códigos QR duplicados.")
    if len({(row["grupo"], row["numero"]) for row in rows}) != len(rows):
        raise ValueError("El CSV contiene números repetidos dentro de un grupo.")
    return rows


def main():
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        url = input("URL del proyecto Supabase: ").strip().rstrip("/")
    secret_key = getpass.getpass("Clave secreta de Supabase (no se mostrará): ").strip()
    if not url.startswith("https://") or not secret_key:
        raise ValueError("La URL debe empezar con https:// y la clave secreta no puede estar vacía.")

    rows = load_rows()
    endpoint = f"{url}/rest/v1/boletas?on_conflict=contenido_qr"
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(batch).encode("utf-8"),
            headers={
                "apikey": secret_key,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"Respuesta inesperada de Supabase: {response.status}")
        except urllib.error.HTTPError as error:
            message = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase rechazó la importación ({error.code}): {message}") from error

    print(f"Importadas o actualizadas {len(rows)} boletas desde {CSV_PATH.name}.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
