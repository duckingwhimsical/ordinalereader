document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing EPUB reader...');
    window.reader = new EPUBReader();

    // Try to load cached or default book
    try {
        console.log('Checking for cached book...');
        const cachedBook = localStorage.getItem('epub-cached-book');

        if (cachedBook) {
            console.log('Found cached book, loading...');
            const blob = await fetch(cachedBook).then(r => r.blob());
            try {
                console.log('Starting book rendering process...');
                await window.reader.loadBook(blob);
                console.log('Book loaded successfully from cache');
                document.getElementById('loadingOverlay').classList.add('hidden');
            } catch (error) {
                console.error('Error rendering cached book:', error);
                await loadDefaultBook();
            }
        } else {
            console.log('No cached book found, attempting to load default book...');
            await loadDefaultBook();
        }
    } catch (error) {
        console.error('Error in book loading process:', error);
        document.getElementById('filePrompt').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
});

async function loadDefaultBook() {
    try {
        console.log('Attempting to load default book...');
        const response = await fetch('/epub/default.epub');
        console.log('Fetch response status:', response.status);

        if (response.ok) {
            console.log('Default book found, loading...');
            const blob = await response.blob();
            console.log('Book blob size:', blob.size, 'bytes');

            // Cache the book
            const reader = new FileReader();
            reader.onloadend = function() {
                try {
                    localStorage.setItem('epub-cached-book', reader.result);
                    console.log('Book cached successfully');
                } catch (error) {
                    console.warn('Failed to cache book:', error);
                }
            };
            reader.readAsDataURL(blob);

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
}

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

            // Retrieve the last position
            const lastPosition = localStorage.getItem('epub-last-position');
            if (lastPosition) {
                console.log('Restoring last position:', lastPosition);
                await this.rendition.display(lastPosition);
            } else {
                await this.rendition.display();
            }

            console.log('Setting up navigation...');
            this.updateLoadingProgress(90, 'Finalizing...');
            await this.setupNavigation();
            await this.setupTableOfContents();

            console.log('Generating book locations...');
            this.updateLoadingProgress(95, 'Generating book locations...');

            // Generate locations for better navigation
            await this.book.locations.generate(1000);
            console.log('Book locations generated');

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
            this.elements.searchButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event from bubbling to document
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


        // Prevent search overlay from closing when clicking inside it
        if (this.elements.searchOverlay) {
            this.elements.searchOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

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
        let touchStartY = null;
        let navTimeoutId = null;

        const showNavigation = () => {
            const prevButton = document.getElementById('prevPage');
            const nextButton = document.getElementById('nextPage');
            prevButton.classList.remove('opacity-0');
            nextButton.classList.remove('opacity-0');
            prevButton.classList.add('opacity-100');
            nextButton.classList.add('opacity-100');

            // Clear any existing timeout
            if (navTimeoutId) clearTimeout(navTimeoutId);

            // Hide navigation after 2 seconds
            navTimeoutId = setTimeout(() => {
                prevButton.classList.remove('opacity-100');
                nextButton.classList.remove('opacity-100');
                prevButton.classList.add('opacity-0');
                nextButton.classList.add('opacity-0');
            }, 2000);
        };

        this.elements.reader.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            showNavigation();
        });

        this.elements.reader.addEventListener('touchend', (e) => {
            if (!touchStartX) return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            // Only navigate if the horizontal swipe is greater than vertical
            // and meets the minimum threshold
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    this.nextPage();
                } else {
                    this.prevPage();
                }
            }

            touchStartX = null;
            touchStartY = null;
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

    async handleSearch() {
        const query = this.elements.searchInput.value.trim();
        if (!query || !this.book) return;

        try {
            // Clear previous results
            this.elements.searchResults.innerHTML = '';

            // Show loading state
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'p-2 text-gray-600 dark:text-gray-400';
            loadingDiv.textContent = 'Searching...';
            this.elements.searchResults.appendChild(loadingDiv);

            // Get all sections from the book's spine
            const sections = this.book.spine.spineItems;
            const results = [];

            // Search through each section
            for (let i = 0; i < sections.length; i++) {
                const section = sections[i];

                try {
                    // Load the section content
                    const content = await section.load(this.book.load.bind(this.book));
                    const text = content.textContent || '';

                    let position = -1;
                    const queryLower = query.toLowerCase();
                    const textLower = text.toLowerCase();

                    // Find all occurrences in this section
                    while ((position = textLower.indexOf(queryLower, position + 1)) !== -1) {
                        // Get surrounding context
                        const start = Math.max(0, position - 40);
                        const end = Math.min(text.length, position + query.length + 40);
                        const excerpt = text.substring(start, end).replace(/\s+/g, ' ').trim();

                        // Calculate the CFI for this position
                        const range = document.createRange();
                        const textNodes = content.evaluate('//text()', content, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        let currentPos = 0;
                        let targetNode = null;
                        let offset = 0;

                        // Find the text node containing this position
                        for (let j = 0; j < textNodes.snapshotLength; j++) {
                            const node = textNodes.snapshotItem(j);
                            if (currentPos + node.textContent.length > position) {
                                targetNode = node;
                                offset = position - currentPos;
                                break;
                            }
                            currentPos += node.textContent.length;
                        }

                        if (targetNode) {
                            range.setStart(targetNode, offset);
                            range.setEnd(targetNode, offset + query.length);
                            const cfi = section.cfiFromRange(range);

                            results.push({
                                cfi,
                                excerpt: '...' + excerpt + '...',
                                sectionIndex: i,
                                position: position
                            });
                        }
                    }
                } catch (err) {
                    console.warn(`Error searching in section ${i}:`, err);
                }
            }

            // Remove loading state
            this.elements.searchResults.innerHTML = '';

            // Sort results by section and position
            results.sort((a, b) => {
                if (a.sectionIndex !== b.sectionIndex) {
                    return a.sectionIndex - b.sectionIndex;
                }
                return a.position - b.position;
            });

            // Display results
            if (results.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'p-2 text-gray-600 dark:text-gray-400';
                noResults.textContent = 'No results found';
                this.elements.searchResults.appendChild(noResults);
                return;
            }

            results.forEach((result, index) => {
                const div = document.createElement('div');
                div.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded';

                const excerptSpan = document.createElement('span');
                excerptSpan.className = 'block text-sm text-gray-800 dark:text-gray-200';
                excerptSpan.textContent = result.excerpt;

                const locationSpan = document.createElement('span');
                locationSpan.className = 'block text-xs text-gray-600 dark:text-gray-400 mt-1';
                locationSpan.textContent = `Result ${index + 1} of ${results.length}`;

                div.appendChild(excerptSpan);
                div.appendChild(locationSpan);

                div.addEventListener('click', () => {
                    this.rendition.display(result.cfi);
                    this.toggleSearch();
                });

                this.elements.searchResults.appendChild(div);
            });

        } catch (error) {
            console.error('Search error:', error);
            this.elements.searchResults.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'p-2 text-red-600 dark:text-red-400';
            errorDiv.textContent = 'An error occurred while searching';
            this.elements.searchResults.appendChild(errorDiv);
        }
    }

    toggleSearch() {
        if (!this.elements.searchOverlay) return;

        const isHidden = this.elements.searchOverlay.classList.contains('hidden');

        if (isHidden) {
            // Show search overlay
            this.elements.searchOverlay.classList.remove('hidden');
            this.elements.searchInput.value = '';
            this.elements.searchInput.focus();

            // Add click outside listener
            setTimeout(() => {
                document.addEventListener('click', this.handleClickOutside);
            }, 0);
        } else {
            // Hide search overlay
            this.elements.searchOverlay.classList.add('hidden');
            this.elements.searchResults.innerHTML = '';
            document.removeEventListener('click', this.handleClickOutside);
        }
    }

    handleClickOutside = (e) => {
        if (this.elements.searchOverlay &&
            !this.elements.searchOverlay.classList.contains('hidden') &&
            !this.elements.searchOverlay.contains(e.target) &&
            e.target !== this.elements.searchButton) {
            this.toggleSearch();
        }
    }

    toggleBookmark() {
        if (!this.rendition) return;

        try {
            const currentLocation = this.rendition.currentLocation();
            if (!currentLocation || !currentLocation.start || !currentLocation.start.cfi) {
                console.error('Invalid location data for bookmark');
                return;
            }

            const cfi = currentLocation.start.cfi;
            const existingBookmark = this.bookmarks.findIndex(b => b.cfi === cfi);

            // Get preview text safely
            let previewText = 'Bookmark';
            try {
                const contents = this.rendition.getContents();
                if (contents && contents.length > 0 && contents[0].documentElement) {
                    // Get text content from the document element
                    const text = contents[0].documentElement.textContent || '';
                    previewText = text.trim().slice(0, 100) + (text.length > 100 ? '...' : '');
                }
            } catch (error) {
                console.warn('Could not extract preview text:', error);
                // Use chapter title or a generic label if available
                previewText = this.book?.navigation?.toc?.[0]?.label || 'Bookmarked location';
            }

            if (existingBookmark >= 0) {
                this.bookmarks.splice(existingBookmark, 1);
                this.elements.bookmarkButton.innerHTML = window.icons.bookmark;
            } else {
                this.bookmarks.push({
                    cfi,
                    text: previewText
                });
                this.elements.bookmarkButton.innerHTML = window.icons.bookmarkFilled;
            }

            this.saveBookmarks();
            this.renderBookmarks();

        } catch (error) {
            console.error('Error toggling bookmark:', error);
            // Reset bookmark button state
            this.elements.bookmarkButton.innerHTML = window.icons.bookmark;
        }
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
            console.log('Navigation relocated:', location);

            // Store the current location whenever it changes
            if (location && location.start) {
                localStorage.setItem('epub-last-position', location.start.cfi);
            }

            // Calculate percentage based on CFI if locations are available
            if (this.book.locations && this.book.locations.length()) {
                const progress = this.book.locations.percentageFromCfi(location.start.cfi);
                const percentage = Math.round(progress * 100);
                this.elements.currentPage.textContent = `${percentage}%`;
            } else {
                // Safer fallback calculation
                try {
                    if (this.book && this.book.spine) {
                        const spineItems = this.book.spine.items;
                        const currentIndex = spineItems.findIndex(item =>
                            location.start.href.includes(item.href || '')
                        );
                        if (currentIndex !== -1) {
                            const percentage = Math.round(((currentIndex + 1) / spineItems.length) * 100);
                            this.elements.currentPage.textContent = `~${percentage}%`;
                        } else {
                            this.elements.currentPage.textContent = 'Reading...';
                        }
                    } else {
                        this.elements.currentPage.textContent = 'Loading...';
                    }
                } catch (error) {
                    console.error('Error calculating page position:', error);
                    this.elements.currentPage.textContent = 'Reading...';
                }
            }

            // Update bookmark button state
            const cfi = location.start.cfi;
            const isBookmarked = this.bookmarks.some(b => b.cfi === cfi);
            this.elements.bookmarkButton.innerHTML = isBookmarked ? window.icons.bookmarkFilled : window.icons.bookmark;
        });
    }
}