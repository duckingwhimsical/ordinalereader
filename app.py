from flask import Flask, send_from_directory, send_file, abort
import os
from pathlib import Path
import logging
import mimetypes

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', static_url_path='/static')

def setup_default_book():
    """Setup default book in attached_assets directory"""
    try:
        assets_dir = Path('attached_assets')
        assets_dir.mkdir(exist_ok=True)

        # Check for specific ebook.epub file
        default_book = assets_dir / 'ebook.epub'
        if default_book.exists():
            logger.info(f'Found ebook.epub in attached_assets directory: {default_book.absolute()}')
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

@app.route('/js/<path:filename>')
def serve_js(filename):
    try:
        logger.debug(f'Attempting to serve JS file: {filename}')
        file_path = os.path.join('static', 'js', filename)
        logger.debug(f'Full JS file path: {file_path}')
        return send_file(file_path, mimetype='application/javascript')
    except FileNotFoundError:
        logger.error(f'JS file not found: {filename}')
        abort(404)
    except Exception as e:
        logger.error(f'Error serving JS file {filename}: {str(e)}')
        abort(500)

@app.route('/css/<path:filename>')
def serve_css(filename):
    try:
        logger.debug(f'Attempting to serve CSS file: {filename}')
        file_path = os.path.join('static', 'css', filename)
        logger.debug(f'Full CSS file path: {file_path}')
        return send_file(file_path, mimetype='text/css')
    except FileNotFoundError:
        logger.error(f'CSS file not found: {filename}')
        abort(404)
    except Exception as e:
        logger.error(f'Error serving CSS file {filename}: {str(e)}')
        abort(500)

@app.route('/epub/<path:filename>')
def serve_epub(filename):
    try:
        logger.debug(f'Attempting to serve EPUB file: {filename}')
        # Always serve ebook.epub as default.epub
        if filename == 'default.epub':
            epub_path = os.path.join('attached_assets', 'ebook.epub')
            epub_path = Path(epub_path).absolute()
            logger.debug(f'Full EPUB file path: {epub_path}')

            if Path(epub_path).is_file():
                logger.info(f'Successfully serving default EPUB file from: {epub_path}')
                return send_file(
                    epub_path,
                    mimetype='application/epub+zip',
                    as_attachment=False
                )

        logger.error(f'EPUB file not found: {filename}')
        abort(404)
    except Exception as e:
        logger.error(f'Error serving EPUB {filename}: {str(e)}')
        abort(500)

if __name__ == '__main__':
    # Setup default book before starting the server
    setup_default_book()
    logger.info('Starting Flask server...')
    app.run(host='0.0.0.0', port=5000, debug=True)