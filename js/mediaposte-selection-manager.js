// ===== GESTION SÉLECTION MÉDIAPOSTE =====

// ===== SÉLECTION PAR CLIC =====

// Garde anti double-traitement de clic USL (évite doublons quand plusieurs layers déclenchent)
let __lastUSLClick = { time: 0, id: null };

/**
 * Gestion du clic sur une zone
 */
function handleZoneClick(e) {
    if (!e.features || e.features.length === 0) return;
    
    // Ne pas sélectionner en mode outil autre que manuel
    if (GLOBAL_STATE.currentTool !== 'manual') return;
    
    const feature = e.features[0];
    const zoneId = feature.properties.id || feature.properties.code;
    
    if (isInUSLMode()) {
        // Si plusieurs USL sont sous le point cliqué, ne rien faire (clic ambigu en zone de chevauchement)
        try {
            const featuresAtPoint = APP.map.queryRenderedFeatures(e.point, { layers: ['zones-usl-fill', 'zones-usl-selected'] });
            const idsAtPoint = new Set(
                (featuresAtPoint || [])
                    .map(f => (f && f.properties) ? f.properties.id : null)
                    .filter(Boolean)
            );
            if (idsAtPoint.size > 1) {
                showStatus('Plusieurs USL se chevauchent ici. Clic ignoré.', 'warning');
                return;
            }
        } catch (_) {}
        // Anti-doublon: si même zone cliquée dans une fenêtre très courte, ignorer
        const now = Date.now();
        if (__lastUSLClick.id === zoneId && (now - __lastUSLClick.time) < 250) {
            return;
        }
        __lastUSLClick = { time: now, id: zoneId };
        handleUSLZoneClick(zoneId, feature);
    } else {
        handleFranceZoneClick(zoneId, feature);
    }
    
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
}

/**
 * Gestion du clic sur une zone USL
 */
function handleUSLZoneClick(zoneId, feature) {
    const zone = GLOBAL_STATE.uslCache.get(zoneId);
    if (!zone) return;
    
    if (GLOBAL_STATE.finalUSLSelection.has(zoneId)) {
        // Retirer de la sélection
        GLOBAL_STATE.finalUSLSelection.delete(zoneId);
        GLOBAL_STATE.totalSelectedFoyers -= zone.foyers || 0;
    } else {
        // Ajouter à la sélection
        GLOBAL_STATE.finalUSLSelection.set(zoneId, zone);
        GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
    }
}

/**
 * Gestion du clic sur une zone France (non-USL)
 */
function handleFranceZoneClick(zoneId, feature) {
    const zone = GLOBAL_STATE.currentZonesCache.get(zoneId);
    if (!zone) return;
    
    if (GLOBAL_STATE.tempSelection.has(zoneId)) {
        // Retirer de la sélection temporaire
        GLOBAL_STATE.tempSelection.delete(zoneId);
    } else {
        // Ajouter à la sélection temporaire
        GLOBAL_STATE.tempSelection.set(zoneId, zone);
    }
    
    GLOBAL_STATE.isInTempMode = GLOBAL_STATE.tempSelection.size > 0;
}

// ===== SÉLECTION PAR RECTANGLE =====

/**
 * Sélectionner les zones dans un rectangle
 */
function selectZonesInBox(bbox) {
    if (!APP.map) return;
    
    const layerId = isInUSLMode() ? 'zones-usl-fill' : 'zones-france-fill';
    const features = APP.map.queryRenderedFeatures(bbox, { layers: [layerId] });
    
    if (features.length === 0) return;
    
    let addedCount = 0;
    
    features.forEach(feature => {
        const zoneId = feature.properties.id || feature.properties.code;
        
        if (isInUSLMode()) {
            const zone = GLOBAL_STATE.uslCache.get(zoneId);
            if (zone && !GLOBAL_STATE.finalUSLSelection.has(zoneId)) {
                GLOBAL_STATE.finalUSLSelection.set(zoneId, zone);
                GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
                addedCount++;
            }
        } else {
            const zone = GLOBAL_STATE.currentZonesCache.get(zoneId);
            if (zone && !GLOBAL_STATE.tempSelection.has(zoneId)) {
                GLOBAL_STATE.tempSelection.set(zoneId, zone);
                addedCount++;
            }
        }
    });
    
    if (!isInUSLMode()) {
        GLOBAL_STATE.isInTempMode = GLOBAL_STATE.tempSelection.size > 0;
    }
    
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
    
    if (addedCount > 0) {
        showStatus(`${addedCount} zones ajoutées à la sélection`, 'success');
    }
}

/**
 * Retirer les zones dans un rectangle
 */
function removeZonesInBox(bbox) {
    if (!APP.map) return;
    
    // IMPORTANT : Chercher dans les deux couches (fill et selected) car les zones sélectionnées 
    // sont masquées de la couche fill
    const fillLayerId = isInUSLMode() ? 'zones-usl-fill' : 'zones-france-fill';
    const selectedLayerId = isInUSLMode() ? 'zones-usl-selected' : 'zones-france-selected';
    
    const features = APP.map.queryRenderedFeatures(bbox, { 
        layers: [fillLayerId, selectedLayerId] 
    });
    
    if (features.length === 0) return;
    
    let removedCount = 0;
    
    features.forEach(feature => {
        const zoneId = feature.properties.id || feature.properties.code;
        
        if (isInUSLMode()) {
            const zone = GLOBAL_STATE.uslCache.get(zoneId);
            if (zone && GLOBAL_STATE.finalUSLSelection.has(zoneId)) {
                GLOBAL_STATE.finalUSLSelection.delete(zoneId);
                GLOBAL_STATE.totalSelectedFoyers -= zone.foyers || 0;
                removedCount++;
            }
        } else {
            if (GLOBAL_STATE.tempSelection.has(zoneId)) {
                GLOBAL_STATE.tempSelection.delete(zoneId);
                removedCount++;
            }
        }
    });
    
    if (!isInUSLMode()) {
        GLOBAL_STATE.isInTempMode = GLOBAL_STATE.tempSelection.size > 0;
    }
    
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
    
    if (removedCount > 0) {
        showStatus(`${removedCount} zones retirées de la sélection`, 'success');
    }
}

// ===== SÉLECTION PAR GÉOMÉTRIE =====

/**
 * Sélectionner toutes les zones qui intersectent avec une géométrie
 */
function selectZonesInGeometry(geometry) {
    if (!geometry) return 0;
    
    let selectedCount = 0;
    
    if (isInUSLMode()) {
        // Vider sélection précédente en mode USL
        GLOBAL_STATE.finalUSLSelection.clear();
        GLOBAL_STATE.totalSelectedFoyers = 0;
        
        GLOBAL_STATE.uslCache.forEach((zone, zoneId) => {
            if (checkZoneIntersection(zone, geometry)) {
                GLOBAL_STATE.finalUSLSelection.set(zoneId, zone);
                GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
                selectedCount++;
            }
        });
    } else {
        // Vider sélection temporaire précédente
        GLOBAL_STATE.tempSelection.clear();
        
        GLOBAL_STATE.currentZonesCache.forEach((zone, zoneId) => {
            if (checkZoneIntersection(zone, geometry)) {
                GLOBAL_STATE.tempSelection.set(zoneId, zone);
                selectedCount++;
            }
        });
        
        GLOBAL_STATE.isInTempMode = GLOBAL_STATE.tempSelection.size > 0;
    }
    
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
    
    return selectedCount;
}

/**
 * Vérification de l'intersection d'une zone avec une géométrie
 */
function checkZoneIntersection(zone, geometry) {
    try {
        const zoneFeature = {
            type: 'Feature',
            geometry: zone.geometry
        };
        
        return turf.booleanIntersects(zoneFeature, geometry);
    } catch (e) {
        console.warn('Erreur intersection:', e);
        return false;
    }
}

// ===== SÉLECTION SPÉCIALISÉE PAR OUTIL =====

/**
 * Sélectionner zones dans un cercle
 */
function selectZonesInCircle(center, radiusKm) {
    const circleGeoJSON = turf.circle(center, radiusKm, {units: 'kilometers'});
    const count = selectZonesInGeometry(circleGeoJSON);
    
    const typeLabel = isInUSLMode() ? 'USL' : getCurrentZoneConfig().label;
    showStatus(`${count} ${typeLabel} sélectionnées dans le cercle`, 'success');
    return count;
}

/**
 * Sélectionner zones dans une isochrone
 */
function selectZonesInIsochrone(isochroneData) {
    const count = selectZonesInGeometry(isochroneData);
    
    const typeLabel = isInUSLMode() ? 'USL' : getCurrentZoneConfig().label;
    showStatus(`${count} ${typeLabel} sélectionnées dans l'isochrone`, 'success');
    return count;
}

/**
 * Sélectionner zones dans un polygone
 */
function selectZonesInPolygon(polygon) {
    const count = selectZonesInGeometry(polygon);
    
    const typeLabel = isInUSLMode() ? 'USL' : getCurrentZoneConfig().label;
    showStatus(`${count} ${typeLabel} sélectionnées dans le polygone`, 'success');
    return count;
}

// ===== CALCUL D'ESTIMATION =====

/**
 * Calcul des zones dans une géométrie donnée (pour prévisualisation)
 */
function calculateZonesInGeometry(geometry) {
    let totalFoyers = 0;
    let zonesCount = 0;
    
    if (isInUSLMode()) {
        GLOBAL_STATE.uslCache.forEach((zone, zoneId) => {
            if (checkZoneIntersection(zone, geometry)) {
                totalFoyers += zone.foyers || 0;
                zonesCount++;
            }
        });
    } else {
        GLOBAL_STATE.currentZonesCache.forEach((zone, zoneId) => {
            if (checkZoneIntersection(zone, geometry)) {
                zonesCount++;
                // Pas de comptage foyers pour les zones non-USL
            }
        });
    }
    
    return { totalFoyers, zonesCount };
}

// ===== IMPORT DE ZONES =====

/**
 * Sélectionner des zones par leurs codes (pour l'import)
 */
function selectZonesByCodes(codes, zonesData) {
    if (!codes || codes.length === 0) return;
    
    if (isInUSLMode()) {
        // Mode USL : sélection directe
        codes.forEach(code => {
            const zone = GLOBAL_STATE.uslCache.get(code);
            if (zone) {
                GLOBAL_STATE.finalUSLSelection.set(code, zone);
                GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
            }
        });
    } else {
        // Mode non-USL : sélection temporaire
        zonesData.forEach(zone => {
            GLOBAL_STATE.tempSelection.set(zone.code, zone);
        });
        
        GLOBAL_STATE.isInTempMode = GLOBAL_STATE.tempSelection.size > 0;
    }
    
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
}

// Suppression de l'ancien blocage global de chevauchement USL :
// la prévention se fait désormais seulement au point de clic (zone de recouvrement).

// ===== NETTOYAGE =====

/**
 * Vider toute sélection
 */
function clearAllSelections() {
    // Vider sélection USL
    GLOBAL_STATE.finalUSLSelection.clear();
    GLOBAL_STATE.totalSelectedFoyers = 0;
    
    // Vider sélection temporaire
    GLOBAL_STATE.tempSelection.clear();
    GLOBAL_STATE.isInTempMode = false;
    
    updateSelectionDisplay();
    updateSelectedZonesDisplay();
    
    showStatus('Sélection vidée', 'warning');
}

/**
 * Vider sélection selon le mode actuel
 */
function clearCurrentSelection() {
    if (isInUSLMode()) {
        clearFinalSelection();
    } else {
        clearTempSelection();
    }
}

// ===== UTILITAIRES DE CACHE =====

/**
 * Vérification si les bounds sont déjà chargées
 */
function isBoundsAlreadyLoaded(newBounds) {
    return GLOBAL_STATE.loadedBounds.some(bounds => 
        bounds.type === GLOBAL_STATE.currentZoneType &&
        bounds.lat_min <= newBounds.lat_min && 
        bounds.lat_max >= newBounds.lat_max && 
        bounds.lng_min <= newBounds.lng_min && 
        bounds.lng_max >= newBounds.lng_max
    );
}

/**
 * Nettoyage du cache pour changement de type
 */
function clearCache() {
    GLOBAL_STATE.currentZonesCache.clear();
    GLOBAL_STATE.superiorZonesCache.clear();
    GLOBAL_STATE.loadedBounds = GLOBAL_STATE.loadedBounds.filter(b => b.type === 'mediaposte');
}

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.handleZoneClick = handleZoneClick;
window.selectZonesInBox = selectZonesInBox;
window.removeZonesInBox = removeZonesInBox;
window.selectZonesInGeometry = selectZonesInGeometry;
window.selectZonesInCircle = selectZonesInCircle;
window.selectZonesInIsochrone = selectZonesInIsochrone;
window.selectZonesInPolygon = selectZonesInPolygon;
window.calculateZonesInGeometry = calculateZonesInGeometry;
window.selectZonesByCodes = selectZonesByCodes;
window.clearAllSelections = clearAllSelections;
window.clearCurrentSelection = clearCurrentSelection;
window.isBoundsAlreadyLoaded = isBoundsAlreadyLoaded;
window.clearCache = clearCache;

console.log('✅ Module SELECTION-MANAGER Médiaposte chargé');