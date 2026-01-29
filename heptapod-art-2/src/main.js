import * as THREE from 'three';
import * as CANNON from 'cannon-es'; // Added import for Raycasting interaction
import { SceneManager } from './Scene.js';
import { PhysicsWorld } from './Physics.js';
import { InkRenderer } from './InkRenderer.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.input = document.getElementById('word-input');
        // this.btnNext = document.getElementById('btn-next');
        this.btnCenter = document.getElementById('btn-center');
        this.btnReset = document.getElementById('btn-reset');

        // Initialize Core Systems
        this.sceneManager = new SceneManager(this.container);
        this.physicsWorld = new PhysicsWorld();
        this.inkRenderer = new InkRenderer(this.sceneManager.scene, this.sceneManager.camera);

        // Bind Events
        this.bindEvents();

        // Start Loop
        this.lastTime = performance.now();
        this.animate();
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.sceneManager.resize();
            this.inkRenderer.resize();
        });

        // Mouse tracking for interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.mouseWorld = null; // 3D position

        window.addEventListener('mousemove', (e) => {
            // Normalized Device Coordinates (-1 to +1)
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        // Focus persistence
        this.container.addEventListener('mousedown', () => {
            // We want to keep focus on input if user is just panning
            setTimeout(() => this.input.focus(), 0);
        });

        this.container.addEventListener('mouseup', () => {
            setTimeout(() => this.input.focus(), 0);
        });

        this.input.addEventListener('input', (e) => {
            const char = e.data;
            if (char) {
                console.log('Input received:', char);
                const center = this.sceneManager.camera.position.clone();
                center.z = 0; // Flatten to 2D plane
                this.physicsWorld.addNode(char, center);
                console.log('Node added. Total nodes:', this.physicsWorld.nodes.length);
            }
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.physicsWorld.finalizeCluster(); // Create new thought bubble
                this.input.value = '';
            }
        });

        /*
        this.btnNext.addEventListener('click', () => {
            this.physicsWorld.shiftOrigin();
            this.input.focus();
        });
        */

        this.btnCenter.addEventListener('click', () => {
            const centroid = this.physicsWorld.getCentroid();
            this.sceneManager.setCameraTarget(centroid.x, centroid.y);
            this.input.focus();
        });

        this.btnReset.addEventListener('click', () => {
            this.physicsWorld.reset();
            this.input.value = '';
            this.input.focus();
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const time = performance.now();
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        // Interaction Update (moved and simplified)
        if (this.sceneManager.camera) {
            this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
            // Raycast to Z=0 plane
            const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            const target = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(planeZ, target);
            if (target) {
                this.mouseWorld = new CANNON.Vec3(target.x, target.y, target.z);
            }
        }

        // Apply Forces
        this.physicsWorld.applyIdleMotion(time / 1000); // Pass seconds
        if (this.mouseWorld) {
            this.physicsWorld.applyMouseInteraction(this.mouseWorld);
        }

        // Step Physics
        this.physicsWorld.step(deltaTime);

        // Sync Physics to Visuals
        const nodes = this.physicsWorld.getNodes();
        const springs = this.physicsWorld.getSprings();
        this.inkRenderer.update(nodes, deltaTime, springs);

        // Render
        this.sceneManager.render(); // Or inkRenderer.render() if using post-processing
    }
}

new App();
