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

// Theme handling with transitions
function setTheme(theme) {
    const html = document.documentElement;
    const themes = {
        light: {
            body: { color: '#1a1a1a', background: '#ffffff' }
        },
        dark: {
            body: { color: '#e2e8f0', background: '#1a1a1a' }
        },
        sepia: {
            body: { color: '#574532', background: '#faf6f0' }
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
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // First clean any leftover HTML tags from the text
    const cleanText = lowerText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    let index = cleanText.indexOf(lowerQuery);

    while (index !== -1) {
        // Get surrounding context (50 chars before and after)
        const start = Math.max(0, index - 50);
        const end = Math.min(cleanText.length, index + query.length + 50);
        const preview = cleanText.slice(start, end);

        searchResults.push({
            index,
            preview: preview.replace(
                new RegExp(query, 'gi'),
                match => `<mark class="bg-yellow-200 dark:bg-yellow-500/50">${match}</mark>`
            ),
            chapter
        });

        index = cleanText.indexOf(lowerQuery, index + 1);
    }

    return searchResults;
}

// Update handleSearch function to use event listeners instead of inline onclick
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
            const textContent = tempDiv.textContent.replace(/\s+/g, ' ').trim();
            return performSearch(textContent, query, index);
        }).flat();

        if (allResults.length === 0) {
            results.innerHTML = '<div class="p-2 text-gray-600 dark:text-gray-400">No results found</div>';
            return;
        }

        // Create result elements
        results.innerHTML = allResults
            .map((match, index) => {
                const page = Math.floor(match.index / 1000) + 1; // Rough estimate of page based on character count
                return `
                    <div class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded" 
                         data-chapter="${match.chapter}" 
                         data-page="${page}">
                        <div class="text-sm text-gray-800 dark:text-gray-200">
                            ${match.preview}
                        </div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Chapter ${match.chapter + 1}, Page ${page} • Match ${index + 1} of ${allResults.length}
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
            displayBookmarks();
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            bookmarks = [];
        }
    }
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

// Update displayChapter function to handle page navigation
async function displayChapter(index, targetPage = 1) {
    try {
        currentChapter = index;
        const chapter = currentBook.chapters[index];
        let content = chapter.content;

        // Create a style element for all CSS
        let combinedStyles = '';

        // Add all processed stylesheet contents
        const linkedStyles = chapter.linkedStyles;
        for (const cssPath of linkedStyles) {
            if (currentBook.styles[cssPath]) {
                combinedStyles += currentBook.styles[cssPath] + '\n';
            }
        }

        // Add chapter's internal styles
        if (chapter.internalStyles) {
            combinedStyles += chapter.internalStyles + '\n';
        }

        // Process font faces with loaded fonts and preloading hints
        const preloadHints = Object.entries(currentBook.fonts)
            .map(([key, font]) => `
                <link rel="preload"
                      href="${font.data}"
                      as="font"
                      type="${font.mimeType}"
                      crossorigin="anonymous">`)
            .join('\n');

        // Add font-face declarations
        combinedStyles += Object.entries(currentBook.fonts)
            .map(([key, font]) => `
                @font-face {
                    font-family: '${font.family}';
                    font-weight: ${font.weight};
                    font-style: ${font.style};
                    font-display: swap;
                }
            `).join('\n');

        // Replace image sources with base64 data
        content = content.replace(
            /<img[^>]+src="([^"]+)"[^>]*>/g,
            (match, src) => {
                const imagePath = resolveEpubPath(src, currentBook.basePath);
                return currentBook.images[imagePath]
                    ? match.replace(src, currentBook.images[imagePath])
                    : match;
            }
        );

        // Add CSS custom properties
        combinedStyles += '\n:root {\n';
        currentBook.customProperties.forEach((value, key) => {
            combinedStyles += `    ${key}: ${value};\n`;
        });
        combinedStyles += '}\n';

        // Remove any existing EPUB styles
        const existingStyles = document.querySelectorAll('style[data-epub-styles]');
        existingStyles.forEach(style => style.remove());

        // Create and append new style element
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-epub-styles', 'true');
        styleElement.textContent = combinedStyles;
        document.head.appendChild(styleElement);

        // Update the content container styles
        const readerContent = document.getElementById('reader-content');
        if (readerContent) {
            readerContent.style.fontSize = `${currentFontSize}px`;
            readerContent.style.height = '100%';
            readerContent.style.position = 'relative';
            readerContent.style.overflow = 'hidden';
            
            // Wait for fonts to load
            await document.fonts.ready;
            
            // Calculate and store pages for this chapter
            const { pages, count } = calculatePages(content);
            currentBook.chapters[currentChapter].pages = pages;
            pagesPerChapter.set(currentChapter, count);
            
            // Display the target page
            currentPage = Math.min(targetPage, count);
            readerContent.innerHTML = pages[currentPage - 1];
            
            // Update displays
            updatePageDisplay();
            updateBookmarkState();
        }

    } catch (error) {
        console.error('Error displaying chapter:', error);
        const readerContent = document.getElementById('reader-content');
        if (readerContent) {
            readerContent.innerHTML = '<div class="p-4 text-red-600">Error displaying chapter. Please try again.</div>';
        }
    }
}

const baseStyles = `
            h1, h2, h3, h4, h5, h6 {
                font-weight: bold;
                line-height: 1.2;
                margin: 1em 0 0.5em;
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
                margin: 1em 2em;
                padding-left: 1em;
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
    document.getElementById('fontSize').onchange = (e) => {
        currentFontSize = parseInt(e.target.value);
        updateFontSize();
        storage.setItem('epub-font-size', currentFontSize);
        
        // Recalculate pages when font size changes
        if (currentBook) {
            const content = currentBook.chapters[currentChapter].content;
            const pages = calculatePages(content);
            pagesPerChapter.set(currentChapter, pages);
            goToPage(Math.min(currentPage, pages));
        }
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
    const isBookmarked = bookmarks.some(b => b.chapter === currentChapter && b.page === currentPage);
    document.getElementById('bookmarkButton').innerHTML = isBookmarked
        ? `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
               <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
           </svg>`
        : `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
           </svg>`;
}

// Pagination functions
function calculatePages(content) {
    const container = document.getElementById('reader-content');
    const tempDiv = document.createElement('div');
    
    // Copy all relevant styles from the container
    tempDiv.style.cssText = window.getComputedStyle(container).cssText;
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.width = container.clientWidth + 'px';
    tempDiv.style.height = container.clientHeight + 'px';
    tempDiv.style.fontSize = currentFontSize + 'px';
    tempDiv.style.padding = window.getComputedStyle(container).padding;
    tempDiv.style.boxSizing = 'border-box';
    tempDiv.style.overflow = 'hidden';
    
    const pages = [];
    let currentPage = '';

    // Split content into words while preserving HTML tags
    const words = content.split(/(<[^>]+>)|(\s+)/g).filter(Boolean);
    
    tempDiv.innerHTML = '';
    document.body.appendChild(tempDiv);
    
    for (const word of words) {
        const testContent = currentPage + ' ' + word;
        tempDiv.innerHTML = testContent;
        
        if (tempDiv.scrollHeight > container.clientHeight) {
            pages.push(currentPage);
            currentPage = word;
        } else {
            currentPage = testContent;
        }
    }
    
    if (currentPage) {
        pages.push(currentPage);
    }
    
    document.body.removeChild(tempDiv);
    return { pages, count: pages.length };
}

function goToPage(pageNum) {
    const container = document.getElementById('reader-content');
    const pages = currentBook.chapters[currentChapter].pages;
    if (!pages || pageNum < 1 || pageNum > pages.length) return;
  
    const isForward = pageNum > currentPage;
  
    // Create a wrapper for perspective
    const wrapper = document.createElement('div');
    wrapper.className = 'absolute inset-0';
    wrapper.style.perspective = '2000px';
    wrapper.style.backgroundColor = window.getComputedStyle(container).backgroundColor;
  
    // Main page container
    const pageContainer = document.createElement('div');
    pageContainer.className = 'absolute inset-0';
  
    // The static page underneath
    const staticPage = document.createElement('div');
    staticPage.className = 'absolute inset-0';
    staticPage.style.backgroundColor = window.getComputedStyle(container).backgroundColor;
    // For backward navigation, static page shows the new page
    // For forward navigation, static page shows the new page
    staticPage.innerHTML = pages[pageNum - 1];
  
    // The flipping page
    const turningPage = document.createElement('div');
    turningPage.className = 'absolute inset-0';
    turningPage.style.transformStyle = 'preserve-3d';
    turningPage.style.boxShadow = 'rgba(0, 0, 0, 0.2) 0 0 15px';
  
    // Front and back faces
    const pageFront = document.createElement('div');
    pageFront.className = 'page-face page-face-front';
    pageFront.style.backgroundColor = window.getComputedStyle(container).backgroundColor;
  
    const pageBack = document.createElement('div');
    pageBack.className = 'page-face page-face-back';
    pageBack.style.backgroundColor = window.getComputedStyle(container).backgroundColor;
  
    // For backward navigation:
    //   - front = current page (will flip away)
    //   - back = empty (since new page is static underneath)
    // For forward navigation:
    //   - front = current page (will flip away)
    //   - back = new page (will be revealed)
    pageFront.innerHTML = pages[currentPage - 1];
    pageBack.innerHTML = isForward ? pages[pageNum - 1] : '';
  
    turningPage.appendChild(pageFront);
    turningPage.appendChild(pageBack);
  
    pageContainer.appendChild(staticPage);
    pageContainer.appendChild(turningPage);
    wrapper.appendChild(pageContainer);
  
    container.innerHTML = '';
    container.appendChild(wrapper);
  
    // Add the correct class to trigger the keyframe
    requestAnimationFrame(() => {
      turningPage.classList.add(isForward ? 'turn-forward' : 'turn-backward');
    });
  
    // Cleanup after animation
    turningPage.addEventListener('animationend', () => {
      container.innerHTML = pages[pageNum - 1];
      currentPage = pageNum;
      updatePageDisplay();
      updateBookmarkState();
    }, { once: true });
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
        displayChapter(currentChapter - 1, prevChapterPages);
    }
}

function updatePageDisplay() {
    const chapterPages = pagesPerChapter.get(currentChapter) || 1;
    const currentPageElement = document.getElementById('currentPage');
    if (currentPageElement) {
        currentPageElement.textContent = `Chapter ${currentChapter + 1} of ${currentBook.chapters.length} • Page ${currentPage} of ${chapterPages}`;
    }
}

// Initialize application
function init() {
    setupControls();
    loadEpubFile();
}

init();
function displayBook() {
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