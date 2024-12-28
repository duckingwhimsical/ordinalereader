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

        # Check if default book exists
        default_book = next(assets_dir.glob('*.epub'), None)
        if default_book and default_book.exists():
            logger.info(f'Default book found: {default_book.name}')
            # Create a symlink to make it accessible as default.epub
            target_link = assets_dir / 'default.epub'
            if not target_link.exists():
                try:
                    os.symlink(default_book, target_link)
                    logger.info('Created symlink to default book')
                except Exception as e:
                    logger.error(f'Failed to create symlink: {str(e)}')
        else:
            logger.warning('No EPUB books found in attached_assets directory')

    except Exception as e:
        logger.error(f'Error checking for default book: {str(e)}')

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