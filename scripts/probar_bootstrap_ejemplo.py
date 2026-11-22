#!/usr/bin/env python3
"""Prueba determinista de contratos usando el escenario de referencia. No sustituye la ejecución real de los agentes LLM."""
from pathlib import Path
import tempfile, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
fixture=ROOT/'examples/bootstrap-test/expected'
if not fixture.exists(): raise SystemExit('Fixture expected no encontrado')
with tempfile.TemporaryDirectory() as td:
    target=Path(td)/'project'; shutil.copytree(ROOT,target)
    # Apply expected agent outputs to simulate a completed handoff chain.
    for src in fixture.rglob('*'):
        if src.is_file():
            dst=target/src.relative_to(fixture); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
    for script in ['validar_bootstrap.py','validar_flujo.py','validar_requirement_loop.py']:
        cp=subprocess.run([sys.executable,str(target/'scripts'/script)],cwd=target,text=True,capture_output=True)
        print(f'--- {script} ---')
        print(cp.stdout,end=''); print(cp.stderr,end='',file=sys.stderr)
        if cp.returncode: raise SystemExit(cp.returncode)
    print('OK: fixture end-to-end respeta contratos Bootstrap -> Architecture Review -> Planning gate')

