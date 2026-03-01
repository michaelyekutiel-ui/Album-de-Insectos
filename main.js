/**
 * Album de Insectos - Core Logic
 */

// Initialize Supabase Client (only if config is provided)
let supabase = null;
if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url !== "YOUR_SUPABASE_URL") {
    supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
}

class SupabaseService {
    constructor() {
        this.client = supabase;
    }

    async getInsects() {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('insects')
            .select('*')
            .order('date_added', { ascending: false });

        if (error) {
            console.error('Error fetching insects:', error);
            return [];
        }
        return data.map(item => ({
            id: item.id,
            name: item.name,
            imageUrl: item.image_url,
            dateAdded: item.date_added
        }));
    }

    async addInsects(insects, userId) {
        if (!this.client) return;
        const toInsert = insects.map(ins => ({
            user_id: userId,
            name: ins.name,
            image_url: ins.imageUrl,
            date_added: new Date().toISOString()
        }));

        const { error } = await this.client
            .from('insects')
            .insert(toInsert);

        if (error) console.error('Error saving insects:', error);
    }

    async deleteInsect(id) {
        if (!this.client) return;
        const { error } = await this.client
            .from('insects')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting insect:', error);
    }
}

class AlbumManager {
    constructor(supabaseService) {
        this.db = supabaseService;
        this.album = JSON.parse(localStorage.getItem('insect-album')) || [];
        this.gridElement = document.getElementById('album-grid');
        this.currentUser = null;
    }

    async setUser(user) {
        this.currentUser = user;
        if (user) {
            // Fetch from Supabase and merge with local? 
            // For now, let's just replace with cloud data if logged in
            const cloudAlbum = await this.db.getInsects();
            if (cloudAlbum.length > 0 || this.album.length > 0) {
                // If local has data but cloud is empty, maybe sync up?
                if (cloudAlbum.length === 0 && this.album.length > 0) {
                    await this.db.addInsects(this.album, user.id);
                    this.album = await this.db.getInsects();
                } else {
                    this.album = cloudAlbum;
                }
            }
        } else {
            this.album = JSON.parse(localStorage.getItem('insect-album')) || [];
        }
        this.render();
    }

    saveLocal() {
        localStorage.setItem('insect-album', JSON.stringify(this.album));
    }

    async addInsects(insects) {
        if (this.currentUser) {
            await this.db.addInsects(insects, this.currentUser.id);
            this.album = await this.db.getInsects();
        } else {
            const newItems = insects.map(item => ({
                id: Date.now() + Math.random(),
                name: item.name,
                imageUrl: item.imageUrl,
                dateAdded: new Date().toISOString()
            }));
            this.album = [...newItems, ...this.album];
            this.saveLocal();
        }
        this.render();
    }

    async deleteInsect(id) {
        if (this.currentUser) {
            await this.db.deleteInsect(id);
            this.album = await this.db.getInsects();
        } else {
            this.album = this.album.filter(insect => insect.id !== id);
            this.saveLocal();
        }
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
        const params = new URLSearchParams({
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: `${query} insect filetype:bitmap`,
            srnamespace: '6',
            origin: '*'
        });

        try {
            const response = await fetch(`${this.baseUrl}?${params}`);
            const data = await response.json();
            if (!data.query || !data.query.search) return [];

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
    "Picasso Bug", "Orchid Mantis", "Leaf Insect", "Violin Beetle", "Brazilian Treehopper",
    "Thorn Bug", "Giraffe Weevil", "Poodle Moth", "Stalk-eyed Fly", "Hercules Beetle",
    "Goliath Beetle", "Titan Beetle", "Giant Weta", "Atlas Moth", "Queen Alexandra's Birdwing",
    "Venezuelan Poodle Moth", "Red Spotted Jewel Beetle", "Claudina Butterfly", "Green Milkweed Grasshopper", "Papuan Green Weevil",
    "Wax Tailed Bug", "Leaf-Mimic Katydid", "Wandering Violin Mantis", "Darth Vader Mantis", "Dragon Mantis",
    "Australian Walking Stick", "Hickory Horned Devil", "Puss Moth", "Elephant Hawk Moth", "Giant Long-Legged Katydid",
    "Wheel Bug", "Alligator Bug", "Creatonotos Gangis", "Filbert Weevil", "Spiny Flower Mantis",
    "Rosy Maple Moth", "Cuckoo Wasp", "Golden Tortoise Beetle", "Beautiful Demoiselle", "Seafoam Striped Weevil",
    "Malay Lacewing", "Banded Jewel Beetle", "Chrysochroa fulminans nishiyamai", "Metallic green Leafhopper", "Parasitoid Wasp",
    "Orange Oakleaf Butterfly", "Dead Leaf Mantis", "Sphinx Moth Caterpillar", "Pink Underwing Moth Caterpillar", "Dead Leaf Moth",
    "Common Baron Caterpillar", "Bee-Like Robber Fly", "Wood Nymph Moth", "Tiger Swallowtail Butterfly", "Ghost Mantis",
    "Jewel Beetle", "Emerald Swallowtail Butterfly", "Flame Skimmer Dragonfly", "Blue-striped Nettle Grub Caterpillar", "Monarch Butterfly",
    "Viceroy Butterfly", "Peppered Moth", "Luna Moth", "Death's-head Hawkmoth", "Vampire Moth",
    "Sloth Moth", "Mandolin Moth", "Monopis Moth", "Tree Lobster", "Giant Spiny Stick Insect",
    "Jungle Nymph", "Black Beauty Stick Insect", "Giant Swallowtail Butterfly", "Firefly", "Glowing Click Beetle",
    "Railroad Worm", "Blue Ghost Firefly", "Snow Flea", "Snow Cricket", "Polypedilum vanderplanki",
    "Radiation-resistant Chironomidae", "Alaskan Beetle", "Antarctic Midge", "Orchid Bee", "Periodical Cicada",
    "Pharaoh Ant", "Euryplatea Nanaknihali Fly", "Fairyfly Wasp", "Scydosella musawasensis", "Leafcutter Ant",
    "Trap-Jaw Ant", "Bullet Ant", "Suicide Ant", "Weaver Ant", "Honeypot Ant",
    "Dung Beetle", "Tarantula Hawk Wasp", "Ohlone Tiger Beetle", "Karner Blue Butterfly", "American Burying Beetle"
];

// UI Controller
document.addEventListener('DOMContentLoaded', async () => {
    const db = new SupabaseService();
    const albumManager = new AlbumManager(db);
    const searchService = new WikipediaSearch();

    // UI Elements
    const authBtn = document.getElementById('auth-btn');
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-modal-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const switchAuthLink = document.getElementById('switch-auth-link');
    const closeAuthBtn = document.querySelector('.close-auth-btn');
    const userInfo = document.getElementById('user-info');
    const userEmail = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');

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

    const viewerModal = document.getElementById('viewer-modal');
    const viewerImg = document.getElementById('viewer-image');
    const viewerName = document.getElementById('viewer-name');
    const closeViewerBtn = document.querySelector('.close-viewer-btn');

    let isLogin = true;
    let selectedInsects = [];
    let lastSurprise = null;

    // Supabase Auth State Listener
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        handleAuthStateChange(session?.user || null);

        supabase.auth.onAuthStateChange((_event, session) => {
            handleAuthStateChange(session?.user || null);
        });
    }

    function handleAuthStateChange(user) {
        if (user) {
            authBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userEmail.textContent = user.email;
            albumManager.setUser(user);
        } else {
            authBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
            albumManager.setUser(null);
        }
    }

    // Auth Interactions
    authBtn.onclick = () => authModal.classList.remove('hidden');
    closeAuthBtn.onclick = () => authModal.classList.add('hidden');

    switchAuthLink.onclick = (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        authTitle.textContent = isLogin ? 'Sign In' : 'Sign Up';
        authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
        switchAuthLink.textContent = isLogin ? 'Sign Up' : 'Sign In';
        document.querySelector('.auth-switch').childNodes[0].textContent = isLogin ? "Don't have an account? " : "Already have an account? ";
    };

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = isLogin ? 'Signing In...' : 'Signing Up...';

        try {
            let result;
            if (isLogin) {
                result = await supabase.auth.signInWithPassword({ email, password });
            } else {
                result = await supabase.auth.signUp({ email, password });
                if (result.data?.user && !result.data.session) {
                    alert('Check your email for the confirmation link!');
                }
            }

            if (result.error) throw result.error;
            authModal.classList.add('hidden');
            authForm.reset();
        } catch (error) {
            alert(error.message);
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
        }
    };

    logoutBtn.onclick = async () => {
        await supabase.auth.signOut();
    };

    // Original Album Logic
    albumManager.render();

    addBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Add New Insect';
        modal.classList.remove('hidden');
        searchInput.focus();
    });

    surpriseBtn.addEventListener('click', async () => {
        const albumNames = albumManager.album.map(ins => ins.name.toLowerCase());
        const candidates = RARE_INSECTS.filter(name => !albumNames.includes(name.toLowerCase()) && name !== lastSurprise);
        const sourceList = candidates.length > 0 ? candidates : RARE_INSECTS.filter(n => n !== lastSurprise);
        const randomInsect = sourceList[Math.floor(Math.random() * sourceList.length)];
        lastSurprise = randomInsect;
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

    const closeViewer = () => viewerModal.classList.add('hidden');
    closeViewerBtn.addEventListener('click', closeViewer);

    const updatePreview = () => {
        if (selectedInsects.length === 0) {
            previewArea.classList.add('hidden');
            return;
        }
        previewArea.classList.remove('hidden');
        previewContainer.innerHTML = selectedInsects.map(ins => `<img src="${ins.imageUrl}" class="preview-thumb" alt="Selected">`).join('');
        previewName.textContent = selectedInsects.length === 1 ? `Add "${selectedInsects[0].name}" to your album?` : `Add ${selectedInsects.length} insects to your album?`;
    };

    const performSearch = async (overrideQuery) => {
        const query = overrideQuery || searchInput.value.trim();
        if (!query) return;
        searchBtn.textContent = 'Searching...';
        searchBtn.disabled = true;
        resultsGrid.innerHTML = '<div class="loading">Searching Wikimedia Commons...</div>';
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
            if (selectedInsects.some(ins => ins.imageUrl === url)) div.classList.add('selected');
            div.innerHTML = `<img src="${url}" alt="Insect candidate">`;
            div.onclick = () => {
                const index = selectedInsects.findIndex(ins => ins.imageUrl === url);
                if (index > -1) {
                    selectedInsects.splice(index, 1);
                    div.classList.add('unselecting');
                    setTimeout(() => div.classList.remove('selected', 'unselecting'), 300);
                } else {
                    selectedInsects.push({ name: query, imageUrl: url });
                    div.classList.add('selected');
                }
                updatePreview();
            };
            resultsGrid.appendChild(div);
        });
    };

    searchBtn.onclick = () => performSearch();
    confirmBtn.onclick = () => {
        if (selectedInsects.length > 0) {
            albumManager.addInsects(selectedInsects);
            closeModal();
        }
    };

    document.getElementById('album-grid').onclick = (e) => {
        const deleteBtn = e.target.closest('.delete-card-btn');
        const card = e.target.closest('.insect-card');
        if (deleteBtn) {
            const id = isNaN(card.dataset.id) ? card.dataset.id : parseFloat(card.dataset.id);
            const insectName = card.querySelector('h3').textContent;
            if (confirm(`Are you sure you want to remove "${insectName}" from your album?`)) {
                albumManager.deleteInsect(id);
            }
            return;
        }
        if (card) {
            viewerImg.src = card.querySelector('img').src;
            viewerName.textContent = card.querySelector('h3').textContent;
            viewerModal.classList.remove('hidden');
        }
    };
});
