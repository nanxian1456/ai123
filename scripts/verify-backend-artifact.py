"""Inspect a backend jar without printing credential contents."""
from pathlib import Path
import sys
import zipfile

artifact = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("backend/target/backend-0.0.1-SNAPSHOT.jar")
secret_names = {"auth.token-secret", "wechat.mini-program.app-secret", "ai.extraction.api-key", "spring.datasource.password"}
with zipfile.ZipFile(artifact) as archive:
    for name in archive.namelist():
        if name.endswith("application-local.properties") or name.rsplit("/", 1)[-1] == ".env" or name.endswith(".env.local"):
            raise SystemExit("Artifact rejected: a local credential file was packaged")
        if name.startswith("BOOT-INF/classes/") and name.endswith(".properties"):
            for line in archive.read(name).decode("utf-8").splitlines():
                if line.lstrip().startswith(("#", "!")) or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                value = value.strip()
                if key.strip() in secret_names and value and not value.startswith("${"):
                    raise SystemExit("Artifact rejected: a credential property contains a literal value")
print("Artifact credential check passed")
