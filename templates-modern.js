// Modern style templates for the EPUB reader
window.templates = {
    // Configuration values
    config: {
        pageTurnSpeed: 300, // milliseconds - faster for modern style
        pageTurnBehavior: 'smooth',
        scrollDebounceTime: 100, // milliseconds
        snapAnimationSpeed: 30 // milliseconds - faster snap animation for modern style
    },

    // Base styles for the reader content
    baseStyles: `
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
    `,

    // Reader layout styles
    readerStyles: `
        /* Reader layout styles */
        .chapter-content {
            padding: 2rem;
            column-fill: auto;
            height: 100%;
        }
        
        /* Internal link styles */
        .internal-link {
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
        }
        
        .internal-link:hover {
            text-decoration: underline;
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
    `,

    // Loading overlay template with modern spinner
    loadingOverlay: () => `
        <div class="text-center p-8 rounded-2xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm shadow-xl">
            <div class="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-8"></div>
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Loading Book...</h3>
            <div class="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div id="loadingProgress" class="h-full bg-blue-500 transition-all duration-300 ease-out"></div>
            </div>
            <p id="loadingStatus" class="mt-2 text-sm text-gray-600 dark:text-gray-400">Initializing...</p>
        </div>
    `,

    // Modern bookmark button templates
    bookmarkButton: {
        active: () => `
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"></path>
            </svg>
        `,
        inactive: () => `
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"></path>
            </svg>
        `
    },

    // Empty bookmarks template with modern style
    emptyBookmarks: () => `
        <div class="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-gray-50/50 dark:bg-gray-700/30 rounded-2xl backdrop-blur-sm">
            <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <svg class="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                </svg>
            </div>
            <p class="text-lg font-medium text-gray-700 dark:text-gray-300">No bookmarks yet</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">Save your favorite spots while reading</p>
        </div>
    `,

    // Modern bookmark item template
    bookmarkItem: (bookmark, index) => `
        <div class="group flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-all duration-200">
            <div class="flex-1 min-w-0">
                <h4 class="font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    ${bookmark.title}
                </h4>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                    Page ${bookmark.page} • ${new Date(bookmark.timestamp).toLocaleDateString()}
                </div>
                ${bookmark.preview ? `
                    <div class="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        ${bookmark.preview}
                    </div>
                ` : ''}
            </div>
            <button class="ml-4 p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" data-bookmark-index="${index}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `,

    // Modern search result template
    searchResult: (match, index, total) => `
        <div class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer rounded-xl transition-all duration-200" 
             data-chapter="${match.chapter}" 
             data-page="${match.page}">
            <div class="text-sm text-gray-800 dark:text-gray-200 mb-2">
                ${match.preview}
            </div>
            <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 space-x-2">
                <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md">Chapter ${match.chapter + 1}</span>
                <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md">Page ${match.page}</span>
                <span class="ml-auto">Match ${index + 1} of ${total}</span>
            </div>
        </div>
    `,

    // Modern empty search results template
    emptySearchResults: () => `
        <div class="p-4 text-center text-gray-600 dark:text-gray-400">
            <svg class="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <p>Enter a search term to begin...</p>
        </div>
    `,

    // Modern error search results template
    errorSearchResults: () => `
        <div class="p-4 text-center text-red-600 dark:text-red-400">
            <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>An error occurred while searching</p>
        </div>
    `,

    // Modern book title template
    bookTitle: (title, subtitle) => `
        <div class="flex flex-col items-center justify-center">
            <div class="text-xl font-bold text-gray-800 dark:text-gray-200 tracking-wide">${title}</div>
            ${subtitle ? `
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">
                    ${subtitle}
                </div>
            ` : ''}
        </div>
    `,

    // Modern navigation buttons with labels
    navigationButtons: {
        prev: () => `
            <div class="flex items-center space-x-2">
                <svg class="w-6 h-6 text-gray-900 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
                <span class="hidden md:inline text-gray-900 dark:text-gray-300">Previous</span>
            </div>
        `,
        next: () => `
            <div class="flex items-center space-x-2">
                <span class="hidden md:inline text-gray-900 dark:text-gray-300">Next</span>
                <svg class="w-6 h-6 text-gray-900 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </div>
        `
    },

    // Modern table of contents item template
    tocItem: (title, index) => `
        <a href="#" 
           class="block w-full text-left px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-all duration-200"
           role="button" 
           aria-label="Go to ${title}"
           data-chapter-index="${index}">
            <div class="flex items-center">
                <span class="text-sm font-medium">${title}</span>
                <svg class="w-4 h-4 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </div>
        </a>
    `
}; 