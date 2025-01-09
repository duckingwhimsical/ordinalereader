let currentFontSize = 16;
let currentBook = null;
let currentChapter = 0;

async function loadEpubFile() {
    try {
        const response = await fetch('/content/d7dd07af6f8722a553fd1c1c0ee010d9f408389da5c3994c9b14bb59618a86b2i0');
        const epubData = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(epubData);
        currentBook = { zip, chapters: [], titles: [], images: {}, currentIndex: 0 };

        // Parse container.xml to find the OPF file
        const containerXml = await zip.file("META-INF/container.xml").async("text");
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, "text/xml");
        const opfPath = containerDoc.querySelector("rootfile").getAttribute("full-path");

        // Parse OPF file
        const opfContent = await zip.file(opfPath).async("text");
        const opfDoc = parser.parseFromString(opfContent, "text/xml");
        const basePath = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

        // Get spine items and manifest
        const spine = Array.from(opfDoc.querySelectorAll("spine itemref")).map(item => 
            item.getAttribute("idref")
        );

        const manifest = Array.from(opfDoc.querySelectorAll("manifest item")).reduce((acc, item) => {
            acc[item.getAttribute("id")] = {
                href: item.getAttribute("href"),
                mediaType: item.getAttribute("media-type")
            };
            return acc;
        }, {});

        // Map spine items to their files
        currentBook.chapters = spine.map(id => manifest[id].href);
        currentBook.basePath = basePath;

        // Parse NCX file for table of contents
        const ncxItem = Array.from(opfDoc.querySelectorAll("manifest item")).find(
            item => item.getAttribute("media-type") === "application/x-dtbncx+xml"
        );

        if (ncxItem) {
            const ncxPath = basePath + ncxItem.getAttribute("href");
            const ncxContent = await zip.file(ncxPath).async("text");
            const ncxDoc = parser.parseFromString(ncxContent, "text/xml");

            // Extract titles and their corresponding files from NCX
            currentBook.titles = Array.from(ncxDoc.querySelectorAll("navPoint")).map(nav => ({
                title: nav.querySelector("text").textContent,
                src: nav.querySelector("content").getAttribute("src").split("#")[0]
            }));
        } else {
            // Fallback to basic chapter titles
            currentBook.titles = currentBook.chapters.map((href, i) => ({
                title: `Chapter ${i + 1}`,
                src: href
            }));
        }

        // Pre-cache images
        const imageItems = Object.values(manifest).filter(item => 
            item.mediaType.startsWith("image/")
        );

        for (const item of imageItems) {
            const imagePath = basePath + item.href;
            const imageBlob = await zip.file(imagePath).async("blob");
            currentBook.images[item.href] = URL.createObjectURL(imageBlob);
        }

        displayBook();
    } catch (error) {
        console.error('Error processing EPUB:', error);
        document.getElementById('reader-content').innerHTML = 
            '<div class="alert alert-danger">Error loading EPUB file. Please check the console for details.</div>';
    }
}

function displayBook() {
    document.getElementById('reader-section').classList.remove('d-none');
    displayChapter(0);
    displayNavigation();
}

async function displayChapter(index) {
    try {
        currentChapter = index;
        const chapterPath = currentBook.basePath + currentBook.chapters[index];
        let content = await currentBook.zip.file(chapterPath).async("text");

        // Replace image sources with blob URLs
        content = content.replace(
            /<img[^>]+src="([^"]+)"[^>]*>/g,
            (match, src) => {
                const imagePath = new URL(src, `file:///${currentBook.basePath}`).pathname.slice(1);
                const blobUrl = currentBook.images[imagePath];
                return match.replace(src, blobUrl || src);
            }
        );

        document.getElementById('reader-content').innerHTML = content;
        updateFontSize();
    } catch (error) {
        console.error('Error displaying chapter:', error);
        document.getElementById('reader-content').innerHTML = 
            '<div class="alert alert-danger">Error displaying chapter content.</div>';
    }
}

function displayNavigation() {
    const nav = document.getElementById('navigation');
    nav.innerHTML = '';

    currentBook.titles.forEach((chapter, index) => {
        const link = document.createElement('a');
        link.className = 'chapter-link';
        link.textContent = chapter.title;
        link.onclick = () => displayChapter(index);
        nav.appendChild(link);
    });
}

function updateFontSize() {
    document.getElementById('reader-content').style.fontSize = `${currentFontSize}px`;
}

function setupControls() {
    document.getElementById('increase-font').onclick = () => {
        currentFontSize = Math.min(currentFontSize + 2, 32);
        updateFontSize();
    };

    document.getElementById('decrease-font').onclick = () => {
        currentFontSize = Math.max(currentFontSize - 2, 12);
        updateFontSize();
    };

    document.getElementById('theme-toggle').onclick = () => {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-bs-theme');
        html.setAttribute('data-bs-theme', currentTheme === 'dark' ? 'light' : 'dark');
    };
}

// Initialization
function init() {
    setupControls();
    loadEpubFile();
}

init();