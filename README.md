# MAMBA Demo Site

This is a interactive tissue block viewer developed for the MAMBA project. It allows full camera controls (orbit, pan, zoom) and dynamic slicing of the tissue block. Interpretability heatmaps may be toggled on and off. Multiple tissue blocks are supported.

Link to site: https://mamba-demo.github.io/demo/

Notes:
- Data is loaded from a GCP bucket. The bucket name is specified in `main.js`. Must set CORS policy on bucket using `gsutil cors set cors-config.json gs://<bucket-name>`.
- Tissue block metadata is loaded from `metadata.json`.
- 3D slices are precomputed from a source y-stack of images by `main.ipynb`.

Dependencies:
- [three.js](https://threejs.org/)
- [jQuery](https://jquery.com/)