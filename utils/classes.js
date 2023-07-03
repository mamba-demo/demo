import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { calculateWindow, calculateOffset, createOutline } from './utils.js';

// Create Viewer class
export class Viewer {
    constructor(container_id, metadata, root_dir, mode) {
        // Store metadata
        this.metadata = metadata;
        this.root_dir = root_dir;
        this.mode = mode;

        // Initialize container
        this.container = document.getElementById(container_id);

        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(75, this.container.offsetWidth / this.container.offsetHeight, 0.1, 1000);
        this.camera.position.y = 3;
        this.camera.position.z = 2;

        // Initialize scene
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
        this.container.appendChild(this.renderer.domElement);

        // Initialize controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.25;
        this.controls.enableZoom = true;
        this.controls.autoRotate = false;
        this.controls.autoRotateSpeed = -1.0;  // set rotation speed to -2.0 degrees per second

        // Bind the animate and resize methods to this
        this.animate = this.animate.bind(this);
        this.resize = this.resize.bind(this);

        // Adjust camera on window resize
        window.addEventListener('resize', this.resize, false);

    }

    // Load tissue
    load(slide_id) {
        // Store slide id
        this.slide_id = slide_id;

        // Clear scene
        this.scene.clear();

        // Compute max dimension for normalization
        this.width = this.metadata.find(slide => slide.id === slide_id).dimensions.x;
        this.depth = this.metadata.find(slide => slide.id === slide_id).dimensions.z;
        this.height = this.metadata.find(slide => slide.id === slide_id).dimensions.y;
        this.scale_factor = Math.max(this.width, this.depth, this.height) / 3;

        // Generate tissue outline
        this.outline_geometry = createOutline(this.width / this.scale_factor, this.height / this.scale_factor, this.depth / this.scale_factor);
        this.outline_material = new THREE.LineBasicMaterial({ color: 0xffffff });
        this.outline = new THREE.LineSegments(this.outline_geometry, this.outline_material);
        this.scene.add(this.outline);

        // Generate dummy tissue block
        let texture = new THREE.Texture();
        let tissue_block_materials = Array(6).fill().map(() => new THREE.MeshBasicMaterial({ map: texture }));
        let block_geometry = new THREE.BoxGeometry(this.width / this.scale_factor, this.height / this.scale_factor, this.depth / this.scale_factor);
        this.tissue_block = new THREE.Mesh(block_geometry, tissue_block_materials);
        this.scene.add(this.tissue_block);

        // Inititialize textures
        this.slice({ x: [0, this.width - 1], y: [0, this.height - 1], z: [0, this.depth - 1] });
    }

    // Update tissue block
    slice = async (slider_values) => {
        // Update tissue block
        let textureLoader = new THREE.TextureLoader();
        let path_to_data = this.root_dir + this.slide_id + "/" + this.mode;

        this.bounds = {
            left: slider_values.x[0],
            right: slider_values.x[1],
            front: slider_values.z[1],
            back: slider_values.z[0],
            top: slider_values.y[0],
            bottom: slider_values.y[1]
        };

        this.bounds_normalized = {
            left: this.bounds.left / this.width,
            right: this.bounds.right / this.width,
            front: this.bounds.front / this.depth,
            back: this.bounds.back / this.depth,
            top: this.bounds.top / this.height,
            bottom: this.bounds.bottom / this.height
        };

        // Update textures
        const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
        const axis = ['x', 'x', 'y', 'y', 'z', 'z'];
        const face_idx = [0, 1, 2, 3, 4, 5];

        // Wrap each texture loading operation in a Promise
        let promises = faces.map((face, i) =>
            new Promise((resolve, reject) => {
                textureLoader.load(`${path_to_data}/${axis[i]}/${this.bounds[face]}.png`, loadedTexture => {
                    // Crop texture using repeat and offset
                    let { window_horizontal, window_vertical } = calculateWindow(face, this.bounds_normalized);
                    let { offset_horizontal, offset_vertical } = calculateOffset(face, this.bounds_normalized);
                    loadedTexture.repeat.set(window_horizontal, window_vertical);
                    loadedTexture.offset.set(offset_horizontal, offset_vertical);

                    // Update material with new texture
                    this.tissue_block.material[face_idx[i]].map = loadedTexture;
                    this.tissue_block.material[face_idx[i]].needsUpdate = true;
                    resolve();
                },
                    undefined,
                    err => reject(err));
            })
        );

        // Dispose old textures
        this.tissue_block.material.forEach(mat => {
            if (mat.map) {
                mat.map.dispose();
                // mat.map = null;
            }
        });

        // Wait for all textures to load
        try {
            await Promise.all(promises);
        } catch (err) {
            console.error('An error occurred while loading textures:', err);
            // throw err;  // or handle error as appropriate
        }

        // Update dimensions
        let width_new = this.bounds.right - this.bounds.left;
        let height_new = this.bounds.bottom - this.bounds.top;
        let depth_new = this.bounds.front - this.bounds.back;
        this.tissue_block.geometry.dispose();
        this.tissue_block.geometry = new THREE.BoxGeometry(width_new / this.scale_factor, height_new / this.scale_factor, depth_new / this.scale_factor);

        // Update this.tissue_block position
        this.tissue_block.position.x = ((this.bounds.left + this.bounds.right - this.width) / 2) / (this.scale_factor);
        this.tissue_block.position.z = ((this.bounds.front + this.bounds.back - this.depth) / 2) / (this.scale_factor);
        this.tissue_block.position.y = ((this.height - this.bounds.top - this.bounds.bottom) / 2) / (this.scale_factor);
    }

    // Sync camera controls from another viewer
    sync_camera(viewer) {
        viewer.controls.addEventListener('change', () => {
            this.camera.position.copy(viewer.camera.position);
            this.camera.rotation.copy(viewer.camera.rotation);
            this.camera.zoom = viewer.camera.zoom;
            this.camera.updateProjectionMatrix();
            this.controls.target.copy(viewer.controls.target);
            this.controls.autoRotate = viewer.controls.autoRotate;
        });
    }

    // Start animation loop
    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // Resize viewer
    resize() {
        this.camera.aspect = this.container.offsetWidth / this.container.offsetHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
    }

    // Reset buttons
    reset_buttons() {
        // Grab axis button elements
        let cameraButtons = {
            y: $("#button-camera-y"),
            x: $("#button-camera-x"),
            z: $("#button-camera-z")
        };

        // Event listeners for axis buttons
        for (let axis in cameraButtons) {
            cameraButtons[axis].click(() => {
                if (axis === 'y') {
                    // Look along -Y direction for top-down view
                    this.camera.position.set(0, 3, 0);
                    this.camera.lookAt(0, 0, 0);
                } else if (axis === 'x') {
                    // Look along +X direction
                    this.camera.position.set(3, 0, 0);
                    this.camera.lookAt(0, 0, 0);
                } else if (axis === 'z') {
                    // Look along +Z direction
                    this.camera.position.set(0, 0, 3);
                }

                // Focus camera on center
                this.camera.lookAt(0, 0, 0);

                // Reset the controls target to ensure camera pans back to the origin
                this.controls.target.set(0, 0, 0);
            });
        }
    }

    // Autorotate button
    autorotate_button() {
        // Grab autorotate button element
        let autorotate_button = document.getElementById('button-autorotate')
        autorotate_button.addEventListener('click', () => {
            if (autorotate_button.classList.contains('active')) {
                this.controls.autoRotate = false;
            } else {
                this.controls.autoRotate = true;
            }
            autorotate_button.classList.toggle('active');
        });
    }

    // Heatmap button
    heatmap_button() {
        // Grab mode toggle button element
        let mode_toggle = document.getElementById('button-heatmap');
        let colorbar = document.getElementById('div-colorbar');
        mode_toggle.addEventListener('click', () => {
            if (mode_toggle.classList.contains('active')) {
                this.mode = 'raw';
                this.slice({ x: [this.bounds.left, this.bounds.right], y: [this.bounds.top, this.bounds.bottom], z: [this.bounds.back, this.bounds.front] });
                colorbar.style.display = 'none';
            } else {
                this.mode = 'heatmap';
                this.slice({ x: [this.bounds.left, this.bounds.right], y: [this.bounds.top, this.bounds.bottom], z: [this.bounds.back, this.bounds.front] });
                colorbar.style.display = 'flex';
            }
            mode_toggle.classList.toggle('active');
        });
    }
}

// Create ControlPanel class
export class ControlPanel {
    constructor(panel_id, metadata) {
        // Initialize panel
        this.panel = document.getElementById(panel_id);

        // Load metadata
        this.metadata = metadata;

        // Create div for logo and link
        let logo_div_top = document.createElement('div');
        logo_div_top.classList.add('div-logo-top'); // add class

        // Add logo.png
        let logo_mamba = document.createElement('img');
        logo_mamba.src = 'logos/mamba.png';
        logo_mamba.classList.add('logo-mamba'); // add class
        logo_div_top.appendChild(logo_mamba);

        // Add link
        let link = document.createElement('a');
        link.href = '';
        link.innerHTML = 'MAMBA';
        link.classList.add('logo-mamba-link'); // add class
        logo_div_top.appendChild(link);

        // Append the top logo div to the panel
        this.panel.appendChild(logo_div_top);

        // Add dropdown
        this.dropdown = document.getElementById('slide-select');
        this.metadata.forEach(slide => {
            let option = document.createElement('option');
            option.value = slide.id;
            option.textContent = 'Block ' + slide.id;
            this.dropdown.appendChild(option);
        });
        this.panel.appendChild(this.dropdown);

        // Add panel toggle
        this.button = document.getElementById('panel-toggle');
        this.button.addEventListener('click', () => {
            // Change the text of the button
            if (this.panel.classList.contains('show')) {
                this.button.innerHTML = '>>';
                this.button.style.transform = 'translateY(-50%) translateX(-400px)'; /* move the button 300px right */
            } else {
                this.button.innerHTML = '<<';
                this.button.style.transform = 'translateY(-50%) translateX(0)'; /* move the button back to the start */
            }
            this.panel.classList.toggle('show');
        });

    }

    // Update panel
    update(slide_id) {
        // Get slide data
        let slide_data = this.metadata.find(slide => slide.id === slide_id);

        // Clear panel
        while (this.panel.children.length > 2) {
            this.panel.removeChild(this.panel.lastChild);
        }

        // Add metadata
        Object.entries(slide_data.metadata).forEach(([key, value]) => {
            let div = document.createElement('div');
            div.innerHTML = '<b>' + key.charAt(0).toUpperCase() + key.slice(1) + '</b>: ' + value; // capitalize the property and bold the key
            this.panel.appendChild(div);
        });

        // Create div for bottom logos
        let logo_div_bottom = document.createElement('div');
        logo_div_bottom.classList.add('div-logo-bottom'); // add class

        // Add logos
        let logo_lab = document.createElement('img');
        logo_lab.src = 'logos/mahmoodlab.png';
        logo_lab.classList.add('logos-fullwidth'); // add class
        logo_div_bottom.appendChild(logo_lab);

        let logo_hms = document.createElement('img');
        logo_hms.src = 'logos/hms.png';
        logo_hms.classList.add('logos-fullwidth'); // add class
        logo_div_bottom.appendChild(logo_hms);

        let logo_bwh = document.createElement('img');
        logo_bwh.src = 'logos/mgb.svg';
        logo_bwh.classList.add('logos-fullwidth'); // add class
        logo_div_bottom.appendChild(logo_bwh);

        // Append the bottom logo div to the panel
        this.panel.appendChild(logo_div_bottom);

    }

    // Activate controller
    control(viewers, sliders) {
        // Build sliders with initial sample
        sliders.build(this.dropdown.value);

        // Update viewers, sliders, and panel when dropdown changes
        this.dropdown.addEventListener('change', () => {
            viewers.forEach(viewer => viewer.load(this.dropdown.value));
            sliders.build(this.dropdown.value);
            this.update(this.dropdown.value);
        });
    }
}

// Create Sliders class
export class Sliders {
    constructor(metadata) {
        // Grab slider divs
        this.sliders = {
            y: $('#ySlider'),
            x: $('#xSlider'),
            z: $('#zSlider')
        };

        // Store metadata
        this.metadata = metadata;
    }

    // Build sliders
    build(slide_id) {
        // Set slider sizes
        this.width = this.metadata.find(slide => slide.id === slide_id).dimensions.x;
        this.depth = this.metadata.find(slide => slide.id === slide_id).dimensions.z;
        this.height = this.metadata.find(slide => slide.id === slide_id).dimensions.y;
        this.sliderSizes = { y: this.height, x: this.width, z: this.depth };
        // this.isUpdating = false;   // Semaphore variable to prevent simultaneous updates

        // Generate sliders
        for (let axis in this.sliders) {
            this.sliders[axis].slider({
                range: true,
                min: 0,
                max: this.sliderSizes[axis] - 1,
                values: [0, this.sliderSizes[axis] - 1],
                step: 1
            });
        }
    }

    // Link sliders to viewer
    activate(viewers) {
        // Initialize previous slider values
        let prevSliderValues = {
            y: this.sliders.y.slider('values'),
            x: this.sliders.x.slider('values'),
            z: this.sliders.z.slider('values')
        };

        // Start an interval that updates the viewer every 50 milliseconds iff the sliders have changed
        setInterval(() => {
            let newSliderValues = {
                y: this.sliders.y.slider('values'),
                x: this.sliders.x.slider('values'),
                z: this.sliders.z.slider('values')
            };

            // Check if the values have changed
            if (JSON.stringify(newSliderValues) !== JSON.stringify(prevSliderValues)) {
                viewers.forEach(viewer => viewer.slice(newSliderValues));
                prevSliderValues = newSliderValues;
            }
        }, 100);

        // Activate autoslice listener
        this.autoslice_buttons(viewers);
    }

    // Autoslice event listener
    autoslice_buttons(viewers) {
        // Grab autoslice button elements
        let autosliceButtons = {
            y: $("#button-autoslicer-y"),
            x: $("#button-autoslicer-x"),
            z: $("#button-autoslicer-z")
        };

        // Set up autoslice intervals
        let autosliceIntervals = {
            y: null,
            x: null,
            z: null
        };

        // Set up autoslice steps to be 1% of width/height/depth
        let autosliceSteps = {
            y: 1,
            x: 1,
            z: 1
        };

        // Event listeners for autoslicer buttons
        for (let axis in autosliceButtons) {
            autosliceButtons[axis].click(() => {
                // If the autoslice for this axis is currently running, stop it
                if (autosliceIntervals[axis]) {
                    clearInterval(autosliceIntervals[axis]);
                    autosliceIntervals[axis] = null;
                    autosliceButtons[axis].removeClass("active");
                } else {
                    // Otherwise, start the autoslice
                    autosliceIntervals[axis] = setInterval(async () => {
                        // Get current values of the slider
                        let values = this.sliders[axis].slider("values");
                        // Only increase lower bound if it's 10 less than the upper bound
                        if (values[0] <= values[1] - autosliceSteps[axis]) {
                            this.sliders[axis].slider("values", [values[0] + autosliceSteps[axis], values[1]]);
                        } else {
                            // Reset lower bound to 0
                            this.sliders[axis].slider("values", [0, values[1]]);
                        }
                    }, 50); // delay in ms
                    autosliceButtons[axis].addClass("active");
                }
            });
        }
    }

}