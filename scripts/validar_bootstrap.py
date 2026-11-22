#!/usr/bin/env python3
from pathlib import Path
import sys, yaml, re
ROOT=Path(__file__).resolve().parents[1]

def load(rel):
    p=ROOT/rel
    if not p.exists(): return None
    with p.open(encoding='utf-8') as f: return yaml.safe_load(f)
errors=[]; warnings=[]
required=[
 'project-manifest.yaml','config/technology-radar.yaml','docs/00-gobernanza/bootstrap-state.yaml',
 'docs/00-gobernanza/architecture-drivers.yaml','docs/00-gobernanza/architecture-scorecard.yaml',
 'docs/00-gobernanza/architecture-risks.yaml','docs/00-gobernanza/architecture-review.yaml',
 'docs/00-gobernanza/assumptions.yaml','docs/00-gobernanza/open-questions.yaml']
for r in required:
    if not (ROOT/r).exists(): errors.append(f'MISSING {r}')
m=load('project-manifest.yaml') or {}; bs=load('docs/00-gobernanza/bootstrap-state.yaml') or {}
if m.get('schema_version',0)<2: errors.append('manifest schema_version must be >=2')
agents=((m.get('workflow') or {}).get('agents') or {})
for k,v in [('bootstrap','project_bootstrap_agent'),('architecture_review','architecture_review_agent')]:
    if agents.get(k)!=v: errors.append(f'workflow.agents.{k} must be {v}')
# Static agent/skill contracts
for f in ['.codex/agents/project-bootstrap-agent.toml','.codex/agents/architecture-review-agent.toml']:
    if not (ROOT/f).exists(): errors.append(f'MISSING {f}')
for n in ['project-discovery','project-classification','architecture-drivers','architecture-selection','architecture-scorecard','technology-selection','profile-resolution','deployment-selection','data-architecture-selection','integration-strategy','architecture-risk-assessment','adr-generation','manifest-generation']:
    if not (ROOT/'skills/bootstrap'/f'{n}.md').exists(): errors.append(f'MISSING skill {n}')
# When bootstrap is ready, enforce traceability
if bs.get('status')=='BOOTSTRAP_READY':
    q=m.get('quality_gates') or {}
    for k in ['bootstrap_completed','architecture_review_passed','decision_traceability_complete']:
        if q.get(k) is not True: errors.append(f'{k} must be true when BOOTSTRAP_READY')
    drivers=(load('docs/00-gobernanza/architecture-drivers.yaml') or {}).get('drivers') or []
    if not drivers: errors.append('BOOTSTRAP_READY requires architecture drivers')
    score=load('docs/00-gobernanza/architecture-scorecard.yaml') or {}
    if len(score.get('candidates') or {})<2: errors.append('BOOTSTRAP_READY requires >=2 architecture candidates')
    review=load('docs/00-gobernanza/architecture-review.yaml') or {}
    if review.get('decision')!='approve': errors.append('architecture review must approve BOOTSTRAP_READY')
    refs=m.get('decision_refs') or {}
    material=['architecture.style','technology.backend.platform','technology.data.primary_database','deployment.current_target']
    if ((m.get('technology') or {}).get('frontend') or {}).get('framework') not in ['none',None,'undecided']:
        material.append('technology.frontend.framework')
    for k in material:
        ref=refs.get(k)
        if not ref: errors.append(f'missing decision_refs.{k}')
        elif not list((ROOT/'docs/00-gobernanza/adr').glob(f'{ref}*.md')): errors.append(f'ADR file not found for {k}: {ref}')
    oq=(load('docs/00-gobernanza/open-questions.yaml') or {}).get('questions') or []
    blocking=[q for q in oq if q.get('blocking') and q.get('status','open')!='resolved']
    if blocking: errors.append(f'{len(blocking)} unresolved blocking open questions')
print('Bootstrap validation')
for x in errors: print('ERROR:',x)
for x in warnings: print('WARN:',x)
if errors: sys.exit(1)
print('OK: bootstrap structure/contracts valid')

