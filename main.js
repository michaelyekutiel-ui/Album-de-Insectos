/**
 * Album de Insectos - Core Logic
 */

// Initialize Supabase Client
let sb = null;
const initSupabase = () => {
    if (typeof supabase !== 'undefined' && typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url !== "YOUR_SUPABASE_URL") {
        sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
        return true;
    }
    return false;
};

class SupabaseService {
    constructor() {
        this.client = sb;
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
            dateAdded: item.date_added,
            userId: item.user_id
        }));
    }

    async getAllInsects() {
        if (!this.client) return [];
        // Fetch insects joined with profiles to get framing and icon info
        const { data, error } = await this.client
            .from('insects')
            .select('*, profiles:user_id(id, username, frame_type, frame_value, avatar_url)')
            .order('date_added', { ascending: false });

        if (error) {
            console.error('Error fetching all insects:', error);
            return [];
        }
        return data.map(item => ({
            id: item.id,
            name: item.name,
            imageUrl: item.image_url,
            dateAdded: item.date_added,
            userId: item.user_id,
            userName: item.profiles?.username || 'Unknown User',
            frameType: item.profiles?.frame_type || 'color',
            frameValue: item.profiles?.frame_value || '#4ade80',
            avatarUrl: item.profiles?.avatar_url
        }));
    }

    async getProfile(userId) {
        if (!this.client) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
        return data;
    }

    async updateProfile(userId, profileData) {
        if (!this.client) return;
        const { error } = await this.client
            .from('profiles')
            .update(profileData)
            .eq('id', userId);

        if (error) console.error('Error updating profile:', error);
    }

    async uploadFrameImage(userId, file) {
        if (!this.client) return null;
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Math.random()}.${fileExt}`;
        const filePath = `frames/${fileName}`;

        const { error: uploadError } = await this.client.storage
            .from('frames')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading frame image:', uploadError);
            return null;
        }

        const { data: { publicUrl } } = this.client.storage
            .from('frames')
            .getPublicUrl(filePath);

        return publicUrl;
    }

    async uploadAvatar(userId, file) {
        if (!this.client) return null;
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Math.random()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await this.client.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading avatar:', uploadError);
            return null;
        }

        const { data: { publicUrl } } = this.client.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return publicUrl;
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
        this.userProfile = null;
        this.isUniversalMode = false;
    }

    async setUser(user) {
        this.currentUser = user;
        if (user) {
            this.userProfile = await this.db.getProfile(user.id);
            await this.refreshAlbum();
        } else {
            this.userProfile = null;
            this.isUniversalMode = false;
            this.album = JSON.parse(localStorage.getItem('insect-album')) || [];
            this.render();
        }
    }

    async setUniversalMode(enabled) {
        this.isUniversalMode = enabled;
        await this.refreshAlbum();
    }

    async refreshAlbum() {
        if (this.currentUser) {
            if (this.isUniversalMode) {
                this.album = await this.db.getAllInsects();
            } else {
                this.album = await this.db.getInsects();
                // Check for local migration
                const localData = JSON.parse(localStorage.getItem('insect-album')) || [];
                if (localData.length > 0 && this.album.length === 0) {
                    await this.db.addInsects(localData, this.currentUser.id);
                    this.album = await this.db.getInsects();
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
            await this.refreshAlbum();
        } else {
            const newItems = insects.map(item => ({
                id: Date.now() + Math.random(),
                name: item.name,
                imageUrl: item.imageUrl,
                dateAdded: new Date().toISOString()
            }));
            this.album = [...newItems, ...this.album];
            this.saveLocal();
            this.render();
        }
    }

    async deleteInsect(id) {
        if (this.currentUser) {
            await this.db.deleteInsect(id);
            await this.refreshAlbum();
        } else {
            this.album = this.album.filter(insect => insect.id !== id);
            this.saveLocal();
            this.render();
        }
    }

    render() {
        if (this.album.length === 0) {
            const msg = this.isUniversalMode ? "No insects found in the world yet." : "Your album is empty. Click the + button to add your first insect!";
            this.gridElement.innerHTML = `
                <div class="empty-state">
                    <p>${msg}</p>
                </div>
            `;
            return;
        }

        this.gridElement.innerHTML = this.album.map(insect => {
            const frameValue = this.isUniversalMode ? (insect.frameValue || '#4ade80') : (this.userProfile?.frame_value || '#4ade80');
            const avatarUrl = this.isUniversalMode ? insect.avatarUrl : this.userProfile?.avatar_url;
            const userName = this.isUniversalMode ? (insect.userName || 'Anonymous') : (this.userProfile?.username || this.currentUser?.email || 'User');

            const frameStyle = `border-color: ${frameValue}`;
            const initial = (userName && typeof userName === 'string' && userName.length > 0) ? userName[0].toUpperCase() : 'U';

            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${userName}" onerror="this.parentElement.innerHTML='<span>${initial}</span>'">`
                : `<span>${initial}</span>`;

            return `
                <div class="insect-card ${this.isUniversalMode ? 'with-frame' : ''}" data-id="${insect.id}">
                    ${!this.isUniversalMode ? '<button class="delete-card-btn" aria-label="Delete insect">&times;</button>' : ''}
                    <div class="frame-wrapper" style="${frameStyle}">
                        <img src="${insect.imageUrl}" class="main-img" alt="${insect.name}" loading="lazy">
                    </div>
                    <div class="insect-info">
                        <div class="info-text">
                            <h3>${insect.name}</h3>
                            <p>${new Date(insect.dateAdded).toLocaleDateString()}</p>
                            ${this.isUniversalMode ? `<p class="user-owner">By: ${insect.userName}</p>` : ''}
                        </div>
                        <div class="user-avatar-badge" title="${userName}">
                            ${avatarHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

class WikipediaSearch {
    constructor() {
        this.baseUrl = 'https://commons.wikimedia.org/w/api.php';
    }

    async search(query) {
        const fallbacks = [
            `${query} insect filetype:bitmap`,
            `${query} filetype:bitmap`,
            `${query}`
        ];

        for (const srsearch of fallbacks) {
            const params = new URLSearchParams({
                action: 'query',
                format: 'json',
                list: 'search',
                srsearch: srsearch,
                srnamespace: '6',
                origin: '*'
            });

            try {
                const response = await fetch(`${this.baseUrl}?${params}`);
                const data = await response.json();
                if (!data.query || !data.query.search || data.query.search.length === 0) continue;

                const titles = data.query.search.map(result => result.title).join('|');
                if (!titles) continue;

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

                if (!imageData.query || !imageData.query.pages) continue;

                const pages = imageData.query.pages;
                const urls = Object.values(pages)
                    .map(page => page.imageinfo ? page.imageinfo[0].url : null)
                    .filter(url => url !== null);

                if (urls.length > 0) return urls;

            } catch (error) {
                console.error(`Search fallback failed for "${srsearch}":`, error);
            }
        }
        return [];
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
    // Initialize Supabase if possible
    console.log('Initializing Album de Insectos...');
    if (initSupabase()) {
        console.log('Supabase initialized successfully.');
    } else {
        console.warn('Supabase not initialized. Check config.js and Supabase library.');
    }

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

    // New UI Elements
    const universalToggle = document.getElementById('universal-toggle');
    const frameSettingsBtn = document.getElementById('frame-settings-btn');
    const framingModal = document.getElementById('framing-modal');
    const closeFramingBtn = document.querySelector('.close-framing-btn');
    const frameColorInput = document.getElementById('frame-color-input');
    const avatarUploadArea = document.getElementById('avatar-upload-area');
    const avatarFileInput = document.getElementById('avatar-file-input');
    const avatarPreview = document.getElementById('avatar-preview');
    const framePreviewBox = document.getElementById('frame-preview-box');
    const saveFrameBtn = document.getElementById('save-frame-btn');

    let isLogin = true;
    let selectedInsects = [];
    let lastSurprise = null;
    let pendingFrameValue = '#4ade80';
    let pendingAvatarUrl = null;
    let pendingAvatarFile = null;

    // Supabase Auth State Listener
    if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        handleAuthStateChange(session?.user || null);

        sb.auth.onAuthStateChange((_event, session) => {
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
            universalToggle.checked = false;
        }
    }

    // Auth Interactions
    authBtn.addEventListener('click', () => {
        authModal.classList.remove('hidden');
    });

    closeAuthBtn.addEventListener('click', () => {
        authModal.classList.add('hidden');
    });

    switchAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        authTitle.textContent = isLogin ? 'Sign In' : 'Sign Up';
        authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
        switchAuthLink.textContent = isLogin ? 'Sign Up' : 'Sign In';
        const switchText = isLogin ? "Don't have an account? " : "Already have an account? ";
        document.querySelector('.auth-switch').childNodes[0].textContent = switchText;
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!sb) {
            alert('Cloud sync is not configured. Please check config.js or try refreshing.');
            return;
        }
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = isLogin ? 'Signing In...' : 'Signing Up...';

        try {
            let result;
            if (isLogin) {
                result = await sb.auth.signInWithPassword({ email, password });
            } else {
                result = await sb.auth.signUp({ email, password });
                if (result.data?.user && !result.data.session) {
                    alert('Check your email for the confirmation link!');
                }
            }

            if (result.error) throw result.error;
            authModal.classList.add('hidden');
            authForm.reset();
        } catch (error) {
            console.error('Auth Error:', error);
            const msg = error.message || 'Unknown network error';
            if (msg === 'Failed to fetch') {
                alert('Connection Error: Your phone or network is blocking the connection to Supabase. Check your internet or ad-blocker.');
            } else {
                alert(`Error: ${msg}`);
            }
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
        }
    });

    logoutBtn.addEventListener('click', async () => {
        if (sb) await sb.auth.signOut();
    });

    // Universal Mode Toggle
    universalToggle.addEventListener('change', (e) => {
        albumManager.setUniversalMode(e.target.checked);
    });

    // Framing Selection Logic
    frameSettingsBtn.addEventListener('click', () => {
        if (!albumManager.userProfile) return;

        pendingFrameValue = albumManager.userProfile.frame_value || '#4ade80';
        pendingAvatarUrl = albumManager.userProfile.avatar_url;
        pendingAvatarFile = null;

        frameColorInput.value = pendingFrameValue;
        updateFramePreview();
        framingModal.classList.remove('hidden');
    });

    closeFramingBtn.addEventListener('click', () => {
        framingModal.classList.add('hidden');
        pendingFrameFile = null;
    });

    frameColorInput.addEventListener('input', (e) => {
        pendingFrameValue = e.target.value;
        updateFramePreview();
    });

    avatarUploadArea.addEventListener('click', () => avatarFileInput.click());

    avatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            pendingAvatarFile = file;
            const reader = new FileReader();
            reader.onload = (re) => {
                pendingAvatarUrl = re.target.result;
                updateFramePreview();
            };
            reader.readAsDataURL(file);
        }
    });

    function updateFramePreview() {
        const wrapper = framePreviewBox.querySelector('.frame-wrapper');
        wrapper.style.borderColor = pendingFrameValue;

        const initial = (albumManager.currentUser?.email || 'U')[0].toUpperCase();
        avatarPreview.innerHTML = pendingAvatarUrl
            ? `<img src="${pendingAvatarUrl}" alt="Preview">`
            : `<span class="avatar-fallback">${initial}</span>`;
    }

    saveFrameBtn.addEventListener('click', async () => {
        if (!albumManager.currentUser) return;

        saveFrameBtn.disabled = true;
        saveFrameBtn.textContent = 'Saving...';

        try {
            let finalAvatarUrl = albumManager.userProfile?.avatar_url;

            if (pendingAvatarFile) {
                const uploadedUrl = await db.uploadAvatar(albumManager.currentUser.id, pendingAvatarFile);
                if (uploadedUrl) finalAvatarUrl = uploadedUrl;
            }

            await db.updateProfile(albumManager.currentUser.id, {
                frame_type: 'color',
                frame_value: pendingFrameValue,
                avatar_url: finalAvatarUrl
            });

            // Update local state and refresh
            albumManager.userProfile = await db.getProfile(albumManager.currentUser.id);
            albumManager.render();
            framingModal.classList.add('hidden');
            pendingAvatarFile = null;
        } catch (error) {
            console.error('Save Personalization Error:', error);
            alert('Failed to save settings.');
        } finally {
            saveFrameBtn.disabled = false;
            saveFrameBtn.textContent = 'Save Personalization';
        }
    });

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
            resultsGrid.innerHTML = `
                <div class="no-results">
                    <p>No images found for "${query}".</p>
                    <p class="search-tip">💡 <strong>Tip:</strong> Try searching for the <strong>scientific name</strong> (e.g., <em>"Pseudosphinx"</em> instead of <em>"Pseudoesfinge"</em>) for better results on Wikimedia.</p>
                </div>
            `;
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

    searchBtn.addEventListener('click', () => performSearch());
    confirmBtn.addEventListener('click', () => {
        if (selectedInsects.length > 0) {
            albumManager.addInsects(selectedInsects);
            closeModal();
        }
    });

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
