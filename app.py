from flask import Flask, send_from_directory, send_file, abort
import os
from pathlib import Path

app = Flask(__name__)

@app.route('/')
def index():
    try:
        return send_file('index.html')
    except FileNotFoundError:
        abort(404)

@app.route('/<path:filename>')
def serve_files(filename):
    try:
        # Check if file exists before attempting to serve
        if Path(filename).is_file():
            return send_file(filename)
        abort(404)
    except Exception:
        abort(500)

@app.route('/epub/<path:filename>')
def serve_epub(filename):
    try:
        epub_path = os.path.join('attached_assets', filename)
        if Path(epub_path).is_file():
            return send_file(epub_path)
        abort(404)
    except Exception:
        abort(500)

if __name__ == '__main__':
    # Ensure the attached_assets directory exists
    os.makedirs('attached_assets', exist_ok=True)
    app.run(host='0.0.0.0', port=5000, debug=True)