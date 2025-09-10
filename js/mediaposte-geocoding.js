// ===== GÉOCODAGE OPTIMISÉ (WebDev Compatible) =====
// Version simplifiée sans gestion d'adresse (gérée côté WebDev)

/**
 * Traitement d'une adresse déjà géocodée (depuis WebDev)
 */
function processGeocodedAddress(coordinates, placeName) {
    if (!APP.map) return;
    
    // Sauvegarder la position du magasin
    GLOBAL_STATE.storeLocation = coordinates;
    
    // Créer le marqueur
    createStoreMarker(coordinates, placeName);
    
    // Marquer comme adresse validée
    GLOBAL_STATE.hasValidatedAddress = true;
    
    debugLog(`Adresse géocodée: ${placeName}`, { coordinates });
}

/**
 * Calcul du zoom intelligent selon le contexte urbain/rural
 */
function calculateSmartZoom(placeName, coordinates) {
    // Vérifier si c'est une grande ville
    const isUrban = CONFIG.URBAN_KEYWORDS.some(city => placeName.includes(city));
    
    // Vérifier si c'est dans Paris intra-muros (arrondissements)
    const isParisCenter = placeName.match(/Paris.*7500[0-9]{2}/) || placeName.includes('arrondissement');
    
    if (isParisCenter) {
        debugLog('Paris centre détecté, zoom très élevé');
        return 16;
    } else if (isUrban) {
        debugLog('Zone urbaine détectée, zoom élevé');
        return 14;
    } else {
        debugLog('Zone rurale/périurbaine détectée, zoom modéré');
        return 12;
    }
}

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.processGeocodedAddress = processGeocodedAddress;
window.calculateSmartZoom = calculateSmartZoom;

console.log('✅ Module GEOCODING-OPTIMIZED chargé (WebDev compatible)');