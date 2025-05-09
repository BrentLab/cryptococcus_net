#!/usr/bin/env python3
"""
Simple HTTP server for network visualization
"""

import sys
import os
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8000

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        SimpleHTTPRequestHandler.end_headers(self)

def main():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, Handler)
    
    print(f"Starting server at http://localhost:{PORT}")
    print("Press Ctrl+C to stop the server")
    
    # Try to open the browser automatically
    webbrowser.open(f"http://localhost:{PORT}")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        httpd.server_close()
        
if __name__ == "__main__":
    main()