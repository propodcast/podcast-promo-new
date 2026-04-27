import socketserver
import http.server
import os

PORT = 3000
DIRECTORY = "/Users/macbook/Downloads/Podcast Promo New"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
