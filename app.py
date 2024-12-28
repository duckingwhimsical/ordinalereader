from flask import Flask, send_from_directory, send_file
import os

app = Flask(__name__)

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/<path:filename>')
def serve_files(filename):
    return send_file(filename)

@app.route('/epub/<path:filename>')
def serve_epub(filename):
    return send_file(os.path.join('attached_assets', filename))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
