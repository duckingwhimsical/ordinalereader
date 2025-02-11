// Default templates for the EPUB reader
window.templates = {
    // Simple loading overlay template
    loadingOverlay: () => `
        <div class="text-center p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-t-blue-500 border-blue-200 mb-4"></div>
            <h3 class="text-lg text-gray-900 dark:text-white">Loading Book...</h3>
            <div class="w-48 h-1 bg-gray-200 dark:bg-gray-700 mt-2">
                <div id="loadingProgress" class="h-full bg-blue-500"></div>
            </div>
            <p id="loadingStatus" class="text-sm text-gray-600 dark:text-gray-400 mt-2">Initializing...</p>
        </div>
    `,

    // Simple bookmark button templates
    bookmarkButton: {
        active: () => `
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"></path>
            </svg>
        `,
        inactive: () => `
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"></path>
            </svg>
        `
    },

    // Simple empty bookmarks template
    emptyBookmarks: () => `
        <div class="text-center p-4">
            <p class="text-gray-600 dark:text-gray-400">No bookmarks yet</p>
        </div>
    `,

    // Simple bookmark item template
    bookmarkItem: (bookmark, index) => `
        <div class="flex justify-between items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            <div>
                <div class="font-medium text-gray-900 dark:text-gray-100">${bookmark.title}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                    Page ${bookmark.page}
                </div>
            </div>
            <button class="text-gray-400 hover:text-red-500" data-bookmark-index="${index}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `,

    // Simple search result template
    searchResult: (match, index, total) => `
        <div class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" 
             data-chapter="${match.chapter}" 
             data-page="${match.page}">
            <div class="text-sm text-gray-800 dark:text-gray-200">
                ${match.preview}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Chapter ${match.chapter + 1}, Page ${match.page}
            </div>
        </div>
    `,

    // Simple empty search results template
    emptySearchResults: () => `
        <div class="p-4 text-center text-gray-600 dark:text-gray-400">
            Enter a search term to begin
        </div>
    `,

    // Simple error search results template
    errorSearchResults: () => `
        <div class="p-4 text-center text-red-600 dark:text-red-400">
            An error occurred while searching
        </div>
    `,

    // Simple book title template
    bookTitle: (title, subtitle) => `
        <div class="text-center">
            <div class="text-lg font-bold text-gray-800 dark:text-gray-200">${title}</div>
            ${subtitle ? `
                <div class="text-sm text-gray-600 dark:text-gray-400">
                    ${subtitle}
                </div>
            ` : ''}
        </div>
    `,

    // Simple navigation buttons
    navigationButtons: {
        prev: () => `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
        `,
        next: () => `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
        `
    },

    // Simple table of contents item template
    tocItem: (title, index) => `
        <a href="#" 
           class="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
           role="button" 
           data-chapter-index="${index}">
            ${title}
        </a>
    `
}; 
