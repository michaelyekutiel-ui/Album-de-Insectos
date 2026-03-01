/**
 * Album de Insectos - Core Logic
 */

class AlbumManager {
    constructor() {
        this.album = JSON.parse(localStorage.getItem('insect-album')) || [];
        this.gridElement = document.getElementById('album-grid');
    }

    save() {
        localStorage.setItem('insect-album', JSON.stringify(this.album));
    }

    addInsects(insects) {
        // insects is an array of {name, imageUrl}
        const newItems = insects.map(item => ({
            id: Date.now() + Math.random(), // Unique ID even for batch
            name: item.name,
            imageUrl: item.imageUrl,
            dateAdded: new Date().toISOString()
        }));

        this.album = [...newItems, ...this.album];
        this.save();
        this.render();
    }

    deleteInsect(id) {
        this.album = this.album.filter(insect => insect.id !== id);
        this.save();
        this.render();
    }

    render() {
        if (this.album.length === 0) {
            this.gridElement.innerHTML = `
                <div class="empty-state">
                    <p>Your album is empty. Click the + button to add your first insect!</p>
                </div>
            `;
            return;
        }

        this.gridElement.innerHTML = this.album.map(insect => `
            <div class="insect-card" data-id="${insect.id}">
                <button class="delete-card-btn" aria-label="Delete insect">&times;</button>
                <img src="${insect.imageUrl}" alt="${insect.name}" loading="lazy">
                <div class="insect-info">
                    <h3>${insect.name}</h3>
                    <p>${new Date(insect.dateAdded).toLocaleDateString()}</p>
                </div>
            </div>
        `).join('');
    }
}

class WikipediaSearch {
    constructor() {
        this.baseUrl = 'https://commons.wikimedia.org/w/api.php';
    }

    async search(query) {
        // Step 1: Search for files related to the query
        const params = new URLSearchParams({
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: `${query} insect filetype:bitmap`,
            srnamespace: '6', // File namespace
            origin: '*'
        });

        try {
            const response = await fetch(`${this.baseUrl}?${params}`);
            const data = await response.json();

            if (!data.query || !data.query.search) return [];

            // Step 2: Get image URLs for the search results
            const titles = data.query.search.map(result => result.title).join('|');
            if (!titles) return [];

            const imageParams = new URLSearchParams({
                action: 'query',
                format: 'json',
                prop: 'imageinfo',
                iiprop: 'url',
                titles: titles,
                origin: '*'
            });

            const imageResponse = await fetch(`${this.baseUrl}?${imageParams}`);
            const imageData = await imageResponse.json();

            const pages = imageData.query.pages;
            return Object.values(pages)
                .map(page => page.imageinfo ? page.imageinfo[0].url : null)
                .filter(url => url !== null);

        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }
}

const RARE_INSECTS = [
    "Orchid Mantis",
    "Venezuela Poodle Moth",
    "Goliath Beetle",
    "Atlas Moth",
    "Peacock Spider",
    "Jewel Wasp",
    "Thorny Devil Stick Insect",
    "Giraffe Weevil",
    "Leaf-Insects",
    "Picasso Bug"
];

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    const albumManager = new AlbumManager();
    const searchService = new WikipediaSearch();

    // Elements
    const addBtn = document.getElementById('add-insect-btn');
    const surpriseBtn = document.getElementById('surprise-btn');
    const modal = document.getElementById('search-modal');
    const modalTitle = modal.querySelector('h2');
    const closeBtn = document.querySelector('.close-btn');
    const searchInput = document.getElementById('insect-search-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsGrid = document.getElementById('search-results');
    const previewArea = document.getElementById('selection-preview');
    const previewContainer = document.getElementById('selected-images-container');
    const previewName = document.getElementById('selected-insect-name');
    const confirmBtn = document.getElementById('confirm-add-btn');

    // Viewer Elements
    const viewerModal = document.getElementById('viewer-modal');
    const viewerImg = document.getElementById('viewer-image');
    const viewerName = document.getElementById('viewer-name');
    const closeViewerBtn = document.querySelector('.close-viewer-btn');

    let selectedInsects = []; // Array of {name, imageUrl}

    // Initial render
    albumManager.render();

    // Modal control
    addBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Add New Insect';
        modal.classList.remove('hidden');
        searchInput.focus();
    });

    surpriseBtn.addEventListener('click', async () => {
        const randomInsect = RARE_INSECTS[Math.floor(Math.random() * RARE_INSECTS.length)];
        modalTitle.textContent = `Discovering: ${randomInsect}`;
        modal.classList.remove('hidden');
        searchInput.value = randomInsect;
        performSearch(randomInsect);
    });

    const closeModal = () => {
        modal.classList.add('hidden');
        resultsGrid.innerHTML = '';
        previewArea.classList.add('hidden');
        searchInput.value = '';
        selectedInsects = [];
        previewContainer.innerHTML = '';
    };

    closeBtn.addEventListener('click', closeModal);
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Viewer control
    const closeViewer = () => {
        viewerModal.classList.add('hidden');
    };

    closeViewerBtn.addEventListener('click', closeViewer);
    viewerModal.querySelector('.modal-overlay').addEventListener('click', closeViewer);

    const updatePreview = () => {
        if (selectedInsects.length === 0) {
            previewArea.classList.add('hidden');
            return;
        }

        previewArea.classList.remove('hidden');
        previewContainer.innerHTML = selectedInsects.map(ins => `
            <img src="${ins.imageUrl}" class="preview-thumb" alt="Selected">
        `).join('');

        previewName.textContent = selectedInsects.length === 1
            ? `Add "${selectedInsects[0].name}" to your album?`
            : `Add ${selectedInsects.length} insects to your album?`;
    };

    // Search logic
    const performSearch = async (overrideQuery) => {
        const query = overrideQuery || searchInput.value.trim();
        if (!query) return;

        searchBtn.textContent = 'Searching...';
        searchBtn.disabled = true;
        resultsGrid.innerHTML = '<div class="loading">Searching Wikimedia Commons...</div>';
        // Don't hide preview if we're doing a new search, just keep current selections
        // previewArea.classList.add('hidden'); 

        const images = await searchService.search(query);

        searchBtn.textContent = 'Search';
        searchBtn.disabled = false;
        resultsGrid.innerHTML = '';

        if (images.length === 0) {
            resultsGrid.innerHTML = '<p>No images found. Try a different name.</p>';
            return;
        }

        images.forEach(url => {
            const div = document.createElement('div');
            div.className = 'result-item';
            if (selectedInsects.some(ins => ins.imageUrl === url)) {
                div.classList.add('selected');
            }
            div.innerHTML = `<img src="${url}" alt="Insect candidate">`;

            div.onclick = () => {
                const index = selectedInsects.findIndex(ins => ins.imageUrl === url);
                if (index > -1) {
                    selectedInsects.splice(index, 1);
                    div.classList.add('unselecting');
                    setTimeout(() => {
                        div.classList.remove('selected', 'unselecting');
                    }, 300);
                } else {
                    selectedInsects.push({ name: query, imageUrl: url });
                    div.classList.add('selected');
                }
                updatePreview();
            };
            resultsGrid.appendChild(div);
        });
    };

    searchBtn.addEventListener('click', () => performSearch());
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Confirm add
    confirmBtn.addEventListener('click', () => {
        if (selectedInsects.length > 0) {
            albumManager.addInsects(selectedInsects);
            closeModal();
        }
    });

    // Handle clicks on the grid
    document.getElementById('album-grid').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-card-btn');
        const card = e.target.closest('.insect-card');

        if (deleteBtn) {
            const id = parseFloat(card.dataset.id);
            const insectName = card.querySelector('h3').textContent;

            if (confirm(`Are you sure you want to remove "${insectName}" from your album?`)) {
                albumManager.deleteInsect(id);
            }
            return;
        }

        if (card) {
            const imgUrl = card.querySelector('img').src;
            const insectName = card.querySelector('h3').textContent;

            viewerImg.src = imgUrl;
            viewerName.textContent = insectName;
            viewerModal.classList.remove('hidden');
        }
    });
});
