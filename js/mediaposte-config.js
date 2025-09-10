// Configuration Médiaposte
const CONFIG = {
    MAPBOX_TOKEN: 'pk.eyJ1IjoibWljaGVsLWF0dGFsaSIsImEiOiJjbWF4eTJnMWQwMzZ3MmpyMDB3b2h0NG1vIn0.EOP-_T7vR2peVDLkrqS1bQ',
    
    ZONE_TYPES: {
        mediaposte: {
            id: 'mediaposte',
            label: 'Mediaposte (USL)',
            table: 'zones_mediapost',
            codeField: 'id',
            nameField: 'foyers',
            color: '#FF6B6B',
            opacity: 0.3,
            isUSL: true,
            superiorType: null // Pas de zone supérieure pour USL
        },
        iris: {
            id: 'iris',
            label: 'IRIS',
            table: 'iris_france',
            codeField: 'code_iris',
            nameField: 'nom_iris',
            color: '#4ECDC4',
            opacity: 0.3,
            isUSL: false,
            superiorType: 'commune' // Les communes sont supérieures aux IRIS
        },
        commune: {
            id: 'commune',
            label: 'Communes',
            table: 'communes_france',
            codeField: 'code_insee',
            nameField: 'nom_commune',
            color: '#45B7D1',
            opacity: 0.3,
            isUSL: false,
            superiorType: 'departement' // Les départements sont supérieurs aux communes
        },
        code_postal: {
            id: 'code_postal',
            label: 'Codes Postaux',
            table: 'codes_postaux_france',
            codeField: 'code_postal',
            nameField: 'nom_commune',
            color: '#9C27B0',
            opacity: 0.3,
            isUSL: false,
            superiorType: 'departement' // Les départements sont supérieurs aux codes postaux
        },
        departement: {
            id: 'departement',
            label: 'Départements',
            table: 'departements_france',
            codeField: 'code_dept',
            nameField: 'nom_dept',
            color: '#FFA726',
            opacity: 0.25,
            isUSL: false,
            superiorType: null // Pas de zone supérieure pour les départements
        }
    },
    
    ZONE_LIMITS: {
        mediaposte: {
            MIN_ZOOM_DISPLAY: 8.5,
            DEFAULT_ZOOM_ON_CHANGE: 13,
            AFTER_IMPORT_ZOOM: 15,
            MAX_ZONES_PER_REQUEST: 2000
        },
        iris: {
            MIN_ZOOM_DISPLAY: 9,
            DEFAULT_ZOOM_ON_CHANGE: 13,
            AFTER_IMPORT_ZOOM: 15
        },
        commune: {
            MIN_ZOOM_DISPLAY: 8,
            DEFAULT_ZOOM_ON_CHANGE: 11,
            AFTER_IMPORT_ZOOM: 13
        },
        code_postal: {
            MIN_ZOOM_DISPLAY: 7,
            DEFAULT_ZOOM_ON_CHANGE: 10,
            AFTER_IMPORT_ZOOM: 12
        },
        departement: {
            MIN_ZOOM_DISPLAY: 5,
            DEFAULT_ZOOM_ON_CHANGE: 9,
            AFTER_IMPORT_ZOOM: 10
        }
    },
    
    MAP_CONFIG: {
        center: [2.3522, 48.8566],
        zoom: 6,
        style: 'mapbox://styles/mapbox/streets-v12',
        maxBounds: [[-5.4, 41.2], [10.2, 51.3]]
    },
    
    CONVERSION: {
        MIN_COVERAGE_RATIO: 0.4,  // 40% minimum
        BATCH_SIZE: 100           // Zones à traiter par batch
    },
    
    COLORS: {
        SELECTED_ZONE: '#C366F2',          // Violet pour les zones sélectionnées (remplace orange #FF7F00)
        DEFAULT_ZONE_OUTLINE: '#E299FF',   // Violet clair pour le contour des zones non sélectionnées (remplace #FF9500)
        SUPERIOR_ZONE_OUTLINE: '#555555',  // Gris pour les contours supérieurs (identique)
        HOVER_ZONE: '#5f27cd',
        CIRCLE_TOOL: '#ffc107',
        ISOCHRONE_TOOL: '#28a745',
        POLYGON_TOOL: '#D20C0C',
        MARKER: '#8F49B3'                  // Couleur du marqueur point de vente (violet demandé)
    },
    
    TIMEOUTS: {
        SEARCH_DELAY: 300,
        MOVE_DELAY: 800,
        PRECOUNT_DELAY: 300,
        TOOL_SWITCH_DELAY: 1000,
        ZOOM_WARNING_DISPLAY: 3000
    },
    
    URBAN_KEYWORDS: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes', 
                     'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille'],
    
    DEBUG: {
        enabled: false,
        maxLogLines: 100
    }
};

const GLOBAL_STATE = {
    isLoading: false,
    currentTool: 'manual',
    currentZoneType: 'mediaposte',
    hasValidatedAddress: false,
    
    storeLocation: null,
    
    // Caches de zones
    uslCache: new Map(),
    currentZonesCache: new Map(),
    superiorZonesCache: new Map(),
    loadedBounds: [],
    
    // Sélections
    tempSelection: new Map(),      // Sélection temporaire non-USL
    finalUSLSelection: new Map(),  // Sélection finale USL
    isInTempMode: false,
    
    // Outils
    circleRadius: 1.5,
    circleCenter: null,
    isochroneData: null,
    currentPolygonId: null,
    
    // Box selection
    boxStartCoord: null,
    isBoxSelecting: false,
    
    // Mémorisation du dernier type
    lastZoneType: null,
    lastNonUSLType: null,
    
    // Session pour tables temporaires
    sessionId: null,  // NOUVEAU
    
    // Flag pour éviter la race condition lors du changement de type
    isChangingZoneType: false,  // Indique qu'un changement de type est en cours
    
    // Compteurs
    totalSelectedFoyers: 0,
    tempSelectedCount: 0
};

const APP = {
    map: null,
    draw: null
};

const DRAW_STYLES = [
    // INACTIVE POLYGON FILL
    {
        id: 'gl-draw-polygon-fill-inactive',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'active', 'true']],
        paint: {
            'fill-color': '#3bb2d0',
            'fill-outline-color': '#3bb2d0',
            'fill-opacity': 0.1
        }
    },
    // INACTIVE POLYGON OUTLINE
    {
        id: 'gl-draw-polygon-stroke-inactive',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'active', 'true']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3bb2d0', 'line-width': 2 }
    },
    // INACTIVE LINE
    {
        id: 'gl-draw-line-inactive',
        type: 'line',
        filter: ['all', ['==', '$type', 'LineString'], ['!=', 'active', 'true']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3bb2d0', 'line-width': 2 }
    },
    // INACTIVE POINT (USED BY STATIC/POINT MODES)
    {
        id: 'gl-draw-point-inactive',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['!=', 'active', 'true']],
        paint: { 'circle-radius': 5, 'circle-color': '#3bb2d0' }
    },

    // ACTIVE POLYGON FILL
    {
        id: 'gl-draw-polygon-fill-active',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
        paint: {
            'fill-color': '#fbb03b',
            'fill-outline-color': '#fbb03b',
            'fill-opacity': 0.1
        }
    },
    // ACTIVE POLYGON OUTLINE
    {
        id: 'gl-draw-polygon-stroke-active',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fbb03b', 'line-width': 2 }
    },
    // ACTIVE LINE
    {
        id: 'gl-draw-line-active',
        type: 'line',
        filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#fbb03b',
            // Eviter l'erreur d'expression en v2: si besoin de dasharray, utiliser literal
            // 'line-dasharray': ['literal', [0.2, 2]],
            'line-width': 2
        }
    },
    // MIDPOINTS
    {
        id: 'gl-draw-midpoint',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
        paint: {
            'circle-radius': 5,
            'circle-color': '#fbb03b'
        }
    },
    // ACTIVE VERTEX HALO
    {
        id: 'gl-draw-polygon-and-line-vertex-halo-active',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['==', 'active', 'true']],
        paint: { 'circle-radius': 8, 'circle-color': '#fff' }
    },
    // ACTIVE VERTEX
    {
        id: 'gl-draw-polygon-and-line-vertex-active',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['==', 'active', 'true']],
        paint: { 'circle-radius': 5, 'circle-color': '#fbb03b' }
    },
    // ACTIVE POINT (for point mode)
    {
        id: 'gl-draw-point-active',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']],
        paint: { 'circle-radius': 7, 'circle-color': '#fbb03b' }
    }
];

function getCurrentZoneConfig() {
    return CONFIG.ZONE_TYPES[GLOBAL_STATE.currentZoneType];
}

function getCurrentZoneLimits() {
    return CONFIG.ZONE_LIMITS[GLOBAL_STATE.currentZoneType];
}

function isInUSLMode() {
    return GLOBAL_STATE.currentZoneType === 'mediaposte';
}

window.CONFIG = CONFIG;
window.GLOBAL_STATE = GLOBAL_STATE;
window.APP = APP;
window.DRAW_STYLES = DRAW_STYLES;
window.getCurrentZoneConfig = getCurrentZoneConfig;
window.getCurrentZoneLimits = getCurrentZoneLimits;
window.isInUSLMode = isInUSLMode;