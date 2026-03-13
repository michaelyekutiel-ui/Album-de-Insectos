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

    async getInsects(userId) {
        if (!this.client || !userId) return [];
        const { data, error } = await this.client
            .from('insects')
            .select('*')
            .eq('user_id', userId)
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
            userId: item.user_id,
            album: item.album || 'Main Album'
        }));
    }

    async getAllInsects() {
        if (!this.client) return [];
        // Fetch insects joined with profiles to get framing and icon info
        const { data, error } = await this.client
            .from('insects')
            .select('*, profiles:user_id!inner(id, username, frame_type, frame_value, avatar_url)')
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
            avatarUrl: item.profiles?.avatar_url,
            album: item.album || 'Main Album'
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
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${userId}/${fileName}`; // Folder is userId, filename is random

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

    async addInsects(insects, userId, albumName = 'Main Album') {
        if (!this.client) return;
        const toInsert = insects.map(ins => ({
            user_id: userId,
            name: ins.name,
            image_url: ins.imageUrl,
            date_added: new Date().toISOString(),
            album: ins.album || albumName
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

    async uploadInsectPhoto(userId, file) {
        if (!this.client) return null;
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await this.client.storage
            .from('insect-photos')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading insect photo:', uploadError);
            return null;
        }

        const { data: { publicUrl } } = this.client.storage
            .from('insect-photos')
            .getPublicUrl(filePath);

        return publicUrl;
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
        this.isGroupedMode = true;
        this.currentAlbum = 'Main Album';
        this.albums = ['Main Album'];
    }

    updateAlbumUI() {
        let globalAlbums = ['Main Album'];
        if (this.album && this.album.length > 0) {
            const insectAlbums = this.album.map(ins => ins.album).filter(Boolean);
            globalAlbums = [...new Set(['Main Album', ...this.albums, ...insectAlbums])];
        } else {
            globalAlbums = [...new Set(['Main Album', ...this.albums])];
        }

        const select = document.getElementById('album-select');
        if (!select) return;
        select.innerHTML = globalAlbums.map(a => `<option value="${a}" ${a === this.currentAlbum ? 'selected' : ''}>${a}</option>`).join('');

        const container = document.getElementById('album-selector-container');
        container.classList.remove('hidden');
    }

    async setUser(user) {
        this.currentUser = user;
        if (user) {
            this.userProfile = await this.db.getProfile(user.id);
            // Auto-create profile if missing
            if (!this.userProfile) {
                await this.db.updateProfile(user.id, { username: user.email.split('@')[0] });
                this.userProfile = await this.db.getProfile(user.id);
            }
            this.albums = this.userProfile.albums || ['Main Album'];
            if (!this.albums.includes(this.currentAlbum)) this.currentAlbum = 'Main Album';
            this.updateAlbumUI();
            await this.refreshAlbum();
        } else {
            this.userProfile = null;
            this.isUniversalMode = false;
            this.currentAlbum = 'Main Album';
            this.albums = ['Main Album'];
            this.updateAlbumUI();
            this.album = JSON.parse(localStorage.getItem('insect-album')) || [];
            this.render();
        }
    }

    async setUniversalMode(enabled) {
        this.isUniversalMode = enabled;
        this.updateAlbumUI();
        await this.refreshAlbum();
    }

    async setGroupedMode(enabled) {
        this.isGroupedMode = enabled;
        this.render();
    }

    async refreshAlbum() {
        if (this.isUniversalMode) {
            this.album = await this.db.getAllInsects();
        } else if (this.currentUser) {
            this.album = await this.db.getInsects(this.currentUser.id);
            // Check for local migration
            const localData = JSON.parse(localStorage.getItem('insect-album')) || [];
            if (localData.length > 0 && this.album.length === 0) {
                await this.db.addInsects(localData, this.currentUser.id);
                this.album = await this.db.getInsects(this.currentUser.id);
            }
        } else {
            this.album = JSON.parse(localStorage.getItem('insect-album')) || [];
        }
        this.updateAlbumUI();
        this.render();
    }

    saveLocal() {
        localStorage.setItem('insect-album', JSON.stringify(this.album));
    }

    async addInsects(insects) {
        if (this.currentUser) {
            await this.db.addInsects(insects, this.currentUser.id, this.currentAlbum);
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

    async deleteBugGroup(speciesName) {
        const photosToDelete = this.album.filter(ins => ins.name === speciesName);
        if (this.currentUser) {
            for (const photo of photosToDelete) {
                await this.db.deleteInsect(photo.id);
            }
            await this.refreshAlbum();
        } else {
            this.album = this.album.filter(ins => ins.name !== speciesName);
            this.saveLocal();
            this.render();
        }
    }

    openGroup(speciesName) {
        const photos = this.album.filter(ins => ins.name === speciesName);
        const modal = document.getElementById('group-modal');
        const title = document.getElementById('group-modal-title');
        const grid = document.getElementById('group-photo-grid');

        title.textContent = `${speciesName} (${photos.length} Photos)`;
        grid.innerHTML = photos.map(photo => `
            <div class="group-photo-item" data-id="${photo.id}">
                <img src="${photo.imageUrl}" alt="${photo.name}">
            </div>
        `).join('');

        modal.dataset.currentGroupSpecies = speciesName;

        // Show/hide remove bug button depending on auth or ownership
        const removeBugBtn = document.getElementById('remove-bug-btn');
        if (this.currentUser && photos.some(p => p.userId === this.currentUser.id) || !this.currentUser) {
            removeBugBtn.classList.remove('hidden');
        } else {
            removeBugBtn.classList.add('hidden');
        }

        modal.classList.remove('hidden');

        // Wire up clicks for photos inside the group
        grid.querySelectorAll('.group-photo-item').forEach(item => {
            item.onclick = () => {
                const photo = photos.find(p => p.id == item.dataset.id);
                if (photo) {
                    const viewerModal = document.getElementById('viewer-modal');
                    const viewerImg = document.getElementById('viewer-image');
                    const viewerName = document.getElementById('viewer-name');
                    viewerImg.src = photo.imageUrl;
                    viewerName.textContent = photo.name;
                    viewerModal.dataset.currentPhotoId = photo.id;
                    viewerModal.classList.remove('hidden');
                }
            };
        });
    }

    render() {
        let displayItems = this.album;

        // Filter by album globally
        displayItems = displayItems.filter(ins => ins.album === this.currentAlbum || (!ins.album && this.currentAlbum === 'Main Album'));

        if (displayItems.length === 0) {
            const msg = this.isUniversalMode ? `No insects found in the world for "${this.currentAlbum}".` : `Your album "${this.currentAlbum}" is empty. Click the + button to add your first insect!`;
            this.gridElement.innerHTML = `
                <div class="empty-state">
                    <p>${msg}</p>
                </div>
            `;
            return;
        }

        let toGroup = displayItems;
        if (this.isGroupedMode) {
            const groups = {};
            toGroup.forEach(insect => {
                if (!groups[insect.name]) {
                    groups[insect.name] = {
                        ...insect,
                        count: 1
                    };
                } else {
                    groups[insect.name].count++;
                }
            });
            displayItems = Object.values(groups);
        }

        this.gridElement.innerHTML = displayItems.map(insect => {
            const frameValue = this.isUniversalMode ? (insect.frameValue || '#4ade80') : (this.userProfile?.frame_value || '#4ade80');
            const avatarUrl = this.isUniversalMode ? insect.avatarUrl : this.userProfile?.avatar_url;
            const userName = this.isUniversalMode ? (insect.userName || 'Anonymous') : (this.userProfile?.username || this.currentUser?.email || 'User');

            const frameStyle = `border-color: ${frameValue}`;
            const initial = (userName && typeof userName === 'string' && userName.length > 0) ? userName[0].toUpperCase() : 'U';

            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${userName}" onerror="this.parentElement.innerHTML='<span>${initial}</span>'">`
                : `<span>${initial}</span>`;

            const isGroup = this.isGroupedMode && insect.count > 1;

            return `
                <div class="insect-card ${this.isUniversalMode ? 'with-frame' : ''} ${isGroup ? 'is-group' : ''}" data-id="${insect.id}" data-name="${insect.name}">
                    ${!isGroup && this.currentUser && insect.userId === this.currentUser.id ? '<button class="delete-card-btn" aria-label="Delete insect">&times;</button>' : ''}
                    <div class="frame-wrapper" style="${frameStyle}">
                        <img src="${insect.imageUrl}" class="main-img" alt="${insect.name}" loading="lazy">
                        ${isGroup ? `<div class="group-badge">${insect.count}</div>` : ''}
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

class iNaturalistSearch {
    constructor() {
        this.baseUrl = 'https://api.inaturalist.org/v1';
    }

    async search(query) {
        try {
            // Step 1: Try to resolve the query to a taxon (supports common names!)
            const taxonId = await this.findTaxonId(query);

            if (taxonId) {
                // Step 2: Get research-grade observations with photos for this taxon
                const urls = await this.getObservationPhotos(taxonId);
                if (urls.length > 0) return urls;
            }

            // Fallback: Search observations directly by query string
            const fallbackUrls = await this.searchObservationsByQuery(query);
            return fallbackUrls;

        } catch (error) {
            console.error('iNaturalist search failed:', error);
            return [];
        }
    }

    async findTaxonId(query) {
        const params = new URLSearchParams({
            q: query,
            per_page: '1',
            iconic_taxa: 'Insecta'
        });
        try {
            const response = await fetch(`${this.baseUrl}/taxa?${params}`);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                return data.results[0].id;
            }
        } catch (e) {
            console.error('Taxon lookup failed:', e);
        }
        return null;
    }

    async getObservationPhotos(taxonId) {
        const params = new URLSearchParams({
            taxon_id: taxonId.toString(),
            photos: 'true',
            quality_grade: 'research',
            per_page: '30',
            order: 'desc',
            order_by: 'votes'
        });
        try {
            const response = await fetch(`${this.baseUrl}/observations?${params}`);
            const data = await response.json();
            return this.extractPhotoUrls(data);
        } catch (e) {
            console.error('Observation fetch failed:', e);
            return [];
        }
    }

    async searchObservationsByQuery(query) {
        const params = new URLSearchParams({
            q: query,
            photos: 'true',
            quality_grade: 'research',
            per_page: '30',
            order: 'desc',
            order_by: 'votes',
            iconic_taxa: 'Insecta'
        });
        try {
            const response = await fetch(`${this.baseUrl}/observations?${params}`);
            const data = await response.json();
            return this.extractPhotoUrls(data);
        } catch (e) {
            console.error('Query search failed:', e);
            return [];
        }
    }

    extractPhotoUrls(data) {
        if (!data.results) return [];
        const urls = [];
        const seen = new Set();
        for (const obs of data.results) {
            if (!obs.photos) continue;
            for (const photo of obs.photos) {
                // Convert square URL to medium (500px) for quality
                const mediumUrl = photo.url.replace('/square.', '/medium.');
                if (!seen.has(mediumUrl)) {
                    seen.add(mediumUrl);
                    urls.push(mediumUrl);
                }
            }
        }
        return urls;
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
    window._albumManager = albumManager; // expose for gallery upload
    const searchService = new iNaturalistSearch();

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
    const closeBtn = modal.querySelector('.close-btn');
    const searchInput = document.getElementById('insect-search-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsGrid = document.getElementById('search-results');
    const previewArea = document.getElementById('selection-preview');
    const previewContainer = document.getElementById('selected-images-container');
    const previewName = document.getElementById('selected-insect-name');
    const confirmBtn = document.getElementById('confirm-add-btn');

    const viewerModal = document.getElementById('viewer-modal');
    const viewerImg = document.getElementById('viewer-image');
    const zoomContainer = document.getElementById('zoom-container');
    const viewerName = document.getElementById('viewer-name');
    const closeViewerBtn = document.querySelector('.close-viewer-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');

    let viewerScale = 1;
    const ZOOM_STEP = 0.2;
    const MAX_SCALE = 5;
    const MIN_SCALE = 0.5;

    // New UI Elements
    const universalToggle = document.getElementById('universal-toggle');
    const groupSpeciesToggle = document.getElementById('group-species-toggle');
    const groupModal = document.getElementById('group-modal');
    const closeGroupBtn = document.querySelector('.close-group-btn');
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
        const frameSettingsBtn = document.getElementById('frame-settings-btn');
        if (user) {
            authBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            if (frameSettingsBtn) frameSettingsBtn.classList.remove('hidden');
            userEmail.textContent = user.email;
            // Default to universal mode when logged in
            universalToggle.checked = true;
            albumManager.setUser(user).then(() => albumManager.setUniversalMode(true));
        } else {
            authBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
            if (frameSettingsBtn) frameSettingsBtn.classList.add('hidden');
            albumManager.setUser(null);
            universalToggle.checked = false;
            groupSpeciesToggle.checked = true;
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

    groupSpeciesToggle.addEventListener('change', (e) => {
        albumManager.setGroupedMode(e.target.checked);
    });

    // Album Options Logic
    const albumSelect = document.getElementById('album-select');
    const createAlbumBtn = document.getElementById('create-album-btn');
    const createAlbumModal = document.getElementById('create-album-modal');
    const closeAlbumBtn = document.querySelector('.close-album-btn');
    const confirmCreateAlbumBtn = document.getElementById('confirm-create-album-btn');
    const newAlbumNameInput = document.getElementById('new-album-name');

    albumSelect.addEventListener('change', (e) => {
        albumManager.currentAlbum = e.target.value;
        albumManager.render();
    });

    createAlbumBtn.addEventListener('click', () => {
        newAlbumNameInput.value = '';
        createAlbumModal.classList.remove('hidden');
    });

    closeAlbumBtn.addEventListener('click', () => {
        createAlbumModal.classList.add('hidden');
    });

    confirmCreateAlbumBtn.addEventListener('click', async () => {
        const name = newAlbumNameInput.value.trim();
        if (!name) return;
        if (!albumManager.albums.includes(name)) {
            albumManager.albums.push(name);
            albumManager.currentAlbum = name;
            albumManager.updateAlbumUI();

            if (albumManager.currentUser) {
                await db.updateProfile(albumManager.currentUser.id, {
                    albums: albumManager.albums
                });
            }
        } else {
            albumManager.currentAlbum = name;
            albumManager.updateAlbumUI();
        }
        createAlbumModal.classList.add('hidden');
        albumManager.render();
    });

    // Framing Selection Logic
    frameSettingsBtn.addEventListener('click', () => {
        if (!albumManager.currentUser) {
            authBtn.click();
            return;
        }

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

    const closeViewer = () => {
        viewerModal.classList.add('hidden');
        resetZoom();
    };
    closeViewerBtn.addEventListener('click', closeViewer);

    // Remove buttons logic
    const removePhotoBtn = document.getElementById('remove-photo-btn');
    const removeBugBtn = document.getElementById('remove-bug-btn');

    removePhotoBtn.addEventListener('click', async () => {
        const photoId = viewerModal.dataset.currentPhotoId;
        const insectName = viewerName.textContent;
        if (photoId && confirm(`Are you sure you want to remove this photo of "${insectName}"?`)) {
            const id = isNaN(photoId) ? photoId : parseFloat(photoId);
            await albumManager.deleteInsect(id);
            closeViewer();
            // If group modal is open, we should also refresh it or close it
            if (!groupModal.classList.contains('hidden')) {
                const currentSpecies = groupModal.dataset.currentGroupSpecies;
                const remaining = albumManager.album.filter(ins => ins.name === currentSpecies);
                if (remaining.length === 0) {
                    groupModal.classList.add('hidden');
                } else {
                    albumManager.openGroup(currentSpecies);
                }
            }
        }
    });

    removeBugBtn.addEventListener('click', async () => {
        const speciesName = groupModal.dataset.currentGroupSpecies;
        if (speciesName && confirm(`Are you sure you want to remove ALL photos of "${speciesName}"?`)) {
            await albumManager.deleteBugGroup(speciesName);
            groupModal.classList.add('hidden');
        }
    });

    const updateZoom = () => {
        const percent = Math.round(viewerScale * 100);
        viewerImg.style.width = `${percent}%`;
        viewerImg.style.maxWidth = 'none';
        viewerImg.style.maxHeight = 'none';
        viewerImg.style.transform = 'none';

        // If zoomed in, align to top-left to allow scrolling over the whole image
        if (viewerScale > 1) {
            zoomContainer.style.alignItems = 'flex-start';
            zoomContainer.style.justifyContent = 'flex-start';
        } else {
            zoomContainer.style.alignItems = 'center';
            zoomContainer.style.justifyContent = 'center';
        }
    };

    const resetZoom = () => {
        viewerScale = 1;
        updateZoom();
    };

    const changeZoom = (delta) => {
        const newScale = viewerScale + delta;
        if (newScale >= MIN_SCALE && newScale <= MAX_SCALE) {
            viewerScale = newScale;
            updateZoom();
        }
    };

    zoomInBtn.addEventListener('click', () => changeZoom(ZOOM_STEP));
    zoomOutBtn.addEventListener('click', () => changeZoom(-ZOOM_STEP));
    zoomResetBtn.addEventListener('click', resetZoom);

    zoomContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        changeZoom(delta);
    }, { passive: false });

    closeGroupBtn.addEventListener('click', () => groupModal.classList.add('hidden'));

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
                    <p class="search-tip">ðŸ’¡ <strong>Tip:</strong> Try searching for the <strong>scientific name</strong> (e.g., <em>"Pseudosphinx"</em> instead of <em>"Pseudoesfinge"</em>) for better results on Wikimedia.</p>
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
            if (card.classList.contains('is-group')) {
                albumManager.openGroup(card.dataset.name);
            } else {
                viewerImg.src = card.querySelector('img').src;
                viewerName.textContent = card.querySelector('h3').textContent;
                viewerModal.dataset.currentPhotoId = card.dataset.id;

                // Show/hide remove photo button based on ownership
                const removePhotoBtn = document.getElementById('remove-photo-btn');
                const photo = albumManager.album.find(p => p.id == card.dataset.id);
                if (photo && albumManager.currentUser && photo.userId === albumManager.currentUser.id || !albumManager.currentUser) {
                    removePhotoBtn.classList.remove('hidden');
                } else {
                    removePhotoBtn.classList.add('hidden');
                }

                viewerModal.classList.remove('hidden');
            }
        }
    };
});

// Fullscreen button
// Fullscreen button - Attached globally to ensure it works even if DOMContentLoaded already fired
(function setupFullscreen() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        console.log('Fullscreen button found, attaching listener...');
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen()
                    .catch(err => console.error('Fullscreen enter error:', err));
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen()
                        .catch(err => console.error('Fullscreen exit error:', err));
                }
            }
        });

        document.addEventListener('fullscreenchange', () => {
            console.log('Fullscreen state:', !!document.fullscreenElement);
        });
    } else {
        console.warn('Fullscreen button not found during setup.');
    }
})();

// =============================================
// GALLERY UPLOAD — Tab switching + file upload
// =============================================
(function setupGalleryUpload() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const searchTab = document.getElementById('search-tab');
    const uploadTab = document.getElementById('upload-tab');
    const uploadArea = document.getElementById('insect-photo-upload-area');
    const photoInput = document.getElementById('insect-photo-input');
    const previewImg = document.getElementById('upload-preview-img');
    const nameInput = document.getElementById('upload-insect-name');
    const confirmBtn = document.getElementById('confirm-upload-btn');
    const statusMsg = document.getElementById('upload-status');

    let selectedFile = null;

    // --- Tab switching ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            searchTab.classList.toggle('hidden', tab !== 'search');
            uploadTab.classList.toggle('hidden', tab !== 'upload');
        });
    });

    // --- Reset upload panel whenever the modal opens ---
    const searchModal = document.getElementById('search-modal');
    const observer = new MutationObserver(() => {
        if (!searchModal.classList.contains('hidden')) return;
        // modal closed — reset upload tab
        selectedFile = null;
        photoInput.value = '';
        previewImg.src = '';
        previewImg.classList.add('hidden');
        nameInput.value = '';
        confirmBtn.disabled = true;
        if (statusMsg) { statusMsg.textContent = ''; statusMsg.classList.add('hidden'); }
    });
    observer.observe(searchModal, { attributes: true, attributeFilter: ['class'] });

    // --- Open file picker when upload area is tapped ---
    uploadArea.addEventListener('click', () => photoInput.click());

    // --- Show preview when a file is chosen ---
    photoInput.addEventListener('change', () => {
        const file = photoInput.files[0];
        if (!file) return;
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = e => {
            previewImg.src = e.target.result;
            previewImg.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
        updateConfirmState();
    });

    // --- Enable confirm button only when both photo and name are provided ---
    nameInput.addEventListener('input', updateConfirmState);
    function updateConfirmState() {
        confirmBtn.disabled = !(selectedFile && nameInput.value.trim());
    }

    // --- Add to album ---
    confirmBtn.addEventListener('click', async () => {
        if (!selectedFile || !nameInput.value.trim()) return;

        const name = nameInput.value.trim();
        confirmBtn.disabled = true;
        showStatus('Saving…');

        try {
            let imageUrl;
            const mgr = window._albumManager; // set below

            if (mgr && mgr.currentUser && mgr.db.client) {
                // Logged in ? upload to Supabase Storage
                imageUrl = await mgr.db.uploadInsectPhoto(mgr.currentUser.id, selectedFile);
                if (!imageUrl) {
                    console.warn('Supabase upload failed, falling back to base64');
                    imageUrl = await fileToDataUrl(selectedFile);
                }
            } else {
                // Logged out ? use base64 data URL (stored in localStorage)
                imageUrl = await fileToDataUrl(selectedFile);
            }

            await mgr.addInsects([{ name, imageUrl }]);
            showStatus('Added! ?');
            // Close modal after short delay
            setTimeout(() => {
                searchModal.classList.add('hidden');
            }, 800);
        } catch (err) {
            console.error(err);
            showStatus('Error: ' + err.message);
            confirmBtn.disabled = false;
        }
    });

    function showStatus(msg) {
        if (!statusMsg) return;
        statusMsg.textContent = msg;
        statusMsg.classList.remove('hidden');
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
})();


