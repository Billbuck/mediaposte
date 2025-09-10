// Variable globale pour le geocoder
var geocoder = null;

// Fonction pour initialiser le geocoder
function InitGeocoderMapbox() {
    console.log("Initialisation du geocoder");
    
    // Créer le geocoder
    geocoder = new MapboxGeocoder({
        accessToken: CONFIG.MAPBOX_TOKEN,
        placeholder: 'Rechercher une adresse...',
        language: 'fr',
        countries: 'fr',
        types: 'address,poi',
        mapboxgl: mapboxgl
    });
    
    // Récupérer le conteneur et le vider
    var conteneur = document.getElementById('geocoder-container');
    conteneur.innerHTML = ''; // Vider le "Saisissez votre texte"
    
    // Ajouter le geocoder
    conteneur.appendChild(geocoder.onAdd());
    
    // Quand une adresse est sélectionnée
    geocoder.on('result', function(e) {
        // Récupérer les infos
        var adresse = e.result.place_name;
        var lng = e.result.center[0];
        var lat = e.result.center[1];
        
        console.log("Adresse sélectionnée:", adresse);
        console.log("Coordonnées:", lat, lng);
        
        // Vider la sélection actuelle avant de changer d'adresse
        if (window.clearSelection) {
            window.clearSelection();
            console.log("Sélection vidée");
        }
        
        // NOUVEAU : Mettre à jour le libellé d'adresse WebDev
        // Utiliser la fonction window.updateWebDevAddress si elle existe
        if (window.updateWebDevAddress) {
            window.updateWebDevAddress(adresse);
        }
        
        // Mettre à jour la carte
        if (window.initializeMapFromWebDev) {
            window.initializeMapFromWebDev(lat, lng, adresse);
        }
    });
}