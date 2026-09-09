"""Operator commands; no passwords, provider keys or session tokens are printed."""
import argparse,base64,json,os
from sqlalchemy import select,update
from . import db,domain
from .config import settings
from .security import seal,unseal

def main():
    parser=argparse.ArgumentParser(prog='python -m tihu.cli');sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('init');sub.add_parser('seed');sub.add_parser('secrets');sub.add_parser('rotate-keys')
    promote=sub.add_parser('admin');promote.add_argument('email')
    args=parser.parse_args()
    if args.command=='secrets':
        enc=lambda:base64.b64encode(os.urandom(32)).decode();print('MASTER_KEYS='+json.dumps({'v1':enc()},separators=(',',':')));print('ACTIVE_KEY_ID=v1');print('SIGNING_KEY='+enc());return
    if args.command=='init':db.init();print('Schema v1 initialized.');return
    db.check_schema()
    if args.command=='seed':domain.seed();print('Starter challenges are ready.')
    elif args.command=='admin':
        with db.engine.begin() as c:
            account=db.row(c,select(db.users).where(db.users.c.email==args.email.strip().lower()))
            if not account or not account['verified'] or account['suspended']:raise SystemExit('Register and verify this account before promoting it.')
            c.execute(update(db.users).where(db.users.c.id==account['id']).values(role='admin'));db.audit_log(c,account['id'],'operator.promote_admin',account['id'])
        print('Administrator role assigned.')
    elif args.command=='rotate-keys':
        count=0
        with db.engine.begin() as c:
            for row in c.execute(select(db.credentials).with_for_update()).mappings():
                if row['sealed'].split('.',1)[0]==settings.active_key:continue
                value=unseal(row['sealed'],row['owner_id'],row['id']);c.execute(update(db.credentials).where(db.credentials.c.id==row['id']).values(sealed=seal(value,row['owner_id'],row['id'])));count+=1
            db.audit_log(c,None,'operator.rotate_keys',settings.active_key)
        print(f'Re-encrypted {count} credential records.')
if __name__=='__main__':main()
