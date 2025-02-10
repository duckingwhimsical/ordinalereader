// Storage utility from oldapp.js
const storage = {
    available: false,
    memoryStore: new Map(),
    init() {
        try {
            localStorage.setItem('test', 'test');
            localStorage.removeItem('test');
            this.available = true;
        } catch (e) {
            this.available = false;
            console.warn('localStorage not available, using memory storage');
        }
    },
    getItem(key) {
        return this.available ? localStorage.getItem(key) : this.memoryStore.get(key);
    },
    setItem(key, value) {
        if (this.available) {
            localStorage.setItem(key, value);
        } else {
            this.memoryStore.set(key, value);
        }
    }
};

// Initialize storage
storage.init();

let currentFontSize = parseInt(storage.getItem('epub-font-size')) || 16;
let currentBook = null;
let currentChapter = 0;
let currentPage = 0;
let totalPages = 0;
let pagesPerChapter = new Map();
let bookmarks = [];
let searchWorker = null;
let wordsPerPage = new Map(); // Maps chapter -> page -> wordCount
let totalWordsPerChapter = new Map(); // Maps chapter -> total words

// Theme handling with transitions
function setTheme(theme) {
    const html = document.documentElement;
    const themes = {
        light: {
            body: { color: '#1a1a1a', background: '#ffffff' },
            bookmark: { fill: '#1a1a1a', stroke: '#4b5563' }
        },
        dark: {
            body: { color: '#e2e8f0', background: '#1a1a1a' },
            bookmark: { fill: '#e2e8f0', stroke: '#9ca3af' }
        },
        sepia: {
            body: { color: '#574532', background: '#faf6f0' },
            bookmark: { fill: '#574532', stroke: '#78716c' }
        }
    };

    html.classList.remove('light', 'dark', 'sepia');
    html.classList.add(theme);

    const content = document.getElementById('reader-content');
    if (content) {
        content.style.color = themes[theme].body.color;
        content.style.backgroundColor = themes[theme].body.background;
    }

    storage.setItem('epub-theme', theme);
    updateBookmarkState(); // Update bookmark button colors
}

// Initialize theme
const savedTheme = storage.getItem('epub-theme') || 'light';
setTheme(savedTheme);

// Loading animation handling
function updateLoadingProgress(progress, status) {
    const progressBar = document.getElementById('loadingProgress');
    const statusText = document.getElementById('loadingStatus');

    if (progressBar) progressBar.style.width = `${progress}%`;
    if (statusText && status) statusText.textContent = status;
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

// Helper function for path resolution within EPUB
function resolveEpubPath(relativePath, basePath) {
    // Remove any leading slash and clean the paths
    relativePath = relativePath.replace(/^\//, '').trim();
    basePath = basePath.replace(/^\//, '').trim();

    // Handle absolute paths (starting from EPUB root)
    if (relativePath.startsWith('EPUB/') || relativePath.startsWith('OPS/')) {
        return relativePath;
    }

    // Normalize the path segments
    const fullPath = basePath + '/' + relativePath;
    const segments = fullPath.split('/').filter(segment => segment && segment !== '.');
    const resolvedSegments = [];

    for (const segment of segments) {
        if (segment === '..') {
            resolvedSegments.pop();
        } else {
            resolvedSegments.push(segment);
        }
    }

    return resolvedSegments.join('/');
}

// Enhanced CSS processor for better URL handling and embedding
const cssProcessor = {
    processImports: async function(css, zip, basePath) {
        console.log('Processing CSS imports from basePath:', basePath);
        const processedImports = await Promise.all(
            Array.from(css.matchAll(/@import\s+(?:url\(['"]?([^'"()]+)['"]?\)|['"]([^'"]+)['"]);/g))
                .map(async ([match, urlPath, plainPath]) => {
                    const importPath = urlPath || plainPath;
                    const fullPath = resolveEpubPath(importPath, basePath);
                    console.log(`Resolving CSS import: ${importPath} -> ${fullPath}`);

                    try {
                        const importedFile = zip.file(fullPath);
                        if (!importedFile) {
                            console.warn(`Import not found: ${fullPath}, trying alternative paths...`);
                            // Try alternative paths
                            const altPaths = [
                                `EPUB/styles/${importPath}`,
                                `OPS/styles/${importPath}`,
                                `styles/${importPath}`,
                                importPath
                            ];

                            for (const altPath of altPaths) {
                                const altFile = zip.file(altPath);
                                if (altFile) {
                                    console.log(`Found CSS at alternative path: ${altPath}`);
                                    const importedCss = await altFile.async("text");
                                    const processedCss = await this.processImports(importedCss, zip, basePath);
                                    return await this.processUrls(processedCss, zip, basePath);
                                }
                            }
                            return '';
                        }

                        const importedCss = await importedFile.async("text");
                        const processedCss = await this.processImports(importedCss, zip, basePath);
                        return await this.processUrls(processedCss, zip, basePath);
                    } catch (e) {
                        console.warn(`Failed to process @import for ${importPath}:`, e);
                        return '';
                    }
                })
        );

        // Replace @import rules with processed content
        let processedCss = css;
        let importIndex = 0;
        processedCss = processedCss.replace(
            /@import\s+(?:url\(['"]?[^'"()]+['"]?\)|['"][^'"]+['"]);/g,
            () => processedImports[importIndex++]
        );

        return processedCss;
    },

    processUrls: async function(css, zip, basePath) {
        console.log('Processing CSS URLs...');
        // Match url() patterns in CSS
        const urlRegex = /url\(['"]?([^'"()]+)['"]?\)/g;
        const matches = Array.from(css.matchAll(urlRegex));

        for (const [fullMatch, url] of matches) {
            if (url.startsWith('data:')) continue; // Skip already embedded resources

            try {
                // Resolve the full path relative to basePath
                const fullPath = resolveEpubPath(url, basePath);
                console.log(`Resolving resource path: ${fullPath}`);
                const file = zip.file(fullPath);

                if (file) {
                    console.log(`Processing resource: ${fullPath}`);
                    const data = await file.async('base64');
                    const mimeType = this.getMimeType(fullPath);
                    const dataUrl = `data:${mimeType};base64,${data}`;
                    css = css.replace(fullMatch, `url('${dataUrl}')`);
                } else {
                    console.warn(`Resource not found: ${fullPath}`);
                }
            } catch (e) {
                console.warn(`Failed to process URL ${url}:`, e);
            }
        }
        return css;
    },

    getMimeType(path) {
        const ext = path.toLowerCase().split('.').pop();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'woff': 'font/woff',
            'woff2': 'font/woff2',
            'ttf': 'font/ttf',
            'otf': 'font/otf',
            'eot': 'application/vnd.ms-fontobject'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    },

    processFontFaces: async function(css, zip, basePath) {
        console.log('Processing font faces...');
        const fontFaceRegex = /@font-face\s*{[^}]*}/g;
        const fontFaceRules = css.match(fontFaceRegex) || [];

        console.log(`Found ${fontFaceRules.length} font-face rules`);

        // Remove all @font-face rules from the CSS
        fontFaceRules.forEach(rule => {
            css = css.replace(rule, ''); // Remove the entire @font-face rule
        });

        return css;
    },

    processCustomProperties: function(css) {
        // Extract and handle CSS custom properties (variables)
        const customProps = new Map();
        const rootRules = css.match(/:root\s*{[^}]*}/g) || [];

        rootRules.forEach(rule => {
            const props = rule.match(/--[^:]+:[^;]+;/g) || [];
            props.forEach(prop => {
                const [name, value] = prop.split(/:\s*/);
                customProps.set(name.trim(), value.replace(';', '').trim());
            });
        });

        return { css, customProps };
    }
};

// Helper function to determine font format from file path
function getFontFormat(path) {
    const ext = path.toLowerCase().split('.').pop();
    switch (ext) {
        case 'woff2': return 'woff2';
        case 'woff': return 'woff';
        case 'ttf': return 'truetype';
        case 'otf': return 'opentype';
        case 'eot': return 'embedded-opentype';
        default: return 'truetype';
    }
}

// Helper function to get MIME type for font format
function getMimeType(format) {
    switch (format) {
        case 'woff2': return 'font/woff2';
        case 'woff': return 'font/woff';
        case 'truetype': return 'font/ttf';
        case 'opentype': return 'font/otf';
        case 'embedded-opentype': return 'application/vnd.ms-fontobject';
        default: return 'font/ttf';
    }
}

// Enhanced font processing functions
function getFontWeight(filename) {
    if (filename.includes('Bold')) return '700';
    if (filename.includes('Medium')) return '500';
    if (filename.includes('Light')) return '300';
    return '400'; // Changed 'normal' to '400' for better CSS compatibility
}

function getFontStyle(filename) {
    if (filename.includes('Italic')) return 'italic';
    return 'normal';
}

function getFontFamilyInfo(filename) {
    // Remove file extension
    const nameWithoutExt = filename.split('.').slice(0, -1).join('.');

    // Match common font weight and style patterns
    const patterns = [
        /-Regular/i, /-Bold/i, /-Medium/i, /-Light/i, /-Italic/i,
        /Regular/i, /Bold/i, /Medium/i, /Light/i, /Italic/i
    ];

    // Remove weight/style suffixes to get clean family name
    let familyName = nameWithoutExt;
    patterns.forEach(pattern => {
        familyName = familyName.replace(pattern, '');
    });

    // Remove any remaining hyphens or underscores and trim
    familyName = familyName.replace(/[-_]/g, ' ').trim();

    return {
        family: familyName,
        weight: getFontWeight(nameWithoutExt),
        style: getFontStyle(nameWithoutExt)
    };
}

async function processFontFile(zip, font, basePath) {
    try {
        console.log(`Processing font file: ${font.href}`);
        let fontFile;

        // Try multiple possible paths
        const possiblePaths = [
            font.href,
            resolveEpubPath(font.href, basePath),
            `fonts/${font.href.split('/').pop()}`
        ];

        for (const path of possiblePaths) {
            fontFile = zip.file(path);
            if (fontFile) {
                console.log(`Found font at path: '${path}'`);
                break;
            }
        }

        if (!fontFile) {
            console.warn(`Could not find font file for ${font.href}`);
            return null;
        }

        // Get the font data as an ArrayBuffer instead of Uint8Array
        const fontData = await fontFile.async("arraybuffer");

        // Parse the font using opentype.js
        const loadedFont = opentype.parse(fontData);

        // Use the font name from the loaded font
        const fontName = loadedFont.names.fontFamily.en || loadedFont.names.fontFamily.default || 'Unknown Font';

        const format = getFontFormat(font.href);
        const mimeType = getMimeType(format);

        // Get font information from filename
        const fontInfo = getFontFamilyInfo(font.href.split('/').pop());
        console.log(`Extracted font info:`, fontInfo);

        const fontKey = `${fontName}-${fontInfo.weight}-${fontInfo.style}`.toLowerCase().replace(/\s+/g, '-');

        // Log the generated font key
        console.log(`Generated font key: '${fontKey}'`);

        // Use FontFace to load the font
        const fontFace = new FontFace(fontName, fontData, {
            weight: fontInfo.weight,
            style: fontInfo.style,
        });

        // Add the font to the document
        await fontFace.load();
        document.fonts.add(fontFace);

        return {
            id: font.id,
            family: fontName,
            weight: fontInfo.weight,
            style: fontInfo.style,
            format: format,
            mimeType: mimeType,
            originalPath: font.fullPath,
            key: fontKey
        };
    } catch (error) {
        console.error(`Error processing font ${font.href}:`, error);
        return null;
    }
}

// Remove the worker code and blob creation
// Instead, create a search function that runs in the main thread
function performSearch(text, query, chapter) {
    if (!text || !query) return [];

    const searchResults = [];
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();

    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery, lastIndex);

    while (index !== -1) {
        // Count words up to this match
        const textUpToMatch = text.substring(0, index);
        const wordIndex = textUpToMatch.split(/\s+/).length;

        // Find the page based on word index
        const chapterWordCounts = wordsPerPage.get(chapter);
        let resultPage = 1;

        // Find the page where this word index falls
        for (const [page, count] of chapterWordCounts.entries()) {
            if (wordIndex <= count) {
                resultPage = page;
                break;
            }
        }

        // Get surrounding context (50 chars before and after)
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + query.length + 50);
        const preview = text.slice(start, end);

        searchResults.push({
            index: wordIndex,
            preview: preview.replace(
                new RegExp(query, 'gi'),
                match => `<mark class="bg-yellow-200 dark:bg-yellow-500/50">${match}</mark>`
            ),
            chapter,
            page: resultPage
        });

        lastIndex = index + query.length;
        index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    return searchResults;
}

// Update handleSearch function to use the new page numbers
async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const results = document.getElementById('searchResults');
    const overlay = document.getElementById('searchOverlay');

    if (!query || !currentBook) {
        results.innerHTML = '<div class="p-2 text-gray-600 dark:text-gray-400">Enter a search term...</div>';
        return;
    }

    results.innerHTML = '<div class="p-2 text-gray-600 dark:text-gray-400">Searching...</div>';

    try {
        const allResults = currentBook.chapters.map((chapter, index) => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = chapter.content;
            const textContent = tempDiv.textContent;
            return performSearch(textContent, query, index);
        }).flat();

        if (allResults.length === 0) {
            results.innerHTML = '<div class="p-2 text-gray-600 dark:text-gray-400">No results found</div>';
            return;
        }

        // Create result elements with accurate page numbers
        results.innerHTML = allResults
            .map((match, index) => {
                return `
                    <div class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded" 
                         data-chapter="${match.chapter}" 
                         data-page="${match.page}">
                        <div class="text-sm text-gray-800 dark:text-gray-200">
                            ${match.preview}
                        </div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Chapter ${match.chapter + 1}, Page ${match.page} • Match ${index + 1} of ${allResults.length}
                        </div>
                    </div>
                `;
            })
            .join('');

        // Add click handlers to results
        const resultElements = results.querySelectorAll('[data-chapter]');
        resultElements.forEach(element => {
            element.addEventListener('click', () => {
                const chapter = parseInt(element.dataset.chapter);
                const page = parseInt(element.dataset.page);
                displayChapter(chapter, page);
                toggleSearch();
            });
        });
    } catch (error) {
        console.error('Search error:', error);
        results.innerHTML = '<div class="p-2 text-red-600 dark:text-red-400">An error occurred while searching</div>';
    }
}

function toggleSearch() {
    const overlay = document.getElementById('searchOverlay');
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');

    if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
        input.value = '';
        input.focus();
        results.innerHTML = '<div class="p-2 text-gray-600 dark:text-gray-400">Enter a search term...</div>';
    } else {
        overlay.classList.add('hidden');
        results.innerHTML = '';
    }
}

// Bookmark handling
function loadBookmarks() {
    const saved = storage.getItem('epub-bookmarks');
    if (saved) {
        try {
            bookmarks = JSON.parse(saved);
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            bookmarks = [];
        }
    } else {
        bookmarks = [];
    }
    displayBookmarks();
}

function saveBookmarks() {
    storage.setItem('epub-bookmarks', JSON.stringify(bookmarks));
    displayBookmarks();
}

function toggleBookmark() {
    const currentLocation = {
        chapter: currentChapter,
        page: currentPage,
        title: currentBook.titles[currentChapter],
        timestamp: new Date().toISOString(),
        preview: getPreviewText()
    };

    const existingIndex = bookmarks.findIndex(b => b.chapter === currentChapter && b.page === currentPage);
    if (existingIndex >= 0) {
        bookmarks.splice(existingIndex, 1);
        document.getElementById('bookmarkButton').innerHTML = `
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
            </svg>`;
    } else {
        bookmarks.push(currentLocation);
        document.getElementById('bookmarkButton').innerHTML = `
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
            </svg>`;
    }

    saveBookmarks();
}

function displayBookmarks() {
    const container = document.getElementById('bookmarks');
    container.innerHTML = '';

    if (!bookmarks || bookmarks.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-6 text-center space-y-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <svg class="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                </svg>
                <p class="text-sm text-gray-600 dark:text-gray-400">No bookmarks yet</p>
                <p class="text-xs text-gray-500 dark:text-gray-500">Click the bookmark icon while reading to save your spot</p>
            </div>`;
        return;
    }

    bookmarks.forEach((bookmark, index) => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg';

        const textDiv = document.createElement('div');
        textDiv.className = 'flex-1';
        textDiv.innerHTML = `
            <button class="text-left text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                ${bookmark.title}
            </button>
            <div class="text-xs text-gray-500">
                Page ${bookmark.page} • ${new Date(bookmark.timestamp).toLocaleDateString()}
            </div>
            ${bookmark.preview ? `<div class="text-xs text-gray-600 dark:text-gray-400 mt-1">${bookmark.preview}</div>` : ''}
        `;
        textDiv.onclick = () => {
            displayChapter(bookmark.chapter, bookmark.page);
            toggleSidebar();
        };

        const removeBtn = document.createElement('button');
        removeBtn.className = 'ml-2 text-gray-400 hover:text-red-500';
        removeBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>`;
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            bookmarks.splice(index, 1);
            saveBookmarks();
        };

        item.appendChild(textDiv);
        item.appendChild(removeBtn);
        container.appendChild(item);
    });
}

function getPreviewText() {
    const content = document.getElementById('reader-content');
    if (!content) return '';
    const text = content.textContent.trim();
    return text.slice(0, 100) + (text.length > 100 ? '...' : '');
}

// EPUB loading and processing
async function loadEpubFile() {
    try {
        updateLoadingProgress(0, 'Loading EPUB file...');
        const response = await fetch('ebook.bin');
        const epubData = await response.arrayBuffer();

        updateLoadingProgress(30, 'Processing EPUB content...');
        const zip = await JSZip.loadAsync(epubData);
        currentBook = {
            zip,
            chapters: [],
            titles: [],
            images: {},
            fonts: {},
            styles: {},
            customProperties: new Map(),
            currentIndex: 0
        };

        updateLoadingProgress(40, 'Parsing book structure...');
        const containerXml = await zip.file("META-INF/container.xml").async("text");
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, "text/xml");
        const opfPath = containerDoc.querySelector("rootfile").getAttribute("full-path");

        updateLoadingProgress(50, 'Loading content.opf...');
        const opfContent = await zip.file(opfPath).async("text");
        const opfDoc = parser.parseFromString(opfContent, "text/xml");
        const basePath = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);
        currentBook.basePath = basePath;

        // Process manifest items first to build a complete resource map
        const manifest = Array.from(opfDoc.querySelectorAll("manifest item"))
            .reduce((acc, item) => {
                const id = item.getAttribute("id");
                const href = item.getAttribute("href");
                const mediaType = item.getAttribute("media-type");
                const properties = item.getAttribute('properties');

                // Store full path for the resource
                const fullPath = resolveEpubPath(href, basePath);
                console.log(`Processing manifest item: ${id} (${mediaType}) at ${fullPath}`);

                acc[id] = {
                    href,
                    fullPath,
                    mediaType,
                    properties
                };
                return acc;
            }, {});

        // Pre-load all CSS files from manifest
        updateLoadingProgress(60, 'Processing stylesheets...');
        const cssItems = Object.values(manifest).filter(item =>
            item.mediaType === "text/css" ||
            item.href.endsWith('.css')
        );

        console.log(`Found ${cssItems.length} CSS files to process:`,
            cssItems.map(css => css.href).join(', '));

        for (const css of cssItems) {
            try {
                const cssPath = css.fullPath;
                console.log(`Processing CSS file: ${cssPath} (from ${css.href})`);

                const cssFile = zip.file(cssPath);
                if (cssFile) {
                    let cssContent = await cssFile.async("text");
                    console.log(`Successfully loaded CSS content from ${cssPath}`);

                    // Process @import rules first
                    cssContent = await cssProcessor.processImports(cssContent, zip, basePath);
                    console.log(`Processed imports for ${cssPath}`);

                    // Process URLs in CSS
                    cssContent = await cssProcessor.processUrls(cssContent, zip, basePath);
                    console.log(`Processed URLs for ${cssPath}`);

                    // Process font-face rules
                    cssContent = await cssProcessor.processFontFaces(cssContent, zip, basePath);
                    console.log(`Processed font-faces for ${cssPath}`);

                    // Process custom properties
                    const { css: processedCss, customProps } = cssProcessor.processCustomProperties(cssContent);

                    // Store processed CSS using the full path as key
                    currentBook.styles[cssPath] = processedCss;
                    customProps.forEach((value, key) => {
                        currentBook.customProperties.set(key, value);
                    });
                    console.log(`Successfully processed and stored CSS file: ${cssPath}`);
                } else {
                    console.warn(`CSS file not found at ${cssPath}, trying alternative paths...`);
                    // Try alternative paths
                    const altPaths = [
                        `EPUB/styles/${css.href}`,
                        `OPS/styles/${css.href}`,
                        `styles/${css.href}`,
                        css.href
                    ];

                    for (const altPath of altPaths) {
                        const altFile = zip.file(altPath);
                        if (altFile) {
                            console.log(`Found CSS at alternative path: ${altPath}`);
                            // Process the CSS file from alternative path
                            let cssContent = await altFile.async("text");
                            cssContent = await cssProcessor.processImports(cssContent, zip, basePath);
                            cssContent = await cssProcessor.processUrls(cssContent, zip, basePath);
                            cssContent = await cssProcessor.processFontFaces(cssContent, zip, basePath);
                            const { css: processedCss, customProps } = cssProcessor.processCustomProperties(cssContent);
                            currentBook.styles[altPath] = processedCss;
                            customProps.forEach((value, key) => {
                                currentBook.customProperties.set(key, value);
                            });
                            console.log(`Successfully processed and stored CSS file from alternative path: ${altPath}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                console.warn(`Failed to process CSS ${css.href}:`, error);
            }
        }

        // Pre-load all fonts from manifest
        updateLoadingProgress(70, 'Processing fonts...');
        const fontItems = Object.values(manifest).filter(item =>
            item.mediaType.startsWith("font/") ||
            item.mediaType.includes("opentype") ||
            item.mediaType.includes("truetype") ||
            item.href.match(/\.(ttf|otf|woff|woff2|eot)$/i)
        );

        console.log(`Found ${fontItems.length} font items in manifest:`,
            fontItems.map(f => f.href).join(', '));

        for (const font of fontItems) {
            const processedFont = await processFontFile(zip, font, basePath);
            if (processedFont) {
                currentBook.fonts[processedFont.key] = processedFont;
                console.log(`Successfully loaded font: ${processedFont.family} (${processedFont.weight}, ${processedFont.style})`);
            }
        }

        const spine = Array.from(opfDoc.querySelectorAll("spine itemref"))
            .map(item => item.getAttribute("idref"));

        // Process images
        updateLoadingProgress(80, 'Processing images...');
        await processImages(zip, basePath, manifest);

        // Enhanced chapter processing with font handling
        updateLoadingProgress(90, 'Loading chapters...');
        const chapterPromises = spine.map(async id => {
            const item = manifest[id];
            const href = item.href;
            const fullPath = item.fullPath;
            let content = await zip.file(fullPath).async("text");

            // Extract and process internal styles
            const styleMatches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
            let internalStyles = styleMatches.map(style =>
                style.replace(/<\/?style[^>]*>/g, '')
            ).join('\n');

            // Process internal styles
            internalStyles = await cssProcessor.processFontFaces(internalStyles, zip, basePath);
            const { css: processedInternalCss, customProps } = cssProcessor.processCustomProperties(internalStyles);

            customProps.forEach((value, key) => {
                currentBook.customProperties.set(key, value);
            });

            // Find referenced stylesheets
            const linkMatches = content.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/g) || [];
            const linkedStyles = linkMatches.map(link => {
                const hrefMatch = link.match(/href=["']([^"']+)["']/);
                if (hrefMatch) {
                    const cssPath = resolveEpubPath(hrefMatch[1], basePath);
                    return cssPath;
                }
                return null;
            }).filter(Boolean);

            // Remove <link> tags from the content
            content = content.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/g, '');

            return {
                href,
                content,
                internalStyles: processedInternalCss,
                linkedStyles
            };
        });

        currentBook.chapters = await Promise.all(chapterPromises);

        // Process NCX for table of contents
        const ncxItem = Object.values(manifest)
            .find(item => item.mediaType === "application/x-dtbncx+xml");

        if (ncxItem) {
            const ncxContent = await zip.file(ncxItem.fullPath).async("text");
            const ncxDoc = parser.parseFromString(ncxContent, "text/xml");
            currentBook.titles = Array.from(ncxDoc.querySelectorAll("navPoint"))
                .map(nav => nav.querySelector("text").textContent);
        } else {
            currentBook.titles = currentBook.chapters.map((_, i) => `Chapter ${i + 1}`);
        }

        await loadTotalPages();

        updateLoadingProgress(100, 'Completed!');
        setTimeout(() => {
            hideLoadingOverlay();
            displayBook();
        }, 500);

    } catch (error) {
        console.error('Error processing EPUB:', error);
        updateLoadingProgress(100, 'Error loading book');
        document.getElementById('reader-content').innerHTML =
            '<div class="p-4 text-red-600 dark:text-red-400">Error loading EPUB file. Please check the console for details.</div>';
    }
}

// Update displayChapter function to remove duplicate scroll and improve consistency
async function displayChapter(index, targetPage = 1, isForward = true) {
    try {
        const readerContent = document.getElementById('reader-content');
        if (!readerContent) return;

        // Update chapter number immediately
        currentChapter = index;
        const chapter = currentBook.chapters[index];
        let content = chapter.content;

        // Create a style element for all CSS
        let combinedStyles = '';

        // Add CSS custom properties first
        combinedStyles += '\n:root {\n';
        currentBook.customProperties.forEach((value, key) => {
            combinedStyles += `    ${key}: ${value};\n`;
        });
        combinedStyles += '}\n';

        // Add all processed stylesheet contents from the ebook with higher specificity
        const linkedStyles = chapter.linkedStyles;
        for (const cssPath of linkedStyles) {
            if (currentBook.styles[cssPath]) {
                // Wrap ebook styles in a higher specificity selector
                combinedStyles += `#reader-content .chapter-content {\n${currentBook.styles[cssPath]}\n}\n`;
            }
        }

        // Add chapter's internal styles with higher specificity
        if (chapter.internalStyles) {
            combinedStyles += `#reader-content .chapter-content {\n${chapter.internalStyles}\n}\n`;
        }

        // Add essential reader layout styles
        combinedStyles += `
            /* Reader layout styles */
            .chapter-content {
                padding: 2rem;
                column-fill: auto;
                height: 100%;
            }
            
            /* Basic column break handling */
            .chapter-content h1, 
            .chapter-content h2, 
            .chapter-content h3, 
            .chapter-content h4, 
            .chapter-content h5, 
            .chapter-content h6, 
            .chapter-content img, 
            .chapter-content table, 
            .chapter-content pre {
                break-inside: avoid;
                break-before: auto;
                break-after: auto;
            }
            
            /* Default spacing only if not specified by ebook */
            .chapter-content p:not([style*="margin"]) {
                margin: 1px 0;
                orphans: 2;
                widows: 2;
            }
            
            /* Default heading margins only if not specified by ebook */
            .chapter-content h1:not([style*="margin"]),
            .chapter-content h2:not([style*="margin"]),
            .chapter-content h3:not([style*="margin"]),
            .chapter-content h4:not([style*="margin"]),
            .chapter-content h5:not([style*="margin"]),
            .chapter-content h6:not([style*="margin"]) {
                margin-top: 1.5em;
                margin-bottom: 0.5em;
            }
        `;

        // Process images
        content = content.replace(
            /<img[^>]+src="([^"]+)"[^>]*>/g,
            (match, src) => {
                const imagePath = resolveEpubPath(src, currentBook.basePath);
                return currentBook.images[imagePath]
                    ? match.replace(src, currentBook.images[imagePath])
                    : match;
            }
        );

        // Remove any existing EPUB styles
        const existingStyles = document.querySelectorAll('style[data-epub-styles]');
        existingStyles.forEach(style => style.remove());

        // Create and append new style element
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-epub-styles', 'true');
        styleElement.textContent = combinedStyles;
        document.head.appendChild(styleElement);

        // Calculate dimensions before content update
        const { columnWidth, columnGap } = getPageDimensions(readerContent);
        
        // Apply layout styles
        Object.assign(readerContent.style, {
            fontSize: `${currentFontSize}px`,
            columnWidth: `${columnWidth}px`,
            columnGap: `${columnGap}px`,
            columnFill: 'auto',
            height: '100%',
            overflow: 'hidden',
            padding: '0',
            margin: '0'
        });

        // Wait for fonts to load
        await document.fonts.ready;

        // Temporarily disable scroll listener
        readerContent.removeEventListener('scroll', handleScroll);

        // Update content
        readerContent.innerHTML = `<div class="chapter-content">${content}</div>`;
        
        // Calculate final position
        const { pageWidth } = getPageDimensions(readerContent);
        const targetOffset = (targetPage - 1) * pageWidth;
        
        // Set scroll position immediately
        readerContent.scrollLeft = targetOffset;

        // Update page number after content and scroll are set
        currentPage = targetPage;
        updatePageDisplay();
        updateBookmarkState();

        // Re-enable scroll listener after a short delay
        setTimeout(() => {
            readerContent.addEventListener('scroll', handleScroll);
        }, 100);

    } catch (error) {
        console.error('Error displaying chapter:', error);
        const readerContent = document.getElementById('reader-content');
        if (readerContent) {
            readerContent.innerHTML = '<div class="p-4 text-red-600">Error displaying chapter. Please try again.</div>';
        }
    }
}

// Extract scroll handler to a separate function for consistency
function handleScroll(event) {
    if (event.target.dataset.isScrolling === 'true') return;
    
    const container = event.target;
    const { pageWidth } = getPageDimensions(container);
    const currentScroll = container.scrollLeft;
    
    // Round to nearest page
    const newPage = Math.round(currentScroll / pageWidth) + 1;
    
    if (newPage !== currentPage) {
        currentPage = newPage;
        updatePageDisplay();
        updateBookmarkState();
        
        // Snap to page boundary if needed
        const targetScroll = (newPage - 1) * pageWidth;
        if (Math.abs(currentScroll - targetScroll) > 1) {
            container.dataset.isScrolling = 'true';
            container.scrollLeft = targetScroll;
            setTimeout(() => {
                container.dataset.isScrolling = 'false';
            }, 50);
        }
    }
}

// Update setupScrollListener to use the extracted handler
function setupScrollListener() {
    const container = document.getElementById('reader-content');
    if (!container) return;
    
    // Remove any existing listeners
    container.removeEventListener('scroll', handleScroll);
    
    // Add debounced scroll listener
    container.addEventListener('scroll', debounce(handleScroll, 100));
}

// Update goToPage function to be more precise
function goToPage(pageNum) {
    const container = document.getElementById('reader-content');
    if (!container) return;

    const { columnWidth, columnGap, pageWidth } = getPageDimensions(container);
    const targetOffset = (pageNum - 1) * pageWidth;

    // Temporarily disable scroll listener
    container.removeEventListener('scroll', handleScroll);

    // Update page number before scrolling
    currentPage = pageNum;
    updatePageDisplay();
    updateBookmarkState();

    // Apply layout and scroll
    Object.assign(container.style, {
        columnWidth: `${columnWidth}px`,
        columnGap: `${columnGap}px`,
        columnFill: 'auto',
        height: '100%',
        overflow: 'hidden',
        padding: '0'
    });

    // Smooth scroll to target page
    container.scrollTo({
        left: targetOffset,
        behavior: 'smooth'
    });

    // Re-enable scroll listener after animation
    setTimeout(() => {
        container.addEventListener('scroll', handleScroll);
    }, 500); // Wait for smooth scroll to complete
}

const baseStyles = `
            h1, h2, h3, h4, h5, h6 {
                font-weight: bold;
                line-height: 1.2;
                margin: 1px 0 0.5em;
            }
            h1 { font-size: 2em; }
            h2 { font-size: 1.5em; }
            h3 { font-size: 1.17em; }
            strong, b { font-weight: bold; }
            em, i { font-style: italic; }
            sub { vertical-align: sub; font-size: smaller; }
            sup { vertical-align: super; font-size: smaller; }
            pre, code {
                font-family: monospace;
                white-space: pre-wrap;
            }
            blockquote {
                margin: 1px 2em;
                padding-left: 1px;
                border-left: 3px solid #ccc;
            }
        `;


function displayNavigation() {
    const nav = document.getElementById('toc');
    nav.innerHTML = '';

    currentBook.titles.forEach((title, index) => {
        const button = document.createElement('button');
        button.className = 'w-full text-left px-4 py-2 textgray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200';
        button.textContent = title;
        button.onclick = () => {
            displayChapter(index);
            toggleSidebar();
        };
        nav.appendChild(button);
    });
}

function updateFontSize() {
    document.getElementById('reader-content').style.fontSize = `${currentFontSize}px`;
}

function updateCurrentPage() {
    document.getElementById('currentPage').textContent =
        `Chapter ${currentChapter + 1} of ${currentBook.chapters.length}`;
}

// Sidebar handling
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isOpen = !sidebar.classList.contains('-translate-x-full');

    if (isOpen) {
        sidebar.classList.add('-translate-x-full');
    } else {
        sidebar.classList.remove('-translate-x-full');
    }
}

// Setup event listeners
function setupControls() {
    // Theme control
    document.getElementById('theme').value = savedTheme;
    document.getElementById('theme').onchange = (e) => setTheme(e.target.value);

    // Font size control
    document.getElementById('fontSize').value = currentFontSize;
    document.getElementById('fontSize').onchange = async (e) => {
        currentFontSize = parseInt(e.target.value);

        // Optionally update immediately so the text resizes right away
        updateFontSize();

        // Save the new size in storage
        storage.setItem('epub-font-size', currentFontSize);

        // Recalculate pagination for the entire book
        await loadTotalPages();

        // Clamp the current page if it exceeds the new total in this chapter
        const totalCurrentChapterPages = pagesPerChapter.get(currentChapter) || 1;
        if (currentPage > totalCurrentChapterPages) {
            currentPage = totalCurrentChapterPages;
        }

        // Redisplay the current chapter at the same page number if possible
        displayChapter(currentChapter, currentPage);
    };

    // Navigation
    document.getElementById('prevPage').onclick = prevPage;
    document.getElementById('nextPage').onclick = nextPage;

    // Sidebar controls
    document.getElementById('menuButton').onclick = toggleSidebar;
    document.getElementById('closeSidebar').onclick = toggleSidebar;

    // Search controls
    document.getElementById('searchButton').onclick = toggleSearch;
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));

    // Add click handler for search overlay background
    const searchOverlay = document.getElementById('searchOverlay');
    if (searchOverlay) {
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) {
                toggleSearch();
            }
        });
    }

    // Add escape key handler for search overlay
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('searchOverlay').classList.contains('hidden')) {
            toggleSearch();
        }
    });

    // Bookmark control
    document.getElementById('bookmarkButton').onclick = toggleBookmark;

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName.toLowerCase() === 'input') return;

        switch (e.key) {
            case 'ArrowLeft':
                prevPage();
                break;
            case 'ArrowRight':
                nextPage();
                break;
        }
    });

    // Handle scroll events for page tracking
    const readerContent = document.getElementById('reader-content');
    if (readerContent) {
        readerContent.addEventListener('scroll', debounce(() => {
            const pageHeight = readerContent.clientHeight;
            currentPage = Math.floor(readerContent.scrollTop / pageHeight) + 1;
            updatePageDisplay();
            updateBookmarkState();
        }, 100));
    }
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function updateBookmarkState() {
    const themes = {
        light: {
            bookmark: { fill: '#1a1a1a', stroke: '#4b5563' }
        },
        dark: {
            bookmark: { fill: '#e2e8f0', stroke: '#9ca3af' }
        },
        sepia: {
            bookmark: { fill: '#574532', stroke: '#78716c' }
        }
    };

    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 
                        document.documentElement.classList.contains('sepia') ? 'sepia' : 'light';
    const themeColors = themes[currentTheme].bookmark;
    
    const isBookmarked = bookmarks.some(b => b.chapter === currentChapter && b.page === currentPage);
    document.getElementById('bookmarkButton').innerHTML = isBookmarked
        ? `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="${themeColors.fill}" stroke="none">
               <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
           </svg>`
        : `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="${themeColors.stroke}" stroke-width="2">
               <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
           </svg>`;
}

// Pagination functions
function calculatePages(content) {
    const container = document.getElementById('reader-content');
    const tempDiv = document.createElement('div');
    
    // Apply the same styles as the container
    tempDiv.style.cssText = window.getComputedStyle(container).cssText;
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.width = container.clientWidth + 'px';
    tempDiv.style.height = container.clientHeight + 'px';
    tempDiv.style.fontSize = currentFontSize + 'px';
    tempDiv.style.padding = '0';
    tempDiv.style.margin = '0';
    tempDiv.style.boxSizing = 'border-box';
    tempDiv.style.columnWidth = container.clientWidth + 'px';
    tempDiv.style.columnGap = '40px';
    tempDiv.style.columnFill = 'auto';
    
    // Add content with wrapper
    tempDiv.innerHTML = `<div class="chapter-content">${content}</div>`;
    document.body.appendChild(tempDiv);
    
    // Calculate total pages based on scroll width
    const totalWidth = tempDiv.scrollWidth;
    const columnWidth = tempDiv.clientWidth;
    const columnGap = parseInt(window.getComputedStyle(tempDiv).columnGap);
    const pageWidth = columnWidth + columnGap;
    const pageCount = Math.max(1, Math.ceil(totalWidth / pageWidth));
    
    document.body.removeChild(tempDiv);
    
    return { content, count: pageCount, columnWidth, columnGap };
}

function getPageDimensions(container) {
    const style = window.getComputedStyle(container);
    const columnWidth = parseInt(style.columnWidth) || container.clientWidth;
    const columnGap = parseInt(style.columnGap) || 40;
    return { columnWidth, columnGap, pageWidth: columnWidth + columnGap };
}

function nextPage() {
    const chapterPages = pagesPerChapter.get(currentChapter) || 1;
    if (currentPage < chapterPages) {
        goToPage(currentPage + 1);
    } else if (currentChapter < currentBook.chapters.length - 1) {
        displayChapter(currentChapter + 1, 1);
    }
}

function prevPage() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    } else if (currentChapter > 0) {
        const prevChapterPages = pagesPerChapter.get(currentChapter - 1) || 1;
        displayChapter(currentChapter - 1, prevChapterPages, false);
    }
}

function updatePageDisplay() {
    // Calculate current overall page
    let totalPagesBefore = 0;
    for (let i = 0; i < currentChapter; i++) {
        totalPagesBefore += pagesPerChapter.get(i) || 0;
    }
    const currentOverallPage = totalPagesBefore + currentPage;

    const currentPageElement = document.getElementById('currentPage');
    if (currentPageElement) {
        currentPageElement.textContent = `Page ${currentOverallPage} of ${totalPages}`;
    }
}

// Initialize application
function init() {
    setupControls();
    setupScrollListener();
    loadEpubFile();
}

init();

async function loadTotalPages() {
    // Pre-calculate pages for all chapters
    updateLoadingProgress(1, 'Calculating chapter layout...');
    console.log('Starting page calculations...');

    // Create a temporary div for page calculations
    const tempDiv = document.createElement('div');
    const readerContent = document.getElementById('reader-content');
    tempDiv.style.cssText = window.getComputedStyle(readerContent).cssText;
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.width = readerContent.clientWidth + 'px';
    tempDiv.style.height = readerContent.clientHeight + 'px';
    tempDiv.style.fontSize = currentFontSize + 'px';
    tempDiv.style.padding = window.getComputedStyle(readerContent).padding;
    tempDiv.style.boxSizing = 'border-box';
    tempDiv.style.overflow = 'hidden';
    document.body.appendChild(tempDiv);

    // Reset counters
    totalPages = 0;
    pagesPerChapter.clear();

    // Process each chapter sequentially
    for (let i = 0; i < currentBook.chapters.length; i++) {
        const { pages, count } = calculatePages(currentBook.chapters[i].content);
        currentBook.chapters[i].pages = pages;
        pagesPerChapter.set(i, count);
        totalPages += count;

        // Calculate actual words per page for this chapter
        const chapterWordCounts = new Map();
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = window.getComputedStyle(document.getElementById('reader-content')).cssText;
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.columnCount = count;
        tempDiv.style.columnGap = '40px';
        tempDiv.innerHTML = currentBook.chapters[i].content;
        document.body.appendChild(tempDiv);

        // Get the actual page boundaries
        const columnWidth = tempDiv.clientWidth / count;
        const words = tempDiv.textContent.split(/\s+/);
        let wordCount = 0;
        let currentPage = 1;
        
        // Create a range to measure text positions
        const range = document.createRange();
        const textNodes = [];
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
        
        // Collect all text nodes
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        // Process each text node
        for (let j = 0; j < textNodes.length; j++) {
            const node = textNodes[j];
            const nodeWords = node.textContent.trim().split(/\s+/);
            
            for (const word of nodeWords) {
                if (!word) continue;
                
                range.setStart(node, 0);
                range.setEnd(node, node.textContent.indexOf(word) + word.length);
                const rect = range.getBoundingClientRect();
                const wordPage = Math.floor(rect.left / columnWidth) + 1;
                
                if (wordPage > currentPage) {
                    chapterWordCounts.set(currentPage, wordCount);
                    currentPage = wordPage;
                }
                wordCount++;
            }
        }
        
        // Set the final page word count
        chapterWordCounts.set(currentPage, wordCount);
        wordsPerPage.set(i, chapterWordCounts);
        totalWordsPerChapter.set(i, wordCount);

        document.body.removeChild(tempDiv);
        range.detach();

        // Update loading progress
        const progress = Math.round((i / currentBook.chapters.length) * 100);
        updateLoadingProgress(progress, 
            `Calculating layout for chapter ${i + 1} of ${currentBook.chapters.length}...`);

        // Give the UI a chance to update
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    console.log(`Final total pages: ${totalPages}`);

    // Clean up temporary div
    document.body.removeChild(tempDiv);

    // Make sure we have pages before proceeding
    if (totalPages === 0) {
        console.error('No pages were calculated!');
        console.log('Number of chapters:', currentBook.chapters.length);
        console.log('First chapter content length:', currentBook.chapters[0]?.content.length);
    }
}

async function displayBook() {

    // Display the book
    document.getElementById('reader-content').parentElement.classList.remove('hidden');
    displayChapter(0);
    displayNavigation();
    loadBookmarks();
}

async function processImages(zip, basePath, manifest) {
    const processImage = async (path) => {
        const file = zip.file(path);
        if (file) {
            const imageData = await file.async("base64");
            const mediaType = path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
                ? 'image/jpeg'
                : path.toLowerCase().endsWith('.png')
                    ? 'image/png'
                    : 'image/gif';
            currentBook.images[path] = `data:${mediaType};base64,${imageData}`;
            return true;
        }
        return false;
    };
    // Process manifest images
    const imageItems = Object.values(manifest)
        .filter(item => item.mediaType.startsWith("image/"));

    for (const item of imageItems) {
        await processImage(resolveEpubPath(item.href, basePath));
    }

    // Try all possible cover image paths
    const coverPaths = [
        "cover.jpg",
        "Cover.jpg",
        "cover.jpeg",
        "Cover.jpeg",
        "cover.png",
        "Cover.png",
        "images/cover.jpg",
        "Imagescover.jpg",
        "IMAGES/cover.jpg",
        "OPS/images/cover.jpg",
        "OPS/Images/cover.jpg",
        "META-INF/cover.jpg",
        "OEBPS/images/cover.jpg",
        "OEBPS/Images/cover.jpg"
    ];

    // Try to find cover image in manifest
    const coverItem = Object.values(manifest).find(item =>
        item.properties?.includes('cover-image') ||
        item.id?.includes('cover') ||
        item.href?.toLowerCase().includes('cover')
    );

    if (coverItem) {
        await processImage(resolveEpubPath(coverItem.href, basePath));
    }

    // Try common cover paths as fallback
    for (const path of coverPaths) {
        if (await processImage(path)) {
            break; // Stop after finding first valid cover image
        }
    }
}