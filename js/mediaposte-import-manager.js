// ===== GESTIONNAIRE IMPORT MÉDIAPOSTE =====

// ===== OUVERTURE/FERMETURE POPUP =====

/**
 * Ouverture de la popup d'import
 */
function openImportPopup() {
    const popup = document.getElementById('popup-import');
    if (popup) {
        // Position par défaut comme dans Zecible
        if (!popup.style.left || popup.style.left === 'auto') {
            popup.style.left = '180px';
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
        
        // Réinitialiser les champs
        const textarea = document.getElementById('import-codes-text');
        if (textarea) {
            textarea.value = '';
            updateImportPlaceholder();
        }
        
        const fileInput = document.getElementById('import-file-input');
        if (fileInput) {
            fileInput.value = '';
        }
        
        const filePreview = document.getElementById('file-preview');
        if (filePreview) {
            filePreview.innerHTML = '';
        }
        
        const importStats = document.getElementById('import-stats');
        if (importStats) {
            importStats.style.display = 'none';
        }
        
        // Activer l'onglet codes par défaut
        switchImportTab('codes');
    }
}

/**
 * Fermeture de la popup d'import
 */
function closeImportPopup() {
    const popup = document.getElementById('popup-import');
    if (popup) {
        popup.classList.remove('active');
    }
}

// ===== GESTION DES PLACEHOLDERS =====

/**
 * Mise à jour du placeholder selon le type de zone
 */
function updateImportPlaceholder() {
    const textarea = document.getElementById('import-codes-text');
    if (!textarea) return;
    
    const zoneType = GLOBAL_STATE.currentZoneType;
    
    const examples = {
        mediaposte: "Exemples d'IDs USL :\n123456\n234567\n345678\n\nFormat : Numérique",
        iris: "Exemples de codes IRIS :\n751011201\n751011202\n691231401\n131011101\n\nFormat : 9 chiffres",
        commune: "Exemples de codes INSEE :\n75101\n69381\n13201\n33063\n\nFormat : 5 chiffres",
        code_postal: "Exemples de codes postaux :\n75001\n69001\n13001\n33000\n\nFormat : 5 chiffres",
        departement: "Exemples de codes département :\n75\n69\n13\n2A\n971\n\nFormat : 2-3 caractères"
    };
    
    textarea.placeholder = examples[zoneType] || "Collez vos codes ici, un par ligne";
}

// ===== ANALYSE DU CONTENU =====

/**
 * Analyse du contenu d'import
 */
function analyzeImportContent(content) {
    if (!content || typeof content !== 'string') return [];
    
    let separator = '\n';
    if (content.includes(';') && !content.includes('\n')) {
        separator = ';';
    } else if (content.includes(',') && !content.includes('\n')) {
        separator = ',';
    } else if (content.includes('\t')) {
        separator = '\t';
    }
    
    const codes = content
        .split(separator)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            if (line.includes(',') || line.includes(';') || line.includes('\t')) {
                return line.split(/[,;\t]/)[0].trim();
            }
            return line;
        })
        .filter(code => code.length > 0);
    
    return [...new Set(codes)]; // Supprimer les doublons
}

/**
 * Validation des codes selon le type de zone
 */
function validateCodes(codes) {
    const zoneType = GLOBAL_STATE.currentZoneType;
    const validCodes = [];
    const invalidCodes = [];
    
    const patterns = {
        mediaposte: /^\d+$/,                    // Numérique
        iris: /^\d{9}$/,                        // 9 chiffres
        commune: /^\d{5}$/,                     // 5 chiffres
        code_postal: /^\d{5}$/,                 // 5 chiffres
        departement: /^(\d{2,3}|2[AB])$/       // 2-3 chiffres ou 2A/2B
    };
    
    const pattern = patterns[zoneType];
    
    codes.forEach(code => {
        if (pattern && pattern.test(code)) {
            validCodes.push(code);
        } else {
            invalidCodes.push(code);
        }
    });
    
    return { validCodes, invalidCodes };
}

// ===== GESTION DES ÉVÉNEMENTS =====

/**
 * Gestion de la saisie dans le textarea
 */
function handleTextareaInput(e) {
    const codes = analyzeImportContent(e.target.value);
    const { validCodes } = validateCodes(codes);
    
    const statsDiv = document.getElementById('import-stats');
    const countSpan = document.getElementById('import-count');
    
    if (validCodes.length > 0) {
        if (countSpan) countSpan.textContent = validCodes.length;
        if (statsDiv) statsDiv.style.display = 'block';
    } else {
        if (statsDiv) statsDiv.style.display = 'none';
    }
}

/**
 * Gestion de la sélection de fichier
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    const filePreview = document.getElementById('file-preview');
    
    if (!file) {
        if (filePreview) filePreview.innerHTML = '';
        return;
    }
    
    try {
        console.log('Lecture du fichier:', file.name);
        const content = await readFileContent(file);
        
        // Ignorer la première ligne (probable en-tête)
        const lines = content.split('\n');
        let firstLine = '';
        let contentWithoutHeader = content;
        
        if (lines.length > 1) {
            firstLine = lines[0].trim();
            contentWithoutHeader = lines.slice(1).join('\n');
        }
        
        const codes = analyzeImportContent(contentWithoutHeader);
        const { validCodes, invalidCodes } = validateCodes(codes);
        
        console.log('Analyse fichier:', {
            premiereLigne: firstLine,
            totalCodes: codes.length,
            valides: validCodes.length,
            invalides: invalidCodes.length
        });
        
        if (filePreview) {
            let previewHTML = `
                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-top: 10px;">
                    <div><strong>Fichier :</strong> ${file.name}</div>
                    ${firstLine ? `<div style="margin-top: 5px; font-size: 11px; color: #666;"><em>En-tête ignoré : "${firstLine}"</em></div>` : ''}
                    <div style="margin-top: 5px;">
                        <strong>Codes valides :</strong> ${validCodes.length}
                        ${invalidCodes.length > 0 ? `<br><strong style="color: #dc3545;">Codes invalides :</strong> ${invalidCodes.length}` : ''}
                    </div>
                </div>
            `;
            
            filePreview.innerHTML = previewHTML;
        }
        
    } catch (error) {
        console.error('Erreur lecture fichier:', error);
        if (filePreview) {
            filePreview.innerHTML = `
                <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; margin-top: 10px;">
                    <strong>Erreur :</strong> ${error.message}
                </div>
            `;
        }
    }
}

// ===== LECTURE DE FICHIER =====

/**
 * Lecture du contenu d'un fichier
 */
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 10 * 1024 * 1024) { // 10MB max
            reject(new Error('Fichier trop volumineux (max 10MB)'));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        
        reader.onerror = function() {
            reject(new Error('Erreur lecture fichier'));
        };
        
        reader.readAsText(file);
    });
}

// ===== PROCESSUS D'IMPORT =====

/**
 * Traitement de l'import
 */
async function processImport() {
    // Lire le mode d'import sélectionné
    const modeInput = document.querySelector('input[name="import-mode"]:checked');
    const importMode = modeInput ? modeInput.value : 'add'; // new | add | remove
    const activeTab = document.querySelector('.import-content.active').id;
    let content = '';
    
    // Récupérer le contenu selon l'onglet actif
    if (activeTab === 'import-codes') {
        const textarea = document.getElementById('import-codes-text');
        content = textarea ? textarea.value : '';
    } else {
        const fileInput = document.getElementById('import-file-input');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            showStatus('Aucun fichier sélectionné', 'error');
            return;
        }
        
        try {
            content = await readFileContent(fileInput.files[0]);
        } catch (error) {
            showStatus('Erreur lecture fichier: ' + error.message, 'error');
            return;
        }
    }
    
    if (!content.trim()) {
        showStatus('Aucun contenu à importer', 'error');
        return;
    }
    
    // Analyser et valider
    const codes = analyzeImportContent(content);
    const { validCodes, invalidCodes } = validateCodes(codes);
    
    if (validCodes.length === 0) {
        showStatus('Aucun code valide trouvé', 'error');
        return;
    }
    
    if (invalidCodes.length > 0) {
        console.warn(`${invalidCodes.length} codes invalides ignorés:`, invalidCodes.slice(0, 10));
    }
    
    console.log('Import prêt:', {
        total: codes.length,
        valides: validCodes.length,
        invalides: invalidCodes.length,
        mode: GLOBAL_STATE.currentZoneType
    });
    
    // Fermer la popup
    closeImportPopup();
    
    // Exécuter l'import selon le mode et le type
    if (isInUSLMode()) {
        await importUSLCodes(validCodes, importMode);
    } else {
        await importNonUSLCodes(validCodes, importMode);
    }
}

/**
 * Import de codes USL
 */
async function importUSLCodes(codes, importMode = 'add') {
    showStatus(`Import USL : ${codes.length} codes...`, 'warning');
    
    // Appliquer le mode
    if (importMode === 'new') {
        GLOBAL_STATE.finalUSLSelection.clear();
        GLOBAL_STATE.totalSelectedFoyers = 0;
    }
    
    try {
        // Charger les zones par codes (API à implémenter)
        const results = await loadZonesByCodes(codes);
        
        if (results && results.success.length > 0) {
            if (importMode === 'remove') {
                // Retirer les USL importées de la sélection finale
                results.success.forEach(id => {
                    if (GLOBAL_STATE.finalUSLSelection.has(id)) {
                        const usl = GLOBAL_STATE.finalUSLSelection.get(id);
                        GLOBAL_STATE.totalSelectedFoyers -= (usl && usl.foyers) ? usl.foyers : 0;
                        GLOBAL_STATE.finalUSLSelection.delete(id);
                    }
                });
            }
            const message = `Import terminé : ${results.success.length} USL importées (${GLOBAL_STATE.totalSelectedFoyers} foyers)`;
            showStatus(message, 'success');
            
            updateSelectionDisplay();
            updateSelectedZonesDisplay();

            // Recentrer la carte sur la sélection courante (hors mode remove)
            if (importMode !== 'remove') {
                GLOBAL_STATE.suppressMoveLoad = true;
                recenterOnSelection();
            }
        } else {
            showStatus('Aucune zone USL trouvée', 'warning');
        }
        
    } catch (error) {
        console.error('Erreur import USL:', error);
        showStatus('Erreur lors de l\'import USL', 'error');
    }
}

/**
 * Import de codes non-USL
 */
async function importNonUSLCodes(codes, importMode = 'add') {
    const zoneConfig = getCurrentZoneConfig();
    showStatus(`Import ${zoneConfig.label} : ${codes.length} codes...`, 'warning');
    
    // Appliquer le mode
    if (importMode === 'new') {
        GLOBAL_STATE.tempSelection.clear();
    }
    
    try {
        // Charger les zones par codes
        const results = await loadZonesByCodes(codes);
        
        if (results && results.success.length > 0) {
            const message = `Import terminé : ${results.success.length} ${zoneConfig.label} importées`;
            showStatus(message, 'success');
            
            // Marquer comme en mode temporaire
            GLOBAL_STATE.isInTempMode = true;

            if (importMode === 'remove') {
                results.success.forEach(code => {
                    GLOBAL_STATE.tempSelection.delete(code);
                });
            }
            
            updateSelectionDisplay();
            updateSelectedZonesDisplay();
            updateValidateButton();
            
            // Afficher message pour la validation
            setTimeout(() => {
                showStatus('Cliquez sur "Valider la sélection" pour convertir en USL', 'warning');
            }, 2000);

            // Recentrer la carte sur la sélection courante (hors mode remove)
            if (importMode !== 'remove') {
                GLOBAL_STATE.suppressMoveLoad = true;
                recenterOnSelection();
            }
            
        } else {
            showStatus(`Aucun ${zoneConfig.label} trouvé`, 'warning');
        }
        
        if (results && results.notFound.length > 0) {
            console.log(`${results.notFound.length} codes non trouvés:`, results.notFound);
        }
        
    } catch (error) {
        console.error('Erreur import non-USL:', error);
        showStatus('Erreur lors de l\'import', 'error');
    }
}

// Suppression de la fonction personnalisée de recentrage; on utilise recenterOnSelection

// ===== INITIALISATION DES ÉVÉNEMENTS =====

/**
 * Initialisation des événements d'import
 */
function initImportEvents() {
    console.log('Initialisation des événements import');
    
    // Textarea
    const textarea = document.getElementById('import-codes-text');
    if (textarea) {
        textarea.removeEventListener('input', handleTextareaInput);
        textarea.addEventListener('input', handleTextareaInput);
    }
    
    // File input
    const fileInput = document.getElementById('import-file-input');
    if (fileInput) {
        fileInput.removeEventListener('change', handleFileSelect);
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    console.log('Événements import configurés');
}

// ===== FONCTIONS GLOBALES EXPOSÉES =====
window.openImportPopup = openImportPopup;
window.closeImportPopup = closeImportPopup;
window.processImport = processImport;
window.handleFileSelect = handleFileSelect;
window.updateImportPlaceholder = updateImportPlaceholder;
window.initImportEvents = initImportEvents;

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initImportEvents, 200);
});

console.log('✅ Module IMPORT-MANAGER Médiaposte chargé');