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
        this.loadSavedPosition();
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
        const cfi = this.currentLocation.start.cfi;
        if (this.bookmarks.has(cfi)) {
            this.bookmarks.delete(cfi);
        } else {
            this.bookmarks.add(cfi);
        }
        this.saveBookmarks();
        this.updateBookmarkButton();
        this.renderBookmarks();
    }

    updateBookmarkButton() {
        const cfi = this.currentLocation?.start.cfi;
        this.elements.bookmarkButton.innerHTML =
            this.bookmarks.has(cfi) ? icons.bookmarkFilled : icons.bookmark;
    }

    renderBookmarks() {
        const container = this.elements.bookmarks;
        container.innerHTML = '';

        this.bookmarks.forEach(cfi => {
            const div = document.createElement('div');
            div.classList.add('bookmark-item');

            try {
                // Get the page number for this CFI using the offset system
                const location = this.rendition.location(cfi);
                const chapterHref = location?.start?.href;
                const pageOffset = this.pageOffsets.get(chapterHref) || 0;
                const page = pageOffset + (location?.start?.displayed?.page || 0);
                div.textContent = `Page ${page}`;
            } catch (error) {
                console.error('Error calculating bookmark page:', error);
                div.textContent = 'Bookmark';
            }

            div.addEventListener('click', () => {
                this.rendition.display(cfi);
                this.toggleSidebar();
            });
            container.appendChild(div);
        });
    }

    loadSettings() {
        return JSON.parse(localStorage.getItem('epub-reader-settings') || '{"fontSize": 16, "theme": "light"}');
    }

    saveSettings() {
        localStorage.setItem('epub-reader-settings', JSON.stringify(this.settings));
    }

    loadBookmarks() {
        return JSON.parse(localStorage.getItem('epub-reader-bookmarks') || '[]');
    }

    saveBookmarks() {
        localStorage.setItem('epub-reader-bookmarks', JSON.stringify([...this.bookmarks]));
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

    updateFontSize() {
        const size = parseInt(this.elements.fontSize.value);
        this.settings.fontSize = size;

        if (this.rendition) {
            // Use EPUB.js's built-in font size adjustment
            this.rendition.themes.fontSize(`${size}px`);

            // Update the stylesheet with more specific font adjustments
            this.rendition.themes.register({
                body: {
                    'font-size': `${size}px !important`,
                    'line-height': `${Math.floor(size * 1.5)}px !important`
                },
                'p': {
                    'font-size': `${size}px !important`,
                    margin: `${Math.floor(size * 0.8)}px 0`
                },
                'h1': { 'font-size': `${size * 1.8}px !important` },
                'h2': { 'font-size': `${size * 1.6}px !important` },
                'h3': { 'font-size': `${size * 1.4}px !important` },
                'h4': { 'font-size': `${size * 1.2}px !important` }
            });

            // Force refresh the current page to apply changes immediately
            const currentLocation = this.currentLocation?.start?.cfi;
            if (currentLocation) {
                this.rendition.display(currentLocation);
            }
        }

        this.saveSettings();
    }

    updateTheme() {
        const theme = this.elements.theme.value;
        this.settings.theme = theme;
        this.applySettings();
        this.saveSettings();
    }

    applySettings() {
        if (!this.rendition) return;

        document.body.setAttribute('data-theme', this.settings.theme);

        this.rendition.themes.fontSize(`${this.settings.fontSize}px`);
        this.rendition.themes.register('theme', {
            body: {
                color: getComputedStyle(document.body).getPropertyValue('--text-color'),
                background: getComputedStyle(document.body).getPropertyValue('--background-color')
            }
        });
        this.rendition.themes.select('theme');
    }
}

// Initialize the reader when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new EPUBReader();
});