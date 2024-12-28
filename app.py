from flask import Flask, send_from_directory, send_file, abort
import os
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def setup_default_book():
    """Setup default book in attached_assets directory"""
    try:
        assets_dir = Path('attached_assets')
        assets_dir.mkdir(exist_ok=True)

        # Check for specific ebook.epub file
        default_book = assets_dir / 'ebook.epub'
        if default_book.exists():
            logger.info('Found ebook.epub in attached_assets directory')
            return True
        else:
            logger.warning('ebook.epub not found in attached_assets directory')
            return False

    except Exception as e:
        logger.error(f'Error checking for ebook.epub: {str(e)}')
        return False

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
        # Always serve ebook.epub as default.epub
        if filename == 'default.epub':
            epub_path = os.path.join('attached_assets', 'ebook.epub')
            if Path(epub_path).is_file():
                logger.info(f'Successfully serving default EPUB file from: {epub_path}')
                return send_file(epub_path)

        # For other epub files, look in attached_assets
        epub_path = os.path.join('attached_assets', filename)
        if Path(epub_path).is_file():
            logger.info(f'Successfully serving EPUB file: {epub_path}')
            return send_file(epub_path)

        logger.error(f'EPUB file not found: {epub_path}')
        abort(404)
    except Exception as e:
        logger.error(f'Error serving EPUB {filename}: {str(e)}')
        abort(500)

if __name__ == '__main__':
    # Setup default book before starting the server
    setup_default_book()
    logger.info('Starting Flask server...')
    app.run(host='0.0.0.0', port=5000, debug=True)