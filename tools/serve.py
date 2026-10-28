from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parent.parent)
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
print('Desktop Rider: http://127.0.0.1:4173', flush=True)
ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
