class EPUBReader {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.currentLocation = null;
        this.settings = this.loadSettings();
        this.bookmarks = new Set(this.loadBookmarks());
        this.initializeElements();
        this.setupEventListeners();
        this.applySettings();
        this.loadDefaultBook();
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
            bookmarks: document.getElementById('bookmarks'),
            // Add loading overlay elements
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingProgress: document.getElementById('loadingProgress'),
            loadingStatus: document.getElementById('loadingStatus')
        };
    }

    async loadDefaultBook() {
        try {
            this.showLoadingOverlay();
            this.updateLoadingStatus('Fetching default book...');

            const response = await fetch('/epub/Fear-and-Liquidity-in-Crypto-Vegas-Generic.epub');
            if (!response.ok) throw new Error('Failed to fetch default book');

            const blob = await response.blob();
            await this.loadBook(blob);
        } catch (error) {
            console.error('Error loading default book:', error);
            this.elements.filePrompt.classList.remove('hidden');
            this.hideLoadingOverlay();
        }
    }

    async loadBook(file) {
        try {
            this.showLoadingOverlay();
            this.updateLoadingStatus('Initializing book...');
            this.updateLoadingProgress(10);

            this.book = ePub(file);
            await this.book.ready;

            this.updateLoadingStatus('Preparing renderer...');
            this.updateLoadingProgress(30);

            this.rendition = this.book.renderTo('reader', {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: "paginated"
            });

            this.updateLoadingStatus('Generating page locations...');
            this.updateLoadingProgress(50);

            // Generate locations with more sections for better accuracy
            await this.book.locations.generate(2048);

            this.updateLoadingStatus('Loading content...');
            this.updateLoadingProgress(90);

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

            this.updateLoadingProgress(100);
            this.updateLoadingStatus('Complete!');
            setTimeout(() => this.hideLoadingOverlay(), 500);

        } catch (error) {
            console.error('Error loading book:', error);
            this.updateLoadingStatus('Error loading book. Please try again.');
            setTimeout(() => {
                this.hideLoadingOverlay();
                this.elements.filePrompt.classList.remove('hidden');
            }, 2000);
        }
    }

    showLoadingOverlay() {
        this.elements.loadingOverlay.classList.remove('hidden');
        this.elements.loadingProgress.style.width = '0%';
        this.elements.loadingStatus.textContent = 'Initializing...';
    }

    hideLoadingOverlay() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    updateLoadingProgress(percentage) {
        this.elements.loadingProgress.style.width = `${percentage}%`;
    }

    updateLoadingStatus(status) {
        this.elements.loadingStatus.textContent = status;
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
                    item.style.backgroundColor = 'rgba(128, 128, 128, 0.2)';
                    setTimeout(() => {
                        item.style.backgroundColor = '';
                    }, 200);
                } catch (error) {
                    console.error('Error navigating to chapter:', error);
                }
            });

            tocElement.appendChild(item);

            if (chapter.subitems && chapter.subitems.length > 0) {
                chapter.subitems.forEach(subchapter => createTocItem(subchapter, level + 1));
            }
        };

        toc.toc.forEach(chapter => createTocItem(chapter));
    }

    updatePageInfo() {
        if (!this.book || !this.rendition) {
            this.elements.currentPage.textContent = '';
            return;
        }

        let currentPage = 1;
        let totalPages = 1;

        // Get current location
        const loc = this.currentLocation;
        if (!loc) {
            this.elements.currentPage.textContent = '';
            return;
        }

        // Get the current CFI
        const cfi = loc.start.cfi;
        if (this.book.locations.length() && cfi) {
            // Calculate current page from CFI
            const progress = this.book.locations.percentageFromCfi(cfi);
            // Get total pages
            totalPages = this.book.locations.length();
            // Calculate current page
            currentPage = Math.ceil(progress * totalPages);
        }

        // Update page display
        this.elements.currentPage.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    prevPage() {
        if (this.rendition) {
            this.rendition.prev().then(() => {
                // Ensure page info is updated after navigation
                this.currentLocation = this.rendition.currentLocation();
                this.updatePageInfo();
            }).catch(error => {
                console.error('Error navigating to previous page:', error);
            });
        }
    }

    nextPage() {
        if (this.rendition) {
            this.rendition.next().then(() => {
                // Ensure page info is updated after navigation
                this.currentLocation = this.rendition.currentLocation();
                this.updatePageInfo();
            }).catch(error => {
                console.error('Error navigating to next page:', error);
            });
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

    async toggleBookmark() {
        if (!this.currentLocation) {
            console.error('Cannot create bookmark: No current location');
            return;
        }

        const cfi = this.currentLocation.start.cfi;
        if (!cfi) {
            console.error('Cannot create bookmark: Invalid CFI');
            return;
        }

        try {
            const spineItem = this.book.spine.get(this.currentLocation.start.href);
            const toc = this.book.navigation?.toc || [];

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

            const chapter = findChapterInToc(toc, spineItem.href);
            console.log('Current chapter:', chapter);

            let textPreview = 'No preview available';
            try {
                const range = this.book.range(cfi);
                if (range) {
                    textPreview = range.toString().slice(0, 100);
                }

                if (!textPreview || textPreview === 'No preview available') {
                    const contents = this.rendition.getContents();
                    if (contents && contents.length > 0) {
                        const currentElement = contents[0].content.querySelector('p, div, span');
                        if (currentElement) {
                            textPreview = currentElement.textContent.slice(0, 100);
                        }
                    }
                }
            } catch (previewError) {
                console.error('Error getting text preview:', previewError);
            }

            const bookmarkData = {
                cfi: cfi,
                href: spineItem.href,
                chapterTitle: chapter ? chapter.label : `Chapter ${spineItem.index + 1}`,
                timestamp: new Date().toISOString(),
                text: textPreview,
                page: this.getCurrentPage()
            };

            console.log('Creating bookmark with data:', bookmarkData);

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
            console.error('Error toggling bookmark:', error, {
                location: this.currentLocation,
                spineItem: this.book.spine.get(this.currentLocation.start.href),
                tocAvailable: !!this.book.navigation?.toc
            });
        }
    }

    hasBookmark(cfi) {
        if (!cfi) {
            console.error('Cannot check bookmark: Invalid CFI');
            return false;
        }

        try {
            return Array.from(this.bookmarks).some(bookmark => {
                try {
                    const data = JSON.parse(bookmark);
                    return data.cfi === cfi;
                } catch (parseError) {
                    console.error('Error parsing bookmark:', parseError);
                    return false;
                }
            });
        } catch (error) {
            console.error('Error checking bookmark:', error);
            return false;
        }
    }

    removeBookmark(cfi) {
        if (!cfi) {
            console.error('Cannot remove bookmark: Invalid CFI');
            return;
        }

        try {
            const bookmarkToRemove = Array.from(this.bookmarks).find(bookmark => {
                try {
                    const data = JSON.parse(bookmark);
                    return data.cfi === cfi;
                } catch (parseError) {
                    console.error('Error parsing bookmark during removal:', parseError);
                    return false;
                }
            });

            if (bookmarkToRemove) {
                console.log('Removing bookmark:', JSON.parse(bookmarkToRemove));
                this.bookmarks.delete(bookmarkToRemove);
            } else {
                console.warn('Bookmark not found for removal:', cfi);
            }
        } catch (error) {
            console.error('Error removing bookmark:', error);
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
                        await this.book.ready;
                        const location = this.book.locations.cfiFromPercentage(
                            this.book.locations.percentageFromCfi(bookmark.cfi)
                        );
                        await this.rendition.display(location);
                        this.currentLocation = this.rendition.currentLocation();
                        this.updatePageInfo();
                        this.toggleSidebar();
                    } catch (error) {
                        console.error('Error navigating to bookmark:', error, {
                            bookmark: bookmark,
                            bookReady: this.book.ready,
                            hasLocations: !!this.book.locations
                        });
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
        if (!this.book || !this.currentLocation || !this.book.locations) return 1;

        try {
            const percentage = this.book.locations.percentageFromCfi(this.currentLocation.start.cfi);
            return Math.ceil((percentage * this.book.locations.length()));
        } catch (error) {
            console.error('Error getting current page:', error);
            return 1;
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
            this.rendition.themes.fontSize(`${size}px`);
            await this.book.locations.generate(1024);
            // Removed  await this.calculatePageOffsets();  - No longer needed.
        }

        this.saveSettings();
    }

    updateTheme() {
        const theme = this.elements.theme.value;
        this.settings.theme = theme;

        document.body.setAttribute('data-theme', theme);

        if (this.rendition) {
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

            Object.keys(themes).forEach(themeName => {
                this.rendition.themes.override(themeName);
            });

            Object.entries(themes).forEach(([themeName, styles]) => {
                this.rendition.themes.register(themeName, styles);
            });

            this.rendition.themes.select(theme);
            this.rendition.themes.override(theme, themes[theme]);

            const currentLocation = this.currentLocation?.start?.cfi;
            if (currentLocation) {
                this.rendition.display(currentLocation);
            }
        }

        this.saveSettings();
    }

    applySettings() {
        if (!this.rendition) return;

        document.body.setAttribute('data-theme', this.settings.theme);
        this.elements.theme.value = this.settings.theme;

        this.rendition.themes.fontSize(`${this.settings.fontSize}px`);
        this.updateTheme();
    }
    setupEventListeners() {
        this.elements.menuButton.addEventListener('click', () => this.toggleSidebar());
        this.elements.closeSidebar.addEventListener('click', () => this.toggleSidebar());

        this.elements.prevPage.addEventListener('click', () => this.prevPage());
        this.elements.nextPage.addEventListener('click', () => this.nextPage());

        this.elements.searchButton.addEventListener('click', () => this.toggleSearch());
        this.elements.searchInput.addEventListener('input', () => this.handleSearch());

        this.elements.bookmarkButton.addEventListener('click', () => this.toggleBookmark());

        this.elements.fontSize.addEventListener('change', () => this.updateFontSize());
        this.elements.theme.addEventListener('change', () => this.updateTheme());

        this.elements.bookInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && file.type === 'application/epub+zip') {
                await this.loadBook(file);
            }
        });

        this.setupDragAndDrop();
        this.setupTouchNavigation();
        this.setupKeyboardNavigation();
    }

    setupDragAndDrop() {
        const dropZone = document.querySelector('.file-prompt');

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/epub+zip') {
                await this.loadBook(files[0]);
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
}

document.addEventListener('DOMContentLoaded', () => {
    new EPUBReader();
});