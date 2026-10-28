import json,sys
s=json.load(open(sys.argv[1]))
d=s.get('$defs') or s.get('definitions') or {}
def find(o,name,path=''):
    if isinstance(o,dict):
        p=o.get('properties',{})
        t=p.get('type',{})
        if t.get('const')==name or name in (t.get('enum') or []):
            print(path); print(json.dumps(o)[:int(sys.argv[3]) if len(sys.argv)>3 else 3000]); return True
        for k,v in o.items():
            if find(v,name,path+'/'+k): return True
    elif isinstance(o,list):
        for i,v in enumerate(o):
            if find(v,name,path+f'[{i}]'): return True
for n in sys.argv[2].split(','):
    if n in d: print('DEF',n); print(json.dumps(d[n])[:int(sys.argv[3]) if len(sys.argv)>3 else 3000])
    else: find(s,n)
    print()
