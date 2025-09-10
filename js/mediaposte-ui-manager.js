// ===== GESTION INTERFACE MÉDIAPOSTE =====

// ===== FONCTION CENTRALISÉE DE VISIBILITÉ UI =====

/**
 * Fonction CENTRALISÉE pour gérer la visibilité de tous les éléments UI
 * Appelée à chaque changement de mode
 */
function updateUIVisibilityForMode() {
    const currentType = GLOBAL_STATE.currentZoneType;
    console.log('[UI] Mise à jour visibilité pour mode:', currentType);
    
    // 1. BOUTON RECHERCHER
    // Visible UNIQUEMENT pour : commune, code_postal, departement
    // PAS pour : mediaposte (USL), iris
    const searchBtn = document.getElementById('search-button');
    if (searchBtn) {
        const showSearch = ['commune', 'code_postal', 'departement'].includes(currentType);
        searchBtn.style.display = showSearch ? 'flex' : 'none';
        console.log('[UI] Bouton Rechercher:', showSearch ? 'visible' : 'caché');
    }
    
    // 2. SWITCH LIBELLÉS
    // Visible pour : iris, commune, code_postal, departement
    // PAS pour : mediaposte (USL)
    const labelsControl = document.getElementById('labels-control');
    if (labelsControl) {
        const showLabels = currentType !== 'mediaposte';
        labelsControl.style.display = showLabels ? 'flex' : 'none';
        
        // Si on passe en USL, désactiver aussi le switch
        if (currentType === 'mediaposte') {
            const labelsSwitch = document.getElementById('labels-switch');
            if (labelsSwitch && labelsSwitch.checked) {
                labelsSwitch.checked = false;
                if (window.toggleLabelsVisibility) {
                    window.toggleLabelsVisibility(false);
                }
            }
        }
        console.log('[UI] Switch Libellés:', showLabels ? 'visible' : 'caché');
    }
    
    // 3. TOOLBAR (outils cercle/isochrone/polygone)
    // Visible UNIQUEMENT en mode USL
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        const showToolbar = currentType === 'mediaposte';
        toolbar.classList.toggle('hidden', !showToolbar);
        console.log('[UI] Toolbar outils:', showToolbar ? 'visible' : 'cachée');
    }
    
    // 4. BOUTON VALIDATION
    // Visible UNIQUEMENT hors USL avec sélection
    updateValidateButton();
    
    // 5. Réinitialiser les événements de labels si nécessaire
    if (window.resetLabelsEvents) {
        window.resetLabelsEvents();
    }
}

// Exporter la fonction
window.updateUIVisibilityForMode = updateUIVisibilityForMode;

// ===== GESTION DU BOUTON VALIDATION =====

/**
 * Mise à jour de la visibilité du bouton validation
 */
function updateValidateButton() {
    const validateBtn = document.getElementById('validate-selection-btn');
    const validateContainer = document.getElementById('validate-container');
    if (!validateBtn || !validateContainer) return;
    
    // Afficher le bouton seulement si :
    // 1. Mode non-USL ET
    // 2. Au moins une zone sélectionnée
    const shouldShow = !isInUSLMode() && 
                      (GLOBAL_STATE.tempSelection.size > 0 || GLOBAL_STATE.tempSelectedCount > 0);
    
    if (shouldShow) {
        validateContainer.classList.remove('hidden');
        validateBtn.textContent = `✓ Valider la sélection (${GLOBAL_STATE.tempSelection.size} zones)`;
    } else {
        validateContainer.classList.add('hidden');
    }
}

/**
 * Met à jour la visibilité de la barre d'outils (Cercle/Isochrone/Polygone)
 * Utilise maintenant la fonction centralisée
 */
function updateToolbarVisibility() {
    updateUIVisibilityForMode();
}

/**
 * Met à jour la visibilité du bouton Rechercher
 * @deprecated Utiliser updateUIVisibilityForMode() à la place
 */
function updateSearchButtonVisibility() {
    updateUIVisibilityForMode();
}

/**
 * Valide la sélection temporaire et lance la conversion
 */
async function validateTempSelection() {

    if (window.isConversionInProgress) {

        return;
    }
    if (window.isValidationInProgress) {

        return;
    }
    window.isValidationInProgress = true;
    const validateBtn = document.getElementById('validate-selection-btn');
    if (validateBtn) { validateBtn.disabled = true; }
    
    if (GLOBAL_STATE.tempSelection.size === 0) {
        showStatus('Aucune zone sélectionnée', 'error');
        window.isValidationInProgress = false;
        if (validateBtn) { validateBtn.disabled = false; }
        return;
    }
    
    // Calculer les bounds de la sélection
    const selectionBounds = calculateSelectionBounds();

    
    if (!selectionBounds) {
        showStatus('Erreur calcul zone sélectionnée', 'error');
        window.isValidationInProgress = false;
        if (validateBtn) { validateBtn.disabled = false; }
        return;
    }
    
    // Calculer l'aire de la sélection
    const selectionArea = calculateBoundsArea(selectionBounds);
    const viewBounds = {
        lat_min: APP.map.getBounds().getSouth(),
        lat_max: APP.map.getBounds().getNorth(),
        lng_min: APP.map.getBounds().getWest(),
        lng_max: APP.map.getBounds().getEast()
    };
    const viewArea = calculateBoundsArea(viewBounds);
    

    
    // Vérifier si les USL sont chargées pour cette zone

    if (!areUSLLoadedForBounds(selectionBounds)) {

        
        // Afficher le statut
        showStatus('Chargement des USL pour la zone sélectionnée...', 'warning');
        
        try {
            // Charger les USL manquantes
            const newUSLCount = await loadUSLForSpecificBounds(selectionBounds);
            
            if (newUSLCount > 0) {
                showStatus(`${newUSLCount} USL supplémentaires chargées`, 'info');
                
                // Mettre à jour l'affichage des USL en debug si nécessaire
                if (!isInUSLMode()) {
                    updateUSLDisplayForDebug();
                }
            }
            

            
        } catch (error) {

            showStatus('Erreur lors du chargement des USL', 'error');
            window.isValidationInProgress = false;
            if (validateBtn) { validateBtn.disabled = false; }
            return;
        }
    } else {

    }
    
    // Lancer la conversion
    showStatus('Conversion en cours...', 'warning');
    convertTempSelectionToUSL();
    // Déverrouiller immédiatement après le déclenchement de conversion
    window.isValidationInProgress = false;
    if (validateBtn) { validateBtn.disabled = false; }
    
    // Après conversion, basculer automatiquement en mode USL
    setTimeout(() => {
        const selector = document.getElementById('zone-type');
        if (selector && selector.value !== 'mediaposte') {
            window.isConversionInProgress = true;
            selector.value = 'mediaposte';
            // Créer un événement simulé pour handleZoneTypeChange
            const fakeEvent = {
                target: selector,
                skipConfirmation: true,
                skipZoom: true
            };
            handleZoneTypeChange(fakeEvent);
            
            // AJOUTER : Forcer la mise à jour de l'UI après conversion
            updateUIVisibilityForMode();
        }
    }, 100);
}

// ===== GESTION DU CHANGEMENT DE TYPE DE ZONE =====

/**
 * Gestion du changement de type de zone
 */
function handleZoneTypeChange(event) {
    const newType = event.target.value;
    const oldType = GLOBAL_STATE.currentZoneType;
    
    if (newType === oldType) return;
    
    // NOUVEAU : Désactiver le listener moveend AVANT de définir le flag
    if (window.moveEndHandler && APP.map) {
        APP.map.off('moveend', window.moveEndHandler);
        console.log('[UI] Listener moveend désactivé au début du changement');
    }
    
    // Activer le flag pour éviter la race condition
    GLOBAL_STATE.isChangingZoneType = true;
    
    // Skip les confirmations si demandé (après conversion automatique)
    const skipConfirm = event.skipConfirmation === true;
    
    // Si une sélection existe, afficher une popup personnalisée au lieu du prompt système
    const needsUSLConfirm = (!skipConfirm && oldType === 'mediaposte' && GLOBAL_STATE.finalUSLSelection.size > 0);
    const needsTempConfirm = (!skipConfirm && oldType !== 'mediaposte' && GLOBAL_STATE.tempSelection.size > 0);
    if (needsUSLConfirm || needsTempConfirm) {
        // Stocker les infos de changement en attente
        GLOBAL_STATE.__pendingZoneType = newType;
        GLOBAL_STATE.__pendingClear = needsUSLConfirm ? 'final' : 'temp';
        GLOBAL_STATE.__pendingSkipZoom = event && event.skipZoom === true;
        
        // Ouvrir la popup custom
        if (typeof openZoneTypeConfirmPopup === 'function') {
            openZoneTypeConfirmPopup(needsUSLConfirm);
        }
        
        // Revenir visuellement à l'ancien type et annuler l'état temporaire
        event.target.value = oldType;
        GLOBAL_STATE.isChangingZoneType = false;
        if (window.moveEndHandler && APP.map) {
            APP.map.on('moveend', window.moveEndHandler);
        }
        return;
    }
    
    // Effacer la sélection si nécessaire (pas de confirmation requise)
    // USL -> France
    if (oldType === 'mediaposte' && GLOBAL_STATE.finalUSLSelection.size > 0) {
        clearFinalSelection();
    }
    // France -> autre type avec sélection temp
    if (oldType !== 'mediaposte' && GLOBAL_STATE.tempSelection.size > 0) {
        clearTempSelection();
    }
    
    // Effectuer le changement
    // NOUVEAU : Mémoriser les types avant le changement
    const wasUSL = oldType === 'mediaposte';
    const isGoingToUSL = newType === 'mediaposte';
    
    // Mémoriser le dernier type non-USL
    if (!wasUSL) {
        GLOBAL_STATE.lastNonUSLType = oldType;
    }
    GLOBAL_STATE.lastZoneType = oldType;
    
    GLOBAL_STATE.currentZoneType = newType;
    // Vider le cache USL quand on passe en mode France (nouveau flux) et purger les bounds USL
    if (newType !== 'mediaposte') {
        if (GLOBAL_STATE.uslCache && GLOBAL_STATE.uslCache.size > 0) {
            GLOBAL_STATE.uslCache.clear();
        }
        // Purger aussi les bounds USL enregistrées
        GLOBAL_STATE.loadedBounds = GLOBAL_STATE.loadedBounds.filter(b => b.type !== 'mediaposte');
        
        // IMPORTANT : Effacer immédiatement les USL de la carte
        if (APP.map && APP.map.getSource('zones-usl')) {
            APP.map.getSource('zones-usl').setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    } else if (newType === 'mediaposte') {
        // Si on passe EN mode USL, effacer les zones France de la carte
        if (APP.map) {
            ['zones-france', 'zones-france-superior'].forEach(sourceId => {
                if (APP.map.getSource(sourceId)) {
                    APP.map.getSource(sourceId).setData({
                        type: 'FeatureCollection',
                        features: []
                    });
                }
            });
        }
    }
    
    // Nettoyer les caches AVANT le changement de zoom
    clearCacheForTypeChange();
    
    // Appliquer le zoom par défaut pour le nouveau type (animation courte)
    // Sauf si on vient d'une conversion vers USL, ou si le caller demande skipZoom
    if (!(window.isConversionInProgress && newType === 'mediaposte') && !(event && event.skipZoom === true)) {
        try {
            if (window.APP && APP.map && typeof getCurrentZoneLimits === 'function') {
                const limits = getCurrentZoneLimits();
                if (limits && typeof limits.DEFAULT_ZOOM_ON_CHANGE === 'number') {
                    const newZoom = limits.DEFAULT_ZOOM_ON_CHANGE;

                    APP.map.easeTo({ zoom: newZoom, duration: 500 });
                }
            }
        } catch (e) {

        }
    } else {

    }
    
    // Si on vient d'une conversion ET qu'on passe en mode USL, ne pas recharger
    if (window.isConversionInProgress && newType === 'mediaposte') {
        
        updateSelectionDisplay();
        updateValidateButton();
        GLOBAL_STATE.isChangingZoneType = false; // Désactiver le flag car on sort prématurément
        
        // Réactiver le listener moveend car on sort prématurément
        if (window.moveEndHandler && APP.map) {
            APP.map.on('moveend', window.moveEndHandler);
            console.log('[UI] Listener moveend réactivé (sortie prématurée)');
        }
        
        return;
    }
    
    showStatus(`Basculement vers ${getCurrentZoneConfig().label}`, 'success');
    
    // IMPORTANT : Toujours mettre à jour l'affichage après changement de type
    updateMapWithAllCachedZones();
    
    // REMPLACER tous les appels dispersés par UN SEUL APPEL :
    updateUIVisibilityForMode();
    
    // Recharger les zones avec forceUpdate
    // Attendre un peu plus longtemps pour s'assurer que l'animation est terminée
    setTimeout(() => {
        // Réactiver le listener moveend AVANT de charger
        if (window.moveEndHandler && APP.map) {
            APP.map.on('moveend', window.moveEndHandler);
            console.log('[UI] Listener moveend réactivé');
        }
        
        loadZonesForCurrentView(true);
        
        // Désactiver le flag après le chargement
        setTimeout(() => {
            GLOBAL_STATE.isChangingZoneType = false;
        }, 100);
    }, 600); // 600ms > durée de l'animation (500ms)
}

// ===== POPUP CONFIRMATION CHANGEMENT DE TYPE =====
function openZoneTypeConfirmPopup(isUSLSelection) {
    const popup = document.getElementById('popup-zone-type-confirm');
    const msg = document.getElementById('zone-type-confirm-message');
    if (!popup) return;
    if (msg) {
        msg.innerText = isUSLSelection
            ? 'Changer de type de zone va vider votre sélection USL. Continuer ?'
            : 'Changer de type de zone va vider votre sélection en cours. Continuer ?';
    }
    // Positionner comme la popup reset (180px, 100px) et ajuster si besoin
    popup.style.left = '180px';
    popup.style.top = '100px';
    popup.style.transform = 'none';
    popup.style.right = 'auto';
    popup.style.display = 'block';
    popup.classList.add('active');
    setTimeout(() => {
        const rect = popup.getBoundingClientRect();
        const appContainer = document.getElementById('app') || document.getElementById('map-container');
        if (appContainer) {
            const containerRect = appContainer.getBoundingClientRect();
            if (rect.right > containerRect.right) {
                popup.style.left = 'auto';
                popup.style.right = '20px';
            }
            if (rect.bottom > containerRect.bottom) {
                popup.style.top = (containerRect.height - rect.height - 20) + 'px';
            }
        }
    }, 10);
}

function closeZoneTypeConfirmPopup() {
    const popup = document.getElementById('popup-zone-type-confirm');
    if (popup) {
        popup.classList.remove('active');
        popup.style.display = 'none';
    }
}

window.cancelZoneTypeChange = function() {
    closeZoneTypeConfirmPopup();
    // Rien d'autre: on a déjà restauré l'ancien type dans le sélecteur
    GLOBAL_STATE.__pendingZoneType = null;
    GLOBAL_STATE.__pendingClear = null;
    GLOBAL_STATE.__pendingSkipZoom = null;
};

window.confirmZoneTypeChange = function() {
    const newType = GLOBAL_STATE.__pendingZoneType;
    const clearTarget = GLOBAL_STATE.__pendingClear;
    const skipZoomFlag = GLOBAL_STATE.__pendingSkipZoom === true;
    closeZoneTypeConfirmPopup();
    if (!newType) return;
    
    // Nettoyer la sélection selon le cas
    if (clearTarget === 'final') {
        if (typeof clearFinalSelection === 'function') clearFinalSelection();
    } else if (clearTarget === 'temp') {
        if (typeof clearTempSelection === 'function') clearTempSelection();
    }
    
    // Déclencher le changement sans re-demander de confirmation
    const selector = document.getElementById('zone-type');
    if (selector) {
        selector.value = newType;
        handleZoneTypeChange({ target: selector, skipConfirmation: true, skipZoom: skipZoomFlag });
    }
    
    GLOBAL_STATE.__pendingZoneType = null;
    GLOBAL_STATE.__pendingClear = null;
    GLOBAL_STATE.__pendingSkipZoom = null;
};

// ===== AFFICHAGE DES MESSAGES =====

/**
 * Affichage des messages de statut
 */
function showStatus(message, type = 'success') {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = 'status-message active ' + type;
    
    setTimeout(() => {
        statusEl.classList.remove('active');
    }, 3000);
    

}

/**
 * Affichage de l'estimation pendant les outils
 */
function showEstimation(count) {
    const tool = GLOBAL_STATE.currentTool;
    
    if (window.updateEstimation) {
        window.updateEstimation(tool, count);
    }
}

/**
 * Masquage de l'estimation
 */
function hideEstimation() {
    ['circle', 'isochrone', 'polygon'].forEach(tool => {
        const estimationBox = document.getElementById(tool + '-estimation');
        if (estimationBox) {
            estimationBox.style.display = 'none';
        }
    });
}

// ===== MISE À JOUR DES COMPTEURS =====

/**
 * Mise à jour de l'affichage de la sélection
 */
function updateSelectionDisplay(skipWebDevUpdate = false) {
    const counter = document.getElementById('selection-counter');
    const countElement = document.getElementById('selection-count');
    const labelElement = document.getElementById('selection-label');
    const foyersElement = document.getElementById('foyers-count');
    const foyersInfo = document.getElementById('foyers-info');
    
    if (!counter || !countElement || !labelElement) return;
    
    let count = 0;
    let label = '';
    let showFoyers = false;
    
    if (isInUSLMode()) {
        // Mode USL : afficher la sélection finale
        count = GLOBAL_STATE.finalUSLSelection.size;
        label = count === 1 ? 'zone USL sélectionnée' : 'zones USL sélectionnées';
        showFoyers = true;
        
        if (foyersElement) {
            foyersElement.textContent = GLOBAL_STATE.totalSelectedFoyers.toLocaleString();
        }
    } else {
        // Mode non-USL : afficher la sélection temporaire
        count = GLOBAL_STATE.tempSelection.size;
        const zoneConfig = getCurrentZoneConfig();
        label = count === 1 ? `${zoneConfig.label.slice(0, -1)} sélectionné` : `${zoneConfig.label} sélectionnés`;
        showFoyers = false;
    }
    
    countElement.textContent = count;
    labelElement.textContent = label;
    
    if (foyersInfo) {
        foyersInfo.style.display = showFoyers && GLOBAL_STATE.totalSelectedFoyers > 0 ? 'inline' : 'none';
    }
    
    // Gérer la visibilité du compteur
    if (count > 0) {
        counter.classList.add('active');
    } else {
        counter.classList.remove('active');
    }
    
    // Mettre à jour le bouton de validation
    updateValidateButton();
    // Mettre à jour la visibilité des actions flottantes
    if (typeof updateActionButtonsVisibility === 'function') {
        updateActionButtonsVisibility();
    }
}

/**
 * Met à jour la visibilité des boutons d'action (reset / recentrer)
 */
function updateActionButtonsVisibility() {
    const resetBtn = document.getElementById('reset-btn');
    const recenterSelectionBtn = document.getElementById('recenter-selection-btn');
    const recenterStoreBtn = document.getElementById('recenter-store-btn');
    if (!resetBtn || !recenterSelectionBtn || !recenterStoreBtn || !window.APP || !APP.map) return;
    
    const hasUSLSelected = GLOBAL_STATE.finalUSLSelection && GLOBAL_STATE.finalUSLSelection.size > 0;
    const hasTempSelected = GLOBAL_STATE.tempSelection && GLOBAL_STATE.tempSelection.size > 0;
    
    // 1) Reset: visible uniquement si au moins une USL est sélectionnée
    if (hasUSLSelected) resetBtn.classList.remove('hidden'); else resetBtn.classList.add('hidden');
    
    // 2) Recentrer sélection: visible si une sélection existe (USL ou temp), quel que soit le viewport
    if (hasUSLSelected || hasTempSelected) recenterSelectionBtn.classList.remove('hidden'); else recenterSelectionBtn.classList.add('hidden');
    
    // 3) Recentrer point de vente: visible uniquement si un magasin est défini ET complètement hors viewport
    let storeOutOfView = false;
    if (GLOBAL_STATE.storeLocation && Array.isArray(GLOBAL_STATE.storeLocation)) {
        const mapBounds = APP.map.getBounds();
        const [lng, lat] = GLOBAL_STATE.storeLocation;
        // le point est hors écran s'il est en dehors des bounds courants
        storeOutOfView = lat < mapBounds.getSouth() || lat > mapBounds.getNorth() || lng < mapBounds.getWest() || lng > mapBounds.getEast();
    }
    if (storeOutOfView) recenterStoreBtn.classList.remove('hidden'); else recenterStoreBtn.classList.add('hidden');
}

// ===== GESTION DES POPUPS OUTILS =====

/**
 * Mise à jour des sliders et affichages
 */
function updateCircleRadiusDisplay() {
    const slider = document.getElementById('circle-radius');
    const display = document.getElementById('circle-radius-display');
    
    if (slider && display) {
        const value = parseFloat(slider.value);
        const formatted = value < 1 ? value.toFixed(2) : value.toString();
        display.textContent = formatted + ' km';
        return value;
    }
    
    return 1.5; // valeur par défaut
}

/**
 * Récupération des paramètres isochrone
 */
function getIsochroneParams() {
    // Récupérer le mode de transport sélectionné
    const transportRadio = document.querySelector('input[name="transport-mode"]:checked');
    const timeSlider = document.getElementById('time-range');
    
    return {
        transport: transportRadio ? transportRadio.value : 'driving',
        time: timeSlider ? parseInt(timeSlider.value) : 10
    };
}

// ===== GESTION DES ONGLETS IMPORT =====

/**
 * Changement d'onglet dans la popup d'import
 */
function switchImportTab(tab) {
    // Désactiver tous les onglets
    document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.import-content').forEach(c => c.classList.remove('active'));
    
    // Activer le contenu demandé
    const contentId = 'import-' + tab;
    const content = document.getElementById(contentId);
    if (content) {
        content.classList.add('active');
    }
    
    // Activer visuellement le bon onglet sans dépendre de event
    const tabs = Array.from(document.querySelectorAll('.import-tab'));
    if (tab === 'codes' && tabs[0]) tabs[0].classList.add('active');
    if (tab === 'file' && tabs[1]) tabs[1].classList.add('active');
}

// ===== GESTION DES POPUPS DÉPLAÇABLES =====

let draggedElement = null;
let dragOffset = { x: 0, y: 0 };

function startDrag(e, popupId) {
    draggedElement = document.getElementById(popupId);
    
    if (!draggedElement.style.left || !draggedElement.style.top) {
        const rect = draggedElement.getBoundingClientRect();
        draggedElement.style.left = rect.left + 'px';
        draggedElement.style.top = rect.top + 'px';
    }
    
    dragOffset.x = e.clientX - parseInt(draggedElement.style.left);
    dragOffset.y = e.clientY - parseInt(draggedElement.style.top);
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
}

function onDrag(e) {
    if (!draggedElement) return;
    
    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;
    
    const rect = draggedElement.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    
    draggedElement.style.left = x + 'px';
    draggedElement.style.top = y + 'px';
}

function stopDrag() {
    draggedElement = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
}

// ===== GESTION DES POPUPS =====

function closePopup(tool) {
    const popup = document.getElementById('popup-' + tool);
    if (popup) {
        popup.classList.remove('active');
    }
    
    // Désactiver les boutons d'outils
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    
    // Retour au mode manuel UNIQUEMENT pour les popups d'outils (éviter reset/import/adresse)
    if (typeof switchTool !== 'undefined') {
        const toolPopups = ['circle', 'isochrone', 'polygon'];
        if (toolPopups.includes(tool)) {
            switchTool('manual');
        }
    }
}

// ===== NETTOYAGE DES SÉLECTIONS =====

/**
 * Vider la sélection finale USL
 */
function clearFinalSelection() {
    GLOBAL_STATE.finalUSLSelection.clear();
    GLOBAL_STATE.totalSelectedFoyers = 0;
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
}

/**
 * Vider la sélection temporaire
 */
function clearTempSelection() {
    GLOBAL_STATE.tempSelection.clear();
    GLOBAL_STATE.tempSelectedCount = 0;
    GLOBAL_STATE.isInTempMode = false;
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
}

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.updateValidateButton = updateValidateButton;
window.validateTempSelection = validateTempSelection;
window.handleZoneTypeChange = handleZoneTypeChange;
window.showStatus = showStatus;
window.showEstimation = showEstimation;
window.hideEstimation = hideEstimation;
window.updateSelectionDisplay = updateSelectionDisplay;
window.updateActionButtonsVisibility = updateActionButtonsVisibility;
window.updateToolbarVisibility = updateToolbarVisibility;
window.updateSearchButtonVisibility = updateSearchButtonVisibility;
window.updateCircleRadiusDisplay = updateCircleRadiusDisplay;
window.getIsochroneParams = getIsochroneParams;
window.switchImportTab = switchImportTab;
window.startDrag = startDrag;
window.closePopup = closePopup;
window.clearFinalSelection = clearFinalSelection;
window.clearTempSelection = clearTempSelection;

/**
 * Gère le changement d'état du switch des libellés
 * @param {Event} event - L'événement de changement
 */
function handleLabelsSwitchChange(event) {
    const showLabels = event.target.checked;

    
    // Vérifier que ce n'est pas le mode USL
    if (GLOBAL_STATE.currentZoneType === 'mediaposte') {

        event.target.checked = false;
        showStatus('Les libellés ne sont pas disponibles en mode USL', 'warning');
        return;
    }
    
    // Appliquer le changement
    if (window.toggleLabelsVisibility) {
        window.toggleLabelsVisibility(showLabels);
    }
    
    // Sauvegarder la préférence
    localStorage.setItem('mediaposte-show-labels', showLabels);
}

/**
 * Réinitialise toutes les sélections
 */
function resetSelection() {

    
    // Ouvrir la popup de confirmation
    const popup = document.getElementById('popup-reset-confirm');
    if (popup) {
        popup.classList.add('active');
        
        // Position par défaut
        if (!popup.style.left || popup.style.left === 'auto') {
            popup.style.left = '180px';
            popup.style.top = '100px';
            popup.style.transform = 'none';
            popup.style.right = 'auto';
        }
        
        // Ajuster la position si elle sort de l'écran
        setTimeout(() => {
            const rect = popup.getBoundingClientRect();
            const appContainer = document.getElementById('app') || document.getElementById('map-container');
            
            if (appContainer) {
                const containerRect = appContainer.getBoundingClientRect();
                
                // Vérifier si la popup sort à droite
                if (rect.right > containerRect.right) {
                    popup.style.left = 'auto';
                    popup.style.right = '20px';
                }
                
                // Vérifier si la popup sort en bas
                if (rect.bottom > containerRect.bottom) {
                    popup.style.top = (containerRect.height - rect.height - 20) + 'px';
                }
            }
        }, 10);
    }
}

/**
 * Confirme la réinitialisation (appelée depuis la popup)
 */
function confirmReset(skipWebDevUpdate = true) {
    
    // Fermer la popup
    closePopup('reset-confirm');
    
    // Effacer les sélections
    if (window.clearFinalSelection) { window.clearFinalSelection(); }
    if (window.clearTempSelection) { window.clearTempSelection(); }
    
    // Mettre à jour l'affichage
    if (window.updateSelectionDisplay) { window.updateSelectionDisplay(skipWebDevUpdate); }
    
    // Afficher un message de confirmation
    if (window.showStatus) {
        window.showStatus('Sélection réinitialisée', 'success');
    }
}

/**
 * Ouvre le popup de modification d'adresse
 */
function openAddressPopup() {
    // Cette fonction sera implémentée dans la phase 5 (popups)
    if (window.showStatus) {
        window.showStatus('Fonctionnalité en cours de développement', 'info');
    }
}

// Exporter les fonctions
window.handleLabelsSwitchChange = handleLabelsSwitchChange;
window.resetSelection = resetSelection;
window.confirmReset = confirmReset;
window.openAddressPopup = openAddressPopup;

console.log('✅ Module UI-MANAGER Médiaposte chargé');