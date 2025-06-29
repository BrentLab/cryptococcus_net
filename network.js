// Global variables
let networkData = [];
let tfSet = new Set();
let geneSet = new Set();
let cy = null;

// Maps to store name relationships
let tfToCommonName = {}; // Maps systematic TF name to common name
let geneToCommonName = {}; // Maps systematic gene name to common name

// Flag to track if large network warning is currently displayed
let isLargeNetworkWarningVisible = false;

// Special TFs with no edges in thresholded network
const specialTFs = {
    '03894': 'Pdr802',
    '01242': 'HapX'
};

// Maps to store selected items
let selectedTFs = new Set();
let selectedGenes = new Set();

// Variables for tracking network size and warnings
let previousTFCount = 0;  // Track previous TF count for direction detection
let previousGeneCount = 0;  // Track previous gene count for direction detection
let previousConfidence = 0.14;  // Track previous confidence threshold - initialized to minimum value

// Store state before showing large network warning (for cancel restoration)
let preLargeNetworkState = null;

// Track the last change that triggered a large network warning
let lastChangeInfo = null;

// Track whether a network is currently rendered
let isNetworkRendered = false;

// Function to update instruction visibility based on selections and network state
function updateInstructionVisibility() {
    const hasSelections = selectedTFs.size > 0 || selectedGenes.size > 0;
    // Show instructions only when there are no selections AND no network is rendered
    const shouldShowInstructions = !hasSelections && !isNetworkRendered;
    
    if (shouldShowInstructions) {
        networkInstructions.style.display = 'block';
    } else {
        networkInstructions.style.display = 'none';
    }
}


// Function to clear all selections (TFs and genes)
function clearAllSelections() {
    // Clear TF selections
    selectedTFs.clear();
    const tfCheckboxes = tfContainer.querySelectorAll('input[type="checkbox"]');
    tfCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Clear gene selections
    selectedGenes.clear();
    const geneCheckboxes = geneContainer.querySelectorAll('input[type="checkbox"]');
    geneCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Update instruction visibility
    updateInstructionVisibility();
    
    // Clear the network visualization
    if (cy) {
        cy.elements().remove();
        isNetworkRendered = false;
    }
}

// Network size thresholds for warnings
const LARGE_NETWORK_NODE_THRESHOLD = 250;  // Warning threshold for nodes
const LARGE_NETWORK_EDGE_THRESHOLD = 800;  // Warning threshold for edges

// DOM elements
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const tfContainer = document.getElementById('transcription-factors');
const geneContainer = document.getElementById('target-genes');
const tfSearch = document.getElementById('tf-search');
const geneSearch = document.getElementById('gene-search');
const confidenceSlider = document.getElementById('confidence-slider');
const confidenceValue = document.getElementById('confidence-value');
const nodeInfo = document.getElementById('node-info');
const nodeName = document.getElementById('node-name');
const nodeType = document.getElementById('node-type');
const nodeConnections = document.getElementById('node-connections');
const selectionInfo = document.getElementById('selection-info'); // Optional - might be hidden
const noConnectionsMessage = document.getElementById('no-connections');
const visualizeBtn = document.getElementById('visualize-btn');
const networkInstructions = document.getElementById('network-instructions');

// Warning dialog elements
const largeNetworkWarning = document.getElementById('large-network-warning');
const warningNodeCount = document.getElementById('warning-node-count');
const warningEdgeCount = document.getElementById('warning-edge-count');
const proceedAnywayBtn = document.getElementById('proceed-anyway-btn');
const cancelVisualizationBtn = document.getElementById('cancel-visualization-btn');

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing application...');
    
    // Set up button event listeners
    document.getElementById('visualize-btn').addEventListener('click', visualizeNetwork);
    document.getElementById('reset-btn').addEventListener('click', resetVisualization);
    document.getElementById('fit-btn').addEventListener('click', fitNetworkView);
    document.getElementById('select-all-tf').addEventListener('click', () => selectAllCheckboxes(tfContainer, true, selectedTFs));
    document.getElementById('clear-all-tf').addEventListener('click', () => selectAllCheckboxes(tfContainer, false, selectedTFs));
    document.getElementById('select-all-genes').addEventListener('click', () => selectAllCheckboxes(geneContainer, true, selectedGenes));
    document.getElementById('clear-all-genes').addEventListener('click', () => selectAllCheckboxes(geneContainer, false, selectedGenes));
    
    // Add event listeners for selection options (if elements exist)
    const selectTFTargetsBtn = document.getElementById('select-tf-targets-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    
    if (selectTFTargetsBtn) {
        selectTFTargetsBtn.addEventListener('click', selectTFAndTargets);
    }
    
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', clearSelection);
    }
    
    // Add event listeners for warning dialog buttons
    proceedAnywayBtn.addEventListener('click', () => {
        console.log('PROCEED: User clicked Proceed Anyway');
        if (lastChangeInfo && lastChangeInfo.checkbox) {
            console.log('PROCEED: lastChangeInfo exists:', JSON.stringify({
                value: lastChangeInfo.checkbox.value,
                wasChecked: lastChangeInfo.previousState,
                nowChecked: lastChangeInfo.checkbox.checked
            }));
        } else {
            console.log('PROCEED: No lastChangeInfo available or checkbox is undefined');
        }
        
        largeNetworkWarning.style.display = 'none';
        isLargeNetworkWarningVisible = false;
        // Clear the saved state since user chose to proceed
        preLargeNetworkState = null;
        // We'll also clear lastChangeInfo in the renderLargeNetwork function
        renderLargeNetwork();
    });
    
    cancelVisualizationBtn.addEventListener('click', () => {
        largeNetworkWarning.style.display = 'none';
        isLargeNetworkWarningVisible = false;
        
        // Check if we have information about the last change that triggered the warning
        if (lastChangeInfo) {
            // Check if this was a confidence slider change
            if (lastChangeInfo.isConfidenceChange) {
                console.log('CANCEL: Confidence slider change detected, reverting from', 
                    confidenceSlider.value, 'to', lastChangeInfo.previousValue);
                
                // Restore the previous confidence value
                confidenceSlider.value = lastChangeInfo.previousValue;
                confidenceValue.textContent = lastChangeInfo.previousValue.toFixed(2);
                previousConfidence = lastChangeInfo.previousValue;
                
                // Clear the last change info
                lastChangeInfo = null;
            } else {
                // Handle checkbox change as before
                console.log('CANCEL: Last change info found:', JSON.stringify({
                    value: lastChangeInfo.checkbox.value,
                    wasChecked: lastChangeInfo.previousState,
                    nowChecked: lastChangeInfo.checkbox.checked,
                    isTF: lastChangeInfo.isTFCheckbox
                }));
                
                // Revert just the specific checkbox that triggered the warning
                const checkbox = lastChangeInfo.checkbox;
                const selectedSet = lastChangeInfo.isTFCheckbox ? selectedTFs : selectedGenes;
                
                console.log(`CANCEL: Before reversion - checkbox checked: ${checkbox.checked}, in selection set: ${selectedSet.has(checkbox.value)}`);
                
                // Set checkbox back to its previous state
                checkbox.checked = lastChangeInfo.previousState;
                
                // Update the selection set to match
                if (checkbox.checked) {
                    selectedSet.add(checkbox.value);
                } else {
                    selectedSet.delete(checkbox.value);
                }
                
                console.log(`CANCEL: After reversion - checkbox checked: ${checkbox.checked}, in selection set: ${selectedSet.has(checkbox.value)}`);
                
                // Clear the last change info
                lastChangeInfo = null;
            }
        }
        // For backwards compatibility, also handle the full state restoration
        else if (preLargeNetworkState) {
            console.log('No last change info, using full state restoration');
            
            // Restore confidence slider value
            confidenceSlider.value = preLargeNetworkState.confidenceValue;
            confidenceValue.textContent = preLargeNetworkState.confidenceDisplayValue;
            previousConfidence = preLargeNetworkState.confidenceValue;
            
            // Restore TF selections
            restoreSelections(tfContainer, preLargeNetworkState.selectedTFs, selectedTFs);
            
            // Restore gene selections
            restoreSelections(geneContainer, preLargeNetworkState.selectedGenes, selectedGenes);
            
            // Clear the saved state
            preLargeNetworkState = null;
        }
    });
    
    // Set up search functionality
    tfSearch.addEventListener('input', () => filterItems(tfContainer, tfSearch.value));
    geneSearch.addEventListener('input', () => filterItems(geneContainer, geneSearch.value));
    
    // Variable to store the debounce timeout
    let confidenceSliderTimeout;
    
    // Set up confidence slider with debouncing
    confidenceSlider.addEventListener('input', function() {
        // Update display value immediately (this is fast)
        const value = parseFloat(this.value).toFixed(2);
        confidenceValue.textContent = value;
        
        // Store current confidence for use in the timeout function
        const currentConfidence = parseFloat(this.value);
        const isIncreasingThreshold = currentConfidence > previousConfidence;
        
        // Clear any existing timeout to prevent multiple executions
        clearTimeout(confidenceSliderTimeout);
        
        // Set a new timeout to delay the expensive operations
        confidenceSliderTimeout = setTimeout(() => {
            console.log(`Debounced slider update: ${currentConfidence}`);
            
            // Check if the large network warning is currently visible
            if (isLargeNetworkWarningVisible) {
                console.log('Confidence slider moved while warning is displayed - updating warning information');
                // Don't visualize the network, but DO update the warning information
                updateNetworkSizeWarning();
                
                // Make sure we still update the previousConfidence value
                // This is important to maintain proper tracking of increasing/decreasing threshold
                previousConfidence = currentConfidence;
                
                return;
            }
            
            // Always update visualization if we have Cytoscape initialized
            // and selections exist, regardless of whether elements are currently displayed
            if (cy && (selectedTFs.size > 0 && selectedGenes.size > 0)) {
                // Only check for large network if we're decreasing the threshold (showing more edges)
                if (!isIncreasingThreshold) {
                    // Save the confidence state before showing warning
                    // This will only happen if we detect a large network
                    if (!preLargeNetworkState) {
                        console.log('Saving confidence state before potential large network warning');
                        preLargeNetworkState = {
                            selectedTFs: Array.from(selectedTFs),
                            selectedGenes: Array.from(selectedGenes),
                            confidenceValue: previousConfidence, // Store the previous value before slider change
                            confidenceDisplayValue: previousConfidence.toFixed(2)
                        };
                        
                        // Also save a special lastChangeInfo for confidence slider
                        lastChangeInfo = {
                            isConfidenceChange: true,
                            previousValue: previousConfidence,
                            newValue: currentConfidence
                        };
                    }
                    
                    checkAndVisualizeNetwork();
                } else {
                    // If increasing threshold (showing fewer edges), always safe to proceed
                    visualizeNetwork();
                }
            }
            
            // Update previous confidence value
            previousConfidence = currentConfidence;
        }, 300); // 300ms delay for debouncing
    });
    
    // Load network data
    loadNetworkData();
});

// Helper function to select/deselect all checkboxes
function selectAllCheckboxes(container, isChecked, selectedSet) {
    console.log(`Select all checkboxes in ${container.id}: ${isChecked}`);
    
    // Check if a large network warning is being shown
    if (isLargeNetworkWarningVisible) {
        console.log('SELECT ALL: Ignoring "Select All" operation while large network warning is displayed');
        return;
    }
    
    // Store previous counts
    const prevTFCount = selectedTFs.size;
    const prevGeneCount = selectedGenes.size;
    
    // Track if this is adding or removing items
    const previousSize = selectedSet.size;
    
    // For Select All operations, we need to handle it differently
    // since we can't use lastChangeInfo (multiple checkboxes)
    if (isChecked) {
        // Reset lastChangeInfo since we're making a bulk change
        lastChangeInfo = null;
        
        // Save full state before "Select All"
        if (!preLargeNetworkState) {
            console.log("Saving state before 'Select All' operation");
            preLargeNetworkState = {
                selectedTFs: Array.from(selectedTFs),
                selectedGenes: Array.from(selectedGenes),
                confidenceValue: parseFloat(confidenceSlider.value),
                confidenceDisplayValue: confidenceValue.textContent
            };
        }
    }
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:not(:disabled)');
    console.log(`Found ${checkboxes.length} enabled checkboxes to ${isChecked ? 'check' : 'uncheck'}`);
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        if (isChecked) {
            selectedSet.add(checkbox.value);
        } else {
            selectedSet.delete(checkbox.value);
        }
    });
    
    // Update instruction visibility
    updateInstructionVisibility();
    
    // Determine if this operation increased or decreased selection
    const isAddingSelection = selectedSet.size > previousSize;
    const isTFSet = selectedSet === selectedTFs;
    
    // Always call appropriate visualization method to update display
    if (cy) {
        if (selectedTFs.size > 0 && selectedGenes.size > 0) {
            console.log('Updating visualization after selecting all');
            
            // Only check for large network when adding items (select all), not when removing (clear all)
            if (isAddingSelection) {
                checkAndVisualizeNetwork();
            } else {
                // Removing items is always safe to proceed
                visualizeNetwork();
            }
        } else {
            // If no valid selections, clear the visualization
            console.log('Clearing visualization after selecting all');
            cy.elements().remove();
            // Show the no-connections message
            noConnectionsMessage.style.display = 'flex';
            isNetworkRendered = false;
            const noConnectionsTitle = noConnectionsMessage.querySelector('h3');
            if (noConnectionsTitle) {
                noConnectionsTitle.textContent = 'Select at least one TF and one target gene';
            }
        }
    }
    
    // Update previous counts for next time
    previousTFCount = selectedTFs.size;
    previousGeneCount = selectedGenes.size;
}

// Helper function to filter items based on search input
function filterItems(container, searchText) {
    console.log(`Filtering items in ${container.id} with search text: "${searchText}"`);
    
    const items = container.querySelectorAll('.checkbox-item');
    const lowerSearch = searchText.toLowerCase().trim();
    let anyVisible = false;
    
    // Always remove any existing "not found" message first
    const existingMessage = container.querySelector('.not-found-message');
    if (existingMessage) {
        container.removeChild(existingMessage);
    }
    
    // If search is empty, show all items
    if (lowerSearch === '') {
        items.forEach(item => {
            item.style.display = '';
        });
        return;
    }
    
    // Filter items based on search text
    items.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const commonName = checkbox.dataset.common;
        const systematicName = checkbox.dataset.systematic;
        
        if (commonName.includes(lowerSearch) || systematicName.includes(lowerSearch)) {
            item.style.display = '';
            anyVisible = true;
        } else {
            item.style.display = 'none';
        }
    });
    
    console.log(`Search for "${searchText}" found matches: ${anyVisible}`);
    
    // If no items match the search, display a message
    if (!anyVisible) {
        console.log(`No matches found for "${searchText}" in ${container.id}, showing message`);
        
        const message = document.createElement('div');
        message.className = 'not-found-message';
        
        if (container.id === 'transcription-factors') {
            message.textContent = 'This TF is not in the network';
        } else if (container.id === 'target-genes') {
            message.textContent = 'This target is not in the network';
        }
        
        // Add message at the top for better visibility
        if (container.firstChild) {
            container.insertBefore(message, container.firstChild);
        } else {
            container.appendChild(message);
        }
    }
}

// Function to update the Visualize Network button state
function updateVisualizeButtonState() {
    // Check if at least one TF and one target gene are selected
    const hasTFs = selectedTFs.size > 0;
    const hasGenes = selectedGenes.size > 0;
    
    // Only enable the button if both conditions are met
    visualizeBtn.disabled = !(hasTFs && hasGenes);
    
    // Optionally add visual indication of disabled state
    if (hasTFs && hasGenes) {
        visualizeBtn.classList.remove('disabled-btn');
        visualizeBtn.title = 'Visualize network with selected TFs and genes';
    } else {
        visualizeBtn.classList.add('disabled-btn');
        if (!hasTFs && !hasGenes) {
            visualizeBtn.title = 'Select at least one TF and one target gene to visualize';
        } else if (!hasTFs) {
            visualizeBtn.title = 'Select at least one TF to visualize';
        } else {
            visualizeBtn.title = 'Select at least one target gene to visualize';
        }
    }
}

// Helper function to handle checkbox selection
function handleCheckboxChange(checkbox, selectedSet) {
    console.log(`CHECKBOX: Change event for ${checkbox.value}, checked: ${checkbox.checked}`);
    
    // Check if a large network warning is being shown
    if (isLargeNetworkWarningVisible) {
        console.log('CHECKBOX: Ignoring checkbox change while large network warning is displayed');
        
        // Revert the checkbox state since we're ignoring this change
        // The event has already fired, so the checkbox is in the new state
        // We need to revert it back without triggering another event
        checkbox.checked = !checkbox.checked;
        
        return;
    }
    
    // Store previous counts to detect direction
    const prevTFCount = selectedTFs.size;
    const prevGeneCount = selectedGenes.size;
    
    // Log previous state if we already have lastChangeInfo
    if (lastChangeInfo) {
        console.log('CHECKBOX: Warning! lastChangeInfo already exists:', JSON.stringify({
            value: lastChangeInfo.checkbox.value,
            wasChecked: lastChangeInfo.previousState
        }));
    }
    
    // Save the single change info BEFORE making the change
    // This lets us revert just this one checkbox if needed
    const wasChecked = !checkbox.checked; // When the change event fires, the state has already changed
    
    lastChangeInfo = {
        checkbox: checkbox,
        previousState: wasChecked, // The state BEFORE this change (opposite of current)
        isTFCheckbox: selectedSet === selectedTFs,
        value: checkbox.value
    };
    
    console.log(`CHECKBOX: Saved lastChangeInfo for ${checkbox.value}, previous state was: ${lastChangeInfo.previousState}, changing to: ${checkbox.checked}`);
    
    // Update the selection
    if (checkbox.checked) {
        selectedSet.add(checkbox.value);
    } else {
        selectedSet.delete(checkbox.value);
    }
    
    // Update instruction visibility
    updateInstructionVisibility();
    
    // Determine if this is adding or removing from the selection
    const isTFSet = selectedSet === selectedTFs;
    const isAddingSelection = checkbox.checked;
    
    const currentTFCount = selectedTFs.size;
    const currentGeneCount = selectedGenes.size;
    
    // Always call appropriate visualization method to update display
    if (cy) {
        if (currentTFCount > 0 && currentGeneCount > 0) {
            console.log('Updating visualization after checkbox change');
            
            // Only check network size when adding selections, not when removing
            if (isAddingSelection) {
                // If we're adding a TF or gene, we should check network size
                checkAndVisualizeNetwork();
            } else {
                // If we're removing, always safe to proceed
                visualizeNetwork();
            }
        } else {
            // If no valid selections, clear the visualization
            console.log('Clearing visualization after checkbox change');
            cy.elements().remove();
            // Show the no-connections message
            noConnectionsMessage.style.display = 'flex';
            isNetworkRendered = false;
            const noConnectionsTitle = noConnectionsMessage.querySelector('h3');
            if (noConnectionsTitle) {
                noConnectionsTitle.textContent = 'Select at least one TF and one target gene';
            }
        }
    }
    
    // Update previous counts for next time
    previousTFCount = currentTFCount;
    previousGeneCount = currentGeneCount;
}

// Load the network data from the TSV file
function loadNetworkData() {
    console.log('Loading network data...');
    
    // Show loading indicator
    loading.style.display = 'flex';
    loadingText.textContent = 'Loading network data...';
    
    // Parse the TSV file using PapaParse
    Papa.parse('net_np3_sys_com_100.tsv', {
        download: true,
        delimiter: '\t',
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            console.log('Data loaded successfully:', results.data.length, 'rows');
            
            // Process the data
            processNetworkData(results.data);
        },
        error: function(error) {
            console.error('Error loading data:', error);
            alert('Error loading network data. Make sure you are running this from a web server. See the console for details.');
            loading.style.display = 'none';
        }
    });
}

// Process the loaded network data
function processNetworkData(data) {
    console.log('Processing network data...');
    loadingText.textContent = 'Processing network data...';
    
    // Store the network data
    networkData = data;
    
    // Extract unique transcription factors and target genes
    data.forEach(row => {
        if (row.REGULATOR && row.TARGET) {
            // Store systematic names
            tfSet.add(row.REGULATOR);
            geneSet.add(row.TARGET);
            
            // Store common name mappings
            if (row['REGULATOR-COM']) {
                tfToCommonName[row.REGULATOR] = row['REGULATOR-COM'];
            }
            
            if (row['TARGET-COM']) {
                geneToCommonName[row.TARGET] = row['TARGET-COM'];
            }
        }
    });
    
    // Add special TFs (Pdr802 and HapX) that aren't in the network
    for (const [sysName, commonName] of Object.entries(specialTFs)) {
        tfSet.add(sysName);
        tfToCommonName[sysName] = commonName;
    }
    
    console.log(`Found ${tfSet.size} transcription factors (including special TFs) and ${geneSet.size} target genes`);
    
    // Debug: Show a sample of TF common names
    console.log("Sample of TF mappings (systematic -> common):", 
               Object.entries(tfToCommonName).slice(0, 5).map(([sys, common]) => `${sys} -> ${common}`));
    
    // Fill select elements with options
    loadingText.textContent = 'Populating menus...';
    
    // Clear and populate the transcription factors with checkboxes
    tfContainer.innerHTML = '';
    
    // Sort TFs by common name (if available) or systematic name
    Array.from(tfSet).sort((a, b) => {
        // Get common names for comparison, falling back to systematic names if needed
        const aName = (tfToCommonName[a] || a).toLowerCase();
        const bName = (tfToCommonName[b] || b).toLowerCase();
        return aName.localeCompare(bName);
    }).forEach(tf => {
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        
        // Check if this is one of our special TFs
        const isSpecialTF = specialTFs.hasOwnProperty(tf);
        
        // Add special styling for special TFs
        if (isSpecialTF) {
            item.style.display = 'block'; // Block instead of flex to match other TFs
            item.style.backgroundColor = '#f0f8ff'; // Light blue background
            item.style.padding = '5px';
            item.style.border = '1px solid #ccc';
            item.style.borderRadius = '4px';
            item.style.marginBottom = '5px';
        }
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tf;
        
        let commonName = tfToCommonName[tf] || tf;
        // Format common name with first letter capital, rest lowercase
        commonName = commonName.charAt(0).toUpperCase() + commonName.slice(1).toLowerCase();
        
        checkbox.dataset.common = commonName.toLowerCase();
        checkbox.dataset.systematic = tf.toLowerCase();
        
        // Disable checkbox for special TFs
        if (isSpecialTF) {
            checkbox.disabled = true;
            checkbox.title = "This TF has no connections in the network";
        } else {
            checkbox.addEventListener('change', () => handleCheckboxChange(checkbox, selectedTFs));
        }
        
        // Create label (same for all TFs)
        const label = document.createElement('label');
        // Only show systematic name in parentheses if it's different from common name
        label.textContent = commonName !== tf ? `${commonName} (${tf})` : commonName;
        
        // Standard layout for all TFs 
        item.appendChild(checkbox);
        item.appendChild(label);
        
        // Add message for special TFs
        if (isSpecialTF) {
            const message = document.createElement('div');
            message.style.fontSize = '12px';
            message.style.color = '#666';
            message.style.fontStyle = 'italic';
            message.style.marginTop = '2px';
            message.style.marginLeft = '22px'; // Align to match standard indentation
            message.textContent = "has no targets with confidence scores above the minimum display.";
            item.appendChild(message);
        }
        
        tfContainer.appendChild(item);
    });
    
    // Clear and populate the target genes with checkboxes
    geneContainer.innerHTML = '';
    
    // Sort genes by common name (if available) or systematic name
    Array.from(geneSet).sort((a, b) => {
        // Get common names for comparison, falling back to systematic names if needed
        const aName = (geneToCommonName[a] || a).toLowerCase();
        const bName = (geneToCommonName[b] || b).toLowerCase();
        return aName.localeCompare(bName);
    }).forEach(gene => {
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = gene;
        
        const commonName = geneToCommonName[gene] || gene;
        checkbox.dataset.common = commonName.toLowerCase();
        checkbox.dataset.systematic = gene.toLowerCase();
        
        checkbox.addEventListener('change', () => handleCheckboxChange(checkbox, selectedGenes));
        
        const label = document.createElement('label');
        // Only show systematic name in parentheses if it's different from common name
        label.textContent = commonName !== gene ? `${commonName} (${gene})` : commonName;
        // Make target gene labels appear in italic
        label.style.fontStyle = 'italic';
        
        item.appendChild(checkbox);
        item.appendChild(label);
        geneContainer.appendChild(item);
    });
    
    // Initialize Cytoscape
    loadingText.textContent = 'Initializing visualization...';
    initCytoscape();
    
    // Initialize the visualize button state (disabled by default since no selections)
    updateVisualizeButtonState();
    
    // Hide loading indicator
    loading.style.display = 'none';
}

// Initialize the Cytoscape instance
function initCytoscape() {
    console.log('Initializing Cytoscape...');
    
    cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(name)', // Use common name for display
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'color': '#000',
                    'text-outline-width': 2,
                    'text-outline-color': '#fff',
                    'width': 'data(size)',
                    'height': 'data(size)'
                }
            },
            {
                selector: 'node[nodeType="TF"]',
                style: {
                    'background-color': 'white',
                    'border-width': 3,
                    'border-color': '#e74c3c',
                    'shape': 'ellipse'
                }
            },
            {
                selector: 'node[nodeType="TF-target"]',
                style: {
                    'background-color': 'white',
                    'border-width': 3,
                    'border-color': '#e74c3c', // Same red as TFs
                    'shape': 'ellipse', // Changed to ellipse
                    'font-style': 'italic' // Italic like targets
                }
            },
            {
                selector: 'node[nodeType="target"]',
                style: {
                    'background-color': 'white',
                    'border-width': 3,
                    'border-color': '#3498db',
                    'shape': 'ellipse',
                    'font-style': 'italic'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 'data(weight)',
                    'line-color': '#999',
                    'target-arrow-color': '#999',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': 'data(opacity)'
                }
            },
            // Styles for selected nodes
            {
                selector: 'node:selected',
                style: {
                    'border-width': 3,
                    'border-color': '#ffd700', // Gold border for selected nodes
                    'border-opacity': 0.8
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'line-color': '#ffd700', // Gold for selected edges
                    'target-arrow-color': '#ffd700',
                    'width': 'data(weight)',
                    'opacity': 1
                }
            }
        ],
        // Enable box selection to select multiple nodes by dragging
        selectionType: 'additive'
    });
    
    // Enable dragging of nodes - when nodes are selected, they move together
    cy.on('grab', 'node', function(e) {
        updateSelectionInfo();
    });
    
    // Add click event for nodes to show info
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        
        // Display node information with both names
        let commonName = node.data('name');
        const sysName = node.id();
        
        // For TFs, ensure proper capitalization (first letter capital, rest lowercase)
        if (node.data('nodeType') === 'TF') {
            commonName = commonName.charAt(0).toUpperCase() + commonName.slice(1).toLowerCase();
        }
        
        // Only show systematic name in parentheses if it's different from common name
        nodeName.textContent = commonName !== sysName ? `${commonName} (${sysName})` : commonName;
        
        // Set style based on node type
        if (node.data('nodeType') === 'TF') {
            nodeType.textContent = 'Transcription Factor';
            nodeName.style.fontStyle = 'normal';
        } else if (node.data('nodeType') === 'TF-target') {
            nodeType.textContent = 'Transcription Factor & Target Gene';
            nodeName.style.fontStyle = 'italic';
        } else {
            nodeType.textContent = 'Target Gene';
            nodeName.style.fontStyle = 'italic';
        }
        
        // Count connections
        const outgoing = node.outgoers('edge').length;
        const incoming = node.incomers('edge').length;
        
        if (node.data('nodeType') === 'TF') {
            nodeConnections.textContent = `Regulates ${outgoing} genes`;
        } else if (node.data('nodeType') === 'TF-target') {
            nodeConnections.textContent = `Regulates ${outgoing} genes / Regulated by ${incoming} transcription factors`;
        } else {
            nodeConnections.textContent = `Regulated by ${incoming} transcription factors`;
        }
        
        // Show the info panel
        nodeInfo.style.display = 'block';
    });
    
    // Add click event for edges to show info
    cy.on('tap', 'edge', function(evt) {
        const edge = evt.target;
        const sourceNode = edge.source();
        const targetNode = edge.target();
        const confidence = edge.data('confidence').toFixed(3);
        
        // Get common names for the source and target
        const sourceName = sourceNode.data('name');
        const targetName = targetNode.data('name');
        
        // Display edge information with common names
        nodeName.textContent = `${sourceName} → ${targetName}`;
        nodeType.textContent = 'Regulatory Relationship';
        nodeConnections.textContent = `Confidence: ${confidence}`;
        
        // Style the edge information text - target gene name should be italic
        nodeName.innerHTML = `${sourceName} → <i>${targetName}</i>`;
        
        // Show the info panel
        nodeInfo.style.display = 'block';
    });
    
    // Hide info panel and clear visual node selections when clicking on background
    cy.on('tap', function(evt) {
        if (evt.target === cy) {
            nodeInfo.style.display = 'none';
            // Only clear visual node selections in the network, keep checkboxes and network intact
            cy.elements().unselect();
        }
    });
    
    // Update selection info on selection changes
    cy.on('select', function() {
        updateSelectionInfo();
    });
    
    cy.on('unselect', function() {
        updateSelectionInfo();
    });
    
    // Shift+click TF nodes to toggle selection of TF and all its connected target nodes
    cy.on('click', 'node[nodeType="TF"], node[nodeType="TF-target"]', function(evt) {
        // Check if Shift key is held
        if (evt.originalEvent && evt.originalEvent.shiftKey) {
            evt.preventDefault(); // Prevent default click behavior
            evt.stopPropagation(); // Stop event from bubbling
            evt.stopImmediatePropagation(); // Prevent other handlers on this element from running
            
            const tfNode = evt.target;
            const tfId = tfNode.id();
            
            // Find all target nodes connected to this TF in the network
            const targetNodes = tfNode.outgoers('node'); // Gets nodes connected via outgoing edges
            
            // Check if TF AND all its targets are currently selected
            const isTFSelected = tfNode.selected();
            const allTargetsSelected = targetNodes.length > 0 && targetNodes.every(node => node.selected());
            const isCompleteGroupSelected = isTFSelected && allTargetsSelected;
            
            console.log('Shift+clicked TF node:', tfId, 'TF selected:', isTFSelected, 'All targets selected:', allTargetsSelected, 'Complete group selected:', isCompleteGroupSelected);
            
            if (isCompleteGroupSelected) {
                // If TF AND all targets are selected, deselect the complete group
                targetNodes.unselect();
                requestAnimationFrame(() => {
                    tfNode.unselect();
                    console.log('Deselected complete group: TF and', targetNodes.length, 'target nodes');
                });
            } else {
                // If the complete group is not selected, select TF and all its targets
                targetNodes.select();
                requestAnimationFrame(() => {
                    tfNode.select();
                    console.log('Selected complete group: TF and', targetNodes.length, 'target nodes');
                });
            }
        }
        // Regular clicks without Shift will use Cytoscape's default selection behavior
    });
}

// Function to calculate potential network size and check if it's large
function calculateNetworkSize() {
    // Use Sets directly for O(1) lookups instead of Arrays with O(n) includes() method
    const selectedTFsSet = selectedTFs; // Already a Set, no need to convert
    const selectedGenesSet = selectedGenes; // Already a Set, no need to convert
    const minConfidence = parseFloat(confidenceSlider.value);
    
    let potentialNodeCount = 0;
    let potentialEdgeCount = 0;
    const uniqueNodes = new Set();
    
    console.log(`Calculating network size with ${selectedTFsSet.size} TFs and ${selectedGenesSet.size} genes at confidence >= ${minConfidence}`);
    
    // Count potential nodes and edges based on current selections and confidence
    networkData.forEach(row => {
        const tf = row.REGULATOR;
        const gene = row.TARGET;
        const value = parseFloat(row.VALUE);
        
        // Skip invalid entries
        if (!tf || !gene || isNaN(value)) return;
        
        // Filter by confidence value
        if (value < minConfidence) return;
        
        // Check if this connection would be included in the visualization
        // Using Set.has() (O(1)) instead of Array.includes() (O(n))
        if (selectedTFsSet.has(tf) && selectedGenesSet.has(gene)) {
            // Count unique nodes
            if (!uniqueNodes.has(tf)) {
                uniqueNodes.add(tf);
                potentialNodeCount++;
            }
            if (!uniqueNodes.has(gene)) {
                uniqueNodes.add(gene);
                potentialNodeCount++;
            }
            
            // Count edges
            potentialEdgeCount++;
        }
    });
    
    console.log(`Potential network size: ${potentialNodeCount} nodes, ${potentialEdgeCount} edges`);
    
    return {
        nodeCount: potentialNodeCount,
        edgeCount: potentialEdgeCount,
        isLargeNetwork: potentialNodeCount > LARGE_NETWORK_NODE_THRESHOLD || 
                        potentialEdgeCount > LARGE_NETWORK_EDGE_THRESHOLD
    };
}

// Function to update the network size warning information without visualizing
function updateNetworkSizeWarning() {
    // Calculate potential network size based on current selections and confidence threshold
    const networkSize = calculateNetworkSize();
    
    console.log('Updating warning information - potential network size:', 
               networkSize.nodeCount, 'nodes,', 
               networkSize.edgeCount, 'edges',
               'isLargeNetwork:', networkSize.isLargeNetwork);
    
    // Update the warning message with the network size
    warningNodeCount.textContent = networkSize.nodeCount;
    warningEdgeCount.textContent = networkSize.edgeCount;
    
    // Check if the network is still large enough to warrant a warning
    // If not, we should auto-dismiss the warning and proceed with visualization
    if (!networkSize.isLargeNetwork) {
        console.log('Network is no longer large enough to warrant a warning - auto-proceeding');
        
        // Hide the warning
        largeNetworkWarning.style.display = 'none';
        isLargeNetworkWarningVisible = false;
        
        // Clear saved state
        preLargeNetworkState = null;
        lastChangeInfo = null;
        
        // Proceed with visualization
        visualizeNetwork();
    }
}

// Function to check network size and decide whether to show warning or visualize
function checkAndVisualizeNetwork() {
    // Calculate potential network size
    const networkSize = calculateNetworkSize();
    
    if (networkSize.isLargeNetwork) {
        console.log('CHECK: Large network detected - showing warning');
        
        // Log the lastChangeInfo state
        if (lastChangeInfo) {
            console.log('CHECK: lastChangeInfo exists when showing warning:', JSON.stringify({
                value: lastChangeInfo.value,
                wasChecked: lastChangeInfo.previousState
            }));
        } else {
            console.log('CHECK: No lastChangeInfo available when showing warning');
        }
        
        // Save state if we don't already have one (for backward compatibility)
        // Note: We might already have saved it in selectAllCheckboxes
        if (!preLargeNetworkState) {
            console.log('CHECK: Saving full state before showing warning...');
            
            // Get current selections
            const currentTFs = Array.from(selectedTFs);
            const currentGenes = Array.from(selectedGenes);
            
            console.log(`CHECK: Current state: ${currentTFs.length} TFs, ${currentGenes.length} genes`);
            
            // Save current state before showing warning (for potential cancellation)
            preLargeNetworkState = {
                selectedTFs: currentTFs,
                selectedGenes: currentGenes,
                confidenceValue: parseFloat(confidenceSlider.value),
                confidenceDisplayValue: confidenceValue.textContent
            };
        } else {
            console.log('CHECK: Warning shown again, existing saved state contains:', 
                    preLargeNetworkState.selectedTFs.length, 'TFs,', 
                    preLargeNetworkState.selectedGenes.length, 'genes');
        }
        
        // Update the warning message with the network size
        warningNodeCount.textContent = networkSize.nodeCount;
        warningEdgeCount.textContent = networkSize.edgeCount;
        
        // Show the warning
        largeNetworkWarning.style.display = 'flex';
        isLargeNetworkWarningVisible = true;
        
        // Hide other messages/indicators
        loading.style.display = 'none';
        noConnectionsMessage.style.display = 'none';
    } else {
        // If not a large network, proceed with visualization
        // Also clear any saved state since we're proceeding without a warning
        preLargeNetworkState = null;
        visualizeNetwork();
    }
}

// Function called when the user chooses to proceed with a large network
function renderLargeNetwork() {
    console.log('User chose to proceed with large network visualization');
    // Clear the last change info since user chose to proceed
    lastChangeInfo = null;
    visualizeNetwork();
}

// Visualize the network based on selected nodes
function visualizeNetwork() {
    console.log('Visualizing network...');
    
    // Use the selectedTFs and selectedGenes Sets
    const selectedTFsArray = Array.from(selectedTFs);
    const selectedGenesArray = Array.from(selectedGenes);
    
    // Get minimum confidence value
    const minConfidence = parseFloat(confidenceSlider.value);
    
    console.log('Selected TFs:', selectedTFsArray.length, selectedTFsArray);
    console.log('Selected genes:', selectedGenesArray.length, selectedGenesArray);
    console.log('Minimum confidence:', minConfidence);
    
    // Check for special TFs and warn the user if they're selected
    const selectedSpecialTFs = selectedTFsArray.filter(tf => specialTFs.hasOwnProperty(tf));
    if (selectedSpecialTFs.length > 0) {
        console.log('Special TFs selected:', selectedSpecialTFs);
        // We could add a warning here if needed, but we'll just allow them to be selected
        // They just won't show any connections in the network
    }
    
    // Debug log the current state of the visualization
    if (cy) {
        console.log('Current network state:', {
            nodes: cy.nodes().length,
            edges: cy.edges().length
        });
    }
    
    // Check if both a TF and a target gene are selected
    if (selectedTFsArray.length === 0 || selectedGenesArray.length === 0) {
        console.log('Visualization aborted: need at least one TF and one target gene');
        
        // Show the no-connections message instead of just returning
        cy.elements().remove();
        loading.style.display = 'none';
        noConnectionsMessage.style.display = 'flex';
        isNetworkRendered = false;
        const noConnectionsTitle = noConnectionsMessage.querySelector('h3');
        if (noConnectionsTitle) {
            noConnectionsTitle.textContent = 'Select at least one TF and one target gene';
        }
        return;
    }
    
    // Show loading indicator
    loading.style.display = 'flex';
    loadingText.textContent = 'Building network...';
    
    // Hide the no-connections message (will show it later if needed)
    noConnectionsMessage.style.display = 'none';
    
    // Clear previous visualization
    cy.elements().remove();
    
    // Hide node info
    nodeInfo.style.display = 'none';
    
    // Prepare nodes and edges data
    const elements = [];
    const addedNodes = new Set();
    let edgeCount = 0;
    
    // Process network data to create elements
    networkData.forEach(row => {
        const tf = row.REGULATOR;
        const gene = row.TARGET;
        const value = parseFloat(row.VALUE);
        
        // Skip invalid entries
        if (!tf || !gene || isNaN(value)) return;
        
        // Filter by confidence value
        if (value < minConfidence) return;
        
        // Add elements if they match the selection criteria
        // Must have explicit selections for both TF and gene
        if (selectedTFsArray.includes(tf) && selectedGenesArray.includes(gene)) {
            
            // Add TF node if not already added
            if (!addedNodes.has(tf)) {
                let commonTFName = tfToCommonName[tf] || tf;
                // Format TF name with first letter capital, rest lowercase
                commonTFName = commonTFName.charAt(0).toUpperCase() + commonTFName.slice(1).toLowerCase();
                elements.push({
                    data: {
                        id: tf,
                        name: commonTFName, // Store common name for display
                        nodeType: 'TF',
                        size: 45
                    }
                });
                addedNodes.add(tf);
            }
            
            // Add target gene node if not already added
            if (!addedNodes.has(gene)) {
                const commonGeneName = geneToCommonName[gene] || gene;
                
                // Check if this target gene is also a TF (exists in tfSet)
                const isAlsoTF = tfSet.has(gene);
                
                elements.push({
                    data: {
                        id: gene,
                        name: commonGeneName, // Store common name for display
                        nodeType: isAlsoTF ? 'TF-target' : 'target', // Mark genes that are also TFs
                        size: 40
                    }
                });
                addedNodes.add(gene);
            }
            
            // Add edge
            elements.push({
                data: {
                    id: `${tf}-${gene}`,
                    source: tf,
                    target: gene,
                    weight: 1 + value,
                    opacity: 0.5 + (value * 0.5),
                    confidence: value
                }
            });
            edgeCount++;
        }
    });
    
    // Update loading message
    loadingText.textContent = `Rendering ${addedNodes.size} nodes and ${edgeCount} edges...`;
    
    // Add elements to the graph
    cy.add(elements);
    
    // If no elements added, show message and return
    if (elements.length === 0) {
        console.log('No connections found. Selected TFs:', selectedTFsArray.length, 'Selected genes:', selectedGenesArray.length, 'Min confidence:', minConfidence);
        loading.style.display = 'none';
        
        // Update the message with current confidence threshold value
        const noConnectionsTitle = noConnectionsMessage.querySelector('h3');
        if (noConnectionsTitle) {
            noConnectionsTitle.textContent = `No connections found (confidence: ${minConfidence.toFixed(2)})`;
        }
        
        // Show the no-connections message
        noConnectionsMessage.style.display = 'flex';
        isNetworkRendered = false;
        return;
    }
    
    // Apply layout
    loadingText.textContent = 'Applying layout...';
    
    cy.layout({
        name: 'cose',
        animate: false,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: true,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
    }).run();
    
    // Hide loading indicator and no-connections message
    loading.style.display = 'none';
    noConnectionsMessage.style.display = 'none';
    
    // Mark network as successfully rendered
    isNetworkRendered = true;
    updateInstructionVisibility();
}

// Reset the visualization and selections
function resetVisualization() {
    console.log('Resetting visualization...');
    
    // Clear selections
    selectAllCheckboxes(tfContainer, false, selectedTFs);
    selectAllCheckboxes(geneContainer, false, selectedGenes);
    
    // Clear the sets
    selectedTFs.clear();
    selectedGenes.clear();
    
    // Update instruction visibility
    updateInstructionVisibility();
    
    // Update the Visualize Network button state
    updateVisualizeButtonState();
    
    // Reset confidence slider to minimum value (0.14)
    confidenceSlider.value = 0.14;
    confidenceValue.textContent = '0.14';
    
    // Clear graph
    cy.elements().remove();
    isNetworkRendered = false;
    
    // Hide all overlays
    nodeInfo.style.display = 'none';
    noConnectionsMessage.style.display = 'none';
    largeNetworkWarning.style.display = 'none';
    
    // Clear search fields
    tfSearch.value = '';
    geneSearch.value = '';
    filterItems(tfContainer, '');
    filterItems(geneContainer, '');
    
    // Remove any not-found messages
    const tfMessage = tfContainer.querySelector('.not-found-message');
    if (tfMessage) tfContainer.removeChild(tfMessage);
    
    const geneMessage = geneContainer.querySelector('.not-found-message');
    if (geneMessage) geneContainer.removeChild(geneMessage);
}

// Fit the network view to the container
function fitNetworkView() {
    if (cy.elements().length > 0) {
        cy.fit(cy.elements(), 50);
    }
}

// Function to select a TF and all its target genes
function selectTFAndTargets() {
    // Check if any nodes are selected
    const selectedNodes = cy.nodes(':selected');
    
    if (selectedNodes.length === 0) {
        alert('Please select at least one transcription factor before using this function.');
        return;
    }
    
    // Store the count of selected TFs and genes before making changes
    const originalTFCount = selectedTFs.size;
    const originalGeneCount = selectedGenes.size;
    
    // Keep track of new selections
    let newSelections = 0;
    let addedGenes = new Set(); // Track newly added genes
    
    // First, collect all target genes that would be selected
    const potentialGenes = new Set();
    selectedNodes.forEach(node => {
        if (node.data('nodeType') === 'TF' || node.data('nodeType') === 'TF-target') {
            node.outgoers('edge').forEach(edge => {
                const targetNode = edge.target();
                potentialGenes.add(targetNode.id());
            });
        }
    });
    
    // Check if this would add a lot of genes
    if (potentialGenes.size > 50) {
        // This is potentially a large addition
        const totalPotentialGenes = new Set([...selectedGenes, ...potentialGenes]);
        
        // Calculate potential network size with these selections
        const selectedTFsArray = Array.from(selectedTFs);
        const selectedGenesArray = Array.from(totalPotentialGenes);
        const minConfidence = parseFloat(confidenceSlider.value);
        
        let potentialNodeCount = 0;
        let potentialEdgeCount = 0;
        const uniqueNodes = new Set();
        
        // Count potential nodes and edges
        networkData.forEach(row => {
            const tf = row.REGULATOR;
            const gene = row.TARGET;
            const value = parseFloat(row.VALUE);
            
            if (!tf || !gene || isNaN(value) || value < minConfidence) return;
            
            if (selectedTFsArray.includes(tf) && selectedGenesArray.includes(gene)) {
                if (!uniqueNodes.has(tf)) {
                    uniqueNodes.add(tf);
                    potentialNodeCount++;
                }
                if (!uniqueNodes.has(gene)) {
                    uniqueNodes.add(gene);
                    potentialNodeCount++;
                }
                potentialEdgeCount++;
            }
        });
        
        // Check if this would create a large network
        if (potentialNodeCount > LARGE_NETWORK_NODE_THRESHOLD || 
            potentialEdgeCount > LARGE_NETWORK_EDGE_THRESHOLD) {
            
            // Show warning
            warningNodeCount.textContent = potentialNodeCount;
            warningEdgeCount.textContent = potentialEdgeCount;
            largeNetworkWarning.style.display = 'flex';
            
            // Set up special handler for this case
            proceedAnywayBtn.onclick = function() {
                largeNetworkWarning.style.display = 'none';
                // Continue with actual selection
                completeTargetSelection(selectedNodes, true);
                
                // Reset normal proceed button behavior
                proceedAnywayBtn.onclick = function() {
                    largeNetworkWarning.style.display = 'none';
                    renderLargeNetwork();
                };
            };
            
            cancelVisualizationBtn.onclick = function() {
                largeNetworkWarning.style.display = 'none';
                
                // Reset normal cancel button behavior
                cancelVisualizationBtn.onclick = function() {
                    largeNetworkWarning.style.display = 'none';
                };
            };
            
            return;
        }
    }
    
    // If we get here, it's safe to proceed with selection
    completeTargetSelection(selectedNodes, false);
}

// Helper function to complete the target selection and update UI
function completeTargetSelection(selectedNodes, wasFromWarning) {
    let newSelections = 0;
    
    // For each selected node
    selectedNodes.forEach(node => {
        // If it's a TF, select all its targets
        if (node.data('nodeType') === 'TF' || node.data('nodeType') === 'TF-target') {
            // Get all outgoing edges from this TF
            const outgoingEdges = node.outgoers('edge');
            
            // Select all those edges and their target nodes
            outgoingEdges.forEach(edge => {
                if (!edge.selected()) {
                    edge.select();
                    newSelections++;
                }
                
                // Select the target node
                const targetNode = edge.target();
                if (!targetNode.selected()) {
                    targetNode.select();
                    newSelections++;
                    
                    // Also update the checkbox in the UI
                    selectedGenes.add(targetNode.id());
                    const checkbox = document.querySelector(`#target-genes input[value="${targetNode.id()}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                }
            });
        }
    });
    
    // Update the selection info
    updateSelectionInfo();
    
    // For large networks, the warning dialog has already been shown
    if (newSelections === 0 && selectedNodes.length > 0 && !wasFromWarning) {
        alert('The selected transcription factor(s) do not regulate any genes in the current network view.');
    } else if (newSelections > 0) {
        // Visualize network with the new selections
        // Since we're adding items, use the check function
        checkAndVisualizeNetwork();
    }
}

// Function to clear all selections
function clearSelection() {
    cy.elements().unselect();
    updateSelectionInfo();
}

// Helper function to restore selections to a previous state
function restoreSelections(container, previouslySelectedValues, currentSelectionSet) {
    console.log(`Starting restoration for ${container.id}`);
    console.log(`Previous selection had ${previouslySelectedValues.length} items`);
    console.log(`Current selection has ${currentSelectionSet.size} items`);
    
    // Clear current selection set
    currentSelectionSet.clear();
    console.log(`After clearing, selection has ${currentSelectionSet.size} items`);
    
    // Get all checkboxes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    console.log(`Found ${checkboxes.length} checkboxes in ${container.id}`);
    
    // Convert the previous selection array to a Set for O(1) lookups
    const previousSelectionSet = new Set(previouslySelectedValues);
    
    // Debug - check a few values to ensure they're in the set
    if (previouslySelectedValues.length > 0) {
        console.log(`First few previous values: ${previouslySelectedValues.slice(0, 3)}`);
        console.log(`First value in set? ${previousSelectionSet.has(previouslySelectedValues[0])}`);
    }
    
    // Update each checkbox
    let checkedCount = 0;
    checkboxes.forEach(checkbox => {
        // Check if this item was in the previous selection
        const wasSelected = previousSelectionSet.has(checkbox.value);
        
        // Update checkbox state
        checkbox.checked = wasSelected;
        
        // Update selection set
        if (wasSelected) {
            currentSelectionSet.add(checkbox.value);
            checkedCount++;
        }
    });
    
    console.log(`Restored ${currentSelectionSet.size} selections in ${container.id} (checked ${checkedCount} boxes)`);
}

// Update the selection info display
function updateSelectionInfo() {
    // If the selection info element doesn't exist (panel might be hidden), do nothing
    if (!selectionInfo) {
        return;
    }
    
    const selectedNodes = cy.nodes(':selected');
    const selectedEdges = cy.edges(':selected');
    
    if (selectedNodes.length === 0) {
        selectionInfo.textContent = 'No nodes selected';
        return;
    }
    
    // Count TFs and targets
    let tfCount = 0;
    let targetCount = 0;
    
    selectedNodes.forEach(node => {
        if (node.data('nodeType') === 'TF' || node.data('nodeType') === 'TF-target') {
            tfCount++;
        }
        if (node.data('nodeType') === 'target' || node.data('nodeType') === 'TF-target') {
            targetCount++;
        }
    });
    
    selectionInfo.textContent = `Selected: ${tfCount} TF(s), ${targetCount} target gene(s), ${selectedEdges.length} connection(s)`;
}