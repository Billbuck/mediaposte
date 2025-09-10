// ===== MODULE DE RECHERCHE - MÉDIAPOSTE (porté de Zecible V2) =====

let TV2_searchTimeout = null;
let TV2_searchResults = [];
let TV2_searchMemory = new Map();
let TV2_isSearching = false;
let TV2_currentSearchRequest = null;

function openSearchPopup() {
    const popup = document.getElementById('popup-search');
    if (!popup) return;

    clearSearchResults();
    updateSearchTitle();
    updateSearchPlaceholder();

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    popup.classList.add('active');
    if (!popup.style.left) {
        popup.style.left = '200px';
        popup.style.top = '100px';
    }
    setTimeout(() => {
        const input = document.getElementById('search-input');
        if (input) input.focus();
    }, 100);
}

function closeSearchPopup() {
    const popup = document.getElementById('popup-search');
    if (popup) popup.classList.remove('active');
    clearSearchResults();
    TV2_searchMemory.clear();
    updateMemoryList();
}

function updateSearchTitle() {
    const el = document.getElementById('search-popup-title-text');
    if (!el) return;
    const labels = { commune: 'Rechercher des communes', code_postal: 'Rechercher des codes postaux', departement: 'Rechercher des départements' };
    el.textContent = labels[GLOBAL_STATE.currentZoneType] || 'Rechercher';
}

function updateSearchPlaceholder() {
    const input = document.getElementById('search-input');
    if (!input) return;
    const placeholders = { commune: 'Rechercher par nom ou code INSEE...', code_postal: 'Rechercher par code postal ou ville...', departement: 'Rechercher par nom ou numéro...' };
    input.placeholder = placeholders[GLOBAL_STATE.currentZoneType] || 'Rechercher...';
}

function handleSearchInput(event) {
    const query = event.target.value.trim();
    updateClearButtonVisibility(event.target.value.length > 0);
    clearTimeout(TV2_searchTimeout);
    if (query.length === 0) { clearSearchResults(); return; }
    if (query.length < 5) { clearSearchResults(); return; }
    TV2_searchTimeout = setTimeout(() => { performSearch(query); }, 300);
}

function forceSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    const query = input.value.trim();
    if (query.length === 0) { showStatus('Veuillez saisir un terme de recherche', 'warning'); return; }
    clearTimeout(TV2_searchTimeout);
    performSearch(query);
}

async function performSearch(query) {
    if (TV2_isSearching) { if (TV2_currentSearchRequest) TV2_currentSearchRequest.abort(); }
    TV2_isSearching = true; showSearchLoader(true);
    const abortController = new AbortController();
    TV2_currentSearchRequest = abortController;
    try {
        const response = await fetch('/api/france/recherche', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type_zone: GLOBAL_STATE.currentZoneType, recherche: query, limit: 20 }),
            signal: abortController.signal
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.success && data.data && data.data.resultats) {
            TV2_searchResults = data.data.resultats.filter(r => !TV2_searchMemory.has(r.code));
            displaySearchResults(TV2_searchResults.slice(0, 10));
        } else {
            TV2_searchResults = []; displayNoResults();
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('[SEARCH] Erreur', e); showStatus('Erreur lors de la recherche', 'error'); TV2_searchResults = []; displayNoResults();
        }
    } finally { TV2_isSearching = false; showSearchLoader(false); TV2_currentSearchRequest = null; }
}

function showSearchLoader(show) {
    const loader = document.getElementById('search-loader');
    const icon = document.getElementById('search-icon');
    if (!loader || !icon) return;
    loader.style.display = show ? 'block' : 'none';
    icon.style.display = show ? 'none' : 'block';
}

function displaySearchResults(results) {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;
    if (results.length === 0) { displayNoResults(); return; }
    let html = '';
    results.forEach(result => {
        let displayText = '';
        switch (GLOBAL_STATE.currentZoneType) {
            case 'commune':
                displayText = `Code INSEE : ${result.code}<br>Commune : ${escapeHtml(result.libelle)}`;
                break;
            case 'code_postal':
                displayText = `Code postal : ${result.code}<br>Ville(s) : ${escapeHtml(result.libelle)}`;
                break;
            case 'departement':
                displayText = `Code département : ${result.code}<br>Département : ${escapeHtml(result.libelle)}`;
                break;
        }
        const libelleEscaped = (result.libelle || '').replace(/'/g, "\\'");
        html += `<div class="search-result-item" onclick="addToMemory('${result.code}','${libelleEscaped}')"><div class="search-result-text">${displayText}</div></div>`;
    });
    dropdown.innerHTML = html; dropdown.style.display = 'block';
}

function displayNoResults() {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;
    const input = document.getElementById('search-input');
    if (input && input.value.trim().length === 0) { clearSearchResults(); return; }
    dropdown.innerHTML = '<div class="search-no-results">Aucun résultat trouvé</div>'; dropdown.style.display = 'block';
}

function clearSearchResults() {
    const dropdown = document.getElementById('search-dropdown');
    if (dropdown) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; }
    TV2_searchResults = [];
}

function addToMemory(code, libelle) {
    let nomComplet = '';
    switch (GLOBAL_STATE.currentZoneType) {
        case 'commune': nomComplet = `${libelle} (${code})`; break;
        case 'code_postal': nomComplet = `${code} - ${libelle}`; break;
        case 'departement': nomComplet = `${code} - ${libelle}`; break;
    }
    TV2_searchMemory.set(code, { code, libelle, nom_complet: nomComplet });
    TV2_searchResults = TV2_searchResults.filter(r => r.code !== code);
    if (TV2_searchResults.length === 0) { clearSearchResults(); const input = document.getElementById('search-input'); if (input) { input.value=''; input.focus(); } updateClearButtonVisibility(false); }
    else { displaySearchResults(TV2_searchResults); }
    updateMemoryList();
}

function removeFromMemory(code) { TV2_searchMemory.delete(code); updateMemoryList(); }

function updateMemoryList() {
    const list = document.getElementById('search-memory-list');
    if (!list) return;
    if (TV2_searchMemory.size === 0) { list.innerHTML = '<div class="search-memory-empty">Aucune zone sélectionnée</div>'; return; }
    let html = '';
    TV2_searchMemory.forEach((item, code) => {
        html += `<div class="search-memory-item"><span class="search-memory-text">${escapeHtml(item.nom_complet)}</span><button class="search-memory-remove" onclick="removeFromMemory('${code}')" type="button"><span class="icon-16 icon-croix-remove"></span></button></div>`;
    });
    list.innerHTML = html;
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input) { input.value=''; input.focus(); }
    clearSearchResults(); updateClearButtonVisibility(false);
}

function updateClearButtonVisibility(show) {
    const btn = document.getElementById('search-clear-btn');
    if (btn) btn.style.display = show ? 'block' : 'none';
}

function handleClickOutside(event) {
    const dropdown = document.getElementById('search-dropdown');
    const container = document.querySelector('.search-input-container');
    if (dropdown && container) {
        if (!container.contains(event.target) && !dropdown.contains(event.target)) {
            const memoryList = document.getElementById('search-memory-list');
            if (!memoryList || !memoryList.contains(event.target)) { clearSearchResults(); }
        }
    }
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', handleClickOutside);
});

// Exports globaux
window.openSearchPopup = openSearchPopup;
window.closeSearchPopup = closeSearchPopup;
window.handleSearchInput = handleSearchInput;
window.forceSearch = forceSearch;
window.addToMemory = addToMemory;
window.removeFromMemory = removeFromMemory;
window.validateSearch = async function() {
    if (TV2_searchMemory.size === 0) { showStatus('Aucune zone à ajouter', 'warning'); return; }
    const codes = Array.from(TV2_searchMemory.keys());
    const zoneTypeLabel = getCurrentZoneConfig().label;
    showStatus(`Ajout de ${codes.length} ${zoneTypeLabel} à la sélection...`, 'warning');
    closeSearchPopup();
    if (window.loadZonesByCodes) {
        const results = await loadZonesByCodes(codes, (p,l,t)=>{ showStatus(`Chargement : ${l}/${t} (${p}%)`, 'warning'); });
        if (results) {
            const msg = `${results.success.length} ${zoneTypeLabel} ajoutées à la sélection${results.notFound.length>0?` (${results.notFound.length} non trouvées)`:''}`;
            showStatus(msg, results.success.length>0?'success':'warning');
        }
    }
};

console.log('✅ Module SEARCH-MANAGER Médiaposte chargé');


