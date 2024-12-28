document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing EPUB reader...');
    window.reader = new EPUBReader();

    // Try to load default book
    try {
        console.log('Attempting to load default book...');
        const response = await fetch('/epub/default.epub');
        console.log('Fetch response status:', response.status);

        if (response.ok) {
            console.log('Default book found, loading...');
            const blob = await response.blob();
            console.log('Book blob size:', blob.size, 'bytes');

            try {
                console.log('Starting book rendering process...');
                await window.reader.loadBook(blob);
                console.log('Book loaded successfully');
                document.getElementById('loadingOverlay').classList.add('hidden');
            } catch (error) {
                console.error('Error rendering book:', error);
                document.getElementById('filePrompt').classList.remove('hidden');
                document.getElementById('loadingOverlay').classList.add('hidden');
            }
        } else {
            console.log('No default book found, showing file prompt');
            document.getElementById('filePrompt').classList.remove('hidden');
            document.getElementById('loadingOverlay').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading default book:', error);
        document.getElementById('filePrompt').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
});

// Define the EPUBReader class
class EPUBReader {
    constructor() {
        console.log('Setting up EPUB container:', {
            container: this.book,
            readerElement: document.getElementById('reader')
        });

        this.book = null;
        this.rendition = null;
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            menuButton: document.getElementById('menuButton'),
            closeSidebar: document.getElementById('closeSidebar'),
            reader: document.getElementById('reader'),
            prevPage: document.getElementById('prevPage'),
            nextPage: document.getElementById('nextPage'),
            searchButton: document.getElementById('searchButton'),
            searchOverlay: document.getElementById('searchOverlay'),
            searchInput: document.getElementById('searchInput'),
            searchResults: document.getElementById('searchResults'),
            bookInput: document.getElementById('bookInput'),
            bookmarkButton: document.getElementById('bookmarkButton'),
            bookmarks: document.getElementById('bookmarks'),
            toc: document.getElementById('toc'),
            currentPage: document.getElementById('currentPage'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingProgress: document.getElementById('loadingProgress'),
            loadingStatus: document.getElementById('loadingStatus'),
            fontSize: document.getElementById('fontSize'),
            theme: document.getElementById('theme'),
            filePrompt: document.getElementById('filePrompt')
        };

        this.currentLocation = null;
        this.bookmarks = [];
        this.loadBookmarks();
        this.setupEventListeners();
    }

    async loadBook(file) {
        try {
            console.log('Starting book load process with file:', file.size, 'bytes');
            this.elements.loadingOverlay.classList.remove('hidden');
            this.elements.filePrompt.classList.add('hidden');
            this.updateLoadingProgress(0, 'Reading file...');

            const arrayBuffer = await file.arrayBuffer();
            console.log('File converted to ArrayBuffer:', arrayBuffer.byteLength, 'bytes');
            this.updateLoadingProgress(20, 'Creating EPUB instance...');

            this.book = ePub(arrayBuffer);
            this.updateLoadingProgress(40, 'Setting up renderer...');

            this.rendition = this.book.renderTo(this.elements.reader, {
                width: '100%',
                height: '100%',
                spread: 'none'
            });

            console.log('Waiting for book to be ready...');
            this.updateLoadingProgress(60, 'Loading book content...');
            await this.book.ready;

            console.log('Displaying book...');
            this.updateLoadingProgress(80, 'Rendering content...');
            await this.rendition.display();

            console.log('Setting up navigation...');
            this.updateLoadingProgress(90, 'Finalizing...');
            await this.setupNavigation();
            await this.setupTableOfContents();
            this.applyStoredSettings();

            console.log('Book load complete');
            this.updateLoadingProgress(100, 'Complete!');

            // Delay hiding the overlay slightly to show the complete state
            setTimeout(() => {
                this.elements.loadingOverlay.classList.add('hidden');
            }, 500);
        } catch (error) {
            console.error('Error in loadBook:', error);
            this.elements.loadingStatus.textContent = 'Error loading book: ' + error.message;
            this.elements.loadingProgress.style.backgroundColor = '#ef4444'; // red-500
            throw error;
        }
    }

    updateLoadingProgress(percent, status) {
        if (this.elements.loadingProgress) {
            this.elements.loadingProgress.style.width = `${percent}%`;
        }
        if (this.elements.loadingStatus) {
            this.elements.loadingStatus.textContent = status;
        }
    }

    toggleSidebar() {
        console.log('Toggling sidebar...');
        console.log('Current sidebar state:', this.elements.sidebar.classList.contains('-translate-x-0') ? 'open' : 'closed');

        // Add transition class for smooth animation
        console.log('Adding transition...');
        this.elements.sidebar.classList.add('transition-transform', 'duration-300', 'ease-in-out');

        // Toggle transform class
        console.log('Applying transform...');
        if (this.elements.sidebar.classList.contains('-translate-x-0')) {
            this.elements.sidebar.classList.remove('-translate-x-0');
            this.elements.sidebar.classList.add('-translate-x-full');
            console.log('Closing sidebar...');
        } else {
            this.elements.sidebar.classList.remove('-translate-x-full');
            this.elements.sidebar.classList.add('-translate-x-0');
            console.log('Opening sidebar...');
        }

        // Log final state
        console.log('Animation complete. Final state:', this.elements.sidebar.classList.contains('-translate-x-0') ? 'open' : 'closed');
    }

    setupEventListeners() {
        // Menu toggle
        if (this.elements.menuButton) {
            this.elements.menuButton.addEventListener('click', () => this.toggleSidebar());
        }
        if (this.elements.closeSidebar) {
            this.elements.closeSidebar.addEventListener('click', () => this.toggleSidebar());
        }

        // Navigation
        if (this.elements.prevPage) {
            this.elements.prevPage.addEventListener('click', () => this.prevPage());
        }
        if (this.elements.nextPage) {
            this.elements.nextPage.addEventListener('click', () => this.nextPage());
        }

        // File input
        if (this.elements.bookInput) {
            this.elements.bookInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && file.type === 'application/epub+zip') {
                    this.loadBook(file);
                }
            });
        }

        // Search functionality
        if (this.elements.searchButton) {
            this.elements.searchButton.addEventListener('click', () => this.toggleSearch());
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
                !this.elements.searchOverlay.classList.contains('hidden') &&
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
            this.elements.fontSize.addEventListener('input', () => this.updateFontSize());
        }
        if (this.elements.theme) {
            this.elements.theme.addEventListener('change', () => this.updateTheme());
        }

        this.setupDragAndDrop();
        this.setupTouchNavigation();
        this.setupKeyboardNavigation();
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('filePrompt');

        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        dropZone.addEventListener('dragover', () => {
            dropZone.classList.add('ring-2', 'ring-blue-500');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('ring-2', 'ring-blue-500');
        });

        dropZone.addEventListener('drop', async (e) => {
            dropZone.classList.remove('ring-2', 'ring-blue-500');
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
            if (e.target.tagName.toLowerCase() === 'input') return;

            switch (e.key) {
                case 'ArrowLeft':
                    this.prevPage();
                    break;
                case 'ArrowRight':
                    this.nextPage();
                    break;
            }
        });
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

    toggleSearch() {
        this.elements.searchOverlay.classList.toggle('hidden');
        if (!this.elements.searchOverlay.classList.contains('hidden')) {
            this.elements.searchInput.focus();
        }
    }

    async handleSearch() {
        const query = this.elements.searchInput.value.trim();
        if (!query || !this.book) return;

        const results = await this.book.search(query);
        this.elements.searchResults.innerHTML = '';

        results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded';
            div.textContent = result.excerpt;
            div.addEventListener('click', () => {
                this.rendition.display(result.cfi);
                this.toggleSearch();
            });
            this.elements.searchResults.appendChild(div);
        });
    }

    toggleBookmark() {
        if (!this.rendition) return;

        const currentLocation = this.rendition.currentLocation();
        const cfi = currentLocation.start.cfi;
        const existingBookmark = this.bookmarks.findIndex(b => b.cfi === cfi);

        if (existingBookmark >= 0) {
            this.bookmarks.splice(existingBookmark, 1);
            this.elements.bookmarkButton.innerHTML = window.icons.bookmark;
        } else {
            this.bookmarks.push({
                cfi,
                text: this.rendition.getContents()[0].textContent.slice(0, 100) + '...'
            });
            this.elements.bookmarkButton.innerHTML = window.icons.bookmarkFilled;
        }

        this.saveBookmarks();
        this.renderBookmarks();
    }

    saveBookmarks() {
        localStorage.setItem('epub-bookmarks', JSON.stringify(this.bookmarks));
    }

    loadBookmarks() {
        console.log('Loading bookmarks...');
        try {
            const stored = localStorage.getItem('epub-bookmarks');
            if (stored) {
                this.bookmarks = JSON.parse(stored);
                console.log('Successfully loaded', this.bookmarks.length, 'valid bookmarks');
            } else {
                this.bookmarks = [];
                console.log('Successfully loaded 0 valid bookmarks');
            }
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            this.bookmarks = [];
        }
    }

    renderBookmarks() {
        this.elements.bookmarks.innerHTML = '';
        this.bookmarks.forEach(bookmark => {
            const div = document.createElement('div');
            div.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded flex items-center space-x-2';

            const icon = document.createElement('span');
            icon.innerHTML = window.icons.bookmarkFilled;
            icon.className = 'w-4 h-4 text-blue-500';

            const text = document.createElement('span');
            text.className = 'text-sm text-gray-700 dark:text-gray-300 truncate';
            text.textContent = bookmark.text;

            div.appendChild(icon);
            div.appendChild(text);

            div.addEventListener('click', () => {
                this.rendition.display(bookmark.cfi);
                if (window.innerWidth < 768) {
                    this.toggleSidebar();
                }
            });

            this.elements.bookmarks.appendChild(div);
        });
    }

    updateFontSize() {
        if (!this.rendition) return;

        const size = this.elements.fontSize.value;
        this.rendition.themes.fontSize(`${size}px`);
        localStorage.setItem('epub-font-size', size);
    }

    updateTheme() {
        if (!this.rendition) return;

        const theme = this.elements.theme.value;
        const themes = {
            light: {
                body: {
                    color: '#1a1a1a',
                    background: '#ffffff'
                }
            },
            dark: {
                body: {
                    color: '#e2e8f0', // Changed to a lighter color for better contrast
                    background: '#1a1a1a'
                }
            },
            sepia: {
                body: {
                    color: '#5b4636',
                    background: '#f4ecd8'
                }
            }
        };

        // Register and apply theme to EPUB content
        this.rendition.themes.default({
            ...themes[theme].body,
            'a:link': { color: theme === 'dark' ? '#93c5fd' : '#0066cc' }, // Lighter blue for dark mode
            'a:visited': { color: theme === 'dark' ? '#c4b5fd' : '#8000ff' }, // Lighter purple for dark mode
            'p, div, span': { color: themes[theme].body.color }, // Ensure text elements inherit the correct color
            'h1, h2, h3, h4, h5, h6': { color: themes[theme].body.color } // Ensure headers inherit the correct color
        });

        // Update system theme
        document.documentElement.classList.remove('light', 'dark', 'sepia');
        document.documentElement.classList.add(theme);

        // Store theme preference
        localStorage.setItem('epub-theme', theme);

        // Update reader background
        this.elements.reader.style.backgroundColor = themes[theme].body.background;
        this.elements.reader.style.color = themes[theme].body.color;

        // Force refresh the current page to apply theme
        if (this.rendition.currentLocation()) {
            const currentCfi = this.rendition.currentLocation().start.cfi;
            this.rendition.display(currentCfi);
        }
    }

    applyStoredSettings() {
        // Apply stored font size
        const storedSize = localStorage.getItem('epub-font-size');
        if (storedSize) {
            this.elements.fontSize.value = storedSize;
            this.updateFontSize();
        }

        // Apply stored theme
        const storedTheme = localStorage.getItem('epub-theme') || 'light';
        if (this.elements.theme) {
            this.elements.theme.value = storedTheme;
            this.updateTheme();
        }
    }

    async setupTableOfContents() {
        const navigation = await this.book.navigation;
        const toc = navigation.toc;

        this.elements.toc.innerHTML = '';
        this.renderTocItems(toc, this.elements.toc);
    }

    renderTocItems(items, container) {
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'py-1';

            const link = document.createElement('a');
            link.href = '#';
            link.className = 'text-sm text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400';
            link.textContent = item.label;

            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.rendition.display(item.href);
                if (window.innerWidth < 768) {
                    this.toggleSidebar();
                }
            });

            div.appendChild(link);

            if (item.subitems && item.subitems.length > 0) {
                const subContainer = document.createElement('div');
                subContainer.className = 'ml-4';
                this.renderTocItems(item.subitems, subContainer);
                div.appendChild(subContainer);
            }

            container.appendChild(div);
        });
    }

    setupNavigation() {
        if (!this.rendition) return;

        this.rendition.on('relocated', (location) => {
            const progress = this.book.locations.percentageFromCfi(location.start.cfi);
            const percentage = Math.round(progress * 100);
            this.elements.currentPage.textContent = `${percentage}%`;

            // Update bookmark button state
            const cfi = location.start.cfi;
            const isBookmarked = this.bookmarks.some(b => b.cfi === cfi);
            this.elements.bookmarkButton.innerHTML = isBookmarked ? window.icons.bookmarkFilled : window.icons.bookmark;
        });
    }
}