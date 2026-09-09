import asyncio
from . import db
from .runner import worker_loop
if __name__=='__main__':
    db.check_schema();asyncio.run(worker_loop())
