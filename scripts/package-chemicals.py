"""Package only the distributable app, local updater and reading instructions."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

folder = Path(__file__).resolve().parent.parent / 'standalone'
files = [folder / name for name in (
    'Shemberg-Chemicals-Inventory.html',
    'Shemberg-Backup-Updater.html',
    'START-HERE.txt',
    'Registry-identity-review.csv',
)]
for source in files:
    if not source.is_file():
        raise FileNotFoundError(source)
target = folder / 'Shemberg-Chemicals-Inventory.zip'
temporary = target.with_suffix('.zip.tmp')
with ZipFile(temporary, 'w', ZIP_DEFLATED) as archive:
    for source in files:
        archive.write(source, source.name)
with ZipFile(temporary) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {source.name for source in files}
    for source in files:
        assert archive.read(source.name) == source.read_bytes()
temporary.replace(target)
print(f'Verified download package: {target.name} ({target.stat().st_size:,} bytes)')
