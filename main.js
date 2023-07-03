import { Viewer, ControlPanel, Sliders } from './utils/classes.js';

let METADATA = await fetch(`metadata_hi_res.json`).then(response => response.json());

// Initialize control panel
let controller = new ControlPanel('metadata-panel', METADATA);

// Initialize viewer
// let viewer = new Viewer('div-viewer-top', METADATA, 'https://storage.googleapis.com/bucket-quickstart_mamba-demo-391400/data_hi_res/', 'raw');
let viewer = new Viewer('div-viewer-top', METADATA, 'data_hi_res/', 'raw');

// Initialize sliders
let sliders = new Sliders(METADATA);

// Load data
controller.update(controller.dropdown.value)
viewer.load(controller.dropdown.value);

// Link control buttons with top viewer
viewer.reset_buttons();
viewer.autorotate_button();
viewer.heatmap_button();

// Animate viewers
viewer.animate();

// Activate control panel
controller.control([viewer], sliders);

// Link sliders to viewer
sliders.activate([viewer])