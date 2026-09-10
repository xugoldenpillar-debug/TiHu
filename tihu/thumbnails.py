"""Best-effort screenshots in a separate, networkless gVisor guest."""
import asyncio
import base64
from contextlib import suppress
from io import BytesIO
import json
import logging
import os
from pathlib import PurePosixPath
import re
import secrets
import warnings

from PIL import Image
from sqlalchemy import select

from . import db
from .config import settings
from .security import safe_path

logger = logging.getLogger('tihu.thumbnails')
MAX_JPEG = 256 * 1024
MAX_INPUT = 3 * 1024 * 1024
MAX_PACKET = 4 * ((MAX_JPEG + 2) // 3) + 256
CAPTURE_SECONDS = 20
SUFFIXES = {'.html', '.css', '.js', '.mjs', '.json', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp'}


def _payload(files):
    if not isinstance(files, dict) or 'index.html' not in files or not 1 <= len(files) <= 50:
        raise ValueError('invalid_thumbnail_input')
    total = 0
    for path, encoded in files.items():
        if not isinstance(path, str) or not safe_path(path) or PurePosixPath(path).suffix.lower() not in SUFFIXES:
            raise ValueError('invalid_thumbnail_input')
        if not isinstance(encoded, str) or len(encoded) > 4 * ((512 * 1024 + 2) // 3):
            raise ValueError('invalid_thumbnail_input')
        size = len(base64.b64decode(encoded, validate=True))
        total += size
        if size > 512 * 1024 or total > 2 * 1024 * 1024:
            raise ValueError('invalid_thumbnail_input')
    payload = json.dumps({'files': files}, separators=(',', ':')).encode()
    if len(payload) > MAX_INPUT:
        raise ValueError('invalid_thumbnail_input')
    return payload


def jpeg_bytes(packet):
    """Fully decode one bounded JPEG before accepting the guest's output."""
    if len(packet) > MAX_PACKET:
        raise ValueError('invalid_thumbnail_output')
    result = json.loads(packet)
    if not isinstance(result, dict) or set(result) != {'ok', 'data'} or result['ok'] is not True or not isinstance(result['data'], str):
        raise ValueError('invalid_thumbnail_output')
    data = base64.b64decode(result['data'], validate=True)
    if not 4 <= len(data) <= MAX_JPEG or data[:2] != b'\xff\xd8' or data[-2:] != b'\xff\xd9':
        raise ValueError('invalid_thumbnail_output')
    with warnings.catch_warnings():
        warnings.simplefilter('error')
        with Image.open(BytesIO(data), formats=['JPEG']) as image:
            # Check dimensions before decompression; do not trust a valid JPEG
            # header alone or accept truncated scan data wrapped in SOI/EOI.
            if image.format != 'JPEG' or image.size != (960, 600) or image.mode != 'RGB':
                raise ValueError('invalid_thumbnail_output')
            image.load()
    return data


def docker_command(name, image):
    return [
        'docker', 'run', '--rm', '--pull', 'never', '-i', '--name', name,
        '--label', 'tihu.thumbnail=true', '--runtime', settings.sandbox_runtime,
        '--network', 'none', '--read-only', '--user', '65532:65532',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true',
        '--pids-limit', '192', '--memory', '768m', '--memory-swap', '768m', '--cpus', '1',
        '--ulimit', 'nofile=1024:1024', '--ulimit', 'core=0', '--log-driver', 'none',
        '--ipc', 'private', '--shm-size', '64m', '--stop-timeout', '1',
        '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777', image,
    ]


async def _output(args, payload=None, limit=MAX_PACKET):
    process = await asyncio.create_subprocess_exec(
        *args, stdin=asyncio.subprocess.PIPE if payload is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    writer = None
    try:
        if payload is not None:
            async def send():
                process.stdin.write(payload)
                await process.stdin.drain()
                process.stdin.close()
                await process.stdin.wait_closed()
            writer = asyncio.create_task(send())
        output = bytearray()
        while True:
            chunk = await process.stdout.read(min(65536, limit + 1 - len(output)))
            if not chunk:
                break
            output.extend(chunk)
            if len(output) > limit:
                raise ValueError('invalid_thumbnail_output')
        if writer:
            await writer
        if await process.wait() != 0:
            raise ValueError('thumbnail_renderer_unavailable')
        return bytes(output)
    finally:
        if writer:
            writer.cancel()
            with suppress(asyncio.CancelledError, BrokenPipeError, ConnectionResetError):
                await writer
        if process.returncode is None:
            with suppress(ProcessLookupError):
                process.kill()
            # Drain without retaining bytes after killing the CLI. A paused,
            # full stdout pipe can otherwise keep asyncio Process.wait pending.
            with suppress(asyncio.TimeoutError):
                async with asyncio.timeout(2):
                    while await process.stdout.read(65536):
                        pass
                    await process.wait()


async def _remove_container(name):
    try:
        async with asyncio.timeout(3):
            await _output(['docker', 'rm', '-f', name], limit=256)
    except Exception:
        # --rm normally removes the guest before this idempotent cleanup runs.
        # Never include Docker output, artifact content or exception text in logs.
        logger.warning('Thumbnail guest cleanup could not be confirmed; the guest also has its own hard deadline.')


async def capture(run_id, files):
    """Persist a real JPEG once; thumbnail failure never changes the run status."""
    name = None
    try:
        if not isinstance(run_id, str) or not re.fullmatch(r'[a-f0-9]{32}', run_id):
            raise ValueError('invalid_thumbnail_input')
        with db.engine.connect() as connection:
            if connection.execute(select(db.thumbnails.c.run_id).where(db.thumbnails.c.run_id == run_id)).first():
                return True
            if not connection.execute(select(db.runs.c.id).join(db.artifacts, db.artifacts.c.run_id == db.runs.c.id).where(db.runs.c.id == run_id, db.runs.c.status == 'succeeded')).first():
                return False
        payload = _payload(files)
        async with asyncio.timeout(CAPTURE_SECONDS):
            image = (await _output(['docker', 'image', 'inspect', os.getenv('THUMBNAIL_IMAGE', 'tihu-thumbnail:0.1'), '--format', '{{.Id}}'], limit=128)).decode().strip()
            if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
                raise ValueError('thumbnail_renderer_unavailable')
            name = f'tihu-thumbnail-{run_id}-{secrets.token_hex(4)}'
            packet = await _output(docker_command(name, image), payload)
            name = None  # A successful docker run --rm has already removed the guest.
        data = jpeg_bytes(packet)
        with db.engine.begin() as connection:
            if connection.dialect.name == 'sqlite':
                from sqlalchemy.dialects.sqlite import insert
            else:
                from sqlalchemy.dialects.postgresql import insert
            inserted = connection.execute(insert(db.thumbnails).values(run_id=run_id, data=data, created=db.now()).on_conflict_do_nothing(index_elements=['run_id']))
            if inserted.rowcount:
                db.log(connection, run_id, 'thumbnail', 'Preview image captured from the saved artifact.')
        return True
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.warning('Thumbnail unavailable; the saved artifact and successful run are unchanged.')
        try:
            with db.engine.begin() as connection:
                db.log(connection, run_id, 'thumbnail', 'Thumbnail unavailable. The saved artifact remains available for preview.')
        except Exception:
            logger.warning('Thumbnail status could not be recorded.')
        return False
    finally:
        if name:
            await _remove_container(name)
