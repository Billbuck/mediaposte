// ===== MOTEUR DE CONVERSION MÉDIAPOSTE =====

// Flag global pour éviter le rechargement après conversion
window.isConversionInProgress = false;

// Fonction pour obtenir la bounding box d'une zone
function getZoneBounds(zone) {
    if (!zone.geometry) return null;
    
    try {
        const bbox = turf.bbox({
            type: 'Feature',
            geometry: zone.geometry
        });
        return {
            minX: bbox[0],
            minY: bbox[1],
            maxX: bbox[2],
            maxY: bbox[3]
        };
    } catch (e) {
        return null;
    }
}

// Vérifier si deux bounding boxes se chevauchent
function boundsOverlap(bounds1, bounds2) {
    if (!bounds1 || !bounds2) return false;
    
    return !(bounds1.maxX < bounds2.minX || 
             bounds1.minX > bounds2.maxX || 
             bounds1.maxY < bounds2.minY || 
             bounds1.minY > bounds2.maxY);
}

// Moteur de conversion Tract V2
function convertTempSelectionToUSL() {
    if (GLOBAL_STATE.tempSelection.size === 0) {
        showStatus('Aucune zone à convertir', 'warning');
        return;
    }
    
    window.isConversionInProgress = true;
    showStatus('Conversion en cours...', 'warning');
    const startTime = performance.now();
    
    console.log('[CONVERSION] Début conversion avec:');
    console.log('- Zones sélectionnées:', GLOBAL_STATE.tempSelection.size);
    console.log('- USL en cache:', GLOBAL_STATE.uslCache.size);
    console.log('- Type actuel:', GLOBAL_STATE.currentZoneType);
    
    // Calculer les bounds de la sélection pour info
    const selectionBounds = calculateSelectionBounds();
    if (selectionBounds) {
        const selectionArea = calculateBoundsArea(selectionBounds);
        console.log('- Aire sélection:', Math.round(selectionArea), 'km²');
    }
    
    // Nettoyer la sélection USL existante
    GLOBAL_STATE.finalUSLSelection.clear();
    GLOBAL_STATE.totalSelectedFoyers = 0;  // IMPORTANT : Remettre à zéro le total
    
    const tempZones = Array.from(GLOBAL_STATE.tempSelection.values());
    const uslZones = Array.from(GLOBAL_STATE.uslCache.values());
    
    // OPTIMISATION 1 : Pré-calculer les bounding boxes
    const tempBounds = tempZones.map(zone => ({
        zone,
        bounds: getZoneBounds(zone)
    })).filter(item => item.bounds !== null);
    
    // OPTIMISATION 2 : Calculer la bounding box globale des zones sélectionnées
    let globalBounds = null;
    if (tempBounds.length > 0) {
        globalBounds = {
            minX: Math.min(...tempBounds.map(t => t.bounds.minX)),
            minY: Math.min(...tempBounds.map(t => t.bounds.minY)),
            maxX: Math.max(...tempBounds.map(t => t.bounds.maxX)),
            maxY: Math.max(...tempBounds.map(t => t.bounds.maxY))
        };
        
        // NOUVEAU : Ajouter une marge de sécurité (environ 100m)
        const margin = 0.001; // ~100m en degrés
        globalBounds.minX -= margin;
        globalBounds.minY -= margin;
        globalBounds.maxX += margin;
        globalBounds.maxY += margin;
    }
    
    // NOUVEAU : Filtrer les USL par proximité géographique
    const candidateUSL = [];
    let filteredOutCount = 0;
    
    for (const uslZone of uslZones) {
        if (!uslZone.geometry) continue;
        
        const uslBounds = getZoneBounds(uslZone);
        if (!uslBounds) continue;
        
        // Ne garder que les USL dont la bbox intersecte avec la bbox globale
        if (boundsOverlap(uslBounds, globalBounds)) {
            candidateUSL.push(uslZone);
        } else {
            filteredOutCount++;
        }
    }
    
    // Utiliser candidateUSL au lieu de uslZones pour le traitement
    const uslZonesToProcess = candidateUSL;
    
    let processedCount = 0;
    let skippedCount = 0;
    let preciseCalculations = 0;  // NOUVEAU : Compteur de calculs précis
    let directValidations = 0;     // NOUVEAU : Compteur de validations directes
    const batchSize = 20; // Réduire la taille des batchs
    
    function processBatch() {
        const batch = uslZonesToProcess.slice(processedCount, processedCount + batchSize);
        
        batch.forEach(uslZone => {
            if (!uslZone.geometry) return;
            
            // OPTIMISATION 3 : Pré-filtrage par bounding box globale
            const uslBounds = getZoneBounds(uslZone);
            if (!uslBounds || !boundsOverlap(uslBounds, globalBounds)) {
                skippedCount++;
                return;
            }
            
            const uslFeature = {
                type: 'Feature',
                geometry: uslZone.geometry
            };
            
            // Remplacer les variables actuelles
            let estimatedCoverage = 0;
            let intersections = [];
            let uslArea = null;
            let alreadySelected = false; // NOUVEAU : Flag pour éviter le double comptage
            
            // OPTIMISATION 4 : Ne tester que les zones dont la bbox chevauche
            tempBounds.forEach(({ zone: tempZone, bounds: tempBounds }) => {
                // Si déjà sélectionné, ne pas continuer
                if (alreadySelected) return;
                
                if (!boundsOverlap(uslBounds, tempBounds)) {
                    return; // Skip si pas de chevauchement possible
                }
                
                try {
                    const tempFeature = {
                        type: 'Feature',
                        geometry: tempZone.geometry
                    };
                    
                    const intersection = turf.intersect(tempFeature, uslFeature);
                    
                    if (intersection) {
                        // Calculer l'aire USL une seule fois
                        if (uslArea === null) {
                            uslArea = turf.area(uslFeature);
                        }
                        
                        const intersectionArea = turf.area(intersection);
                        const coverageRatio = intersectionArea / uslArea;
                        
                        // Phase 1 : Estimation rapide
                        estimatedCoverage += coverageRatio;
                        
                        // Stocker l'intersection pour un calcul précis éventuel
                        intersections.push(intersection);
                        
                        // OPTIMISATION 5 : Arrêt précoce si estimation largement au-dessus du seuil
                        if (estimatedCoverage >= CONFIG.CONVERSION.MIN_COVERAGE_RATIO * 1.5) {
                            GLOBAL_STATE.finalUSLSelection.set(uslZone.id, uslZone);
                            GLOBAL_STATE.totalSelectedFoyers += uslZone.foyers || 0;
                            directValidations++; // NOUVEAU : Compter les validations directes
                            alreadySelected = true; // NOUVEAU : Marquer comme déjà sélectionné
                            return; // Sortir de forEach
                        }
                    }
                } catch (e) {
                    // Ignorer silencieusement les erreurs
                }
            });
            
            // Phase 2 : Calcul précis si proche du seuil ET pas déjà sélectionné
            if (!alreadySelected && // NOUVEAU : Vérifier qu'on n'a pas déjà sélectionné
                estimatedCoverage >= CONFIG.CONVERSION.MIN_COVERAGE_RATIO * 0.8 && 
                estimatedCoverage < CONFIG.CONVERSION.MIN_COVERAGE_RATIO * 1.5 &&
                intersections.length > 0) {
                
                preciseCalculations++; // NOUVEAU : Compter les calculs précis
                
                try {
                    // Calculer l'union réelle de toutes les intersections
                    let unionedIntersection = intersections[0];
                    
                    for (let i = 1; i < intersections.length; i++) {
                        unionedIntersection = turf.union(
                            turf.featureCollection([unionedIntersection]),
                            turf.featureCollection([intersections[i]])
                        );
                    }
                    
                    // Calculer le ratio exact
                    const exactArea = turf.area(unionedIntersection);
                    const exactRatio = exactArea / uslArea;
                    
                    if (exactRatio >= CONFIG.CONVERSION.MIN_COVERAGE_RATIO) {
                        GLOBAL_STATE.finalUSLSelection.set(uslZone.id, uslZone);
                        GLOBAL_STATE.totalSelectedFoyers += uslZone.foyers || 0;
                    }
                } catch (e) {
                    // En cas d'erreur sur l'union, se fier à l'estimation
                    if (estimatedCoverage >= CONFIG.CONVERSION.MIN_COVERAGE_RATIO) {
                        GLOBAL_STATE.finalUSLSelection.set(uslZone.id, uslZone);
                        GLOBAL_STATE.totalSelectedFoyers += uslZone.foyers || 0;
                    }
                }
            }
        });
        
        processedCount += batch.length;
        
        if (processedCount < uslZonesToProcess.length) {
            // Afficher la progression avec les stats
            const progress = Math.round((processedCount / uslZonesToProcess.length) * 100);
            const elapsed = Math.round((performance.now() - startTime) / 1000);
            const safeElapsed = Math.max(elapsed, 1); // éviter division par 0
            const rate = Math.round(processedCount / safeElapsed);
            showStatus(`Conversion... ${progress}% (${rate} USL/s, ${skippedCount + filteredOutCount} ignorées)`, 'warning');
            
            // Utiliser requestAnimationFrame pour ne pas bloquer l'UI
            requestAnimationFrame(() => {
                setTimeout(processBatch, 0);
            });
        } else {
            finishConversion(startTime, skippedCount + filteredOutCount, preciseCalculations, directValidations);
        }
    }
    
    processBatch();
}

function finishConversion(startTime, totalSkippedCount, preciseCalculations = 0, directValidations = 0) {
    const duration = Math.round(performance.now() - startTime);
    
    // Nettoyer la sélection temporaire
    GLOBAL_STATE.tempSelection.clear();
    GLOBAL_STATE.tempSelectedCount = 0;
    GLOBAL_STATE.isInTempMode = false;
    
    // Basculer vers le mode USL
    const selector = document.getElementById('zone-type');
    if (selector) {
        selector.value = 'mediaposte';
        GLOBAL_STATE.currentZoneType = 'mediaposte';
    }
    // Assurer que la barre d'outils réapparaît en mode USL
    if (typeof window.updateToolbarVisibility === 'function') {
        window.updateToolbarVisibility();
    }
    
    console.log('[CONVERSION] Terminée:', {
        uslSélectionnées: GLOBAL_STATE.finalUSLSelection.size,
        foyers: GLOBAL_STATE.totalSelectedFoyers,
        durée: duration + 'ms'
    });
    
    // NOUVEAU : Reset immédiat du flag
    window.isConversionInProgress = false;
    
    // NOUVEAU : Masquer les layers non-USL
    hideNonUSLLayers();
    
    // NOUVEAU : Mettre à jour directement l'affichage USL
    updateUSLDisplay();
    updateSelectedZonesDisplay();
    
    // Mettre à jour l'interface
    updateSelectionDisplay();
    updateValidateButton();
    if (typeof window.updateToolbarVisibility === 'function') {
        window.updateToolbarVisibility();
    }

    // NOUVEAU : Recentrage automatique sur les USL sélectionnées
    try {
        if (window.APP && APP.map && typeof window.recenterOnSelection === 'function') {
            if (GLOBAL_STATE.finalUSLSelection && GLOBAL_STATE.finalUSLSelection.size > 0) {
                console.log('[CONVERSION] Recentrage automatique sur la sélection USL');
                recenterOnSelection(60);
            }
        }
    } catch (e) {
        console.warn('[CONVERSION] Recentrage automatique échoué:', e);
    }
    
    const message = `Conversion terminée : ${GLOBAL_STATE.finalUSLSelection.size} USL sélectionnées (${GLOBAL_STATE.totalSelectedFoyers} foyers) en ${duration}ms (${totalSkippedCount} ignorées, ${preciseCalculations} calculs précis, ${directValidations} validations directes)`;
    showStatus(message, 'success');
    console.log(`[CONVERSION] Performance : ${totalSkippedCount}/${GLOBAL_STATE.uslCache.size} USL ignorées, ${preciseCalculations} calculs précis`);
    
    // SUPPRIMÉ : Plus de rechargement complet
    
    // Réinitialiser le flag de conversion immédiatement
    window.isConversionInProgress = false;
}

function clearConversionState() {
    GLOBAL_STATE.tempSelection.clear();
    GLOBAL_STATE.tempSelectedCount = 0;
    GLOBAL_STATE.isInTempMode = false;
}

window.convertTempSelectionToUSL = convertTempSelectionToUSL;
window.clearConversionState = clearConversionState;

console.log('✅ Module CONVERSION-ENGINE Médiaposte chargé');