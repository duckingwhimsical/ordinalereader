from flask import Flask, send_from_directory, send_file, abort
import os
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/')
def index():
    try:
        logger.debug('Attempting to serve index.html')
        return send_file('index.html')
    except FileNotFoundError:
        logger.error('index.html not found')
        abort(404)
    except Exception as e:
        logger.error(f'Unexpected error serving index.html: {str(e)}')
        abort(500)

@app.route('/<path:filename>')
def serve_files(filename):
    try:
        logger.debug(f'Attempting to serve file: {filename}')
        # Check if file exists before attempting to serve
        if Path(filename).is_file():
            return send_file(filename)
        logger.error(f'File not found: {filename}')
        abort(404)
    except Exception as e:
        logger.error(f'Error serving {filename}: {str(e)}')
        abort(500)

@app.route('/epub/<path:filename>')
def serve_epub(filename):
    try:
        logger.debug(f'Attempting to serve EPUB file: {filename}')
        epub_path = os.path.join('attached_assets', filename)
        if Path(epub_path).is_file():
            return send_file(epub_path)
        logger.error(f'EPUB file not found: {epub_path}')
        abort(404)
    except Exception as e:
        logger.error(f'Error serving EPUB {filename}: {str(e)}')
        abort(500)

if __name__ == '__main__':
    # Ensure the attached_assets directory exists
    os.makedirs('attached_assets', exist_ok=True)
    app.run(host='0.0.0.0', port=5000, debug=True)