import base64,json,os,secrets
from pathlib import Path
p=Path('.env')
if p.exists():raise SystemExit('.env already exists; refusing to overwrite it')
enc=lambda:base64.b64encode(os.urandom(32)).decode()
password=secrets.token_urlsafe(30)
text='\n'.join([
'TIHU_ENV=development',f'POSTGRES_PASSWORD={password}',f"MASTER_KEYS={json.dumps({'v1':enc()},separators=(',',':'))}",'ACTIVE_KEY_ID=v1',f'SIGNING_KEY={enc()}','APP_ORIGIN=http://localhost:8080','PREVIEW_ORIGIN=http://127.0.0.1:8001','SANDBOX_RUNTIME=runsc','SANDBOX_IMAGE=tihu-sandbox:0.1','WORKER_CONCURRENCY=2','REGISTRATION_OPEN=true',''])
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(text)
print('Created .env with random database, encryption and signing secrets (mode 0600).')
