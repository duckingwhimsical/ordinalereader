class EPUBReader {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.currentLocation = null;
        this.settings = this.loadSettings();
        this.bookmarks = new Set(this.loadBookmarks());
        this.currentPage = 0;
        this.totalPages = 0;
        this.pageOffsets = new Map(); // Store page offsets for each chapter

        this.initializeElements();
        this.setupEventListeners();
        this.applySettings();

        // Automatically load the default book
        this.loadDefaultBook();
    }

    // Add new method to load default book
    async loadDefaultBook() {
        try {
            const response = await fetch('/epub/Fear-and-Liquidity-in-Crypto-Vegas-Generic.epub');
            const blob = await response.blob();
            await this.loadBook(blob);
        } catch (error) {
            console.error('Error loading default book:', error);
            // Show file prompt if default book fails to load
            this.elements.filePrompt.classList.remove('hidden');
        }
    }

    initializeElements() {
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            menuButton: document.getElementById('menuButton'),
            closeSidebar: document.getElementById('closeSidebar'),
            prevPage: document.getElementById('prevPage'),
            nextPage: document.getElementById('nextPage'),
            searchButton: document.getElementById('searchButton'),
            bookmarkButton: document.getElementById('bookmarkButton'),
            searchOverlay: document.getElementById('searchOverlay'),
            searchInput: document.getElementById('searchInput'),
            searchResults: document.getElementById('searchResults'),
            bookInput: document.getElementById('bookInput'),
            filePrompt: document.getElementById('filePrompt'),
            reader: document.getElementById('reader'),
            fontSize: document.getElementById('fontSize'),
            theme: document.getElementById('theme'),
            currentPage: document.getElementById('currentPage'),
            toc: document.getElementById('toc'),
            bookmarks: document.getElementById('bookmarks')
        };
    }

    setupEventListeners() {
        // Menu controls
        this.elements.menuButton.addEventListener('click', () => this.toggleSidebar());
        this.elements.closeSidebar.addEventListener('click', () => this.toggleSidebar());

        // Navigation
        this.elements.prevPage.addEventListener('click', () => this.prevPage());
        this.elements.nextPage.addEventListener('click', () => this.nextPage());

        // Search
        this.elements.searchButton.addEventListener('click', () => this.toggleSearch());
        this.elements.searchInput.addEventListener('input', () => this.handleSearch());

        // Bookmarks
        this.elements.bookmarkButton.addEventListener('click', () => this.toggleBookmark());

        // Settings
        this.elements.fontSize.addEventListener('change', () => this.updateFontSize());
        this.elements.theme.addEventListener('change', () => this.updateTheme());

        // File loading
        this.elements.bookInput.addEventListener('change', (e) => this.loadBook(e.target.files[0]));
        this.setupDragAndDrop();

        // Touch and keyboard navigation
        this.setupTouchNavigation();
        this.setupKeyboardNavigation();
    }

    setupDragAndDrop() {
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/epub+zip') {
                this.loadBook(files[0]);
            }
        });
    }

    setupTouchNavigation() {
        let touchStartX = null;

        this.elements.reader.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        });

        this.elements.reader.addEventListener('touchend', (e) => {
            if (!touchStartX) return;

            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    this.nextPage();
                } else {
                    this.prevPage();
                }
            }

            touchStartX = null;
        });
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    this.prevPage();
                    break;
                case 'ArrowRight':
                    this.nextPage();
                    break;
            }
        });
    }

    async loadBook(file) {
        this.book = ePub(file);
        await this.book.ready;

        this.rendition = this.book.renderTo('reader', {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: "paginated"  // Enable pagination
        });

        // Generate locations before displaying content
        await this.book.locations.generate(1024);

        // Calculate page offsets for continuous numbering
        await this.calculatePageOffsets();

        this.loadTableOfContents();
        this.loadBookmarks();
        this.elements.filePrompt.classList.add('hidden');

        this.rendition.on('relocated', (location) => {
            this.currentLocation = location;
            this.updatePageInfo();
            this.updateBookmarkButton();
            this.savePosition();
        });

        await this.rendition.display();
        this.applySettings();
    }


    async calculatePageOffsets() {
        try {
            this.pageOffsets.clear();
            let cumulativePages = 0;

            // Get all spine items (chapters)
            const spineItems = this.book.spine.items;

            // For each spine item, calculate its page count
            for (let i = 0; i < spineItems.length; i++) {
                const item = spineItems[i];
                this.pageOffsets.set(item.href, cumulativePages);

                // Display the item to get its page count
                await this.rendition.display(item.href);
                const displayed = this.rendition.currentLocation().start.displayed;

                if (displayed) {
                    cumulativePages += displayed.total;
                }
            }

            this.totalPages = cumulativePages;
            console.log('Total pages:', this.totalPages);

            // Return to the beginning of the book
            await this.rendition.display(spineItems[0].href);
        } catch (error) {
            console.error('Error calculating page offsets:', error);
        }
    }

    async loadTableOfContents() {
        const toc = await this.book.loaded.navigation;
        const tocElement = this.elements.toc;
        tocElement.innerHTML = '';

        const createTocItem = (chapter, level = 0) => {
            const item = document.createElement('div');
            item.classList.add('toc-item');
            item.style.paddingLeft = `${level * 20}px`;
            item.textContent = chapter.label;

            item.addEventListener('click', async () => {
                try {
                    await this.rendition.display(chapter.href);
                    this.toggleSidebar();
                    // Visual feedback
                    item.style.backgroundColor = 'rgba(128, 128, 128, 0.2)';
                    setTimeout(() => {
                        item.style.backgroundColor = '';
                    }, 200);
                } catch (error) {
                    console.error('Error navigating to chapter:', error);
                }
            });

            tocElement.appendChild(item);

            // Handle nested chapters if they exist
            if (chapter.subitems && chapter.subitems.length > 0) {
                chapter.subitems.forEach(subchapter => createTocItem(subchapter, level + 1));
            }
        };

        toc.toc.forEach(chapter => createTocItem(chapter));
    }

    updatePageInfo() {
        if (!this.book || !this.currentLocation) {
            this.elements.currentPage.textContent = 'Loading...';
            return;
        }

        try {
            const location = this.currentLocation;
            const chapterHref = location.start.href;
            const pageOffset = this.pageOffsets.get(chapterHref) || 0;
            const currentPage = pageOffset + location.start.displayed.page;

            this.elements.currentPage.textContent = `Page ${currentPage} of ${this.totalPages}`;
        } catch (error) {
            console.error('Error displaying page numbers:', error);
            this.elements.currentPage.textContent = 'Loading...';
        }
    }

    prevPage() {
        if (this.rendition) {
            this.rendition.prev();
        }
    }

    nextPage() {
        if (this.rendition) {
            this.rendition.next();
        }
    }

    toggleSidebar() {
        this.elements.sidebar.classList.toggle('open');
    }

    toggleSearch() {
        this.elements.searchOverlay.classList.toggle('open');
        if (this.elements.searchOverlay.classList.contains('open')) {
            this.elements.searchInput.focus();
        }
    }

    async handleSearch() {
        const query = this.elements.searchInput.value;
        if (!query || query.length < 3) {
            this.elements.searchResults.innerHTML = '';
            return;
        }

        const results = await this.book.search(query);
        this.elements.searchResults.innerHTML = '';

        results.forEach(result => {
            const div = document.createElement('div');
            div.classList.add('search-result');
            div.textContent = result.excerpt;
            div.addEventListener('click', () => {
                this.rendition.display(result.cfi);
                this.toggleSearch();
            });
            this.elements.searchResults.appendChild(div);
        });
    }

    toggleBookmark() {
        if (!this.currentLocation) return;

        const cfi = this.currentLocation.start.cfi;
        if (!cfi) {
            console.error('Invalid location for bookmark');
            return;
        }

        try {
            // Get current section/chapter information
            const spineItem = this.book.spine.get(this.currentLocation.start.href);
            const toc = this.book.navigation?.toc || [];

            // Find the current chapter in TOC
            const findChapterInToc = (items, href) => {
                for (let item of items) {
                    if (item.href === href) return item;
                    if (item.subitems) {
                        const found = findChapterInToc(item.subitems, href);
                        if (found) return found;
                    }
                }
                return null;
            };

            const chapter = findChapterInToc(toc, spineItem.href) || 
                          { label: `Chapter ${spineItem.index + 1}` };

            // Get text content around the current position
            const contents = this.rendition.getContents();
            const range = this.book.range(cfi);
            const textPreview = range ? 
                range.toString().slice(0, 100) : 
                contents[0]?.content.querySelector('p')?.textContent?.slice(0, 100) || 
                'No preview available';

            const bookmarkData = {
                cfi: cfi,
                href: spineItem.href,
                chapterTitle: chapter.label,
                timestamp: new Date().toISOString(),
                text: textPreview,
                page: this.getCurrentPage()
            };

            const bookmarkString = JSON.stringify(bookmarkData);

            if (this.hasBookmark(cfi)) {
                this.removeBookmark(cfi);
            } else {
                this.bookmarks.add(bookmarkString);
            }

            this.saveBookmarks();
            this.updateBookmarkButton();
            this.renderBookmarks();

        } catch (error) {
            console.error('Error toggling bookmark:', error);
        }
    }

    hasBookmark(cfi) {
        return Array.from(this.bookmarks).some(bookmark => {
            try {
                const data = JSON.parse(bookmark);
                return data.cfi === cfi;
            } catch {
                return false;
            }
        });
    }

    removeBookmark(cfi) {
        const bookmarkToRemove = Array.from(this.bookmarks).find(bookmark => {
            try {
                const data = JSON.parse(bookmark);
                return data.cfi === cfi;
            } catch {
                return false;
            }
        });
        if (bookmarkToRemove) {
            this.bookmarks.delete(bookmarkToRemove);
        }
    }

    updateBookmarkButton() {
        if (!this.currentLocation?.start?.cfi) return;

        const isBookmarked = this.hasBookmark(this.currentLocation.start.cfi);
        this.elements.bookmarkButton.innerHTML = isBookmarked ? icons.bookmarkFilled : icons.bookmark;
    }

    renderBookmarks() {
        const container = this.elements.bookmarks;
        container.innerHTML = '<h2 class="bookmarks-header">Bookmarks</h2>';

        if (this.bookmarks.size === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.classList.add('bookmark-empty');
            emptyMessage.textContent = 'No bookmarks yet';
            container.appendChild(emptyMessage);
            return;
        }

        const bookmarksList = document.createElement('div');
        bookmarksList.classList.add('bookmarks-list');

        Array.from(this.bookmarks)
            .map(bookmark => {
                try {
                    return JSON.parse(bookmark);
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => a.page - b.page)
            .forEach(bookmark => {
                const div = document.createElement('div');
                div.classList.add('bookmark-item');

                const header = document.createElement('div');
                header.classList.add('bookmark-header');

                const title = document.createElement('div');
                title.classList.add('bookmark-title');
                title.textContent = bookmark.chapterTitle;

                const preview = document.createElement('div');
                preview.classList.add('bookmark-preview');
                preview.textContent = bookmark.text;

                const page = document.createElement('div');
                page.classList.add('bookmark-page');
                page.textContent = `Page ${bookmark.page}`;

                const deleteBtn = document.createElement('button');
                deleteBtn.classList.add('bookmark-delete');
                deleteBtn.setAttribute('title', 'Remove bookmark');
                deleteBtn.innerHTML = '×';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeBookmark(bookmark.cfi);
                    this.saveBookmarks();
                    this.renderBookmarks();
                    this.updateBookmarkButton();
                });

                header.appendChild(title);
                header.appendChild(deleteBtn);

                div.appendChild(header);
                div.appendChild(preview);
                div.appendChild(page);

                div.addEventListener('click', async () => {
                    try {
                        await this.rendition.display(bookmark.cfi);
                        this.toggleSidebar();
                    } catch (error) {
                        console.error('Error navigating to bookmark:', error);
                    }
                });

                bookmarksList.appendChild(div);
            });

        container.appendChild(bookmarksList);
    }

    loadBookmarks() {
        try {
            const savedBookmarks = localStorage.getItem('epub-reader-bookmarks');
            if (!savedBookmarks) {
                this.bookmarks = new Set();
                return;
            }

            const bookmarks = JSON.parse(savedBookmarks);
            this.bookmarks = new Set(bookmarks);
            this.renderBookmarks();
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            this.bookmarks = new Set();
        }
    }

    saveBookmarks() {
        try {
            localStorage.setItem('epub-reader-bookmarks', JSON.stringify([...this.bookmarks]));
        } catch (error) {
            console.error('Error saving bookmarks:', error);
        }
    }

    getCurrentPage() {
        try {
            const location = this.currentLocation;
            const chapterHref = location.start.href;
            const pageOffset = this.pageOffsets.get(chapterHref) || 0;
            return pageOffset + location.start.displayed.page;
        } catch (error) {
            console.error('Error getting current page:', error);
            return 0;
        }
    }

    loadSettings() {
        return JSON.parse(localStorage.getItem('epub-reader-settings') || '{"fontSize": 16, "theme": "light"}');
    }

    saveSettings() {
        localStorage.setItem('epub-reader-settings', JSON.stringify(this.settings));
    }

    loadSavedPosition() {
        const savedCfi = localStorage.getItem('epub-reader-position');
        if (savedCfi) {
            this.rendition.display(savedCfi);
        }
    }

    savePosition() {
        if (this.currentLocation) {
            localStorage.setItem('epub-reader-position', this.currentLocation.start.cfi);
        }
    }

    async updateFontSize() {
        const size = parseInt(this.elements.fontSize.value);
        this.settings.fontSize = size;

        if (this.rendition) {
            // Use only EPUB.js's built-in font size adjustment
            this.rendition.themes.fontSize(`${size}px`);

            // Regenerate locations to ensure correct page counting
            await this.book.locations.generate(1024);

            // Recalculate page offsets
            await this.calculatePageOffsets();

            // Return to the previous location

        }

        this.saveSettings();
    }

    updateTheme() {
        const theme = this.elements.theme.value;
        this.settings.theme = theme;

        // Update UI theme
        document.body.setAttribute('data-theme', theme);

        if (this.rendition) {
            // Define theme styles
            const themes = {
                light: {
                    body: {
                        color: '#333333 !important',
                        background: '#ffffff !important'
                    },
                    'p, div, span, h1, h2, h3, h4, h5, h6': {
                        color: '#333333 !important'
                    },
                    a: {
                        color: '#2196f3 !important'
                    }
                },
                dark: {
                    body: {
                        color: '#ffffff !important',
                        background: '#1a1a1a !important'
                    },
                    'p, div, span, h1, h2, h3, h4, h5, h6': {
                        color: '#ffffff !important'
                    },
                    a: {
                        color: '#64b5f6 !important'
                    }
                },
                sepia: {
                    body: {
                        color: '#5b4636 !important',
                        background: '#f4ecd8 !important'
                    },
                    'p, div, span, h1, h2, h3, h4, h5, h6': {
                        color: '#5b4636 !important'
                    },
                    a: {
                        color: '#825e45 !important'
                    }
                }
            };

            // Remove any existing themes
            Object.keys(themes).forEach(themeName => {
                this.rendition.themes.override(themeName);
            });

            // Register and apply the new theme
            Object.entries(themes).forEach(([themeName, styles]) => {
                this.rendition.themes.register(themeName, styles);
            });

            // Apply the selected theme
            this.rendition.themes.select(theme);
            this.rendition.themes.override(theme, themes[theme]);

            // Force refresh the current page to ensure theme is applied
            const currentLocation = this.currentLocation?.start?.cfi;
            if (currentLocation) {
                this.rendition.display(currentLocation);
            }
        }

        this.saveSettings();
    }

    applySettings() {
        if (!this.rendition) return;

        // Set the theme on the document body
        document.body.setAttribute('data-theme', this.settings.theme);
        this.elements.theme.value = this.settings.theme;

        // Apply font size using EPUB.js's native method
        this.rendition.themes.fontSize(`${this.settings.fontSize}px`);

        // Apply the theme using updateTheme
        this.updateTheme();
    }
}

// Initialize the reader when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new EPUBReader();
});