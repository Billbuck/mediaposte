// ===== FONCTIONS DE SAUVEGARDE ET CHARGEMENT D'ÉTUDES =====

// NOTE: La fonction getStudyDataForSave() a été déplacée dans mediaposte-main.js
// pour éviter les doublons et centraliser la logique de sauvegarde

/**
 * Charge une étude sauvegardée
 * @param {Object} studyData - Les données de l'étude à charger
 * @returns {Promise<boolean>} True si le chargement a réussi
 */
async function loadStudy(studyData) {
	    console.log("=== CHARGEMENT ÉTUDE ===");
    console.log("Données reçues:", studyData);
    console.log("Adresse à restaurer:", studyData.store.adresse);

    try {
        // Validation des données
        if (!studyData || !studyData.store || !studyData.selection) {
            throw new Error('Données d\'étude invalides');
        }
        
        // 1. Réinitialiser l'application
        clearSelection();
        clearCache();
        
        // 2. Restaurer l'adresse du point de vente
        const storeAddress = studyData.store.adresse;
        
        const addressInput = document.getElementById('address-input');
        if (addressInput) {
            addressInput.value = storeAddress;
        }
        
        // NOUVEAU : Mettre à jour le libellé d'adresse WebDev
        if (window.updateWebDevAddress) {
            window.updateWebDevAddress(storeAddress);
        }
        
        // 3. Restaurer la position du magasin
        GLOBAL_STATE.storeLocation = [
            studyData.store.longitude,
            studyData.store.latitude
        ];
        
        // 4. Créer le marqueur
        createStoreMarker(GLOBAL_STATE.storeLocation, storeAddress);
        
        // 5. Afficher toutes les sections
        showAllSections();
        
        // 6. Centrer la carte sur le point de vente avec un zoom adapté
        APP.map.flyTo({
            center: GLOBAL_STATE.storeLocation,
            zoom: 14,
            duration: 2000
        });
        
        // 7. Attendre que la carte se stabilise
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        // 8. Charger les zones de la vue actuelle
        await loadZonesForCurrentView(true);
        
        // 9. Attendre que les zones soient chargées
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 10. Restaurer la sélection
        let restoredCount = 0;
        let notFoundZones = [];
        
        // Récupérer les USL à restaurer
        const zoneIds = studyData.selection.tabUsl || [];
        
        zoneIds.forEach(zoneId => {
            // Vérifier que la zone existe dans le cache USL
            const zone = GLOBAL_STATE.uslCache.get(zoneId);
            if (zone) {
                GLOBAL_STATE.finalUSLSelection.add(zoneId);
                GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
                restoredCount++;
            } else {
                notFoundZones.push(zoneId);
            }
        });
        
        // 11. Mettre à jour l'affichage
        updateSelectionDisplay();
        updateUSLColors();
        
        // 12. Si des zones n'ont pas été trouvées, essayer de dézoomer et recharger
        if (notFoundZones.length > 0) {
            console.log(`${notFoundZones.length} zones non trouvées, tentative de chargement élargi...`);
            
            // Dézoomer d'un niveau
            APP.map.setZoom(APP.map.getZoom() - 1);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Recharger les zones
            await loadZonesForCurrentView(true);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Réessayer de restaurer les zones manquantes
            notFoundZones.forEach(zoneId => {
                const zone = GLOBAL_STATE.zonesCache.get(zoneId);
                if (zone) {
                    GLOBAL_STATE.selectedZones.add(zoneId);
                    GLOBAL_STATE.totalSelectedFoyers += zone.foyers || 0;
                    restoredCount++;
                }
            });
            
            // Mettre à jour l'affichage final
                            updateSelectionDisplay();
                updateUSLColors();
        }
        
        // 13. Afficher le résultat
        const message = `Étude chargée : ${restoredCount}/${zoneIds.length} zones restaurées (${GLOBAL_STATE.totalSelectedFoyers} foyers)`;
        updateStatus('main', message, restoredCount === zoneIds.length ? 'success' : 'warning');
        
        return true;
        
    } catch (error) {
        console.error('Erreur lors du chargement de l\'étude:', error);
        updateStatus('main', 'Erreur lors du chargement de l\'étude', 'error');
        return false;
    }
}

// Exposer les fonctions globalement
// window.getStudyDataForSave = getStudyDataForSave; // Déplacé dans mediaposte-main.js
window.loadStudy = loadStudy;

console.log('✅ Fonctions de sauvegarde/chargement ajoutées');