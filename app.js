// Remove the empty icons object at the top

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Starting initialization...'); // Debug
    window.reader = new EPUBReader();
    
    try {
        const cachedBook = localStorage.getItem('epub-cached-book');
        if (cachedBook) {
            console.log('Found cached book, loading...'); // Debug
            const blob = await fetch(cachedBook).then(r => r.blob());
            await window.reader.loadBook(blob);
        } else {
            console.log('No cached book, loading default...'); // Debug
            await loadDefaultBook();
        }
    } catch (error) {
        console.error('Failed to load book:', error); // Debug
        document.getElementById('filePrompt').classList.remove('hidden');
    }
    document.getElementById('loadingOverlay').classList.add('hidden');
});

// Simplify loadDefaultBook function
async function loadDefaultBook() {
    try {
        console.log('Fetching default book...'); // Debug
        const response = await fetch(bookURL);
        if (response.ok) {
            const blob = await response.blob();
            await window.reader.loadBook(blob);
        } else {
            console.error('Failed to fetch default book:', response.status); // Debug
            throw new Error('Failed to fetch default book');
        }
    } catch (error) {
        console.error('Error in loadDefaultBook:', error); // Debug
        document.getElementById('filePrompt').classList.remove('hidden');
    }
    document.getElementById('loadingOverlay').classList.add('hidden');
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
            this.updateLoadingProgress(0, 'Reading file...');
            
            const arrayBuffer = await file.arrayBuffer();
            this.updateLoadingProgress(20, 'Creating EPUB instance...');
            
            this.book = ePub(arrayBuffer);
            this.updateLoadingProgress(40, 'Setting up renderer...');
            
            this.rendition = this.book.renderTo(this.elements.reader, {
                width: '100%',
                height: '100%',
                spread: 'none',
                allowScriptedContent: true,
                allowPopups: true
            });
            
            this.updateLoadingProgress(60, 'Loading book content...');
            await this.book.ready;
            
            this.updateLoadingProgress(80, 'Rendering content...');
            
            // Retrieve the last position
            const lastPosition = localStorage.getItem('epub-last-position');
            if (lastPosition) {
                await this.rendition.display(lastPosition);
            } else {
                await this.rendition.display();
            }
            
            this.updateLoadingProgress(90, 'Finalizing...');
            await this.setupNavigation();
            await this.setupTableOfContents();
            
            this.updateLoadingProgress(95, 'Generating book locations...');
            await this.book.locations.generate(1000);
            
            this.applyStoredSettings();
            
            this.updateLoadingProgress(100, 'Complete!');
            setTimeout(() => {
                this.elements.loadingOverlay.classList.add('hidden');
            }, 500);
            
        } catch (error) {
            console.error('Error loading book:', error);
            this.elements.loadingStatus.textContent = 'Error loading book: ' + error.message;
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

        // Add escape key handler for search overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.elements.searchOverlay.classList.contains('hidden')) {
                this.toggleSearch();
            }
        });

        // Update the search overlay click handling
        if (this.elements.searchOverlay) {
            this.elements.searchOverlay.addEventListener('click', (e) => {
                if (e.target === this.elements.searchOverlay) {
                    this.toggleSearch();
                }
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

        this.setupTouchNavigation();
        this.setupKeyboardNavigation();
    }

    setupTouchNavigation() {
        let touchStartX = null;
        let touchStartTime = null;
        
        const showNavigationButtons = () => {
            const buttons = [this.elements.prevPage, this.elements.nextPage];
            buttons.forEach(button => {
                button.classList.remove('opacity-0');
                button.classList.add('opacity-100');
                
                // Clear any existing timeout
                if (button.fadeTimeout) {
                    clearTimeout(button.fadeTimeout);
                }
                
                // Set new timeout to hide the button
                button.fadeTimeout = setTimeout(() => {
                    button.classList.remove('opacity-100');
                    button.classList.add('opacity-0');
                }, 1000); // Hide after 1 second
            });
        };
        
        this.elements.reader.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartTime = Date.now();
            showNavigationButtons();
        });

        this.elements.reader.addEventListener('touchend', (e) => {
            if (!touchStartX) return;

            const touchEndX = e.changedTouches[0].clientX;
            const diffX = touchStartX - touchEndX;
            const touchDuration = Date.now() - touchStartTime;

            // Only trigger if the touch was relatively quick (less than 300ms)
            // and the swipe distance was significant enough (more than 50px)
            if (touchDuration < 300 && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    this.nextPage();
                } else {
                    this.prevPage();
                }
            }
            
            touchStartX = null;
            touchStartTime = null;
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

        this.elements.searchResults.innerHTML = '<div class="p-2 text-gray-600 dark:text-gray-400">Searching...</div>';

        try {
            const results = await Promise.all(
                this.book.spine.spineItems.map(item => 
                    item.load(this.book.load.bind(this.book))
                        .then(contents => {
                            const searchResults = item.find(query);
                            return searchResults.map(result => ({
                                cfi: result.cfi,
                                excerpt: result.excerpt,
                                section: item.index
                            }));
                        })
                        .catch(err => {
                            console.warn(`Search failed for section ${item.index}:`, err);
                            return [];
                        })
                )
            );

            // Flatten results array and remove empty results
            const flatResults = results.flat().filter(result => result);

            this.elements.searchResults.innerHTML = flatResults.length ? 
                flatResults.map((result, i) => `
                    <div class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded" 
                         onclick="window.reader.rendition.display('${result.cfi}'); window.reader.toggleSearch();">
                        <span class="block text-sm text-gray-800 dark:text-gray-200">${result.excerpt}</span>
                        <span class="block text-xs text-gray-600 dark:text-gray-400 mt-1">Result ${i + 1} of ${flatResults.length} (Chapter ${result.section + 1})</span>
                    </div>
                `).join('') :
                '<div class="p-2 text-gray-600 dark:text-gray-400">No results found</div>';

        } catch (error) {
            console.error('Search error:', error);
            this.elements.searchResults.innerHTML = '<div class="p-2 text-red-600 dark:text-red-400">An error occurred while searching</div>';
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
        } else {
            // Hide search overlay
            this.elements.searchOverlay.classList.add('hidden');
            this.elements.searchResults.innerHTML = '';
        }
    }

    toggleBookmark() {
        if (!this.rendition) return;

        try {
            const currentLocation = this.rendition.currentLocation();
            if (!currentLocation || !currentLocation.start || !currentLocation.start.cfi) return;

            const cfi = currentLocation.start.cfi;
            const existingBookmark = this.bookmarks.findIndex(b => b.cfi === cfi);

            let previewText = 'Bookmark';
            try {
                // Get the current chapter title from navigation if available
                const chapter = this.book.navigation && this.book.navigation.get(cfi);
                const chapterLabel = chapter ? chapter.label : '';

                // Get the current text content
                const contents = this.rendition.getContents();
                if (contents && contents[0]) {
                    const selection = contents[0].window.getSelection();
                    const range = contents[0].document.createRange();
                    range.selectNodeContents(contents[0].document.body);
                    const text = range.toString().trim();
                    previewText = text.slice(0, 100) + (text.length > 100 ? '...' : '');
                    if (chapterLabel) {
                        previewText = `${chapterLabel}: ${previewText}`;
                    }
                }
            } catch (error) {
                console.warn('Error getting preview text:', error);
                previewText = 'Bookmarked location';
            }

            if (existingBookmark >= 0) {
                // Remove bookmark
                this.bookmarks.splice(existingBookmark, 1);
                this.elements.bookmarkButton.innerHTML = `
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                    </svg>`;
            } else {
                // Add bookmark
                this.bookmarks.push({
                    cfi,
                    text: previewText
                });
                this.elements.bookmarkButton.innerHTML = `
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
                    </svg>`;
            }

            this.saveBookmarks();
            this.renderBookmarks();

        } catch (error) {
            console.error('Error toggling bookmark:', error);
            // Reset bookmark button state
            this.elements.bookmarkButton.innerHTML = `
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                </svg>`;
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
            icon.innerHTML = `
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
                </svg>`;
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
                    color: '#e2e8f0',
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

        // Update the controls color and background to match the theme
        const controls = document.querySelectorAll('#prevPage, #nextPage, #menuButton, #searchButton, #bookmarkButton');
        const bottomControls = document.querySelector('.bottom-0');
        controls.forEach(control => {
            control.style.color = themes[theme].body.color;
        });
        if (bottomControls) {
            bottomControls.style.backgroundColor = themes[theme].body.background;
            bottomControls.style.color = themes[theme].body.color;
            
            // Add backdrop-blur effect while maintaining transparency
            bottomControls.style.backdropFilter = 'blur(8px)';
            bottomControls.style.backgroundColor = theme === 'dark' 
                ? 'rgba(26, 26, 26, 0.9)'  // Dark theme
                : theme === 'sepia'
                    ? 'rgba(244, 236, 216, 0.9)'  // Sepia theme
                    : 'rgba(255, 255, 255, 0.9)';  // Light theme
        }
    }

    applyStoredSettings() {
        const storedSize = localStorage.getItem('epub-font-size');
        if (storedSize && this.elements.fontSize) {
            this.elements.fontSize.value = storedSize;
            this.updateFontSize();
        }

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
            if (location && location.start) {
                localStorage.setItem('epub-last-position', location.start.cfi);
                
                // Update bookmark button state
                const currentCfi = location.start.cfi;
                const isBookmarked = this.bookmarks.some(b => b.cfi === currentCfi);
                this.elements.bookmarkButton.innerHTML = isBookmarked ? `
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
                    </svg>` : `
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                    </svg>`;
            }

            if (this.book.locations && this.book.locations.length()) {
                const progress = this.book.locations.percentageFromCfi(location.start.cfi);
                const percentage = Math.round(progress * 100);
                this.elements.currentPage.textContent = `${percentage}%`;
            }
        });
    }
}