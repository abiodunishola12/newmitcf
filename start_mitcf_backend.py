"""MITCF backend launcher — Python 3.11 with dummy self-pipe event loop."""
import sys, asyncio, socket as _socket
import asyncio.windows_events
from asyncio.selector_events import BaseSelectorEventLoop

class _DummySelfPipeMixin:
    def _make_self_pipe(self):
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
        s.setblocking(False)
        try:
            s.bind(("127.0.0.1", 0))
        except OSError:
            pass
        self._ssock = s
        self._csock = None
        self._internal_fds = 1
        self._add_reader(self._ssock.fileno(), self._read_from_self)

    def _close_self_pipe(self):
        if self._ssock is not None:
            try: self._remove_reader(self._ssock.fileno())
            except: pass
            try: self._ssock.close()
            except: pass
            self._ssock = None
        self._csock = None
        self._internal_fds = 0

    def _write_to_self(self): pass
    def _read_from_self(self): pass


class MITCFEventLoop(_DummySelfPipeMixin, asyncio.SelectorEventLoop):
    pass


asyncio.windows_events.ProactorEventLoop = MITCFEventLoop   # type: ignore
asyncio.ProactorEventLoop = MITCFEventLoop                   # type: ignore
loop = MITCFEventLoop()
asyncio.set_event_loop(loop)

sys.path.insert(0, r"C:\Users\ABIODUN\PycharmProjects\newmitcf\web\backend")
sys.path.insert(0, r"C:\Users\ABIODUN\PycharmProjects\newmitcf")

from web.backend.main import app
import uvicorn

PORT = 8000
config = uvicorn.Config(app, host="127.0.0.1", port=PORT, reload=False, log_level="info")
server = uvicorn.Server(config)
print(f"Backend running: http://127.0.0.1:{PORT}/docs", flush=True)
loop.run_until_complete(server.serve())
