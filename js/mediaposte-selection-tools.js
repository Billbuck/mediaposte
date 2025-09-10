// ===== OUTILS SÉLECTION MÉDIAPOSTE =====

// ===== GESTION DES OUTILS =====
// Utilitaires logs horodatés et contrôle de concurrence pour isochrone
function isoTs() { return new Date().toISOString(); }
let currentIsochroneRequestId = 0;
let currentIsochroneAbortController = null;

/**
 * Changement d'outil de sélection
 */
function switchTool(tool) {
    performToolSwitch(tool);
}

/**
 * Exécution du changement d'outil
 */
function performToolSwitch(tool) {
    // Vider la sélection USL si on active un outil de dessin en mode USL
    if ((tool === 'circle' || tool === 'isochrone' || tool === 'polygon')
        && typeof isInUSLMode === 'function' && isInUSLMode()
        && GLOBAL_STATE.finalUSLSelection && GLOBAL_STATE.finalUSLSelection.size > 0) {
        if (typeof clearFinalSelection === 'function') {
            clearFinalSelection();
        } else {
            GLOBAL_STATE.finalUSLSelection.clear();
            GLOBAL_STATE.totalSelectedFoyers = 0;
            if (typeof updateSelectionDisplay === 'function') updateSelectionDisplay();
            if (typeof updateSelectedZonesDisplay === 'function') updateSelectedZonesDisplay();
        }
    }

    GLOBAL_STATE.currentTool = tool;
    
    // Nettoyer les outils précédents
    hideCircle();
    hideIsochrone();
    hideEstimation();
    
    // Effacer le polygone si on change d'outil (sécurisé)
    if (tool !== 'polygon' && APP && APP.draw && typeof APP.draw.deleteAll === 'function') {
        try {
            APP.draw.deleteAll();
        } catch (e) {
            console.warn('[DRAW] deleteAll échoué:', e);
        }
        GLOBAL_STATE.currentPolygonId = null;
    }
    
    // Gérer le mode Draw pour polygone
    if (tool === 'polygon') {
        // S'assurer que Draw est initialisé/ajouté
        if (typeof initializeDrawTool === 'function') {
            try { initializeDrawTool(); } catch(_) {}
        }
        // Activer le mode dès que le contrôle est monté
        setTimeout(() => {
            const isMounted = (APP?.map?._controls||[]).includes(APP?.draw);
            if (APP && APP.draw && isMounted) {
                try {
                    APP.draw.changeMode('draw_polygon');
                    // TODO: Retirer après période de rodage (date: fin janvier 2025)
                    console.info('[DRAW] Mode polygone activé');
                } catch(_) {}
            } else {
                // TODO: Retirer après période de rodage (date: fin janvier 2025)
                console.warn('[DRAW] Contrôle non monté, retry...');
                setTimeout(() => {
                    const mounted = (APP?.map?._controls||[]).includes(APP?.draw);
                    if (APP && APP.draw && mounted) {
                        try {
                            APP.draw.changeMode('draw_polygon');
                            // TODO: Retirer après période de rodage (date: fin janvier 2025)
                            console.info('[DRAW] Mode polygone activé');
                        } catch(_) {}
                    }
                }, 300);
            }
        }, 100);
        showStatus('Cliquez sur la carte pour dessiner un polygone', 'warning');
    } else if (APP && APP.draw) {
        try { APP.draw.changeMode('simple_select'); } catch(_) {}
    }
    
    // Affichage automatique du cercle si outil cercle et adresse valide
    if (tool === 'circle' && GLOBAL_STATE.storeLocation) {
        GLOBAL_STATE.circleCenter = GLOBAL_STATE.storeLocation;
        const circleGeoJSON = showCircleOnMap();
        
        if (circleGeoJSON) {
            // NOUVEAU: Recentrage avec offset horizontal et padding triplé
            try {
                const bbox = turf.bbox(circleGeoJSON);
                const padding = { top: 100, bottom: 100, left: 100, right: 100 };
                if (APP.map && typeof APP.map.cameraForBounds === 'function') {
                    const camera = APP.map.cameraForBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding });
                    if (camera && camera.center) {
                        const widthLng = bbox[2] - bbox[0];
                        const offsetLng = widthLng * 0.25; // décalage vers la droite (25% largeur)
                        const adjustedCenter = { lng: camera.center.lng - offsetLng, lat: camera.center.lat };
                        APP.map.easeTo({ center: adjustedCenter, zoom: camera.zoom, duration: 800 });
                    } else {
                        APP.map.fitBounds(bbox, { padding, duration: 800 });
                    }
                } else {
                    APP.map.fitBounds(bbox, { padding, duration: 800 });
                }
            } catch (_) {
                // Fallback
                fitMapToGeometry(APP.map, circleGeoJSON);
            }
            debouncedPrecount(circleGeoJSON);
        }
    }
    
    // Affichage automatique de l'isochrone si outil isochrone et adresse valide
    if (tool === 'isochrone' && GLOBAL_STATE.storeLocation) {
        (async () => {
            await updateIsochronePreview();
            try {
                if (GLOBAL_STATE.isochroneData) {
                    const bbox = turf.bbox(GLOBAL_STATE.isochroneData);
                    const padding = { top: 100, bottom: 100, left: 300, right: 100 };
                    if (APP.map && typeof APP.map.cameraForBounds === 'function') {
                        const camera = APP.map.cameraForBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding });
                        if (camera && camera.center) {
                            const rawZoom = typeof camera.zoom === 'number' ? camera.zoom : APP.map.getZoom();
                            const steppedZoom = Math.round(rawZoom / 0.25) * 0.25;
                            if (APP.map && typeof APP.map.isMoving === 'function' && APP.map.isMoving()) {
                                try { APP.map.stop(); console.log(`[ISOCHRONE ${isoTs()}] Stop animation précédente avant recentrage (activation outil)`); } catch(_) {}
                            }
                            // Saut instantané pour éviter un zoom intermédiaire non-steppé
                            APP.map.jumpTo({ center: camera.center, zoom: steppedZoom });
                        } else {
                            APP.map.fitBounds(bbox, { padding, duration: 800 });
                        }
                    } else {
                        APP.map.fitBounds(bbox, { padding, duration: 800 });
                    }
                }
            } catch (_) {}
        })();
    }
    
    
}

// ===== OUTIL CERCLE =====

/**
 * Activation du mode outil cercle
 */
function activateTool(tool) {
    // Empêcher le rechargement de la page
    if (typeof event !== 'undefined' && event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Désactiver tous les boutons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Fermer toutes les popups
    document.querySelectorAll('.popup').forEach(popup => popup.classList.remove('active'));
    
    // Activer le bouton correspondant
    document.querySelectorAll('.tool-btn').forEach(btn => {
        if (btn.dataset.tool === tool) {
            btn.classList.add('active');
        }
    });
    
    const popup = document.getElementById('popup-' + tool);
    if (popup) {
        // Position par défaut comme dans Zecible
        if (!popup.style.left || popup.style.left === 'auto') {
            popup.style.left = ((tool === 'circle' || tool === 'isochrone' || tool === 'polygon') ? '100px' : '180px');
            popup.style.top = '100px';
            popup.style.transform = 'none';
            popup.style.right = 'auto';
        }
        
        popup.classList.add('active');
        
        // Vérifier après l'affichage si la popup est visible et ajuster si nécessaire
        setTimeout(() => {
            const rect = popup.getBoundingClientRect();
            
            // Si la popup sort à droite
            if (rect.right > window.innerWidth - 20) {
                popup.style.left = (window.innerWidth - rect.width - 20) + 'px';
            }
            
            // Si la popup sort en bas
            if (rect.bottom > window.innerHeight - 20) {
                popup.style.top = (window.innerHeight - rect.height - 20) + 'px';
            }
        }, 10);
    }
    
    // Appeler la fonction de changement d'outil
    switchTool(tool);
    
    return false;
}

/**
 * Mise à jour du rayon du cercle
 */
function updateCircleRadius() {
    GLOBAL_STATE.circleRadius = updateCircleRadiusDisplay();
    
    if (GLOBAL_STATE.circleCenter) {
        const circleGeoJSON = showCircleOnMap();
        
        if (circleGeoJSON) {
            // NOUVEAU: Recentrage avec offset horizontal et padding triplé à chaque changement de rayon
            try {
                const bbox = turf.bbox(circleGeoJSON);
                const padding = { top: 100, bottom: 100, left: 100, right: 100 };
                if (APP.map && typeof APP.map.cameraForBounds === 'function') {
                    const camera = APP.map.cameraForBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding });
                    if (camera && camera.center) {
                        const widthLng = bbox[2] - bbox[0];
                        const offsetLng = widthLng * 0.25; // décalage vers la droite (25%)
                        const adjustedCenter = { lng: camera.center.lng - offsetLng, lat: camera.center.lat };
                        APP.map.easeTo({ center: adjustedCenter, zoom: camera.zoom, duration: 400 });
                    } else {
                        APP.map.fitBounds(bbox, { padding, duration: 400 });
                    }
                } else {
                    APP.map.fitBounds(bbox, { padding, duration: 400 });
                }
            } catch (_) {
                fitMapToGeometry(APP.map, circleGeoJSON);
            }
            debouncedPrecount(circleGeoJSON);
        }
    }
}

/**
 * Mise à jour de l'aperçu du cercle
 */
function updateCirclePreview() {
    updateCircleRadius();
}

/**
 * Validation de la sélection cercle
 */
function validateCircleSelection() {
    if (!GLOBAL_STATE.storeLocation) {
        showStatus('Aucun point de vente défini', 'error');
        return;
    }
    
    const count = selectZonesInCircle(GLOBAL_STATE.circleCenter, GLOBAL_STATE.circleRadius);
    
    // Retour au mode manuel
    setTimeout(() => {
        performToolSwitch('manual');
        if (window.closePopup) {
            closePopup('circle');
        }
        // NOUVEAU: Recentrer la carte sur les USL sélectionnées après validation
        if (typeof window.recenterOnSelection === 'function') {
            try { window.recenterOnSelection(60); } catch (_) {}
        }
    }, 500);
}

// --- Contrôles +/- pour le rayon du cercle (affichage immédiat + debounce mise à jour) ---
let circleUpdateTimeout = null;

function getCircleStep(value) {
    const v = typeof value === 'number' ? value : parseFloat(value) || 1.5;
    if (v < 2) return 0.25;     // [0.25, 2)
    if (v < 4) return 0.5;      // [2, 4)
    if (v < 10) return 1;       // [4, 10)
    if (v < 20) return 2;       // [10, 20)
    return 5;                   // [20, 50]
}

function roundToStep(value, step) {
    return Math.round(value / step) * step;
}

function scheduleCircleUpdate() {
    const input = document.getElementById('circle-radius');
    if (!input) return;
    let value = parseFloat(input.value);
    if (isNaN(value)) value = 1.5;
    value = Math.max(0.25, Math.min(50, value));
    const step = getCircleStep(value);
    value = roundToStep(value, step);
    input.value = value;
    if (typeof updateCircleRadiusDisplay === 'function') updateCircleRadiusDisplay();
    if (circleUpdateTimeout) {
        clearTimeout(circleUpdateTimeout);
    }
    circleUpdateTimeout = setTimeout(() => {
        try { updateCirclePreview(); } catch(_) {}
        circleUpdateTimeout = null;
    }, 350);
}

function incrementCircleRadius() {
    const input = document.getElementById('circle-radius');
    if (!input) return;
    const before = parseFloat(input.value) || 1.5;
    const step1 = getCircleStep(before);
    let rawAfter = before + step1;
    rawAfter = Math.max(0.25, Math.min(50, rawAfter));
    const step2 = getCircleStep(rawAfter);
    const after = roundToStep(rawAfter, step2);
    input.value = after;
    scheduleCircleUpdate();
}

function decrementCircleRadius() {
    const input = document.getElementById('circle-radius');
    if (!input) return;
    const before = parseFloat(input.value) || 1.5;
    const step1 = getCircleStep(before);
    let rawAfter = before - step1;
    rawAfter = Math.max(0.25, Math.min(50, rawAfter));
    const step2 = getCircleStep(rawAfter);
    const after = roundToStep(rawAfter, step2);
    input.value = after;
    scheduleCircleUpdate();
}

// ===== OUTIL ISOCHRONE =====

/**
 * Mise à jour de l'aperçu de l'isochrone en temps réel
 */
async function updateIsochronePreview() {
    if (!GLOBAL_STATE.storeLocation || GLOBAL_STATE.currentTool !== 'isochrone') {
        return;
    }
    const startedAt = isoTs();
    const requestId = ++currentIsochroneRequestId;

    // Annuler une requête précédente si encore en vol
    if (currentIsochroneAbortController) {
        try { currentIsochroneAbortController.abort(); } catch(_) {}
    }
    currentIsochroneAbortController = new AbortController();

    showStatus('Calcul de l\'isochrone...', 'warning');
    
    try {
        const params = getIsochroneParams();
        const profile = params.transport === 'driving' ? 'driving' : 
                       params.transport === 'cycling' ? 'cycling' : 'walking';
        
        const url = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${GLOBAL_STATE.storeLocation[0]},${GLOBAL_STATE.storeLocation[1]}?contours_minutes=${params.time}&polygons=true&access_token=${CONFIG.MAPBOX_TOKEN}`;
        const response = await fetch(url, { signal: currentIsochroneAbortController.signal });
        const data = await response.json();

        // Si une nouvelle requête a été lancée depuis, ignorer cette réponse
        if (requestId !== currentIsochroneRequestId) {
            return;
        }
        
        if (data.features && data.features.length > 0) {
            GLOBAL_STATE.isochroneData = data.features[0];
            showIsochroneOnMap();
            
            // Recentrage avec padding asymétrique et zoom pas 0,25
            try {
                const bbox = turf.bbox(GLOBAL_STATE.isochroneData);
                const padding = { top: 100, bottom: 100, left: 300, right: 100 };
                if (APP.map && typeof APP.map.cameraForBounds === 'function') {
                    const camera = APP.map.cameraForBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding });
                    if (camera && camera.center) {
                        const rawZoom = typeof camera.zoom === 'number' ? camera.zoom : APP.map.getZoom();
                        const steppedZoom = Math.round(rawZoom / 0.25) * 0.25;
                        if (APP.map && typeof APP.map.isMoving === 'function' && APP.map.isMoving()) {
                            try { APP.map.stop(); } catch(_) {}
                        }
                        // Supprimer l'auto-chargement déclenché par moveend pour ce recentrage
                        if (window.GLOBAL_STATE) { GLOBAL_STATE.suppressMoveLoad = true; }
                        // Saut instantané pour éviter un zoom intermédiaire non-steppé
                        APP.map.jumpTo({ center: camera.center, zoom: steppedZoom });
                    } else {
                        APP.map.fitBounds(bbox, { padding, duration: 600 });
                    }
                } else {
                    APP.map.fitBounds(bbox, { padding, duration: 600 });
                }
            } catch (_) {
                fitMapToGeometry(APP.map, GLOBAL_STATE.isochroneData);
            }
            debouncedPrecount(GLOBAL_STATE.isochroneData);
            
            showStatus('Isochrone calculée', 'success');
        } else {
            showStatus('Impossible de calculer l\'isochrone', 'error');
        }
        
    } catch (error) {
        if (error && error.name === 'AbortError') { return; }
        showStatus('Erreur lors du calcul de l\'isochrone', 'error');
        console.error('[ISOCHRONE ERROR]', error);
    } finally {
        if (requestId === currentIsochroneRequestId) {
            currentIsochroneAbortController = null;
        }
    }
}

/**
 * Mise à jour de l'affichage du temps
 */
function updateTimePreview() {
    const timeInput = document.getElementById('time-range');
    let value = parseInt(timeInput.value);
    value = Math.max(1, Math.min(60, value));
    timeInput.value = value;
    document.getElementById('time-display').textContent = value + ' minutes';
    // Calcul lancé via debounce
}

let isochroneUpdateTimeout = null;
function scheduleIsochroneUpdate() {
    const timeInput = document.getElementById('time-range');
    const value = Math.max(1, Math.min(60, parseInt(timeInput.value) || 10));
    timeInput.value = value;
    document.getElementById('time-display').textContent = value + ' minutes';
    if (isochroneUpdateTimeout) { clearTimeout(isochroneUpdateTimeout); }
    isochroneUpdateTimeout = setTimeout(() => {
        updateIsochronePreview();
        isochroneUpdateTimeout = null;
    }, 350);
}

function incrementIsochroneTime() { 
    const t=document.getElementById('time-range'); 
    const before = parseInt(t.value)||10; 
    const after = Math.min(60,before+1);
    t.value = after; 
    scheduleIsochroneUpdate(); 
}
function decrementIsochroneTime() { 
    const t=document.getElementById('time-range'); 
    const before = parseInt(t.value)||10; 
    const after = Math.max(1,before-1);
    t.value = after; 
    scheduleIsochroneUpdate(); 
}

/**
 * Validation de la sélection isochrone
 */
function validateIsochroneSelection() {
    if (!GLOBAL_STATE.isochroneData) {
        showStatus('Aucune isochrone à valider', 'error');
        return;
    }
    
    const count = selectZonesInIsochrone(GLOBAL_STATE.isochroneData);
    
    // Retour au mode manuel
    setTimeout(() => {
        performToolSwitch('manual');
        if (window.closePopup) {
            closePopup('isochrone');
        }
        if (typeof window.recenterOnSelection === 'function') {
            try { window.recenterOnSelection(60); } catch (_) {}
        }
    }, 500);
}

// ===== OUTIL POLYGONE =====

/**
 * Gestion de la création d'un polygone
 */
function handlePolygonCreate(e) {
    if (GLOBAL_STATE.currentTool !== 'polygon') return;
    
    const polygon = e.features[0];
    GLOBAL_STATE.currentPolygonId = polygon.id;
    
    if (APP.draw) {
        setTimeout(() => {
            APP.draw.changeMode('direct_select', { featureId: polygon.id });
        }, 100);
    }
    
    showStatus('Polygone créé - Ajustez-le puis validez', 'success');
    debouncedPrecount(polygon, 500);
}

/**
 * Gestion de la modification d'un polygone
 */
function handlePolygonUpdate(e) {
    if (GLOBAL_STATE.currentTool !== 'polygon') return;
    
    const polygon = e.features[0];
    debouncedPrecount(polygon, 500);
}

/**
 * Gestion de la suppression d'un polygone
 */
function handlePolygonDelete(e) {
    GLOBAL_STATE.currentPolygonId = null;
    hideEstimation();
}

/**
 * Validation de la sélection polygone
 */
function validatePolygonSelection() {
    if (!APP.draw) return;
    
    const allFeatures = APP.draw.getAll();
    
    if (!allFeatures.features || allFeatures.features.length === 0) {
        showStatus('Aucun polygone à valider', 'error');
        return;
    }
    
    const polygon = allFeatures.features[0];
    const count = selectZonesInPolygon(polygon);
    
    APP.draw.deleteAll();
    GLOBAL_STATE.currentPolygonId = null;
    
    // Retour au mode manuel
    setTimeout(() => {
        performToolSwitch('manual');
        if (window.closePopup) {
            closePopup('polygon');
        }
    }, 500);
}

/**
 * Effacement du polygone
 */
function clearPolygon() {
    if (APP && APP.draw && typeof APP.draw.deleteAll === 'function') {
        try { APP.draw.deleteAll(); } catch(_) {}
    }
    GLOBAL_STATE.currentPolygonId = null;
    GLOBAL_STATE.currentTool = 'polygon';
    hideEstimation();
    showStatus('Polygone effacé', 'warning');
    // Repasser immédiatement en mode dessin pour permettre un nouveau tracé
    if (APP && APP.draw && typeof APP.draw.changeMode === 'function') {
        try {
            // Laisser Mapbox Draw finaliser la suppression avant de relancer le mode
            setTimeout(() => { try { APP.draw.changeMode('draw_polygon'); } catch(_) {} }, 50);
        } catch(_) {}
    }
}

// ===== PRÉCOMPTAGE =====

/**
 * Précomptage avec debounce
 */
function debouncedPrecount(geometry, delay = CONFIG.TIMEOUTS.PRECOUNT_DELAY) {
    clearTimeout(GLOBAL_STATE.precountTimeout);
    
    GLOBAL_STATE.precountTimeout = setTimeout(() => {
        const result = calculateZonesInGeometry(geometry);
        
        if (isInUSLMode()) {
            showEstimation(result.totalFoyers);
        } else {
            showEstimation(result.zonesCount);
        }
    }, delay);
}

/**
 * Mise à jour du précomptage après chargement de nouvelles zones
 */
function updatePrecountAfterZoneLoad() {
    if (GLOBAL_STATE.currentTool === 'circle' && GLOBAL_STATE.circleCenter) {
        const circleGeoJSON = turf.circle(GLOBAL_STATE.circleCenter, GLOBAL_STATE.circleRadius, {units: 'kilometers'});
        debouncedPrecount(circleGeoJSON, 100);
    } else if (GLOBAL_STATE.currentTool === 'isochrone' && GLOBAL_STATE.isochroneData) {
        debouncedPrecount(GLOBAL_STATE.isochroneData, 100);
    } else if (GLOBAL_STATE.currentTool === 'polygon' && APP.draw) {
        const allFeatures = APP.draw.getAll();
        if (allFeatures.features && allFeatures.features.length > 0) {
            debouncedPrecount(allFeatures.features[0], 100);
        }
    }
}

// ===== CONFIGURATION DES ÉVÉNEMENTS DRAW =====

/**
 * Configuration des événements Draw (appelé après initialisation)
 */
function setupDrawEvents() {
    if (APP.map && APP.draw) {
        // Événements Draw pour les polygones
        try { APP.map.off('draw.create', handlePolygonCreate); } catch(_) {}
        try { APP.map.off('draw.update', handlePolygonUpdate); } catch(_) {}
        try { APP.map.off('draw.delete', handlePolygonDelete); } catch(_) {}

        APP.map.on('draw.create', handlePolygonCreate);
        APP.map.on('draw.update', handlePolygonUpdate);
        APP.map.on('draw.delete', handlePolygonDelete);
        
    }
}

// ===== RACCOURCIS CLAVIER =====

/**
 * Configuration des raccourcis clavier
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key.toLowerCase()) {
            case 'c':
                activateTool('circle');
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
        }
    });
}

// ===== FONCTION GLOBALE POUR METTRE À JOUR LES ESTIMATIONS =====

/**
 * Fonction globale pour mettre à jour les estimations
 */
window.updateEstimation = function(tool, value) {
    const estimationBox = document.getElementById(tool + '-estimation');
    const estimationValue = document.getElementById(tool + '-estimation-value');
    
    if (estimationBox && estimationValue) {
        if (value > 0) {
            estimationBox.style.display = 'block';
            
            if (isInUSLMode()) {
                estimationValue.textContent = value.toLocaleString() + ' foyers';
            } else {
                const zoneLabel = getCurrentZoneConfig().label;
                estimationValue.textContent = value.toLocaleString() + ' ' + (value === 1 ? zoneLabel.slice(0, -1) : zoneLabel);
            }
        } else {
            estimationBox.style.display = 'none';
        }
    }
};

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.activateTool = activateTool;
window.switchTool = switchTool;
window.updateCircleRadius = updateCircleRadius;
window.updateCirclePreview = updateCirclePreview;
window.validateCircleSelection = validateCircleSelection;
window.updateIsochronePreview = updateIsochronePreview;
window.updateTimePreview = updateTimePreview;
window.validateIsochroneSelection = validateIsochroneSelection;
window.handlePolygonCreate = handlePolygonCreate;
window.handlePolygonUpdate = handlePolygonUpdate;
window.handlePolygonDelete = handlePolygonDelete;
window.validatePolygonSelection = validatePolygonSelection;
window.clearPolygon = clearPolygon;
window.updatePrecountAfterZoneLoad = updatePrecountAfterZoneLoad;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;
window.setupDrawEvents = setupDrawEvents;