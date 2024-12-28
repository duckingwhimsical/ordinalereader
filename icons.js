// SVG icon definitions as template literals
const icons = {
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12h18M3 6h18M3 18h18"></path>
    </svg>`,

    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"></path>
    </svg>`,

    prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6"></path>
    </svg>`,

    next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"></path>
    </svg>`,

    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="M21 21l-4.35-4.35"></path>
    </svg>`,

    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
    </svg>`,

    bookmarkFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"></path>
    </svg>`
};

// Initialize icons when the document loads
window.addEventListener('DOMContentLoaded', () => {
    try {
        const menuButton = document.querySelector('#menuButton');
        const closeSidebar = document.querySelector('#closeSidebar');
        const prevPage = document.querySelector('#prevPage');
        const nextPage = document.querySelector('#nextPage');
        const searchButton = document.querySelector('#searchButton');
        const bookmarkButton = document.querySelector('#bookmarkButton');

        if (menuButton) menuButton.innerHTML = icons.menu;
        if (closeSidebar) closeSidebar.innerHTML = icons.close;
        if (prevPage) prevPage.innerHTML = icons.prev;
        if (nextPage) nextPage.innerHTML = icons.next;
        if (searchButton) searchButton.innerHTML = icons.search;
        if (bookmarkButton) bookmarkButton.innerHTML = icons.bookmark;
    } catch (error) {
        console.error('Error initializing icons:', error);
    }
});

// Export icons for use in other modules
window.icons = icons;