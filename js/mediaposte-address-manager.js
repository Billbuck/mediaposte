// ===== GESTIONNAIRE D'ADRESSE MÉDIAPOSTE =====

// Variable pour stocker le geocoder
let popupGeocoder = null;
let selectedCoordinates = null;
let selectedAddress = null;
let isFirstMandatoryOpen = true;
let isGeocoderClearing = false;

/**
 * Vérifie si l'adresse est requise (première ouverture)
 */
function isAddressRequired() {
    return !GLOBAL_STATE.hasValidatedAddress;
}

/**
 * Ouvre la popup d'adresse
 */
function openAddressPopup() {
    console.log('[ADDRESS-MANAGER] Ouverture popup adresse');
    
    const popup = document.getElementById('popup-address');
    if (!popup) return;
    
    const isRequired = isAddressRequired();
    const isFirstTime = isRequired && isFirstMandatoryOpen;
    
    console.log('[ADDRESS-MANAGER] État ouverture:', {
        isRequired,
        isFirstMandatoryOpen,
        isFirstTime
    });
    
    // Ajouter/retirer la classe required
    if (isRequired) {
        document.body.classList.add('address-required');
        popup.classList.add('required');
    } else {
        document.body.classList.remove('address-required');
        popup.classList.remove('required');
    }
    
    // Afficher la popup
    popup.classList.add('active');
    
    // CORRECTION : Nettoyer tous les styles de position avant de repositionner
    popup.style.position = '';
    popup.style.top = '';
    popup.style.left = '';
    popup.style.transform = '';
    
    // Gérer l'affichage des boutons selon le mode
    const closeBtn = document.getElementById('address-popup-close');
    const cancelBtn = document.getElementById('address-cancel-btn');
    
    if (isRequired) {
        // Mode création : masquer croix et annuler
        if (closeBtn) closeBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        if (isFirstTime) {
            // Première ouverture obligatoire : centrer
            popup.style.position = 'fixed';
            popup.style.top = '50%';
            popup.style.left = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
            console.log('[ADDRESS-MANAGER] Popup centrée (première ouverture obligatoire)');
        } else {
            // Réouverture en mode création : position normale
            popup.style.position = 'absolute';
            popup.style.left = '100px';
            popup.style.top = '150px';
            popup.style.transform = 'none';
            console.log('[ADDRESS-MANAGER] Popup à 100px, 150px (réouverture en mode création)');
        }
    } else {
        // Mode modification : afficher croix et annuler, position normale
        if (closeBtn) closeBtn.style.display = 'flex';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        popup.style.position = 'absolute';
        popup.style.left = '100px';
        popup.style.top = '150px';
        popup.style.transform = 'none';
        console.log('[ADDRESS-MANAGER] Mode modification, position normale');
    }
    
    // Initialiser le geocoder si pas déjà fait
    if (!popupGeocoder) {
        initializePopupGeocoder();
    }
    
    // Focus sur le champ de recherche après un court délai
    setTimeout(() => {
        const input = popup.querySelector('.mapboxgl-ctrl-geocoder--input');
        if (input) {
            input.focus();
        }
    }, 100);
    
    // Marquer que ce n'est plus la première ouverture
    if (isFirstTime) {
        isFirstMandatoryOpen = false;
    }
}

/**
 * Ferme la popup d'adresse
 */
function closeAddressPopup() {
    console.log('[ADDRESS-MANAGER] Fermeture popup adresse');
    
    const popup = document.getElementById('popup-address');
    if (!popup) return;
    
    // Ne pas permettre la fermeture si adresse requise
    if (isAddressRequired()) {
        console.log('[ADDRESS-MANAGER] Fermeture refusée - adresse requise');
        return;
    }
    
    popup.classList.remove('active');
    
    // Réinitialiser l'affichage
    resetAddressDisplay();
}

/**
 * Annule les changements d'adresse
 */
function cancelAddressChange() {
    console.log('[ADDRESS-MANAGER] Annulation changement adresse');
    
    // Réinitialiser les variables
    selectedCoordinates = null;
    selectedAddress = null;
    
    // Fermer la popup
    closeAddressPopup();
}

/**
 * Initialise le geocoder dans la popup
 */
function initializePopupGeocoder() {
    console.log('[ADDRESS-MANAGER] Initialisation du geocoder');
    
    const container = document.getElementById('popup-geocoder-container');
    if (!container) return;
    
    // Créer le geocoder
    popupGeocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl: mapboxgl,
        placeholder: 'Rechercher une adresse...',
        countries: 'fr',
        language: 'fr',
        limit: 10,
        marker: false // Pas de marqueur automatique
    });
    
    // Ajouter au conteneur
    container.appendChild(popupGeocoder.onAdd(APP.map));
    
    // Gérer la sélection d'une adresse
    popupGeocoder.on('result', function(e) {
        console.log('[ADDRESS-MANAGER] Adresse sélectionnée:', e.result);
        
        selectedCoordinates = e.result.center;
        selectedAddress = e.result.place_name;
        
        // Afficher l'adresse sélectionnée
        displaySelectedAddress(selectedAddress);
        
        // Activer le bouton de validation
        const validateBtn = document.getElementById('address-validate-btn');
        if (validateBtn) {
            validateBtn.disabled = false;
        }
    });
    
    // Gérer l'effacement
    popupGeocoder.on('clear', function() {
        if (!isGeocoderClearing) {
            console.log('[ADDRESS-MANAGER] Recherche effacée');
        }
        resetAddressDisplay();
    });
}

/**
 * Affiche l'adresse sélectionnée
 */
function displaySelectedAddress(address) {
    const display = document.getElementById('selected-address-display');
    const text = document.getElementById('selected-address-text');
    
    if (display && text) {
        text.textContent = address;
        display.style.display = 'block';
    }
}

/**
 * Réinitialise l'affichage de l'adresse
 */
function resetAddressDisplay() {
    const display = document.getElementById('selected-address-display');
    const validateBtn = document.getElementById('address-validate-btn');
    
    if (display) {
        display.style.display = 'none';
    }
    
    if (validateBtn) {
        validateBtn.disabled = true;
    }
    
    // Vider le geocoder (éviter la récursion via le flag)
    if (popupGeocoder) {
        if (!isGeocoderClearing) {
            isGeocoderClearing = true;
            try {
                popupGeocoder.clear();
            } catch(_) {}
            isGeocoderClearing = false;
        }
    }
    
    selectedCoordinates = null;
    selectedAddress = null;
}

/**
 * Valide l'adresse sélectionnée
 */
function validateAddress() {
    console.log('[ADDRESS-MANAGER] Validation adresse:', {
        coordinates: selectedCoordinates,
        address: selectedAddress
    });
    
    if (!selectedCoordinates || !selectedAddress) {
        showStatus('Veuillez sélectionner une adresse', 'error');
        return;
    }
    
    // Reset de l'étude chargée (sans mouvement de carte)
    if (window.initializeState) {
        try { initializeState(); } catch (e) { console.warn('[ADDRESS-MANAGER] initializeState a échoué:', e); }
    }

    // Mettre à jour l'état global
    GLOBAL_STATE.storeLocation = selectedCoordinates;
    GLOBAL_STATE.hasValidatedAddress = true;
    
    // Créer/mettre à jour le marqueur
    createStoreMarker(selectedCoordinates, selectedAddress);
    
    // Centrer la carte sur la nouvelle position
    APP.map.flyTo({
        center: selectedCoordinates,
        zoom: 14
    });
    
    // Capturer les valeurs avant reset
    const validatedCoordinates = selectedCoordinates;
    const validatedAddress = selectedAddress;

    // Afficher le message de succès AVANT reset
    showStatus(`Point de vente défini : ${validatedAddress}`, 'success');

    // Notifier WebDev du libellé d'adresse AVANT reset
    if (window.updateWebDevAddress) {
        try { window.updateWebDevAddress(validatedAddress); } catch(_) {}
    }

    // Retirer la classe address-required
    document.body.classList.remove('address-required');
    
    // Fermer la popup
    const popup = document.getElementById('popup-address');
    if (popup) {
        popup.classList.remove('active');
        popup.classList.remove('required');
    }
    
    // Réinitialiser l'affichage (vide le champ de recherche)
    resetAddressDisplay();
    
    // Charger les zones pour la nouvelle position
    setTimeout(() => {
        loadZonesForCurrentView(true);
    }, 500);

    // Mettre à jour WebDev si disponible
    if (window.updateSelectionWebDev) {
        window.updateSelectionWebDev(0, 0);
    }
    
    // Appeler la fonction WebDev si disponible
    if (window.onAddressValidated) {
        window.onAddressValidated(validatedCoordinates[1], validatedCoordinates[0], validatedAddress);
    }
}

// Exposer les fonctions globalement
window.isAddressRequired = isAddressRequired;
window.openAddressPopup = openAddressPopup;
window.closeAddressPopup = closeAddressPopup;
window.cancelAddressChange = cancelAddressChange;
window.validateAddress = validateAddress;

console.log('✅ Module ADDRESS-MANAGER chargé');