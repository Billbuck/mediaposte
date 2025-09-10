// ===== GESTION CARTE MÉDIAPOSTE =====

// ===== INITIALISATION CARTE =====

/**
 * Initialisation de la carte Mapbox
 */
function initMap() {

    
    mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
    
    APP.map = new mapboxgl.Map({
        container: 'map',
        style: CONFIG.MAP_CONFIG.style,
        center: CONFIG.MAP_CONFIG.center,
        zoom: CONFIG.MAP_CONFIG.zoom,
        maxBounds: CONFIG.MAP_CONFIG.maxBounds,
        dragRotate: false,
        pitchWithRotate: false,
        touchZoomRotate: false,
        preserveDrawingBuffer: true  // Nécessaire pour capturer la carte
    });
    
    APP.map.keyboard.disableRotation();
    APP.map.touchZoomRotate.disableRotation();
    // Gestion du zoom: désactiver le zoom continu au scroll pour gérer un pas fixe
    if (APP.map.scrollZoom) {
        APP.map.scrollZoom.disable();
    }
    
    // Désactiver le zoom au double-clic
    if (APP.map.doubleClickZoom) {
        APP.map.doubleClickZoom.disable();
    }
    
    APP.map.on('load', () => {
        showStatus('Carte chargée - Saisissez une adresse pour commencer', 'success');
        setupMapEvents();
        // Initialiser Draw immédiatement après le chargement du style
        initializeDrawTool();
    });

    // Gestion du zoom molette par pas de 0.25 avec contraintes min/max selon le mode
    APP.map.getCanvas().addEventListener('wheel', (e) => {
        try {
            e.preventDefault();
            const currentZoom = APP.map.getZoom();
            const limits = getModeZoomLimits();
            const delta = e.deltaY > 0 ? -0.25 : 0.25;
            let newZoom = currentZoom + delta;
            if (newZoom < limits.minZoom) {
                newZoom = limits.minZoom;
                if (typeof showStatus === 'function') {
                    const zoneLabel = typeof getCurrentZoneConfig === 'function' ? getCurrentZoneConfig().label : 'zones';
                    showStatus(`Zoomez pour voir les ${zoneLabel} (zoom min: ${limits.minZoom})`, 'warning');
                }
            }
            if (newZoom > limits.maxZoom) newZoom = limits.maxZoom;
            if (newZoom !== currentZoom) {
                APP.map.setZoom(newZoom);
            }
        } catch (err) {
            // Erreur silencieuse sur gestion molette
        }
    }, { passive: false });
    
    // Gestion des erreurs de carte
    APP.map.on('error', (e) => {
        console.error('[MAP ERROR]', e);
        if (e.error && e.error.message) {
            console.error('[MAP ERROR DETAILS]', e.error.message);
        }
    });
    
    return APP.map;
}

/**
 * Initialisation de l'outil Draw avec protections
 */
function initializeDrawTool() {

    
    // Vérifier que la carte est complètement stable
    if (!APP.map || !APP.map.isStyleLoaded()) {

        setTimeout(initializeDrawTool, 1000);
        return;
    }
    
    try {
        // 1) Créer l'instance si absente
        if (!APP.draw) {
            APP.draw = new MapboxDraw({
                displayControlsDefault: false,
                controls: { polygon: false, trash: false },
                defaultMode: 'simple_select',
                boxSelect: false,
                styles: (Array.isArray(window.DRAW_STYLES) && window.DRAW_STYLES.length > 0) ? window.DRAW_STYLES : undefined
            });
        }

        // 2) Ajouter le contrôle si non monté, ou récupérer un Draw déjà monté
        const controls = (APP.map && APP.map._controls) ? APP.map._controls : [];
        let isMounted = controls.includes(APP.draw);
        // Si un autre contrôle Draw est déjà monté, le récupérer
        if (!isMounted) {
            const existingDraw = controls.find(c => c && typeof c.changeMode === 'function' && typeof c.getMode === 'function' && c.modes);
            if (existingDraw) {
                APP.draw = existingDraw;
                isMounted = true;
            }
        }
        if (!isMounted && APP.map && APP.map.isStyleLoaded()) {
            APP.map.addControl(APP.draw);
        }

        // 3) Attacher les événements Draw une seule fois
        if (!GLOBAL_STATE.__drawEventsAttached && typeof window.setupDrawEvents === 'function') {
            try { window.setupDrawEvents(); GLOBAL_STATE.__drawEventsAttached = true; } catch(_) {}
        }

        // 4) Nettoyer toute géométrie résiduelle si le contexte est prêt
        try { if (APP.draw && APP.draw._ctx) APP.draw.deleteAll(); } catch(_) {}

    } catch (error) {
        console.error('[DRAW ERROR] Erreur initialisation Draw:', error);
        APP.draw = null;
    }
}

// ===== ÉVÉNEMENTS CARTE =====

/**
 * Configuration des événements de la carte
 */
function setupMapEvents() {

    
    // Debug des sources et layers au chargement
    APP.map.on('styledata', () => {
        // Remonter certaines couches de référence (labels villes, limites admin)
        bringReferenceLayersToFront();
    });
    
    // Mettre à jour l'indicateur de zoom
    function updateZoomIndicator() {
        const zoomLevel = document.getElementById('zoom-level');
        if (zoomLevel && APP.map) {
            zoomLevel.textContent = APP.map.getZoom().toFixed(2);
        }
    }
    
    APP.map.on('zoom', updateZoomIndicator);
    APP.map.on('zoomend', updateZoomIndicator);
    updateZoomIndicator();
    
    let moveTimeout;
    
    // Définir le handler moveend comme fonction nommée pour pouvoir le retirer/ajouter
    const moveEndHandler = () => {
        const bounds = APP.map.getBounds();
        const zoom = APP.map.getZoom();

        // Si un recentrage programmatique Isochrone est en cours, ne déclenche pas de chargement
        if (window.GLOBAL_STATE && GLOBAL_STATE.suppressMoveLoad === true) {

            GLOBAL_STATE.suppressMoveLoad = false;
            // Mettre à jour la visibilité des boutons mais éviter tout autre traitement
            if (typeof updateActionButtonsVisibility === 'function') {
                updateActionButtonsVisibility();
            }
            return;
        }
        
        // NOUVEAU : Si un changement de type est en cours, ne pas charger
        if (window.GLOBAL_STATE && GLOBAL_STATE.isChangingZoneType === true) {
            // Mettre à jour quand même la visibilité des boutons
            if (typeof updateActionButtonsVisibility === 'function') {
                updateActionButtonsVisibility();
            }
            return;
        }
        
        // Chargement zones sans délai
        if (hasValidAddress()) {
            loadZonesForCurrentView();
        } else {

        }
        // Mise à jour instantanée des actions
        if (typeof updateActionButtonsVisibility === 'function') {
            updateActionButtonsVisibility();
        }
    };
    
    APP.map.on('moveend', moveEndHandler);
    
    // Exporter le handler pour pouvoir le gérer depuis d'autres modules
    window.moveEndHandler = moveEndHandler;
    
    // Configuration de la sélection par rectangle
    setupBoxSelection();
}

/**
 * Configuration de la sélection par rectangle
 */
function setupBoxSelection() {
    APP.map.on('mousedown', (e) => {
        if (GLOBAL_STATE.currentTool !== 'manual' || (!e.originalEvent.shiftKey && !e.originalEvent.ctrlKey)) return;
        
        e.preventDefault();
        APP.map.dragPan.disable();
        
        GLOBAL_STATE.isBoxSelecting = true;
        GLOBAL_STATE.boxSelectStart = e.point;
        
        GLOBAL_STATE.boxSelectElement = document.createElement('div');
        const isRemoveMode = e.originalEvent.ctrlKey;
        GLOBAL_STATE.boxSelectElement.style.cssText = `
            position: absolute;
            border: 2px solid ${isRemoveMode ? '#dc3545' : '#4A90E2'};
            background: ${isRemoveMode ? 'rgba(220, 53, 69, 0.1)' : 'rgba(74, 144, 226, 0.1)'};
            pointer-events: none;
            z-index: 999;
        `;
        GLOBAL_STATE.boxSelectElement.dataset.mode = isRemoveMode ? 'remove' : 'add';
        APP.map.getContainer().appendChild(GLOBAL_STATE.boxSelectElement);
    });
    
    APP.map.on('mousemove', (e) => {
        if (!GLOBAL_STATE.isBoxSelecting || !GLOBAL_STATE.boxSelectElement) return;
        
        const current = e.point;
        const minX = Math.min(GLOBAL_STATE.boxSelectStart.x, current.x);
        const maxX = Math.max(GLOBAL_STATE.boxSelectStart.x, current.x);
        const minY = Math.min(GLOBAL_STATE.boxSelectStart.y, current.y);
        const maxY = Math.max(GLOBAL_STATE.boxSelectStart.y, current.y);
        
        GLOBAL_STATE.boxSelectElement.style.left = minX + 'px';
        GLOBAL_STATE.boxSelectElement.style.top = minY + 'px';
        GLOBAL_STATE.boxSelectElement.style.width = (maxX - minX) + 'px';
        GLOBAL_STATE.boxSelectElement.style.height = (maxY - minY) + 'px';
    });
    
    APP.map.on('mouseup', (e) => {
        if (!GLOBAL_STATE.isBoxSelecting) return;
        
        APP.map.dragPan.enable();
        
        if (GLOBAL_STATE.boxSelectStart && GLOBAL_STATE.boxSelectElement) {
            const current = e.point;
            const bbox = [
                [Math.min(GLOBAL_STATE.boxSelectStart.x, current.x), Math.min(GLOBAL_STATE.boxSelectStart.y, current.y)],
                [Math.max(GLOBAL_STATE.boxSelectStart.x, current.x), Math.max(GLOBAL_STATE.boxSelectStart.y, current.y)]
            ];
            
            const isRemoveMode = GLOBAL_STATE.boxSelectElement.dataset.mode === 'remove';
            if (isRemoveMode) {
                removeZonesInBox(bbox);
            } else {
                selectZonesInBox(bbox);
            }
            
            GLOBAL_STATE.boxSelectElement.remove();
        }
        
        GLOBAL_STATE.isBoxSelecting = false;
        GLOBAL_STATE.boxSelectStart = null;
        GLOBAL_STATE.boxSelectElement = null;
    });
}

// ===== GESTION DES SOURCES ET LAYERS =====

/**
 * Filtrer les zones visibles dans le viewport actuel
 */
function filterZonesInViewport(zones) {
    if (!APP.map) return zones;
    
    const bounds = APP.map.getBounds();
    const viewport = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
    };
    
    // Ajouter une marge de 20% pour éviter les pop-in
    const latMargin = (viewport.north - viewport.south) * 0.2;
    const lngMargin = (viewport.east - viewport.west) * 0.2;
    
    viewport.north += latMargin;
    viewport.south -= latMargin;
    viewport.east += lngMargin;
    viewport.west -= lngMargin;
    

    
    let visibleCount = 0;
    let outOfViewCount = 0;
    
    const filtered = zones.filter(zone => {
        if (!zone.geometry || !zone.geometry.coordinates) return false;
        
        try {
            // Calculer une bbox approximative pour la zone
            let minLat = Infinity, maxLat = -Infinity;
            let minLng = Infinity, maxLng = -Infinity;
            
            let coords;
            if (zone.geometry.type === 'Polygon') {
                coords = zone.geometry.coordinates[0];
            } else if (zone.geometry.type === 'MultiPolygon') {
                // Pour MultiPolygon, prendre tous les points
                coords = [];
                zone.geometry.coordinates.forEach(polygon => {
                    coords = coords.concat(polygon[0]);
                });
            } else {
                return false;
            }
            
            // Calculer la bbox de la zone
            coords.forEach(coord => {
                const lng = coord[0];
                const lat = coord[1];
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            });
            
            // Vérifier si la bbox de la zone intersecte avec le viewport
            const intersects = !(maxLat < viewport.south || minLat > viewport.north ||
                                maxLng < viewport.west || minLng > viewport.east);
            
            if (intersects) {
                visibleCount++;
            } else {
                outOfViewCount++;
            }
            
            return intersects;
        } catch (e) {
            console.warn('[FILTER-DEBUG] Erreur filtrage zone:', zone.id, e);
            return false;
        }
    });
    

    
    return filtered;
}

/**
 * Mise à jour de la carte avec toutes les zones
 */
function updateMapWithAllCachedZones() {
    if (!APP.map || !APP.map.isStyleLoaded()) {

        
        // Double sécurité : event + timeout
        let updated = false;
        
        // Essayer avec l'événement styledata
        APP.map.once('styledata', () => {
            if (!updated) {
                updated = true;

                setTimeout(() => updateMapWithAllCachedZones(), 200);
            }
        });
        
        // Timeout de sécurité au cas où l'événement ne se déclenche pas
        setTimeout(() => {
            if (!updated && APP.map && APP.map.isStyleLoaded()) {
                updated = true;

                updateMapWithAllCachedZones();
            }
        }, 500);
        
        return;
    }
    

    
    if (isInUSLMode()) {
        updateUSLDisplay();
    } else {
        // Afficher les zones France
        updateFranceZonesDisplay();
        
        // NOUVEAU : Afficher aussi les USL en mode debug (pointillés gris)
        updateUSLDisplayForDebug();
    }
}

/**
 * Affichage des zones USL
 */
function updateUSLDisplay() {
    const zones = Array.from(GLOBAL_STATE.uslCache.values());
    
    let validCount = 0;
    let invalidCount = 0;
    
    const t0 = performance.now();
    
    const geojsonData = {
        type: 'FeatureCollection',
        features: zones.map(zone => {
            // Validation stricte avant création de la feature
            if (!window.validateZoneGeometry || !window.validateZoneGeometry(zone)) {
                console.warn('[USL] Zone USL avec géométrie invalide ignorée:', zone.id);
                invalidCount++;
                return null;
            }
            
            validCount++;
            return {
                type: 'Feature',
                properties: {
                    id: zone.id,
                    foyers: zone.foyers || 0
                },
                geometry: zone.geometry
            };
        }).filter(f => f !== null) // Supprimer les features invalides
    };
    
    
    
    const t1 = performance.now();

    
    updateSource('zones-usl', geojsonData);
    
    const t2 = performance.now();

    
    if (!APP.map.getLayer('zones-usl-fill')) {
        createUSLLayers();
    } else {
        // Si les layers existent déjà, s'assurer que les événements sont attachés
        setupZoneEvents('zones-usl-fill');
        setupZoneEvents('zones-usl-line');
        setupZoneEvents('zones-usl-selected');
    }
    
    // IMPORTANT : S'assurer que tous les layers USL sont visibles
    const uslLayers = [
        'zones-usl-fill',
        'zones-usl-line',
        'zones-usl-selected',
        'zones-usl-selected-line'
    ];
    
    uslLayers.forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.setLayoutProperty(layerId, 'visibility', 'visible');
        }
    });
    
    // Masquer le layer debug s'il existe
    if (APP.map.getLayer('zones-usl-debug-line')) {
        APP.map.setLayoutProperty('zones-usl-debug-line', 'visibility', 'none');
    }
    
    updateUSLColors();
}

/**
 * Affichage des zones USL en mode debug (non-USL)
 */
function updateUSLDisplayForDebug() {
    const zones = Array.from(GLOBAL_STATE.uslCache.values());
    
    if (zones.length === 0) return;
    
    const geojsonData = {
        type: 'FeatureCollection',
        features: zones.map(zone => {
            if (!window.validateZoneGeometry || !window.validateZoneGeometry(zone)) {
                return null;
            }
            
            return {
                type: 'Feature',
                properties: {
                    id: zone.id,
                    foyers: zone.foyers || 0
                },
                geometry: zone.geometry
            };
        }).filter(f => f !== null)
    };
    
    updateSource('zones-usl', geojsonData);
    
    // En mode Non-USL, les USL sont complètement invisibles (pas de debug)
    // Masquer tous les layers USL
    const uslLayers = [
        'zones-usl-fill',
        'zones-usl-line',
        'zones-usl-selected',
        'zones-usl-selected-line'
    ];
    
    uslLayers.forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.setLayoutProperty(layerId, 'visibility', 'none');
        }
    });
}

/**
 * Affichage des zones France (non-USL)
 */
function updateFranceZonesDisplay() {
    // Zones principales - Filtrer seulement celles visibles
    const allMainZones = Array.from(GLOBAL_STATE.currentZonesCache.values());
    const mainZones = filterZonesInViewport(allMainZones);
    
    
    
    const mainGeoJSON = {
        type: 'FeatureCollection',
        features: mainZones.map(zone => {
            // Validation stricte avant création de la feature
            if (!window.validateZoneGeometry || !window.validateZoneGeometry(zone)) {
                console.warn('[FRANCE] Zone France avec géométrie invalide ignorée:', zone.id);
                return null;
            }
            
            return {
                type: 'Feature',
                properties: {
                    id: zone.id,
                    code: zone.code,
                    nom: zone.nom || ''
                },
                geometry: zone.geometry
            };
        }).filter(f => f !== null)
    };
    
    // Zones supérieures (contexte)
    const superiorZones = Array.from(GLOBAL_STATE.superiorZonesCache.values());
    const superiorGeoJSON = {
        type: 'FeatureCollection',
        features: superiorZones.map(zone => {
            // Validation stricte avant création de la feature
            if (!window.validateZoneGeometry || !window.validateZoneGeometry(zone)) {
                console.warn('[FRANCE] Zone supérieure avec géométrie invalide ignorée:', zone.code);
                return null;
            }
            
            return {
                type: 'Feature',
                properties: {
                    code: zone.code
                },
                geometry: zone.geometry
            };
        }).filter(f => f !== null)
    };
    
    updateSource('zones-france', mainGeoJSON);
    updateSource('zones-france-superior', superiorGeoJSON);
    
    
    
    if (!APP.map.getLayer('zones-france-fill')) {
        createFranceLayers();
    } else {
        // Si les layers existent déjà, s'assurer que les événements sont attachés
        setupZoneEvents('zones-france-fill');
        setupZoneEvents('zones-france-line');
        setupZoneEvents('zones-france-selected');
    }
    
    // IMPORTANT : S'assurer que les layers France sont visibles
    // Afficher tous les layers France
    const franceLayers = [
        'zones-france-fill',
        'zones-france-line',
        'zones-france-selected',
        'zones-france-selected-line',
        'zones-france-superior-line'
    ];
    
    franceLayers.forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.setLayoutProperty(layerId, 'visibility', 'visible');
        }
    });
    
    // Masquer TOUS les layers USL en mode non-USL (ils doivent être invisibles)
    const uslLayers = [
        'zones-usl-fill',
        'zones-usl-line',
        'zones-usl-selected',
        'zones-usl-selected-line'
    ];
    
    uslLayers.forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.setLayoutProperty(layerId, 'visibility', 'none');
        }
    });
    
    updateFranceColors();
    
    // Réinitialiser les événements de survol si les labels sont activés
    if (typeof window.resetLabelsEvents === 'function') {
        window.resetLabelsEvents();
    }
}

/**
 * Création des layers USL
 */
function createUSLLayers() {
    console.log('[LAYERS] Création des layers USL...');
    
    // Layer de remplissage (transparent par défaut comme Zecible)
    APP.map.addLayer({
        id: 'zones-usl-fill',
        type: 'fill',
        source: 'zones-usl',
        paint: {
            'fill-color': CONFIG.COLORS.DEFAULT_ZONE_OUTLINE,
            'fill-opacity': 0
        }
    });
    
    // Layer de contour 
    APP.map.addLayer({
        id: 'zones-usl-line',
        type: 'line',
        source: 'zones-usl',
        paint: {
            'line-color': CONFIG.COLORS.DEFAULT_ZONE_OUTLINE,
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                9, 0.01,     // zoom 9 → épaisseur 0.1px
                15, 1.7     // zoom 15 → épaisseur 1.7px (max)
            ],
            'line-opacity': 1  // Opacité complète comme Zecible
        }
    });
    
    // Layer sélection remplissage
    APP.map.addLayer({
        id: 'zones-usl-selected',
        type: 'fill',
        source: 'zones-usl',
        paint: {
            'fill-color': CONFIG.COLORS.SELECTED_ZONE,
            'fill-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                9, 0.5,       // zoom 9 → opacité 0.9 (opaque)
                15, 0.2     // zoom 15 → opacité 0.3 (plus transparent)
            ],
            'fill-outline-color': CONFIG.COLORS.SELECTED_ZONE,  // Même couleur pour éviter les bordures
            'fill-antialias': false  // Antialiasing activé
        },
        filter: ['in', 'id', '']
    });
    
    // Layer sélection contour - INVISIBLE
    APP.map.addLayer({
        id: 'zones-usl-selected-line',
        type: 'line',
        source: 'zones-usl',
        paint: {
            'line-color': CONFIG.COLORS.SELECTED_ZONE,
            'line-width': 0,  // Pas de contour
            'line-opacity': 0  // Complètement invisible
        },
        filter: ['in', 'id', '']
    });
    
    // IMPORTANT : Configurer les événements de clic sur TOUTES les couches cliquables
    setupZoneEvents('zones-usl-fill');
    setupZoneEvents('zones-usl-line');
    setupZoneEvents('zones-usl-selected');  // Pour pouvoir désélectionner

    // S'assurer que les labels/arrondissements restent visibles par-dessus
    bringReferenceLayersToFront();
}

/**
 * Création des layers France
 */
function createFranceLayers() {
    console.log('[LAYERS] Création des layers France...');
    
    // ORDRE IMPORTANT : Les zones principales d'abord
    
    // Zones principales (remplissage transparent par défaut)
    APP.map.addLayer({
        id: 'zones-france-fill',
        type: 'fill',
        source: 'zones-france',
        paint: {
            'fill-color': CONFIG.COLORS.DEFAULT_ZONE_OUTLINE,
            'fill-opacity': 0
        }
    });
    
    // Zones principales (contour violet clair avec largeur adaptative)
    APP.map.addLayer({
        id: 'zones-france-line',
        type: 'line',
        source: 'zones-france',
        paint: {
            'line-color': CONFIG.COLORS.DEFAULT_ZONE_OUTLINE,
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                9, 0.2,     // zoom 9 → épaisseur 0.2px
                15, 1.5     // zoom 15 → épaisseur 1.5px (max)
            ],
            'line-opacity': 1  // Opacité complète comme Zecible
        }
    });
    
    // Source dédiée aux zones sélectionnées France (non filtrée par viewport)
    if (!APP.map.getSource('zones-france-selected-source')) {
        APP.map.addSource('zones-france-selected-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
    }
    
    // Layer sélection remplissage (utilise la source dédiée)
    APP.map.addLayer({
        id: 'zones-france-selected',
        type: 'fill',
        source: 'zones-france-selected-source',
        paint: {
            'fill-color': CONFIG.COLORS.SELECTED_ZONE,
            'fill-opacity': 0.6,
            'fill-outline-color': CONFIG.COLORS.SELECTED_ZONE,
            'fill-antialias': true
        }
    });
    
    // Layer sélection contour - INVISIBLE
    APP.map.addLayer({
        id: 'zones-france-selected-line',
        type: 'line',
        source: 'zones-france-selected-source',
        paint: {
            'line-color': CONFIG.COLORS.SELECTED_ZONE,
            'line-width': 0,
            'line-opacity': 0
        }
    });
    
    // LAYER SUPÉRIEUR EN DERNIER (comme Zecible) - Contours gris pointillés
    // On l'ajoute APRÈS tous les autres layers pour qu'il soit au-dessus
    APP.map.addLayer({
        id: 'zones-france-superior-line',
        type: 'line',
        source: 'zones-france-superior',
        paint: {
            'line-color': CONFIG.COLORS.SUPERIOR_ZONE_OUTLINE,  // #555555 - Gris
            'line-width': 1,
            'line-opacity': 1,
            'line-dasharray': [10, 3]  // Pointillés comme Zecible
        }
    });
    
    // IMPORTANT : Configurer les événements de clic sur TOUTES les couches cliquables
    setupZoneEvents('zones-france-fill');
    setupZoneEvents('zones-france-line');
    setupZoneEvents('zones-france-selected');  // Pour pouvoir désélectionner

    // S'assurer que les labels/arrondissements restent visibles par-dessus
    bringReferenceLayersToFront();
}

// === GESTION DES LABELS AU SURVOL ===

let currentLabelElement = null;
let labelsEnabled = false;

/**
 * Active/désactive l'affichage des labels
 */
function toggleLabelsVisibility(enabled) {
    labelsEnabled = enabled;
    
    if (!enabled && currentLabelElement) {
        currentLabelElement.remove();
        currentLabelElement = null;
    }
    
    // Réinitialiser les événements
    resetLabelsEvents();
}

/**
 * Réinitialise les événements de survol selon le type de zone
 */
function resetLabelsEvents() {
    if (!APP.map) return;

    
    // Retirer TOUS les anciens listeners sur les couches France (vrais noms)
    const possibleLayers = ['zones-france-fill', 'zones-france-line', 'zones-france-superior-line'];
    possibleLayers.forEach(layer => {
        if (APP.map.getLayer(layer)) {
            try { APP.map.off('mousemove', layer); } catch(_) {}
            try { APP.map.off('mouseleave', layer); } catch(_) {}

        }
    });
    
    // Ne PAS activer pour mediaposte (USL)
    if (GLOBAL_STATE.currentZoneType === 'mediaposte') return;
    
    // Activer sur les bonnes couches
    if (labelsEnabled) {
        possibleLayers.forEach(layer => {
            if (APP.map.getLayer(layer)) {
                APP.map.on('mousemove', layer, handleZoneHover);
                APP.map.on('mouseleave', layer, hideZoneLabel);

            }
        });
    }
}

/**
 * Gère le survol d'une zone
 */
function handleZoneHover(e) {
    if (!labelsEnabled) return;
    if (GLOBAL_STATE.currentZoneType === 'mediaposte') return;
    if (!e.features || e.features.length === 0) return;
    const properties = e.features[0].properties || {};

    showZoneLabel(properties);
}

/**
 * Affiche le label d'une zone
 */
function showZoneLabel(properties) {

    
    // Créer ou réutiliser l'élément
    if (!currentLabelElement) {
        currentLabelElement = document.createElement('div');
        currentLabelElement.className = 'zone-label';
        const container = document.getElementById('map-container') || document.body;
        container.appendChild(currentLabelElement);
    }
    
    // Formater le contenu selon le type (aligné sur Zecible V2)
    let content = '';
    switch (GLOBAL_STATE.currentZoneType) {
        case 'iris':
            content = `
                <span class="zone-label-code">${properties.code || ''}</span>
                <span class="zone-label-name">${properties.nom || ''}</span>
            `;
            break;
        case 'commune':
            content = `
                <span class="zone-label-code">${properties.code || ''}</span>
                <span class="zone-label-name">${properties.nom || ''}</span>
            `;
            break;
        case 'code_postal':
            // Pour les codes postaux, afficher la liste des villes
            content = `
                <span class="zone-label-code">${properties.code || ''}</span>
                <span class="zone-label-name">${properties.nom || ''}</span>
            `;
            break;
        case 'departement':
            content = `
                <span class="zone-label-code">${properties.code || ''}</span>
                <span class="zone-label-name">${properties.nom || ''}</span>
            `;
            break;
        default:
            content = '';
    }
    
    currentLabelElement.innerHTML = content;
    currentLabelElement.classList.add('active');
}

/**
 * Cache le label
 */
function hideZoneLabel() {
    if (currentLabelElement) {
        currentLabelElement.classList.remove('active');
    }
}

// Exporter les fonctions
window.toggleLabelsVisibility = toggleLabelsVisibility;
window.resetLabelsEvents = resetLabelsEvents;

/**
 * Mise à jour d'une source avec vérification
 */
function updateSource(sourceId, data) {
    try {
        if (APP.map.getSource(sourceId)) {
            APP.map.getSource(sourceId).setData(data);
        } else {
            APP.map.addSource(sourceId, {
                type: 'geojson',
                data: data
            });
        }
    } catch (error) {
        console.error(`[SOURCE ERROR] Erreur mise à jour source ${sourceId}:`, error);
    }
}

// ===== MISE À JOUR DES COULEURS =====

/**
 * Mise à jour des couleurs USL
 */
function updateUSLColors() {
    if (!APP.map.getLayer('zones-usl-selected')) return;
    
    // Mettre à jour les filtres des layers de sélection
    const selectedIds = Array.from(GLOBAL_STATE.finalUSLSelection.keys());
    
    if (selectedIds.length === 0) {
        // Aucune sélection - afficher toutes les zones dans les couches inférieures
        APP.map.setFilter('zones-usl-selected', ['in', 'id', '']);
        APP.map.setFilter('zones-usl-selected-line', ['in', 'id', '']);
        APP.map.setFilter('zones-usl-fill', null);  // Retirer le filtre
        APP.map.setFilter('zones-usl-line', null);  // Retirer le filtre
    } else {
        // Appliquer le filtre pour les zones sélectionnées
        APP.map.setFilter('zones-usl-selected', ['in', 'id', ...selectedIds]);
        APP.map.setFilter('zones-usl-selected-line', ['in', 'id', ...selectedIds]);
        
        // IMPORTANT : Masquer les zones sélectionnées des couches inférieures
        // pour éviter la superposition
        APP.map.setFilter('zones-usl-fill', ['!', ['in', ['get', 'id'], ['literal', selectedIds]]]);
        APP.map.setFilter('zones-usl-line', ['!', ['in', ['get', 'id'], ['literal', selectedIds]]]);
    }
}

/**
 * Mise à jour des couleurs France
 */
function updateFranceColors() {
    if (!APP.map.getLayer('zones-france-selected')) return;
    
    // Mettre à jour les filtres des layers de sélection
    const selectedIds = Array.from(GLOBAL_STATE.tempSelection.keys());
    
    // Mettre à jour la source dédiée pour la sélection (non filtrée par viewport)
    try {
        const features = selectedIds.map(id => {
            const zone = GLOBAL_STATE.currentZonesCache.get(id);
            if (!zone || !zone.geometry) return null;
            return {
                type: 'Feature',
                properties: { id: id, code: zone.code || id, nom: zone.nom || '' },
                geometry: zone.geometry
            };
        }).filter(f => f !== null);
        const source = APP.map.getSource('zones-france-selected-source');
        if (source) {
            source.setData({ type: 'FeatureCollection', features });
        }
    } catch (_) {}

    // Couches inférieures: masquer les sélectionnées pour éviter la double superposition
    if (selectedIds.length === 0) {
        APP.map.setFilter('zones-france-fill', null);
        APP.map.setFilter('zones-france-line', null);
    } else {
        APP.map.setFilter('zones-france-fill', ['!', ['in', ['get', 'id'], ['literal', selectedIds]]]);
        APP.map.setFilter('zones-france-line', ['!', ['in', ['get', 'id'], ['literal', selectedIds]]]);
    }
}

/**
 * Fonction générale pour mettre à jour les zones sélectionnées
 */
function updateSelectedZonesDisplay() {
    if (isInUSLMode()) {
        updateUSLColors();
    } else {
        updateFranceColors();
    }
}

// ===== ÉVÉNEMENTS SUR LES ZONES =====

/**
 * Configuration des événements sur les zones
 * @param {string} layerId - ID de la couche
 * @param {boolean} changeCursor - Si true, change le curseur au survol (par défaut: true)
 */
function setupZoneEvents(layerId, changeCursor = true) {
    // Vérifier que la couche existe
    if (!APP.map.getLayer(layerId)) {
        console.warn(`[EVENTS] Couche ${layerId} introuvable, impossible d'attacher les événements`);
        return;
    }
    
    // Nettoyer les anciens événements
    APP.map.off('click', layerId, handleZoneClick);
    APP.map.off('mouseenter', layerId);
    APP.map.off('mouseleave', layerId);
    APP.map.off('mousemove', layerId);
    
    // Ajouter l'événement de clic uniquement pour les couches non "-line"
    const isLineLayer = typeof layerId === 'string' && layerId.endsWith('-line');
    if (!isLineLayer) {
        APP.map.on('click', layerId, handleZoneClick);
    }
    
    // Ajouter les événements de curseur si demandé
    if (changeCursor) {
        // Initialiser le set global des couches survolées si nécessaire
        if (!GLOBAL_STATE.__hoveredInteractiveLayers) {
            GLOBAL_STATE.__hoveredInteractiveLayers = new Set();
        }
        
        APP.map.on('mouseenter', layerId, () => {
            GLOBAL_STATE.__hoveredInteractiveLayers.add(layerId);
            APP.map.getCanvas().style.cursor = 'pointer';
        });
        
        // Renforcer le maintien du curseur pendant le déplacement sur la couche
        APP.map.on('mousemove', layerId, () => {
            APP.map.getCanvas().style.cursor = 'pointer';
        });
        
        APP.map.on('mouseleave', layerId, () => {
            GLOBAL_STATE.__hoveredInteractiveLayers.delete(layerId);
            // Ne réinitialiser le curseur que si plus aucune couche interactive n'est survolée
            if (GLOBAL_STATE.__hoveredInteractiveLayers.size === 0) {
                APP.map.getCanvas().style.cursor = '';
            }
        });
    }
}

// ===== GESTION DES OUTILS VISUELS =====

/**
 * Affichage du cercle
 */
function showCircleOnMap() {
    if (!GLOBAL_STATE.circleCenter) return null;
    
    try {
        const circleGeoJSON = turf.circle(GLOBAL_STATE.circleCenter, GLOBAL_STATE.circleRadius, {units: 'kilometers'});
        
        updateSource('circle-source', circleGeoJSON);
        
        if (!APP.map.getLayer('circle-fill')) {
            APP.map.addLayer({
                id: 'circle-fill',
                type: 'fill',
                source: 'circle-source',
                paint: {
                    'fill-color': CONFIG.COLORS.CIRCLE_TOOL,
                    'fill-opacity': 0.2
                }
            });
            
            APP.map.addLayer({
                id: 'circle-line',
                type: 'line',
                source: 'circle-source',
                paint: {
                    'line-color': CONFIG.COLORS.CIRCLE_TOOL,
                    'line-width': 2
                }
            });
        }
        
        return circleGeoJSON;
    } catch (error) {
        console.error('[CIRCLE ERROR]', error);
        return null;
    }
}

/**
 * Masquage du cercle
 */
function hideCircle() {
    ['circle-fill', 'circle-line'].forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.removeLayer(layerId);
        }
    });
    
    if (APP.map.getSource('circle-source')) {
        APP.map.removeSource('circle-source');
    }
    
    GLOBAL_STATE.circleCenter = null;
}

/**
 * Affichage de l'isochrone
 */
function showIsochroneOnMap() {
    if (!GLOBAL_STATE.isochroneData) return;
    
    try {
        updateSource('isochrone-source', GLOBAL_STATE.isochroneData);
        
        if (!APP.map.getLayer('isochrone-fill')) {
            APP.map.addLayer({
                id: 'isochrone-fill',
                type: 'fill',
                source: 'isochrone-source',
                paint: {
                    'fill-color': CONFIG.COLORS.ISOCHRONE_TOOL,
                    'fill-opacity': 0.2
                }
            });
            
            APP.map.addLayer({
                id: 'isochrone-line',
                type: 'line',
                source: 'isochrone-source',
                paint: {
                    'line-color': CONFIG.COLORS.ISOCHRONE_TOOL,
                    'line-width': 2
                }
            });
        }
    } catch (error) {
        console.error('[ISOCHRONE ERROR]', error);
    }
}

/**
 * Masquage de l'isochrone
 */
function hideIsochrone() {
    ['isochrone-fill', 'isochrone-line'].forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.removeLayer(layerId);
        }
    });
    
    if (APP.map.getSource('isochrone-source')) {
        APP.map.removeSource('isochrone-source');
    }
    
    GLOBAL_STATE.isochroneData = null;
}

// ===== CRÉATION MARQUEUR MAGASIN =====

/**
 * Création du marqueur du point de vente avec validation stricte
 */
function createStoreMarker(coordinates, placeName) {

    
    // Validation stricte des coordonnées
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
        console.error('[MARKER ERROR] Coordonnées marqueur invalides:', coordinates);
        return;
    }
    
    const [lng, lat] = coordinates;
    
    // Vérification des types
    if (typeof lng !== 'number' || typeof lat !== 'number') {
        console.error('[MARKER ERROR] Coordonnées marqueur non numériques:', { lng, lat });
        return;
    }
    
    // Vérification NaN
    if (isNaN(lng) || isNaN(lat)) {
        console.error('[MARKER ERROR] Coordonnées marqueur NaN:', { lng, lat });
        return;
    }
    
    // Vérification null
    if (lng === null || lat === null) {
        console.error('[MARKER ERROR] Coordonnées marqueur null:', { lng, lat });
        return;
    }
    
    // Vérification des limites
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        console.error('[MARKER ERROR] Coordonnées hors limites:', { lng, lat });
        return;
    }
    

    
    // Supprimer l'ancien marqueur s'il existe
    const existingMarkers = document.getElementsByClassName('mapboxgl-marker');
    Array.from(existingMarkers).forEach(marker => marker.remove());
    
    // Supprimer aussi la source/layer du marqueur dans le canvas
    if (APP.map.getSource('store-marker')) {
        if (APP.map.getLayer('store-marker-layer')) {
            APP.map.removeLayer('store-marker-layer');
        }
        APP.map.removeSource('store-marker');
    }
    
    try {
        // Créer le nouveau marqueur HTML (pour l'interaction)
        const marker = new mapboxgl.Marker({ color: (CONFIG && CONFIG.COLORS && CONFIG.COLORS.MARKER) ? CONFIG.COLORS.MARKER : '#C366F2' })
            .setLngLat([lng, lat])
            .addTo(APP.map);
        
        // Ajouter aussi un marqueur dans le canvas (pour la capture)
        APP.map.addSource('store-marker', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                properties: {
                    name: placeName || 'Point de vente'
                }
            }
        });
        
        // Ajouter la couche du marqueur (invisible par défaut)
        // Trouver la couche la plus haute pour placer le marqueur au-dessus
        const layers = APP.map.getStyle().layers;
        let topLayerId = null;
        
        // Chercher la dernière couche de type symbol ou la dernière couche tout court
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (layer.type === 'symbol' || i === layers.length - 1) {
                topLayerId = layer.id;
                break;
            }
        }
        
        // Ajouter la couche du marqueur
        APP.map.addLayer({
            id: 'store-marker-layer',
            type: 'circle',
            source: 'store-marker',
            paint: {
                'circle-radius': 10,  // Taille raisonnable
                'circle-color': (CONFIG && CONFIG.COLORS && CONFIG.COLORS.MARKER) ? CONFIG.COLORS.MARKER : '#C366F2',  // Violet comme le marqueur HTML
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 2,
                'circle-opacity': 1,
                'circle-stroke-opacity': 1
            },
            layout: {
                'visibility': 'none' // Invisible par défaut
            }
        });  // Sans spécifier de position, il ira au-dessus

    } catch (error) {
        console.error('[MARKER ERROR] Erreur création marqueur:', error);
    }
}

// ===== UTILITAIRES =====

/**
 * Vérification si une adresse valide est présente
 */
function hasValidAddress() {
    return GLOBAL_STATE.storeLocation !== null && GLOBAL_STATE.hasValidatedAddress === true;
}

/**
 * Ajustement de la vue selon une géométrie avec protection
 */
function fitMapToGeometry(map, geometry) {
    try {
        if (!geometry || !map) return;
        
        const bbox = turf.bbox(geometry);
        
        // Vérifier que la bbox est valide
        if (bbox.some(coord => typeof coord !== 'number' || isNaN(coord))) {
            console.error('[FIT ERROR] BBox invalide:', bbox);
            return;
        }
        
        map.fitBounds(bbox, {
            padding: { top: 50, bottom: 50, left: 50, right: 400 },
            duration: 1000
        });
    } catch (error) {
        console.warn('[FIT ERROR] Impossible d\'ajuster la vue:', error);
    }
}

/**
 * Limites de zoom selon le mode courant
 */
function getModeZoomLimits() {
    try {
        const isUSL = typeof isInUSLMode === 'function' ? isInUSLMode() : false;
        const DEFAULT_MAX_ZOOM_USL = 16;
        const DEFAULT_MAX_ZOOM_FR = 14;
        const minZoom = isUSL
            ? (CONFIG.ZONE_LIMITS?.mediaposte?.MIN_ZOOM_DISPLAY ?? 10)
            : (CONFIG.ZONE_LIMITS?.[GLOBAL_STATE.currentZoneType]?.MIN_ZOOM_DISPLAY ?? 7);
        const maxZoom = isUSL ? DEFAULT_MAX_ZOOM_USL : DEFAULT_MAX_ZOOM_FR;
        return { minZoom, maxZoom };
    } catch (_) {
        return { minZoom: 7, maxZoom: 16 };
    }
}

/**
 * Incrémente le zoom de la carte avec contraintes et pas fixe
 */
function incrementZoom(step) {
    if (!APP.map) return;
    const { minZoom, maxZoom } = getModeZoomLimits();
    const current = APP.map.getZoom();
    let target = current + step;
    if (target < minZoom) target = minZoom;
    if (target > maxZoom) target = maxZoom;
    if (target !== current) {
        APP.map.setZoom(target);
    }
}

/**
 * Masquer tous les layers non-USL
 */
function hideNonUSLLayers() {
    
    // Masquer les layers France
    const franceLayers = [
        'zones-france-fill',
        'zones-france-line',
        'zones-france-selected',
        'zones-france-selected-line',
        'zones-france-superior-line'
    ];
    
    franceLayers.forEach(layerId => {
        if (APP.map.getLayer(layerId)) {
            APP.map.setLayoutProperty(layerId, 'visibility', 'none');
        }
    });
    
    // Masquer aussi le layer de debug USL s'il existe
    if (APP.map.getLayer('zones-usl-debug-line')) {
        APP.map.setLayoutProperty('zones-usl-debug-line', 'visibility', 'none');
    }
    
    // IMPORTANT : S'assurer que les layers USL normaux sont visibles
    if (APP.map.getLayer('zones-usl-fill')) {
        APP.map.setLayoutProperty('zones-usl-fill', 'visibility', 'visible');
    }
    if (APP.map.getLayer('zones-usl-line')) {
        APP.map.setLayoutProperty('zones-usl-line', 'visibility', 'visible');
    }
    
    
}

/**
 * Fonction de débogage pour les zones supérieures
 */
function debugSuperiorZones() {
    console.log('=== DEBUG ZONES SUPÉRIEURES ===');
    console.log('Cache size:', GLOBAL_STATE.superiorZonesCache.size);
    
    // Vérifier la source
    const source = APP.map.getSource('zones-france-superior');
    if (source) {
        console.log('Source zones-france-superior existe');
        if (source._data) {
            console.log('Nombre de features:', source._data.features.length);
            if (source._data.features.length > 0) {
                console.log('Première feature:', source._data.features[0]);
            }
        }
    } else {
        console.log('Source zones-france-superior n\'existe pas!');
    }
    
    // Vérifier le layer
    const layer = APP.map.getLayer('zones-france-superior-line');
    if (layer) {
        console.log('Layer zones-france-superior-line existe');
        const visibility = APP.map.getLayoutProperty('zones-france-superior-line', 'visibility');
        console.log('Visibility:', visibility || 'visible (par défaut)');
        const paint = APP.map.getPaintProperty('zones-france-superior-line', 'line-color');
        console.log('Line color:', paint);
        const width = APP.map.getPaintProperty('zones-france-superior-line', 'line-width');
        console.log('Line width:', width);
        const opacity = APP.map.getPaintProperty('zones-france-superior-line', 'line-opacity');
        console.log('Line opacity:', opacity);
    } else {
        console.log('Layer zones-france-superior-line n\'existe pas!');
    }
    
    // Vérifier la valeur de CONFIG.COLORS.SUPERIOR_ZONE_OUTLINE
    console.log('CONFIG.COLORS.SUPERIOR_ZONE_OUTLINE:', CONFIG.COLORS.SUPERIOR_ZONE_OUTLINE);
}

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.initMap = initMap;
window.updateMapWithAllCachedZones = updateMapWithAllCachedZones;
window.updateSelectedZonesDisplay = updateSelectedZonesDisplay;
window.showCircleOnMap = showCircleOnMap;
window.hideCircle = hideCircle;
window.showIsochroneOnMap = showIsochroneOnMap;
window.hideIsochrone = hideIsochrone;
window.createStoreMarker = createStoreMarker;
window.hasValidAddress = hasValidAddress;
window.fitMapToGeometry = fitMapToGeometry;
window.hideNonUSLLayers = hideNonUSLLayers;
window.debugSuperiorZones = debugSuperiorZones;

// Note: toggleLabelsVisibility est déjà définie plus haut (ligne 773) avec la gestion correcte de labelsEnabled

/**
 * Remonte au premier plan les labels de villes et limites d'arrondissements
 * sans impacter le reste des couches
 */
function bringReferenceLayersToFront() {
    try {
        if (!APP.map || !APP.map.getStyle) return;
        const style = APP.map.getStyle();
        const layers = (style && Array.isArray(style.layers)) ? style.layers : [];
        const idsToTop = [];
        layers.forEach(layer => {
            const id = layer && layer.id ? layer.id : '';
            const srcLayer = layer && layer['source-layer'] ? layer['source-layer'] : '';
            const type = layer && layer.type ? layer.type : '';
            const isCityLabel = type === 'symbol' && (
                /place-label|locality|settlement|neighborhood|place-city|place-town|place-village/i.test(id) ||
                /place_label|locality|settlement|neighborhood/i.test(srcLayer)
            );
            const isAdminBoundary = type === 'line' && (
                /admin-?3-?4-?boundaries|admin-?2-?boundaries|admin-?boundaries/i.test(id) ||
                /admin/i.test(srcLayer)
            );
            if (isCityLabel || isAdminBoundary) {
                idsToTop.push(id);
            }
        });
        // Dé-duplication et déplacement au-dessus de tous les layers personnalisés
        Array.from(new Set(idsToTop)).forEach(id => {
            if (APP.map.getLayer(id)) {
                try { APP.map.moveLayer(id); } catch(_) {}
            }
        });
    } catch (e) {
        console.warn('[LAYERS] Impossible de remonter les couches de référence:', e);
    }
}