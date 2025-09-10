// ===== FONCTIONS UTILITAIRES (WebDev Compatible) =====

// ===== UTILITAIRES DE CALCUL =====

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
        return 16; // Zoom très élevé pour Paris intra-muros
    } else if (isUrban) {
        debugLog('Zone urbaine détectée, zoom élevé');
        return 14; // Zoom élevé pour autres grandes villes
    } else {
        debugLog('Zone rurale/périurbaine détectée, zoom modéré');
        return 12; // Zoom modéré pour zones rurales
    }
}

/**
 * Calcul approximatif de la surface en km²
 */
function calculateSurfaceKm2(bounds) {
    const latDiff = bounds.lat_max - bounds.lat_min;
    const lngDiff = bounds.lng_max - bounds.lng_min;
    
    // Conversion approximative degrés → km (à la latitude moyenne)
    const avgLat = (bounds.lat_min + bounds.lat_max) / 2;
    const latKm = latDiff * 111; // 1° lat ≈ 111km
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180); // Correction longitude
    
    return latKm * lngKm;
}

/**
 * Estimation du nombre de zones selon la surface
 */
function estimateZoneCount(surfaceKm2) {
    // Estimation basée sur densité moyenne USL en France
    const avgDensity = surfaceKm2 > 1000 ? 0.8 : 2.5; // zones/km² (rural vs urbain)
    return Math.round(surfaceKm2 * avgDensity);
}

/**
 * Vérification si une zone de bounds est déjà chargée
 */
function isBoundsAlreadyLoaded(newBounds) {
    const currentType = GLOBAL_STATE.currentZoneType;
    const matchingBounds = GLOBAL_STATE.loadedBounds.filter(bounds => 
        bounds.type === currentType
    );
    
    console.log('[BOUNDS-DEBUG] Vérification bounds:', {
        newBounds,
        currentType,
        totalLoadedBounds: GLOBAL_STATE.loadedBounds.length,
        matchingTypeCount: matchingBounds.length
    });
    
    const isLoaded = GLOBAL_STATE.loadedBounds.some(bounds => {
        const typeMatch = bounds.type === currentType;
        const latMinOk = bounds.lat_min <= newBounds.lat_min;
        const latMaxOk = bounds.lat_max >= newBounds.lat_max;
        const lngMinOk = bounds.lng_min <= newBounds.lng_min;
        const lngMaxOk = bounds.lng_max >= newBounds.lng_max;
        
        const fullyContained = typeMatch && latMinOk && latMaxOk && lngMinOk && lngMaxOk;
        
        if (typeMatch) {
            console.log('[BOUNDS-DEBUG] Comparaison avec bounds existantes:', {
                existingBounds: bounds,
                checks: { typeMatch, latMinOk, latMaxOk, lngMinOk, lngMaxOk },
                fullyContained
            });
        }
        
        return fullyContained;
    });
    
    console.log('[BOUNDS-DEBUG] Résultat final:', isLoaded);
    return isLoaded;
}

/**
 * Ajustement de la vue de la carte selon une géométrie
 */
function fitMapToGeometry(map, geometry) {
    try {
        // Calculer les limites (bbox) de la géométrie
        const bbox = turf.bbox(geometry);
        
        // Ajuster la vue de la carte avec padding
        map.fitBounds(bbox, {
            padding: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 400 // Plus d'espace à droite pour les contrôles
            },
            duration: 1000 // Animation d'1 seconde
        });
    } catch (error) {
        console.warn('Impossible d\'ajuster la vue:', error);
    }
}

/**
 * Ajustement de la vue avec décalage pour cercle/isochrone
 */
function fitMapToGeometryWithOffset(map, geometry) {
    try {
        // Calculer les limites (bbox) de la géométrie
        const bbox = turf.bbox(geometry);
        
        // Calculer le centre de la bbox
        const centerLng = (bbox[0] + bbox[2]) / 2;
        const centerLat = (bbox[1] + bbox[3]) / 2;
        
        // Décaler le centre vers la droite pour compenser le menu
        const offsetLng = (bbox[2] - bbox[0]) * 0.25; // 25% de décalage vers la droite
        const newCenterLng = centerLng - offsetLng; // Soustraire pour décaler à droite
        
        // Ajuster la vue avec le nouveau centre
        map.fitBounds(bbox, {
            padding: {
                top: 50,
                bottom: 50,
                left: 400, // Plus d'espace à gauche pour le menu
                right: 100
            },
            duration: 1000
        });
    } catch (error) {
        console.warn('Impossible d\'ajuster la vue:', error);
    }
}

/**
 * Calcul des zones dans une géométrie donnée
 */
function calculateZonesInGeometry(geometry) {
    let totalFoyers = 0;
    let zonesCount = 0;
    
    GLOBAL_STATE.zonesCache.forEach((zone, zoneId) => {
        try {
            const zoneFeature = {
                type: 'Feature',
                geometry: zone.geometry
            };
            
            if (turf.booleanIntersects(zoneFeature, geometry)) {
                totalFoyers += zone.foyers || 0;
                zonesCount++;
            }
        } catch (e) {
            debugLog('Erreur calcul intersection:', { zoneId, error: e.message });
        }
    });
    
    return { totalFoyers, zonesCount };
}

// ===== UTILITAIRES DE DEBUG =====

/**
 * Logging de debug avec timestamps
 */
function debugLog(message, data = null) {
    if (!GLOBAL_STATE.debugMode) return;
    
    const debugDiv = document.getElementById('debug-info');
    if (!debugDiv) return;
    
    const timestamp = new Date().toLocaleTimeString();
    let logEntry = `[${timestamp}] ${message}`;
    
    if (data) {
        logEntry += `\n${JSON.stringify(data, null, 2)}`;
    }
    
    // Limiter la taille du log
    const currentContent = debugDiv.innerHTML;
    const lines = currentContent.split('\n');
    if (lines.length > CONFIG.DEBUG.maxLogLines) {
        debugDiv.innerHTML = lines.slice(0, CONFIG.DEBUG.keepLogLines).join('\n');
    }
    
    debugDiv.innerHTML = logEntry + '\n\n' + debugDiv.innerHTML;
    console.log(`[DEBUG] ${message}`, data);
}

/**
 * Affichage des informations de debug du cache
 */
function debugCacheInfo(map) {
    const currentBounds = map.getBounds();
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    
    const debugInfo = {
        cache_size: GLOBAL_STATE.zonesCache.size,
        loaded_bounds_count: GLOBAL_STATE.loadedBounds.length,
        current_bounds: {
            lat_min: currentBounds.getSouth().toFixed(6),
            lat_max: currentBounds.getNorth().toFixed(6),
            lng_min: currentBounds.getWest().toFixed(6),
            lng_max: currentBounds.getEast().toFixed(6)
        },
        current_center: {
            lat: currentCenter.lat.toFixed(6),
            lng: currentCenter.lng.toFixed(6)
        },
        current_zoom: currentZoom.toFixed(2),
        store_location: GLOBAL_STATE.storeLocation ? {
            lng: GLOBAL_STATE.storeLocation[0].toFixed(6),
            lat: GLOBAL_STATE.storeLocation[1].toFixed(6)
        } : null,
        map_sources: Object.keys(map.getStyle().sources),
        zones_source_exists: !!map.getSource('zones-mediapost'),
        zones_layer_exists: !!map.getLayer('zones-fill')
    };
    
    debugLog('=== CACHE INFO ===', debugInfo);
    
    // Vérifier si la zone actuelle est couverte
    const currentViewBounds = {
        lat_min: currentBounds.getSouth(),
        lat_max: currentBounds.getNorth(),
        lng_min: currentBounds.getWest(),
        lng_max: currentBounds.getEast()
    };
    
    const isCurrentViewCovered = isBoundsAlreadyLoaded(currentViewBounds);
    debugLog(`Zone actuelle couverte: ${isCurrentViewCovered}`);
    
    // Afficher les zones visibles
    if (map.getSource('zones-mediapost')) {
        const features = map.querySourceFeatures('zones-mediapost');
        debugLog(`Zones visibles sur la carte: ${features.length}`);
    }
    
    // Afficher les limites du cache
    GLOBAL_STATE.loadedBounds.forEach((bounds, index) => {
        debugLog(`Cache #${index}:`, {
            lat_min: bounds.lat_min.toFixed(6),
            lat_max: bounds.lat_max.toFixed(6),
            lng_min: bounds.lng_min.toFixed(6),
            lng_max: bounds.lng_max.toFixed(6)
        });
    });
}

// ===== UTILITAIRES UI =====

/**
 * Mise à jour du status avec style
 */
function updateStatus(section, message, type = '') {
    const element = document.getElementById(`${section}-status`) || document.getElementById('main-status');
    if (!element) return;
    
    element.textContent = message;
    element.className = `status ${type}`;
    
    // Log debug pour status importants
    if (section === 'main' || section === 'address') {
        debugLog(`Status [${section}]: ${message}`);
    }
}

/**
 * Affichage/masquage des sections optionnelles
 */
function showAllSections() {
    document.querySelector('.section-tools')?.classList.remove('hidden');
    document.querySelector('.section-selection')?.classList.remove('hidden');
    GLOBAL_STATE.hasValidatedAddress = true;
}

function hideOptionalSections() {
    document.querySelector('.section-tools')?.classList.add('hidden');
    document.querySelector('.section-selection')?.classList.add('hidden');
    GLOBAL_STATE.hasValidatedAddress = false;
}

/**
 * Vider la sélection actuelle (toutes zones)
 */
function clearSelection() {
    const map = mapboxgl.getMap();
    if (!map) return;

    const zonesLayer = map.getLayer('zones-fill');
    if (zonesLayer) {
        map.removeLayer('zones-fill');
    }
    const zonesSource = map.getSource('zones-mediapost');
    if (zonesSource) {
        map.removeSource('zones-mediapost');
    }
    GLOBAL_STATE.selectedZones = [];
    debugLog('Sélection vidée.');
}

/**
 * Debounce générique
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Calcule la bounding box de toutes les zones sélectionnées
 * @returns {Object|null} Bounds {lat_min, lat_max, lng_min, lng_max} ou null si pas de sélection
 */
function calculateSelectionBounds() {
    const selectionMap = (typeof isInUSLMode === 'function' && isInUSLMode())
        ? GLOBAL_STATE.finalUSLSelection
        : GLOBAL_STATE.tempSelection;
    if (!selectionMap || selectionMap.size === 0) {
        return null;
    }
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    
    // Parcourir toutes les zones sélectionnées
    for (const zone of selectionMap.values()) {
        if (!zone.geometry || !zone.geometry.coordinates) continue;
        
        try {
            // Créer un objet GeoJSON Feature valide pour turf
            const feature = {
                type: 'Feature',
                geometry: zone.geometry,
                properties: {}
            };
            
            // Utiliser turf.bbox avec l'objet Feature
            const bbox = turf.bbox(feature);
            minLng = Math.min(minLng, bbox[0]);
            minLat = Math.min(minLat, bbox[1]);
            maxLng = Math.max(maxLng, bbox[2]);
            maxLat = Math.max(maxLat, bbox[3]);
        } catch (e) {
            // Calcul manuel de la bbox si turf échoue
            try {
                let coords = [];
                
                // Extraire les coordonnées selon le type de géométrie
                if (zone.geometry.type === 'Polygon') {
                    coords = zone.geometry.coordinates[0];
                } else if (zone.geometry.type === 'MultiPolygon') {
                    // Pour MultiPolygon, concatener toutes les coordonnées
                    zone.geometry.coordinates.forEach(polygon => {
                        coords = coords.concat(polygon[0]);
                    });
                } else if (zone.geometry.type === 'LineString') {
                    coords = zone.geometry.coordinates;
                } else if (zone.geometry.type === 'MultiLineString') {
                    zone.geometry.coordinates.forEach(line => {
                        coords = coords.concat(line);
                    });
                } else {
                    console.error('[BOUNDS] Type de géométrie non supporté:', zone.geometry.type);
                    continue;
                }
                
                // Calculer min/max des coordonnées
                coords.forEach(coord => {
                    if (Array.isArray(coord) && coord.length >= 2) {
                        const lng = coord[0];
                        const lat = coord[1];
                        minLng = Math.min(minLng, lng);
                        maxLng = Math.max(maxLng, lng);
                        minLat = Math.min(minLat, lat);
                        maxLat = Math.max(maxLat, lat);
                    }
                });
                
                // Debug seulement si nécessaire
                // console.log(`[BOUNDS] Bbox calculée manuellement pour ${zone.id}:`, {
                //     minLat, maxLat, minLng, maxLng
                // });
                
            } catch (manualError) {
                console.error('[BOUNDS] Erreur calcul manuel pour zone:', zone.id, manualError);
            }
        }
    }
    
    if (minLat === Infinity) {
        console.error('[BOUNDS] Aucune coordonnée valide trouvée');
        return null;
    }
    
    // Ajouter une petite marge (environ 500m)
    const margin = 0.005;
    
    const bounds = {
        lat_min: minLat - margin,
        lat_max: maxLat + margin,
        lng_min: minLng - margin,
        lng_max: maxLng + margin
    };
    
    console.log('[BOUNDS] Bounds finales calculées:', bounds);
    
    return bounds;
}

/**
 * Recentre la vue sur la sélection courante (USL ou non-USL)
 */
function recenterOnSelection(padding = 60) {
    try {
        const bounds = calculateSelectionBounds();
        if (!bounds || !window.APP || !APP.map) {
            if (typeof showStatus === 'function') {
                showStatus('Aucune sélection à recentrer', 'warning');
            }
            return;
        }
        const bbox = [bounds.lng_min, bounds.lat_min, bounds.lng_max, bounds.lat_max];
        // Empêcher le chargement automatique pendant l'animation, puis forcer une mise à jour à la fin
        try {
            GLOBAL_STATE.suppressMoveLoad = true;
            if (APP.map && typeof APP.map.once === 'function') {
                APP.map.once('moveend', () => {
                    try {
                        // Réactiver le chargement après l'animation
                        GLOBAL_STATE.suppressMoveLoad = false;
                        // Rafraîchir immédiatement l'affichage
                        updateMapWithAllCachedZones();
                        updateSelectedZonesDisplay();
                        // Forcer le chargement des USL dans la viewport après recentrage
                        if (typeof isInUSLMode === 'function' && isInUSLMode() && typeof loadZonesForCurrentView === 'function') {
                            loadZonesForCurrentView(true);
                        }
                    } catch (_) {}
                });
            }
        } catch (_) {}
        // Calculer la caméra cible puis quantifier le zoom par pas de 0,25 pour une expérience cohérente
        if (typeof APP.map.cameraForBounds === 'function') {
            const camera = APP.map.cameraForBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
                padding: { top: padding, bottom: padding, left: padding, right: padding }
            });
            const rawZoom = camera && typeof camera.zoom === 'number' ? camera.zoom : APP.map.getZoom();
            const steppedZoom = Math.round(rawZoom / 0.25) * 0.25;
            APP.map.easeTo({ center: camera.center, zoom: steppedZoom, duration: 1000 });
        } else {
            // Fallback si cameraForBounds n'est pas disponible
            APP.map.fitBounds(bbox, {
                padding: { top: padding, bottom: padding, left: padding, right: padding },
                duration: 1000
            });
        }
    } catch (e) {
        console.warn('[RECENTER] Erreur recentrage:', e);
    }
}

/**
 * Recentrer la vue sur le point de vente
 */
function recenterOnStore(zoom = 14, duration = 800) {
    try {
        if (!window.APP || !APP.map || !GLOBAL_STATE.storeLocation) return;
        const [lng, lat] = GLOBAL_STATE.storeLocation;
        APP.map.flyTo({ center: [lng, lat], zoom, duration });
    } catch (e) {
        console.warn('[RECENTER STORE] Erreur:', e);
    }
}

window.recenterOnStore = recenterOnStore;

window.recenterOnSelection = recenterOnSelection;

/**
 * Vérifie si les bounds de sélection sont entièrement couvertes par les USL chargées
 * @param {Object} selectionBounds - Bounds à vérifier
 * @returns {boolean} true si entièrement couvertes
 */
function areUSLLoadedForBounds(selectionBounds) {
    if (!selectionBounds) return true;
    
    console.log('[BOUNDS-CHECK] Vérification si USL chargées pour:', selectionBounds);
    console.log('[BOUNDS-CHECK] Bounds USL existantes:', 
        GLOBAL_STATE.loadedBounds.filter(b => b.type === 'mediaposte').map(b => ({
            lat_min: b.lat_min,
            lat_max: b.lat_max,
            lng_min: b.lng_min,
            lng_max: b.lng_max
        }))
    );
    
    // Vérifier dans les bounds USL chargées
    const result = GLOBAL_STATE.loadedBounds.some(bounds => {
        const isUSL = bounds.type === 'mediaposte';
        const coversSelection = bounds.lat_min <= selectionBounds.lat_min &&
                              bounds.lat_max >= selectionBounds.lat_max &&
                              bounds.lng_min <= selectionBounds.lng_min &&
                              bounds.lng_max >= selectionBounds.lng_max;
        
        if (isUSL && !coversSelection) {
            console.log('[BOUNDS-CHECK] Bounds USL ne couvre pas la sélection:', {
                bounds_lat: [bounds.lat_min, bounds.lat_max],
                selection_lat: [selectionBounds.lat_min, selectionBounds.lat_max],
                bounds_lng: [bounds.lng_min, bounds.lng_max],
                selection_lng: [selectionBounds.lng_min, selectionBounds.lng_max]
            });
        }
        
        return isUSL && coversSelection;
    });
    
    // Sécurité: si couvert mais cache USL vide, considérer NON COUVERT pour forcer le chargement USL
    const hasUSLInCache = GLOBAL_STATE.uslCache && GLOBAL_STATE.uslCache.size > 0;
    const finalResult = result && hasUSLInCache;
    if (result && !hasUSLInCache) {
        console.log('[BOUNDS-CHECK] Couvert mais cache USL vide -> forcer rechargement');
    }
    console.log('[BOUNDS-CHECK] Résultat:', finalResult ? 'COUVERT' : 'NON COUVERT');
    return finalResult;
}

/**
 * Calcule l'aire approximative d'une bounds en km²
 * @param {Object} bounds - Bounds {lat_min, lat_max, lng_min, lng_max}
 * @returns {number} Aire approximative en km²
 */
function calculateBoundsArea(bounds) {
    if (!bounds) return 0;
    
    // Approximation simple : 1 degré de latitude ≈ 111 km
    // 1 degré de longitude ≈ 111 km * cos(latitude)
    const latKm = (bounds.lat_max - bounds.lat_min) * 111;
    const avgLat = (bounds.lat_max + bounds.lat_min) / 2;
    const lngKm = (bounds.lng_max - bounds.lng_min) * 111 * Math.cos(avgLat * Math.PI / 180);
    
    return latKm * lngKm;
}

// Exporter les nouvelles fonctions
window.calculateSelectionBounds = calculateSelectionBounds;
window.areUSLLoadedForBounds = areUSLLoadedForBounds;
window.calculateBoundsArea = calculateBoundsArea;

console.log('✅ Module UTILS chargé (WebDev compatible)');