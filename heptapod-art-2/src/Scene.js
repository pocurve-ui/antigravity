import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor(container) {
        this.container = container;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 20); // Standard starting position

        this.scene.background = new THREE.Color(0x050510); // Deep Space Blue

        this.renderer = new THREE.WebGLRenderer({
            alpha: false, // Force opaque
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x050510, 1); // Explicit clear color
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 100;

        // Changed to Pan-only controls
        this.controls.enableRotate = false;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
        console.log("OrbitControls initialized and active (Pan Mode)");
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    panCamera(deltaX, deltaY) {
        // Shift camera position
        this.camera.position.x += deltaX;
        this.camera.position.y += deltaY;

        // Shift controls target to maintain view angle relative to position
        this.controls.target.x += deltaX;
        this.controls.target.y += deltaY;

        console.log(`Auto-panning: Camera shifted by (${deltaX}, ${deltaY})`);
    }

    setCameraTarget(x, y) {
        const dx = x - this.controls.target.x;
        const dy = y - this.controls.target.y;
        this.panCamera(dx, dy);
        console.log(`Centering camera on: (${x}, ${y})`);
    }
}
