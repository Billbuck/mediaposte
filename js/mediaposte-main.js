// ===== INITIALISATION PRINCIPALE MÉDIAPOSTE =====

// ===== GESTION INITIALISATION =====

// Flag pour éviter la double initialisation
let isAppInitialized = false;
let isInitializingFromWebDev = false;

/**
 * Initialisation complète de l'application
 */
function initializeApp() {
    if (isAppInitialized) {

        return;
    }
    
    console.log('=== INITIALISATION MÉDIAPOSTE ===');
    
    try {
        // Marquer comme initialisé
        isAppInitialized = true;
        
        // 1. Initialiser la carte
        initMap();
        
        // 2. Configurer les événements UI
        setupUIEvents();
        
        // 2.5. Protéger tous les boutons contre le rechargement de page
        document.addEventListener('click', function(e) {
            if (e.target.tagName === 'BUTTON') {
                e.preventDefault();
            }
        });
        
        // 3. Configurer les raccourcis clavier
        setupKeyboardShortcuts();
        
        // 4. Configurer les événements Draw (après chargement des modules)
        setTimeout(() => {
            if (window.setupDrawEvents) {
                setupDrawEvents();
            }
        }, 100);
        
        // 5. Initialiser l'état
        initializeState();
        
        console.log('✅ Médiaposte initialisé avec succès');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
        showStatus('Erreur lors de l\'initialisation de l\'application', 'error');
        isAppInitialized = false; // Permettre une nouvelle tentative
    }
}

/**
 * Initialisation de l'état global
 */
function initializeState() {
    // Réinitialiser les états
    GLOBAL_STATE.isLoading = false;
    GLOBAL_STATE.currentTool = 'manual';
    GLOBAL_STATE.currentZoneType = 'mediaposte';
    GLOBAL_STATE.hasValidatedAddress = false;
    GLOBAL_STATE.storeLocation = null;
    
    // Vider les caches
    GLOBAL_STATE.uslCache.clear();
    GLOBAL_STATE.currentZonesCache.clear();
    GLOBAL_STATE.superiorZonesCache.clear();
    GLOBAL_STATE.loadedBounds = [];
    
    // Vider les sélections
    GLOBAL_STATE.tempSelection.clear();
    GLOBAL_STATE.finalUSLSelection.clear();
    GLOBAL_STATE.isInTempMode = false;
    GLOBAL_STATE.totalSelectedFoyers = 0;
    GLOBAL_STATE.tempSelectedCount = 0;
    
    // Réinitialiser les outils
    GLOBAL_STATE.circleRadius = 1.5;
    GLOBAL_STATE.circleCenter = null;
    GLOBAL_STATE.isochroneData = null;
    GLOBAL_STATE.currentPolygonId = null;
    
    // Mettre à jour l'affichage
    updateSelectionDisplay();
    updateValidateButton();
    if (typeof updateToolbarVisibility === 'function') {
        updateToolbarVisibility();
    }
    if (typeof updateActionButtonsVisibility === 'function') {
        updateActionButtonsVisibility();
    }
    

}

// ===== CONFIGURATION DES ÉVÉNEMENTS UI =====

/**
 * Configuration de tous les événements de l'interface
 */
function setupUIEvents() {
    // Sélecteur de type de zone
    const zoneTypeSelector = document.getElementById('zone-type');
    if (zoneTypeSelector) {
        zoneTypeSelector.addEventListener('change', handleZoneTypeChange);

    }
    
    // Bouton de validation
    const validateBtn = document.getElementById('validate-selection-btn');
    if (validateBtn) {
        validateBtn.addEventListener('click', validateTempSelection);

    }
    
    // Boutons d'outils
    setupToolButtonEvents();
    
    // Sliders et contrôles des popups
    setupPopupControlEvents();

    // Initialiser la visibilité du bouton recherche (aligné Zecible)
    if (window.updateSearchButtonVisibility) {
        try { window.updateSearchButtonVisibility(); } catch(_) {}
    }
    
    // Initialiser le switch des libellés à OFF par défaut
    const labelsSwitch = document.getElementById('labels-switch');
    if (labelsSwitch) {
        // Par défaut OFF, sauf si explicitement sauvegardé comme ON
        const savedState = localStorage.getItem('mediaposte-show-labels') === 'true';
        labelsSwitch.checked = savedState || false; // false par défaut
        if (window.toggleLabelsVisibility) {
            window.toggleLabelsVisibility(savedState || false);
        }
    }
    

}

/**
 * Configuration des événements des boutons d'outils
 */
function setupToolButtonEvents() {
    const toolButtons = document.querySelectorAll('.tool-btn');
    
    toolButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const tooltip = btn.getAttribute('data-tooltip');
            let tool = '';
            
            if (tooltip.includes('Cercle')) tool = 'circle';
            else if (tooltip.includes('Isochrone')) tool = 'isochrone';
            else if (tooltip.includes('Polygone')) tool = 'polygon';
            
            if (tool) {
                activateTool(tool);
            }
        });
    });
    

}

/**
 * Configuration des événements des contrôles de popup
 */
function setupPopupControlEvents() {
    // Slider du cercle
    const circleRadius = document.getElementById('circle-radius');
    if (circleRadius) {
        circleRadius.addEventListener('input', updateCirclePreview);
    }
    
    // Sélecteur de transport
    const transportMode = document.getElementById('transport-mode');
    if (transportMode) {
        transportMode.addEventListener('change', updateIsochronePreview);
    }
    
    // Slider de temps
    const timeRange = document.getElementById('time-range');
    if (timeRange) {
        timeRange.addEventListener('input', updateTimePreview);
    }
    

}

// ===== INTÉGRATION AVEC WEBDEV =====

/**
 * Fonction appelée par WebDev - Version avec JSON
 * @param {Object|string} jsonData - Les données de l'étude (objet ou chaîne JSON)
 */
function InitialiserCarte(jsonData) {
    console.log('=== InitialiserCarte APPELÉE ===', jsonData);
    
    // Attendre que la carte soit chargée
    setTimeout(function() {
        try {
            // Parser le JSON si c'est une chaîne
            let studyData = null;
            if (typeof jsonData === 'string') {
                if (jsonData && jsonData.trim() !== '') {
                    studyData = JSON.parse(jsonData);
                }
            } else {
                studyData = jsonData;
            }
            
            console.log('[InitialiserCarte] Données parsées:', studyData);
            
            // CAS 1 : JSON vide ou null - Forcer la demande d'adresse
            if (!studyData || !studyData.store || !studyData.store.adresse) {
                console.log('[InitialiserCarte] CAS 1 - JSON vide - ouverture popup adresse obligatoire');
                
                GLOBAL_STATE.hasValidatedAddress = false;
                
                // Ouvrir la popup d'adresse en mode obligatoire
                if (window.openAddressPopup) {
                    setTimeout(function() {
                        window.openAddressPopup();
                    }, 500);
                }
                
                // Centrer sur la France par défaut
                APP.map.flyTo({
                    center: [2.213749, 46.227638],
                    zoom: 5.5
                });
                
                return;
            }
            
            // CAS 2 & 3 : Adresse présente
            const store = studyData.store;
            
            // Définir la position du magasin
            GLOBAL_STATE.storeLocation = [store.longitude, store.latitude];
            GLOBAL_STATE.hasValidatedAddress = true;
            
            // Créer le marqueur
            createStoreMarker(GLOBAL_STATE.storeLocation, store.adresse);
            
            // Centrer la carte
            APP.map.flyTo({
                center: GLOBAL_STATE.storeLocation,
                zoom: 14
            });
            
            // Charger les zones
            setTimeout(function() {
                loadZonesForCurrentView(true);
            }, 500);
            
            // CAS 3 : JSON complet avec sélection USL
            if (studyData.selection && studyData.selection.tabUsl && studyData.selection.tabUsl.length > 0) {
                console.log('[InitialiserCarte] CAS 3 - JSON complet - chargement des USL');
                
                // Utiliser la fonction loadStudy qui gère correctement le chargement
                setTimeout(async function() {
                    try {
                        // Appeler loadStudy pour charger proprement l'étude complète
                        if (window.loadStudy) {
                            await window.loadStudy(studyData);
                        } else {
                            console.error('[InitialiserCarte] Fonction loadStudy non disponible');
                            showStatus('Erreur : fonction de chargement non disponible', 'error');
                        }
                    } catch (error) {
                        console.error('[InitialiserCarte] Erreur chargement étude:', error);
                        showStatus('Erreur lors du chargement de l\'étude', 'error');
                    }
                }, 2000);
                
            } else {
                // CAS 2 : Adresse seule
                console.log('[InitialiserCarte] CAS 2 - Adresse seule');
                showStatus(`Point de vente défini : ${store.adresse}`, 'success');
                
                // Mettre à jour WebDev (adresse + sélection à 0)
                if (window.updateWebDevAddress) {
                    try { window.updateWebDevAddress(store.adresse); } catch(_) {}
                }
                if (window.updateSelectionWebDev) {
                    window.updateSelectionWebDev(0, 0);
                }
            }
            
        } catch (error) {
            console.error('[InitialiserCarte] Erreur:', error);
            showStatus('Erreur lors de l\'initialisation', 'error');
            
            // En cas d'erreur, ouvrir la popup d'adresse
            GLOBAL_STATE.hasValidatedAddress = false;
            if (window.openAddressPopup) {
                setTimeout(function() {
                    window.openAddressPopup();
                }, 500);
            }
        }
    }, 1000);
}

/**
 * Initialisation à partir de WebDev avec coordonnées (fonction alternative)
 */
function initializeMapFromWebDev(lat, lng, address) {

    InitialiserCarte(lat, lng, address);
}

/**
 * Mise à jour de l'adresse depuis WebDev
 */
function updateWebDevAddress(address) {

    // Cette fonction peut être utilisée pour synchroniser l'affichage
    // avec le champ d'adresse côté WebDev
}

// ===== FONCTIONS DE SAUVEGARDE/CHARGEMENT ADAPTÉES =====

/**
 * Récupération des données d'étude pour sauvegarde
 */
function getStudyDataForSave() {
    if (!GLOBAL_STATE.storeLocation) {
        alert('Aucun point de vente défini');
        return null;
    }
    
    if (GLOBAL_STATE.finalUSLSelection.size === 0) {
        alert('Aucune zone USL sélectionnée');
        return null;
    }
    
    // Récupérer l'adresse depuis WebDev
    const storeAddress = window.getStoreAddressFromWebDev ? 
                        window.getStoreAddressFromWebDev() : 
                        'Adresse non disponible';
    
    const studyData = {
        store: {
            adresse: storeAddress,
            longitude: GLOBAL_STATE.storeLocation[0],
            latitude: GLOBAL_STATE.storeLocation[1]
        },
        selection: {
            totalFoyers: GLOBAL_STATE.totalSelectedFoyers,
            tabUsl: Array.from(GLOBAL_STATE.finalUSLSelection.keys())
        }
    };
    
    return studyData;
}

/**
 * Chargement d'une étude sauvegardée
 */
async function loadStudy(studyData) {
    
    try {
        // Validation des données
        if (!studyData || !studyData.store || !studyData.selection) {
            throw new Error('Données d\'étude invalides');
        }
        
        // 1. Réinitialiser l'application
        initializeState();
        
        // 2. Restaurer l'adresse (WebDev)
        if (window.updateWebDevAddress) {
            window.updateWebDevAddress(studyData.store.adresse);
        }
        
        // 3. Restaurer la position du magasin
        GLOBAL_STATE.storeLocation = [
            studyData.store.longitude,
            studyData.store.latitude
        ];
        GLOBAL_STATE.hasValidatedAddress = true;
        
        // 4. Créer le marqueur
        createStoreMarker(GLOBAL_STATE.storeLocation, studyData.store.adresse);
        
        // 5. S'assurer qu'on est en mode USL
        const zoneSelector = document.getElementById('zone-type');
        if (zoneSelector) {
            zoneSelector.value = 'mediaposte';
            GLOBAL_STATE.currentZoneType = 'mediaposte';
        }
        
        // NOUVEAU: Détection étude sauvegardée avec USL
        const hasSavedSelection = !!(studyData.selection && Array.isArray(studyData.selection.tabUsl) && studyData.selection.tabUsl.length > 0);
        if (hasSavedSelection) {
            console.log('[LOAD-STUDY] Étude sauvegardée détectée');
            console.log('[LOAD-STUDY] USL à charger:', studyData.selection.tabUsl.length);
            console.log('[LOAD-STUDY] Recentrage sur sélection au lieu du point de vente');
            
            // 6A. Charger des USL en arrière-plan autour du point de vente (zone élargie)
            try {
                const [lng, lat] = GLOBAL_STATE.storeLocation;
                const latMargin = 0.25;  // ~27 km
                const lngMargin = 0.35;  // ~25 km à cette latitude
                const preloadBounds = {
                    lat_min: lat - latMargin,
                    lat_max: lat + latMargin,
                    lng_min: lng - lngMargin,
                    lng_max: lng + lngMargin
                };
                if (typeof window.loadUSLForSpecificBounds === 'function') {
                    await window.loadUSLForSpecificBounds(preloadBounds);
                } else if (typeof loadUSLForSpecificBounds === 'function') {
                    await loadUSLForSpecificBounds(preloadBounds);
                }
            } catch (e) {
                console.warn('[LOAD-STUDY] Préchargement USL autour du point de vente impossible:', e);
            }
            
            // 6B. Charger les zones pour la vue courante (complément)
            await loadZonesForCurrentView(true);
            
            // 7A. Petite attente pour stabiliser
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            // EXISTANT: Étude sans sélection, zoom sur le point de vente
            APP.map.flyTo({
                center: GLOBAL_STATE.storeLocation,
                zoom: 14,
                duration: 2000
            });
            await new Promise(resolve => setTimeout(resolve, 2500));
            await loadZonesForCurrentView(true);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 8. Restaurer la sélection USL
        let restoredCount = 0;
        
        studyData.selection.tabUsl.forEach(uslId => {
            const zone = GLOBAL_STATE.uslCache.get(uslId);
            if (zone) {
                GLOBAL_STATE.finalUSLSelection.set(uslId, zone);
                GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
                restoredCount++;
            }
        });
        
        // NOUVEAU: si sélection restaurée, recadrer sur l'ensemble des USL sélectionnées
        if (hasSavedSelection && restoredCount > 0) {
            try {
                if (typeof window.recenterOnSelection === 'function') {
                    window.recenterOnSelection(60);
                } else if (typeof recenterOnSelection === 'function') {
                    recenterOnSelection(60);
                }
            } catch (e) {
                console.warn('[LOAD-STUDY] Recentrage sur sélection impossible:', e);
            }
        }
        
        // 9. Mettre à jour l'affichage
        updateSelectionDisplay();
        updateSelectedZonesDisplay();
        
        // 10. Mettre à jour WebDev
        if (window.updateSelectionWebDev) {
            window.updateSelectionWebDev(
                GLOBAL_STATE.finalUSLSelection.size,
                GLOBAL_STATE.totalSelectedFoyers
            );
        }
        
        // 11. Message de confirmation
        const message = `Étude chargée : ${restoredCount}/${studyData.selection.tabUsl.length} USL restaurées (${GLOBAL_STATE.totalSelectedFoyers} foyers)`;
        showStatus(message, restoredCount === studyData.selection.tabUsl.length ? 'success' : 'warning');
        
        // 12. Restaurer la préférence des libellés
        const showLabels = localStorage.getItem('mediaposte-show-labels') === 'true';
        const labelsSwitch = document.getElementById('labels-switch');
        if (labelsSwitch) {
            labelsSwitch.checked = showLabels;
            if (window.toggleLabelsVisibility) {
                window.toggleLabelsVisibility(showLabels);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('[LOAD ERROR] Erreur chargement étude:', error);
        showStatus('Erreur lors du chargement de l\'étude', 'error');
        return false;
    }
}

// ===== UTILITAIRES =====

/**
 * Calcul du zoom intelligent selon le contexte urbain/rural
 */
function calculateSmartZoom(placeName, coordinates) {
    const isUrban = CONFIG.URBAN_KEYWORDS.some(city => placeName.includes(city));
    const isParisCenter = placeName.match(/Paris.*7500[0-9]{2}/) || placeName.includes('arrondissement');
    
    if (isParisCenter) {
        console.log('[ZOOM] Paris centre détecté, zoom très élevé');
        return 16;
    } else if (isUrban) {
        console.log('[ZOOM] Zone urbaine détectée, zoom élevé');
        return 14;
    } else {
        console.log('[ZOOM] Zone rurale/périurbaine détectée, zoom modéré');
        return 12;
    }
}

/**
 * Nettoyage complet de l'application
 */
function resetApplication() {
    console.log('=== RESET APPLICATION ===');
    
    // Réinitialiser l'état
    initializeState();
    
    // Supprimer le marqueur
    const existingMarkers = document.getElementsByClassName('mapboxgl-marker');
    Array.from(existingMarkers).forEach(marker => marker.remove());
    
    // Nettoyer les outils visuels
    hideCircle();
    hideIsochrone();
    hideEstimation();
    
    if (APP.draw) {
        APP.draw.deleteAll();
    }
    
    // Nettoyer les sources de la carte
    if (APP.map) {
        ['zones-usl', 'zones-france', 'zones-france-superior', 'circle-source', 'isochrone-source'].forEach(sourceId => {
            if (APP.map.getSource(sourceId)) {
                APP.map.getSource(sourceId).setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
        });
    }
    
    // Centrer sur la France
    APP.map.flyTo({
        center: CONFIG.MAP_CONFIG.center,
        zoom: CONFIG.MAP_CONFIG.zoom,
        duration: 1000
    });
    
    // Réinitialiser WebDev
    if (window.updateSelectionWebDev) {
        window.updateSelectionWebDev(0, 0);
    }
    
    showStatus('Application réinitialisée', 'warning');
}

// ===== RACCOURCIS CLAVIER =====

/**
 * Configuration des raccourcis clavier
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ignorer si on est dans un champ de saisie
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key.toLowerCase()) {
            case 'c':
                if (!e.ctrlKey && !e.metaKey) { // Éviter Ctrl+C
                    activateTool('circle');
                }
                break;
            case 'i':
                activateTool('isochrone');
                break;
            case 'p':
                activateTool('polygon');
                break;
            case 'escape':
                // Fermer toutes les popups
                document.querySelectorAll('.popup.active').forEach(popup => {
                    const tool = popup.id.replace('popup-', '');
                    if (window.closePopup) {
                        closePopup(tool);
                    }
                });
                break;
            case 'delete':
            case 'backspace':
                // Vider la sélection actuelle
                if (confirm('Vider la sélection actuelle ?')) {
                    if (isInUSLMode()) {
                        clearFinalSelection();
                    } else {
                        clearTempSelection();
                    }
                    
                    // Mettre à jour WebDev
                    if (window.updateSelectionWebDev) {
                        window.updateSelectionWebDev(0, 0);
                    }
                }
                break;
        }
    });
    
    console.log('[SHORTCUTS] ✓ Raccourcis clavier configurés');
}

// ===== ÉVÉNEMENTS DE DÉMARRAGE =====

/**
 * Événement de chargement du DOM
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('[DOM] DOM chargé, initialisation de Médiaposte...');
    
    // Ne pas initialiser automatiquement si on attend WebDev
    if (window.location.search.includes('webdev') || window.parent !== window) {
        console.log('[DOM] Mode WebDev détecté, attente initialisation manuelle');
        return;
    }
    
    // Attendre un peu pour que Mapbox soit prêt
    setTimeout(() => {
        if (!isInitializingFromWebDev) {
            initializeApp();
        }
    }, 100);
});

// ===== GESTION DES ERREURS GLOBALES =====

/**
 * Capturer les erreurs non gérées
 */
window.addEventListener('error', function(event) {
    // Ignorer les erreurs Mapbox connues
    if (event.message && event.message.includes('Expected value to be of type number')) {
        console.warn('[ERROR HANDLER] Erreur Mapbox connue ignorée:', event.message);
        event.preventDefault();
        return;
    }
    
    console.error('[ERROR HANDLER] Erreur non gérée:', event);
});

// ===== MISE À JOUR DE LA SÉLECTION POUR WEBDEV =====

/**
 * Observer les changements de sélection pour mettre à jour WebDev
 */
function watchSelectionChanges() {
    // Cette fonction est appelée depuis updateSelectionDisplay
    if (window.updateSelectionWebDev) {
        if (isInUSLMode()) {
            window.updateSelectionWebDev(
                GLOBAL_STATE.finalUSLSelection.size,
                GLOBAL_STATE.totalSelectedFoyers
            );
        } else {
            // En mode non-USL, on compte juste les zones
            window.updateSelectionWebDev(
                GLOBAL_STATE.tempSelection.size,
                0
            );
        }
    }
}

// Surcharger updateSelectionDisplay pour ajouter la mise à jour WebDev
const originalUpdateSelectionDisplay = window.updateSelectionDisplay;
window.updateSelectionDisplay = function(skipWebDevUpdate = false) {
    if (originalUpdateSelectionDisplay) {
        originalUpdateSelectionDisplay(skipWebDevUpdate);
    }
    if (!skipWebDevUpdate) {
        watchSelectionChanges();
    }
};

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.initializeApp = initializeApp;
window.InitialiserCarte = InitialiserCarte;
window.initializeMapFromWebDev = initializeMapFromWebDev;
window.updateWebDevAddress = updateWebDevAddress;
window.getStudyDataForSave = getStudyDataForSave;
window.loadStudy = loadStudy;
window.calculateSmartZoom = calculateSmartZoom;
window.resetApplication = resetApplication;

// Fonction alternative pour WebDev
window.InitialiserCarteAvecCoordonnees = function(lat, lng, adresse) {

    InitialiserCarte(lat, lng, adresse);
};

/**
 * Force une capture de la carte après rendu complet
 * Alternative qui attend le prochain frame de rendu
 */
window.CapturerCarteAvecAttente = function(callback) {
    console.log('[CAPTURE-ALT] Début capture avec attente');
    
    if (!APP.map) {
        console.error('[CAPTURE-ALT] Carte non disponible');
        if (callback) callback("");
        return;
    }
    
    // Forcer un rendu complet
    APP.map.triggerRepaint();
    
    // Attendre le prochain frame de rendu
    APP.map.once('render', function() {
        console.log('[CAPTURE-ALT] Événement render reçu');
        
        // Attendre encore un frame pour être sûr
        requestAnimationFrame(function() {
            console.log('[CAPTURE-ALT] Animation frame suivant');
            
            // Capturer maintenant
            const imageBase64 = window.CapturerCarte();
            
            if (callback) {
                callback(imageBase64);
            }
        });
    });
    
    // Timeout de sécurité
    setTimeout(function() {
        console.warn('[CAPTURE-ALT] Timeout - capture forcée');
        const imageBase64 = window.CapturerCarte();
        if (callback) {
            callback(imageBase64);
        }
    }, 2000);
};

// ===== FONCTIONS DE CAPTURE D'ÉCRAN POUR WEBDEV =====

/**
 * Recentre la carte pour une capture optimale
 * Version instantanée sans animation
 * Priorité : sélection > point de vente > vue France
 * @returns {boolean} true si recentrage effectué
 */
window.RecentrerPourCapture = function() {
    console.log('[CAPTURE] Recentrage instantané pour capture');
    
    if (!APP.map) return false;
    
    // Si des zones sont sélectionnées, recentrer dessus instantanément
    if (GLOBAL_STATE.finalUSLSelection.size > 0 || GLOBAL_STATE.tempSelection.size > 0) {
        // Calculer les bounds de la sélection
        const boundsData = window.calculateSelectionBounds();
        if (boundsData && boundsData.lat_min != null && boundsData.lat_max != null && 
            boundsData.lng_min != null && boundsData.lng_max != null) {
            
            console.log('[CAPTURE] Recentrage instantané sur la sélection');
            
            // Convertir au format attendu par Mapbox : [[lng_min, lat_min], [lng_max, lat_max]]
            const mapboxBounds = [
                [boundsData.lng_min, boundsData.lat_min],
                [boundsData.lng_max, boundsData.lat_max]
            ];
            
            APP.map.fitBounds(mapboxBounds, {
                padding: 30,      // Padding réduit pour cadrage serré
                duration: 0,      // Pas d'animation
                animate: false,   // Force pas d'animation
                maxZoom: 15      // Limite de zoom pour éviter trop proche
            });
            return true;
        }
    }
    
    // Sinon, recentrer sur le point de vente instantanément
    if (GLOBAL_STATE.storeLocation) {
        console.log('[CAPTURE] Recentrage instantané sur le point de vente');
        APP.map.jumpTo({
            center: GLOBAL_STATE.storeLocation,
            zoom: 14,
            animate: false  // Pas d'animation
        });
        return true;
    }
    
    // Par défaut, vue France instantanée
    console.log('[CAPTURE] Recentrage instantané sur la France');
    APP.map.jumpTo({
        center: [2.213749, 46.227638],
        zoom: 5.5,
        animate: false  // Pas d'animation
    });
    return true;
};

/**
 * Capture la carte et retourne une image base64
 * @returns {string} Image en base64 (data:image/png;base64,...)
 */
window.CapturerCarte = function() {
    console.log('[CAPTURE] Capture de la carte');
    
    if (!APP.map) {
        console.error('[CAPTURE] Carte non disponible');
        return "";
    }
    
    try {
        // Obtenir le canvas de la carte
        const canvas = APP.map.getCanvas();
        
        // Vérifications du canvas
        console.log('[CAPTURE] Canvas dimensions:', canvas.width, 'x', canvas.height);
        console.log('[CAPTURE] Canvas style:', canvas.style.width, 'x', canvas.style.height);
        
        // Vérifier si le canvas a une taille valide
        if (canvas.width === 0 || canvas.height === 0) {
            console.error('[CAPTURE] Canvas a une taille nulle');
            return "";
        }
        
        // Forcer le rendu de la carte plusieurs fois
        APP.map.triggerRepaint();
        
        // Attendre un peu pour le rendu du marqueur
        const renderStart = Date.now();
        while (Date.now() - renderStart < 50) {
            // Petite pause de 50ms
        }
        
        // Re-forcer le rendu
        APP.map.triggerRepaint();
        
        // Obtenir le contexte pour vérifier s'il est valide
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            console.error('[CAPTURE] Contexte WebGL non disponible');
            return "";
        }
        
        // Vérifier si le contexte WebGL est perdu
        if (gl.isContextLost && gl.isContextLost()) {
            console.error('[CAPTURE] Contexte WebGL perdu');
            return "";
        }
        
        // Avant de convertir en base64, vérifier si on doit ajouter le marqueur
        let imageBase64;
        
        if (APP.map.getSource('store-marker') && APP.map.getSource('store-marker')._data) {
            // Récupérer les coordonnées du marqueur
            const markerData = APP.map.getSource('store-marker')._data;
            const coords = markerData.geometry.coordinates;
            
            // Convertir les coordonnées en pixels
            const point = APP.map.project(coords);
            
            // Créer un canvas temporaire pour dessiner le marqueur
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Copier l'image de la carte
            tempCtx.drawImage(canvas, 0, 0);
            
            // Dessiner le marqueur
            const scale = window.devicePixelRatio || 1;
            const x = point.x * scale;
            const y = point.y * scale;
            
            // Cercle violet avec bordure blanche
            tempCtx.beginPath();
            tempCtx.arc(x, y, 10 * scale, 0, 2 * Math.PI);
            tempCtx.fillStyle = CONFIG.COLORS.MARKER || '#C366F2';
            tempCtx.fill();
            tempCtx.strokeStyle = '#FFFFFF';
            tempCtx.lineWidth = 2 * scale;
            tempCtx.stroke();
            
            // Convertir le canvas temporaire en base64
            imageBase64 = tempCanvas.toDataURL('image/png', 1.0);
        } else {
            // Pas de marqueur, conversion normale
            imageBase64 = canvas.toDataURL('image/png', 1.0);
        }
        
        console.log('[CAPTURE] Image capturée, taille:', imageBase64.length);
        
        // Vérifier si l'image n'est pas vide (une image PNG vide fait environ 1000-2000 octets)
        if (imageBase64.length < 5000) {
            console.warn('[CAPTURE] Image suspecte (trop petite), peut-être vide');
        }
        
        return imageBase64;
        
    } catch (error) {
        console.error('[CAPTURE] Erreur lors de la capture:', error);
        return "";
    }
};

/**
 * Fonction appelée par WebDev pour recentrer, capturer et afficher
 * @param {string} aliasZTR - L'alias de la Zone de Texte Riche WebDev
 */
window.JavascriptRecentrerCapturerAfficher = function(aliasZTR) {
    console.log('[CAPTURE-AUTO] Début avec alias ZTR:', aliasZTR);
    
    if (!APP.map) {
        console.error('[CAPTURE-AUTO] Carte non disponible');
        return false;
    }
    
    // 1. Recentrer instantanément
    if (window.RecentrerPourCapture) {
        window.RecentrerPourCapture();
        console.log('[CAPTURE-AUTO] Recentrage effectué');
    }
    
    // 2. Attendre que le recentrage soit terminé et capturer
    // Comme le recentrage est instantané, on attend juste le prochain render
    APP.map.once('render', function() {
        console.log('[CAPTURE-AUTO] Événement render après recentrage');
        
        // Attendre un frame supplémentaire pour être sûr
        requestAnimationFrame(function() {
            console.log('[CAPTURE-AUTO] Frame suivant, capture en cours');
            
            // Forcer le rendu
            APP.map.triggerRepaint();
            
            // Capturer maintenant
            var imageBase64 = window.CapturerCarte();
            
            if (imageBase64 && imageBase64 !== "") {
                console.log('[CAPTURE-AUTO] Image capturée avec succès');
                
                // Sauvegarder dans la variable WebDev
                if (window.WebDevBridge) {
                    WebDevBridge.set('sImageCarte', imageBase64);
                    console.log('[CAPTURE-AUTO] Image sauvegardée dans sImageCarte');
                }
                
                // 3. Afficher dans la ZTR
                if (aliasZTR) {
                    // HTML adaptatif pour la ZTR
                    var htmlImage = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden;">' +
                                   '<img src="' + imageBase64 + '" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border: 2px solid #ddd; border-radius: 8px;" />' +
                                   '</div>';
                    
                    // Obtenir l'ID réel de la ZTR
                    var idZTR = aliasZTR;
                    var elementZTR = document.getElementById(idZTR);
                    
                    if (elementZTR) {
                        elementZTR.innerHTML = htmlImage;
                        console.log('[CAPTURE-AUTO] Image affichée dans la ZTR');
                    } else {
                        console.error('[CAPTURE-AUTO] ZTR non trouvée avec ID:', idZTR);
                    }
                }
            } else {
                console.error('[CAPTURE-AUTO] Échec de la capture');
            }
        });
    });
    
    // Timeout de sécurité au cas où l'événement render ne se déclenche pas
    setTimeout(function() {
        if (!APP.map._renderTaskQueue || APP.map._renderTaskQueue.length === 0) {
            console.warn('[CAPTURE-AUTO] Timeout - forçage de la capture');
            var imageBase64 = window.CapturerCarte();
            if (imageBase64 && window.WebDevBridge) {
                WebDevBridge.set('sImageCarte', imageBase64);
            }
        }
    }, 1000);
    
    return true;
};

/**
 * Fonction synchrone pour WebDev - Capture simple sans temporisation
 * @returns {string} Image en base64 ou chaîne vide si erreur
 */
window.RecupererCaptureCarte = function() {
    console.log('[CAPTURE-WEBDEV] Récupération capture pour WebDev');
    
    // Vérifier que la carte existe
    if ((!window.APP || !window.APP.map) && (!APP || !APP.map)) {
        console.error('[CAPTURE-WEBDEV] Carte non disponible');
        return "";
    }
    
    try {
        // Note: Le marqueur est maintenant dessiné directement sur le canvas dans CapturerCarte()
        
        // Forcer le rendu avant capture
        if (window.APP && window.APP.map) {
            window.APP.map.triggerRepaint();
        } else if (APP && APP.map) {
            APP.map.triggerRepaint();
        }
        
        // Capturer directement la carte
        // IMPORTANT: Appeler la vraie fonction de capture, pas celle de WebDev
        var imageBase64 = "";
        
        // S'assurer d'appeler la bonne fonction
        if (typeof window.CapturerCarte === 'function') {
            // Vérifier qu'on n'est pas dans une boucle infinie
            var functionString = window.CapturerCarte.toString();
            if (functionString.indexOf('[CAPTURE] Capture de la carte') > -1) {
                // C'est la bonne fonction
                imageBase64 = window.CapturerCarte();
            } else {
                console.error('[CAPTURE-WEBDEV] window.CapturerCarte semble être la fonction WebDev, pas celle de Médiaposte');
                // Essayer d'accéder directement à la fonction globale
                if (APP && APP.map) {
                    // Appeler directement le code de capture
                    var canvas = APP.map.getCanvas();
                    if (canvas && canvas.width > 0 && canvas.height > 0) {
                        APP.map.triggerRepaint();
                        imageBase64 = canvas.toDataURL('image/png', 1.0);
                    }
                }
            }
        }
        
        if (imageBase64 && imageBase64 !== "") {
            console.log('[CAPTURE-WEBDEV] Image capturée avec succès, taille:', imageBase64.length);
            
            // Note: Plus besoin de gérer la visibilité du marqueur
            
            return imageBase64;
        } else {
            console.error('[CAPTURE-WEBDEV] Capture vide ou échouée');
            return "";
        }
    } catch (error) {
        console.error('[CAPTURE-WEBDEV] Erreur lors de la capture:', error);
        console.error('[CAPTURE-WEBDEV] Stack:', error.stack);
        
        // Note: Plus besoin de gérer la visibilité du marqueur
        
        return "";
    }
};

console.log('✅ Module MAIN Médiaposte chargé');
console.log('✅ InitialiserCarte exposée globalement:', typeof window.InitialiserCarte);
/**
 * Fonction simple pour WebDev - Effectue uniquement le recentrage instantané
 * @returns {boolean} true si recentrage effectué
 */
window.EffectuerRecentrageInstantane = function() {
    console.log('[RECENTRAGE] Recentrage instantané pour capture WebDev');
    
    if (!APP.map) {
        console.error('[RECENTRAGE] Carte non disponible');
        return false;
    }
    
    // Recentrer immédiatement
    if (window.RecentrerPourCapture) {
        window.RecentrerPourCapture();
        console.log('[RECENTRAGE] Recentrage instantané effectué');
        
        // Forcer le rendu
        APP.map.triggerRepaint();
        return true;
    }
    
    return false;
};



console.log('✅ Fonctions de capture exposées:', {
    RecentrerPourCapture: typeof window.RecentrerPourCapture,
    CapturerCarte: typeof window.CapturerCarte,
    JavascriptRecentrerCapturerAfficher: typeof window.JavascriptRecentrerCapturerAfficher,
    RecupererCaptureCarte: typeof window.RecupererCaptureCarte,
    EffectuerRecentrageInstantane: typeof window.EffectuerRecentrageInstantane
});