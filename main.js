import { Viewer, ControlPanel, Sliders } from './utils/classes.js';

let METADATA = await fetch(`metadata.json`).then(response => response.json());

// Initialize control panel
let controller = new ControlPanel('metadata-panel', METADATA);

// Initialize viewers
let viewer_top = new Viewer('div-viewer-top', METADATA, 'https://storage.googleapis.com/bucket-quickstart_mamba-demo-391400/', 'heatmap');
// let viewer_bottom = new Viewer('div-viewer-bottom', METADATA, 'data/', 'heatmap/');

// Initialize sliders
let sliders = new Sliders(METADATA);

// Load data
controller.update(controller.dropdown.value)
viewer_top.load(controller.dropdown.value);
// viewer_bottom.load(controller.dropdown.value);

// Link control buttons with top viewer
viewer_top.reset_buttons();
viewer_top.autorotate_button();
viewer_top.heatmap_button();

// Sync viewer camera controls
// viewer_top.sync_camera(viewer_bottom);
// viewer_bottom.sync_camera(viewer_top);

// Animate viewers
viewer_top.animate();
// viewer_bottom.animate();

// Activate control panel
controller.control([viewer_top], sliders);

// Link sliders to viewer
sliders.activate([viewer_top])