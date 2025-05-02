// Global variables
let networkData = [];
let tfSet = new Set();
let geneSet = new Set();
let cy = null;

// DOM elements
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const tfSelect = document.getElementById('transcription-factors');
const geneSelect = document.getElementById('target-genes');
const confidenceSlider = document.getElementById('confidence-slider');
const confidenceValue = document.getElementById('confidence-value');
const nodeInfo = document.getElementById('node-info');
const nodeName = document.getElementById('node-name');
const nodeType = document.getElementById('node-type');
const nodeConnections = document.getElementById('node-connections');

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing application...');
    
    // Set up button event listeners
    document.getElementById('visualize-btn').addEventListener('click', visualizeNetwork);
    document.getElementById('reset-btn').addEventListener('click', resetVisualization);
    document.getElementById('fit-btn').addEventListener('click', fitNetworkView);
    document.getElementById('select-all-tf').addEventListener('click', () => selectAll(tfSelect));
    document.getElementById('clear-all-tf').addEventListener('click', () => clearAll(tfSelect));
    document.getElementById('select-all-genes').addEventListener('click', () => selectAll(geneSelect));
    document.getElementById('clear-all-genes').addEventListener('click', () => clearAll(geneSelect));
    
    // Set up confidence slider
    confidenceSlider.addEventListener('input', function() {
        // Update display value
        const value = parseFloat(this.value).toFixed(2);
        confidenceValue.textContent = value;
        
        // If network already visualized, update it
        if (cy && cy.elements().length > 0) {
            visualizeNetwork();
        }
    });
    
    // Load network data
    loadNetworkData();
});

// Helper function to select all options in a select element
function selectAll(selectElement) {
    for (let i = 0; i < selectElement.options.length; i++) {
        selectElement.options[i].selected = true;
    }
}

// Helper function to clear all selections in a select element
function clearAll(selectElement) {
    for (let i = 0; i < selectElement.options.length; i++) {
        selectElement.options[i].selected = false;
    }
}

// Load the network data from the TSV file
function loadNetworkData() {
    console.log('Loading network data...');
    
    // Show loading indicator
    loading.style.display = 'flex';
    loadingText.textContent = 'Loading network data...';
    
    // Parse the TSV file using PapaParse
    Papa.parse('net_np3.tsv', {
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
            tfSet.add(row.REGULATOR);
            geneSet.add(row.TARGET);
        }
    });
    
    console.log(`Found ${tfSet.size} transcription factors and ${geneSet.size} target genes`);
    
    // Fill select elements with options
    loadingText.textContent = 'Populating menus...';
    
    // Clear and populate the transcription factors select
    tfSelect.innerHTML = '';
    Array.from(tfSet).sort().forEach(tf => {
        const option = document.createElement('option');
        option.value = tf;
        option.textContent = tf;
        tfSelect.appendChild(option);
    });
    
    // Clear and populate the target genes select
    geneSelect.innerHTML = '';
    Array.from(geneSet).sort().forEach(gene => {
        const option = document.createElement('option');
        option.value = gene;
        option.textContent = gene;
        geneSelect.appendChild(option);
    });
    
    // Initialize Cytoscape
    loadingText.textContent = 'Initializing visualization...';
    initCytoscape();
    
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
                    'label': 'data(id)',
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
                    'background-color': '#3498db',
                    'shape': 'ellipse'
                }
            },
            {
                selector: 'node[nodeType="target"]',
                style: {
                    'background-color': '#e74c3c',
                    'shape': 'rectangle'
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
            }
        ]
    });
    
    // Add click event for nodes to show info
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        
        // Display node information
        nodeName.textContent = node.id();
        nodeType.textContent = node.data('nodeType') === 'TF' ? 'Transcription Factor' : 'Target Gene';
        
        // Count connections
        const outgoing = node.outgoers('edge').length;
        const incoming = node.incomers('edge').length;
        
        if (node.data('nodeType') === 'TF') {
            nodeConnections.textContent = `Regulates ${outgoing} genes`;
        } else {
            nodeConnections.textContent = `Regulated by ${incoming} transcription factors`;
        }
        
        // Show the info panel
        nodeInfo.style.display = 'block';
    });
    
    // Add click event for edges to show info
    cy.on('tap', 'edge', function(evt) {
        const edge = evt.target;
        const sourceNode = edge.source().id();
        const targetNode = edge.target().id();
        const confidence = edge.data('confidence').toFixed(3);
        
        // Display edge information
        nodeName.textContent = `${sourceNode} → ${targetNode}`;
        nodeType.textContent = 'Regulatory Relationship';
        nodeConnections.textContent = `Confidence: ${confidence}`;
        
        // Show the info panel
        nodeInfo.style.display = 'block';
    });
    
    // Hide info panel when clicking on background
    cy.on('tap', function(evt) {
        if (evt.target === cy) {
            nodeInfo.style.display = 'none';
        }
    });
}

// Visualize the network based on selected nodes
function visualizeNetwork() {
    console.log('Visualizing network...');
    
    // Get selected transcription factors and target genes
    const selectedTFs = Array.from(tfSelect.selectedOptions).map(option => option.value);
    const selectedGenes = Array.from(geneSelect.selectedOptions).map(option => option.value);
    
    // Get minimum confidence value
    const minConfidence = parseFloat(confidenceSlider.value);
    
    console.log('Selected TFs:', selectedTFs);
    console.log('Selected genes:', selectedGenes);
    console.log('Minimum confidence:', minConfidence);
    
    // Check if any nodes are selected
    if (selectedTFs.length === 0 && selectedGenes.length === 0) {
        alert('Please select at least one transcription factor or target gene.');
        return;
    }
    
    // Show loading indicator
    loading.style.display = 'flex';
    loadingText.textContent = 'Building network...';
    
    // Clear previous visualization
    cy.elements().remove();
    
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
        if ((selectedTFs.includes(tf) || selectedTFs.length === 0) && 
            (selectedGenes.includes(gene) || selectedGenes.length === 0)) {
            
            // Add TF node if not already added
            if (!addedNodes.has(tf)) {
                elements.push({
                    data: {
                        id: tf,
                        nodeType: 'TF',
                        size: 25
                    }
                });
                addedNodes.add(tf);
            }
            
            // Add target gene node if not already added
            if (!addedNodes.has(gene)) {
                elements.push({
                    data: {
                        id: gene,
                        nodeType: 'target',
                        size: 20
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
        loading.style.display = 'none';
        alert('No connections found with the current filters. Try lowering the confidence threshold or selecting different nodes.');
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
    
    // Hide loading indicator
    loading.style.display = 'none';
}

// Reset the visualization and selections
function resetVisualization() {
    console.log('Resetting visualization...');
    
    // Clear selections
    clearAll(tfSelect);
    clearAll(geneSelect);
    
    // Reset confidence slider
    confidenceSlider.value = 0;
    confidenceValue.textContent = '0.00';
    
    // Clear graph
    cy.elements().remove();
    
    // Hide node info
    nodeInfo.style.display = 'none';
}

// Fit the network view to the container
function fitNetworkView() {
    if (cy.elements().length > 0) {
        cy.fit(cy.elements(), 50);
    }
}