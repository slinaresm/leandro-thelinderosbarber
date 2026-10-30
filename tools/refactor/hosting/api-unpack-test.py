import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import uuid

root = Path(__file__).resolve().parents[3]
php = root / '.refactor-data/runtime/php84/php.exe'
source = Path(__file__).with_name('api-unpack.php').read_bytes()
fixture = b'<?php echo json_encode(["status"=>"fixture-only"]).PHP_EOL;'
for scenario in ['valid', 'hash-mismatch', 'env-entry', 'traversal', 'parent-file']:
    work = root / '.refactor-data' / ('api-unpack-' + uuid.uuid4().hex)
    work.mkdir()
    (work / 'rf017-api-unpack.php').write_bytes(source)
    if scenario == 'parent-file':
        (work / 'api').write_text('preserve', encoding='utf-8')
    else:
        (work / 'api').mkdir()
        (work / 'api/.env').write_text('preserve-secret', encoding='utf-8')
    archive = work / 'rf017-private-api.tar'
    with tarfile.open(archive, 'w', format=tarfile.USTAR_FORMAT) as bundle:
        files = {'rf017-api-init.php': fixture, 'api/config/test.php': b'<?php // fixture'}
        if scenario == 'env-entry':
            files['api/.env'] = b'never-overwrite'
        if scenario == 'traversal':
            files['api/../outside'] = b'never-write'
        for name, payload in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(payload)
            bundle.addfile(entry, io.BytesIO(payload))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (work / 'rf017-private-api.sha256').write_text('0' * 64 if scenario == 'hash-mismatch' else digest, encoding='ascii')
    result = subprocess.run([str(php), str(work / 'rf017-api-unpack.php')], capture_output=True, text=True)
    assert not result.stderr, result.stderr
    report = json.loads(result.stdout)
    if scenario == 'valid':
        assert result.returncode == 0 and report['status'] == 'fixture-only'
        assert (work / 'api/.env').read_text() == 'preserve-secret'
        assert (work / 'rf017-api-unpacked.json').exists()
        repeated = subprocess.run([str(php), str(work / 'rf017-api-unpack.php')], capture_output=True, text=True)
        assert json.loads(repeated.stdout) == report
    else:
        assert result.returncode == 1 and report['status'] == 'failed'
        assert not (work / 'rf017-api-unpacked.json').exists()
        assert not (work / 'outside').exists()
        if scenario != 'parent-file':
            assert (work / 'api/.env').read_text() == 'preserve-secret'
    print('OK ' + scenario)
print('5 escenarios de extracción aprobados; no se publica ni se conecta a bases.')
