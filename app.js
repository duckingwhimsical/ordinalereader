document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('Initializing EPUB Reader...');
        new EPUBReader();
    } catch (error) {
        console.error('Error initializing EPUB Reader:', error);
    }
});

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
        console.log('Initializing elements...');
        // Initialize all required elements
        this.elements = {
            sidebar: document.querySelector('#sidebar'),
            menuButton: document.querySelector('#menuButton'),
            closeSidebar: document.querySelector('#closeSidebar'),
            prevPage: document.querySelector('#prevPage'),
            nextPage: document.querySelector('#nextPage'),
            searchButton: document.querySelector('#searchButton'),
            bookmarkButton: document.querySelector('#bookmarkButton'),
            searchOverlay: document.querySelector('#searchOverlay'),
            searchInput: document.querySelector('#searchInput'),
            searchResults: document.querySelector('#searchResults'),
            bookInput: document.querySelector('#bookInput'),
            filePrompt: document.querySelector('#filePrompt'),
            reader: document.querySelector('#reader'),
            fontSize: document.querySelector('#fontSize'),
            theme: document.querySelector('#theme'),
            currentPage: document.querySelector('#currentPage'),
            toc: document.querySelector('#toc'),
            bookmarks: document.querySelector('#bookmarks'),
            loadingOverlay: document.querySelector('#loadingOverlay'),
            loadingProgress: document.querySelector('#loadingProgress'),
            loadingStatus: document.querySelector('#loadingStatus')
        };

        // Verify critical elements exist
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
                console.error(`Required element not found: #${key}`);
            }
        });
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

        // Get current location
        const loc = this.currentLocation;
        if (!loc) {
            this.elements.currentPage.textContent = '';
            return;
        }

        // Get the current CFI
        const cfi = loc.start.cfi;
        if (this.book.locations.length() && cfi) {
            // Calculate percentage
            const progress = this.book.locations.percentageFromCfi(cfi);
            const percentage = Math.round(progress * 100);

            // Update percentage display
            this.elements.currentPage.textContent = `${percentage}%`;
        }
    }
    prevPage() {
        if (this.rendition) {
            this.rendition.prev().then(() => {
                // Ensure page info is updated after navigation
                this.currentLocation = this.rendition.currentLocation();
                this.updatePageInfo();
                // Add recently clicked class
                this.elements.prevPage.classList.add('recently-clicked');
                // Remove class after animation ends
                setTimeout(() => {
                    this.elements.prevPage.classList.remove('recently-clicked');
                }, 2000);
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
                // Add recently clicked class
                this.elements.nextPage.classList.add('recently-clicked');
                // Remove class after animation ends
                setTimeout(() => {
                    this.elements.nextPage.classList.remove('recently-clicked');
                }, 2000);
            }).catch(error => {
                console.error('Error navigating to next page:', error);
            });
        }
    }

    toggleSidebar() {
        console.log('Toggling sidebar...');
        if (!this.elements.sidebar) {
            console.error('Sidebar element not found');
            return;
        }
        this.elements.sidebar.classList.toggle('open');
    }

    toggleSearch() {
        console.log('Toggling search...');
        if (!this.elements.searchOverlay) {
            console.error('Search overlay element not found');
            return;
        }

        const isOpen = this.elements.searchOverlay.classList.toggle('open');
        this.elements.searchOverlay.classList.toggle('hidden', !isOpen);

        if (isOpen) {
            this.elements.searchInput.value = '';
            this.elements.searchInput.focus();
            this.elements.searchResults.innerHTML = '<div class="search-placeholder">Enter at least 3 characters to search</div>';
        }
    }

    async handleSearch() {
        const query = this.elements.searchInput.value;
        if (!query || query.length < 3) {
            this.elements.searchResults.innerHTML = '<div class="search-placeholder">Enter at least 3 characters to search</div>';
            return;
        }

        // Show loading state
        this.elements.searchResults.innerHTML = '<div class="search-loading">Searching...</div>';

        try {
            const results = await this.book.search(query);
            this.elements.searchResults.innerHTML = '';

            if (results.length === 0) {
                this.elements.searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
                return;
            }

            const searchCount = document.createElement('div');
            searchCount.classList.add('search-count');
            searchCount.textContent = `Found ${results.length} result${results.length === 1 ? '' : 's'}`;
            this.elements.searchResults.appendChild(searchCount);

            results.forEach((result, index) => {
                const div = document.createElement('div');
                div.classList.add('search-result');

                // Create chapter info
                const chapterInfo = document.createElement('div');
                chapterInfo.classList.add('search-result-chapter');
                const chapter = this.getChapterFromCfi(result.cfi);
                chapterInfo.textContent = chapter || 'Unknown Chapter';

                // Create excerpt container with highlighted text
                const excerptContainer = document.createElement('div');
                excerptContainer.classList.add('search-result-excerpt');
                const highlightedText = this.highlightSearchText(result.excerpt, query);
                excerptContainer.innerHTML = highlightedText;

                // Add chapter info and excerpt to result
                div.appendChild(chapterInfo);
                div.appendChild(excerptContainer);

                // Add touch-friendly click handler
                div.addEventListener('click', async () => {
                    try {
                        await this.rendition.display(result.cfi);
                        this.currentLocation = this.rendition.currentLocation();
                        this.updatePageInfo();
                        this.toggleSearch();

                        // Highlight the found text temporarily
                        const contents = this.rendition.getContents();
                        contents.forEach(content => {
                            content.window.getSelection().removeAllRanges();
                            const range = this.book.range(result.cfi);
                            if (range) {
                                const selection = content.window.getSelection();
                                selection.addRange(range);
                            }
                        });

                        // Remove highlight after a delay
                        setTimeout(() => {
                            contents.forEach(content => {
                                content.window.getSelection().removeAllRanges();
                            });
                        }, 2000);
                    } catch (error) {
                        console.error('Error navigating to search result:', error);
                    }
                });

                this.elements.searchResults.appendChild(div);
            });
        } catch (error) {
            console.error('Error performing search:', error);
            this.elements.searchResults.innerHTML = '<div class="search-error">An error occurred while searching</div>';
        }
    }

    // Helper method to get chapter information from CFI
    getChapterFromCfi(cfi) {
        try {
            const spineItem = this.book.spine.get(this.book.canonical(cfi));
            if (!spineItem) return null;

            const chapter = this.book.navigation?.toc.find(item =>
                item.href === spineItem.href ||
                (item.subitems && item.subitems.some(subitem => subitem.href === spineItem.href))
            );

            return chapter ? chapter.label : `Chapter ${spineItem.index + 1}`;
        } catch (error) {
            console.error('Error getting chapter from CFI:', error);
            return null;
        }
    }

    // Helper method to highlight search text in excerpt
    highlightSearchText(excerpt, query) {
        try {
            const regex = new RegExp(`(${query})`, 'gi');
            return excerpt.replace(regex, '<mark>$1</mark>');
        } catch (error) {
            console.error('Error highlighting text:', error);
            return excerpt;
        }
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
        console.log('Setting up event listeners...');

        // Menu button click handler
        if (this.elements.menuButton) {
            console.log('Setting up menu button...');
            this.elements.menuButton.addEventListener('click', (e) => {
                console.log('Menu button clicked');
                e.preventDefault();
                e.stopPropagation();
                this.toggleSidebar();
            });
        }

        // Close sidebar button
        if (this.elements.closeSidebar) {
            this.elements.closeSidebar.addEventListener('click', (e) => {
                console.log('Close sidebar button clicked');
                e.preventDefault();
                e.stopPropagation();
                this.toggleSidebar();
            });
        }

        // Navigation buttons
        if (this.elements.prevPage) {
            this.elements.prevPage.addEventListener('click', () => this.prevPage());
        }
        if (this.elements.nextPage) {
            this.elements.nextPage.addEventListener('click', () => this.nextPage());
        }

        // Search functionality
        if (this.elements.searchButton) {
            console.log('Setting up search button...');
            this.elements.searchButton.addEventListener('click', (e) => {
                console.log('Search button clicked');
                e.preventDefault();
                e.stopPropagation();
                this.toggleSearch();
            });
        }

        // Debounced search input handler
        if (this.elements.searchInput) {
            let searchTimeout;
            this.elements.searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.handleSearch(), 300);
            });
        }

        // Close search overlay when clicking outside
        document.addEventListener('click', (e) => {
            if (this.elements.searchOverlay &&
                this.elements.searchOverlay.classList.contains('open') &&
                !this.elements.searchOverlay.contains(e.target) &&
                !this.elements.searchButton.contains(e.target)) {
                this.toggleSearch();
            }
        });

        // Other buttons
        if (this.elements.bookmarkButton) {
            this.elements.bookmarkButton.addEventListener('click', () => this.toggleBookmark());
        }
        if (this.elements.fontSize) {
            this.elements.fontSize.addEventListener('change', () => this.updateFontSize());
        }
        if (this.elements.theme) {
            this.elements.theme.addEventListener('change', () => this.updateTheme());
        }

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