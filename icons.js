// SVG icon definitions with proper viewBox and styling for Tailwind
const icons = {
    menu: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
    </svg>`,

    close: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
    </svg>`,

    prev: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
    </svg>`,

    next: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
    </svg>`,

    search: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
    </svg>`,

    bookmark: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
    </svg>`,

    bookmarkFilled: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
    </svg>`
};

// Initialize icons when the document loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing icons...');
    try {
        const menuButton = document.querySelector('#menuButton');
        const closeSidebar = document.querySelector('#closeSidebar');
        const prevPage = document.querySelector('#prevPage');
        const nextPage = document.querySelector('#nextPage');
        const searchButton = document.querySelector('#searchButton');
        const bookmarkButton = document.querySelector('#bookmarkButton');

        if (menuButton) {
            console.log('Setting menu button icon');
            menuButton.innerHTML = icons.menu;
        }
        if (closeSidebar) {
            console.log('Setting close sidebar icon');
            closeSidebar.innerHTML = icons.close;
        }
        if (prevPage) {
            console.log('Setting prev page icon');
            prevPage.innerHTML = icons.prev;
        }
        if (nextPage) {
            console.log('Setting next page icon');
            nextPage.innerHTML = icons.next;
        }
        if (searchButton) {
            console.log('Setting search button icon');
            searchButton.innerHTML = icons.search;
        }
        if (bookmarkButton) {
            console.log('Setting bookmark button icon');
            bookmarkButton.innerHTML = icons.bookmark;
        }
    } catch (error) {
        console.error('Error initializing icons:', error);
    }
});

// Export icons for use in other modules
window.icons = icons;