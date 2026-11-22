#!/usr/bin/env python3
"""Inicializa el estado de bootstrap desde un brief YAML. No toma decisiones arquitectónicas: prepara el workspace para project_bootstrap_agent."""
from pathlib import Path
import argparse, shutil, yaml
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(); p.add_argument('brief'); a=p.parse_args()
src=Path(a.brief)
if not src.exists(): raise SystemExit(f'Brief no encontrado: {src}')
brief=yaml.safe_load(src.read_text(encoding='utf-8')) or {}
(ROOT/'docs/01-producto/project-brief-input.yaml').write_text(yaml.safe_dump(brief,sort_keys=False,allow_unicode=True),encoding='utf-8')
state=yaml.safe_load((ROOT/'docs/00-gobernanza/bootstrap-state.yaml').read_text(encoding='utf-8'))
state['status']='PENDING'; state['current_stage']='discovery'; state['blocking_questions']=[]
for stage in state['stages'].values(): stage['status']='pending'
(ROOT/'docs/00-gobernanza/bootstrap-state.yaml').write_text(yaml.safe_dump(state,sort_keys=False,allow_unicode=True),encoding='utf-8')
handoff={'handoff':{'status':'pending','from_skill':None,'feature':None,'feature_status':None,'decision':'bootstrap-project','next_skill':'project-discovery','next_agent':'project_bootstrap_agent','state_file':'docs/00-gobernanza/bootstrap-state.yaml','blocking_questions':[],'notes':'Workspace inicializado desde brief; ejecutar Project Bootstrap Agent.'}}
(ROOT/'handoff.yaml').write_text(yaml.safe_dump(handoff,sort_keys=False,allow_unicode=True),encoding='utf-8')
print('OK: brief cargado; siguiente agente: project_bootstrap_agent')

