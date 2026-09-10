"""Render stdin artifacts only. No workspace, credentials, sockets or host mounts."""
import base64
import json
import mimetypes
import os
from pathlib import PurePosixPath
import signal
import sys
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

MAX_INPUT = 3 * 1024 * 1024
MAX_JPEG = 256 * 1024
ORIGIN = 'http://artifact.invalid'
PREFIX = '/render/'
INDEX = ORIGIN + PREFIX + 'index.html'
SUFFIXES = {'.html', '.css', '.js', '.mjs', '.json', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp'}
CSP = (
    f"sandbox allow-scripts; default-src 'none'; script-src {ORIGIN}{PREFIX} 'unsafe-inline' blob:; "
    f"style-src {ORIGIN}{PREFIX} 'unsafe-inline'; img-src {ORIGIN}{PREFIX} data: blob:; "
    f"font-src {ORIGIN}{PREFIX} data:; media-src {ORIGIN}{PREFIX} data: blob:; "
    "connect-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; "
    "object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; navigate-to 'none'"
)


def safe_path(path):
    return (
        isinstance(path, str) and bool(path) and len(path) <= 180
        and not PurePosixPath(path).is_absolute() and '\\' not in path and ':' not in path
        and not any(part in ('', '.', '..') or part.startswith('.') for part in path.split('/'))
        and not any(ord(char) < 32 for char in path)
    )


def load_files():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError('invalid_input')
    packet = json.loads(raw)
    if not isinstance(packet, dict) or set(packet) != {'files'}:
        raise ValueError('invalid_input')
    encoded_files = packet['files']
    if not isinstance(encoded_files, dict) or 'index.html' not in encoded_files or not 1 <= len(encoded_files) <= 50:
        raise ValueError('invalid_input')
    files = {}
    total = 0
    for path, encoded in encoded_files.items():
        if not safe_path(path) or PurePosixPath(path).suffix.lower() not in SUFFIXES or not isinstance(encoded, str):
            raise ValueError('invalid_input')
        if len(encoded) > 4 * ((512 * 1024 + 2) // 3):
            raise ValueError('invalid_input')
        data = base64.b64decode(encoded, validate=True)
        total += len(data)
        if len(data) > 512 * 1024 or total > 2 * 1024 * 1024:
            raise ValueError('invalid_input')
        files[path] = data
    return files


def render(files):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, chromium_sandbox=False, timeout=7000,
            args=[
                '--disable-dev-shm-usage', '--disable-background-networking',
                '--disable-component-update', '--disable-domain-reliability',
                '--disable-sync', '--no-first-run', '--no-default-browser-check',
                '--metrics-recording-only', '--host-resolver-rules=MAP * ~NOTFOUND',
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            ],
        )
        try:
            context = browser.new_context(
                viewport={'width': 960, 'height': 600}, device_scale_factor=1,
                java_script_enabled=True, service_workers='block', accept_downloads=False,
                locale='en-US', timezone_id='UTC', reduced_motion='reduce',
            )
            page = context.new_page()
            initial_navigation = True
            navigation_blocked = False

            def prevent_navigation(frame):
                nonlocal navigation_blocked
                if frame == page.main_frame and frame.url.split('#', 1)[0] != INDEX:
                    navigation_blocked = True
                    page.close()

            def route_request(route):
                nonlocal initial_navigation
                request = route.request
                parsed = urlsplit(request.url)
                if parsed.scheme != 'http' or parsed.netloc != 'artifact.invalid' or not parsed.path.startswith(PREFIX):
                    route.abort('blockedbyclient')
                    return
                path = unquote(parsed.path[len(PREFIX):], errors='strict')
                # URL decoding is intentionally performed once, like the preview
                # server; encoded traversal must not gain filesystem semantics.
                if request.method != 'GET' or not safe_path(path) or path not in files:
                    route.abort('blockedbyclient')
                    return
                if request.is_navigation_request():
                    if not initial_navigation or request.frame != page.main_frame or request.url != INDEX:
                        route.abort('blockedbyclient')
                        return
                    initial_navigation = False
                elif request.resource_type not in {'stylesheet', 'script', 'image', 'font', 'media'}:
                    route.abort('blockedbyclient')
                    return
                content_type = mimetypes.guess_type(path)[0] or 'application/octet-stream'
                route.fulfill(status=200, body=files[path], headers={
                    'Content-Type': content_type,
                    'Content-Security-Policy': CSP,
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store',
                    'Referrer-Policy': 'no-referrer',
                    'X-Content-Type-Options': 'nosniff',
                })

            context.route('**/*', route_request)
            context.route_web_socket('**/*', lambda socket: socket.close())
            page.on('dialog', lambda dialog: dialog.dismiss())
            page.on('framenavigated', prevent_navigation)
            page.on('download', lambda download: download.cancel())
            context.on('page', lambda opened: opened.close() if opened != page else None)
            page.goto(INDEX, wait_until='load', timeout=6000)
            page.wait_for_timeout(750)
            # Lower JPEG quality only when necessary; never fabricate an image.
            for quality in (70, 50, 30, 15):
                data = page.screenshot(type='jpeg', quality=quality, full_page=False,
                                       animations='disabled', caret='hide', scale='css', timeout=2500)
                if navigation_blocked or page.url.split('#', 1)[0] != INDEX:
                    raise ValueError('navigation_blocked')
                if len(data) <= MAX_JPEG:
                    return data
            raise ValueError('thumbnail_too_large')
        finally:
            browser.close()


def main():
    # A second hard deadline survives a hung page, browser launch or Playwright call.
    def deadline(signum, frame):
        # An explicit handler also works as PID 1; exiting it tears down the
        # container's descendants even if Chromium itself has stopped responding.
        os._exit(1)

    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(18)
    try:
        data = render(load_files())
        sys.stdout.write(json.dumps({'ok': True, 'data': base64.b64encode(data).decode()}, separators=(',', ':')) + '\n')
        return 0
    except Exception:
        sys.stderr.write('thumbnail_render_failed\n')
        sys.stdout.write('{"ok":false}\n')
        return 1
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    raise SystemExit(main())
