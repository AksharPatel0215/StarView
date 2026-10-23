"""Run reviewed claim entailment cases against a local verifier model."""
import argparse
import asyncio
import json
from pathlib import Path
from app.core.grounded_rag import verify_claims

async def run(model):
    cases=json.loads((Path(__file__).parent/'grounding_cases.json').read_text())['cases']
    claims=[{'text':c['claim'],'kind':'inference','evidence':[{'quote':c['quote']}]} for c in cases]
    accepted=await verify_claims(claims,model,'')
    rows=[{'name':case['name'],'expected':case['expected'],'accepted':claim in accepted,'correct':(claim in accepted)==(case['expected']=='supported')} for case,claim in zip(cases,claims)]
    return {'model':model,'cases':rows,'false_accepts':sum(r['accepted'] and r['expected']=='unsupported' for r in rows),'false_rejects':sum(not r['accepted'] and r['expected']=='supported' for r in rows),'note':'Model-based entailment checks do not establish formal mathematical correctness.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--model',default='deepseek-r1:7b');parser.add_argument('--output');args=parser.parse_args()
    result=asyncio.run(run(args.model));text=json.dumps(result,indent=2);print(text)
    if args.output:Path(args.output).write_text(text)
    if result['false_accepts']:raise SystemExit(1)
