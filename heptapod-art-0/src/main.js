import * as THREE from 'three';
import { SceneManager } from './Scene.js';
import { PhysicsWorld } from './Physics.js';
import { InkRenderer } from './InkRenderer.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.input = document.getElementById('word-input');
        this.btnNext = document.getElementById('btn-next');
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

        this.input.addEventListener('input', (e) => {
            const char = e.data;
            if (char) {
                this.physicsWorld.addNode(char);
            }
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.physicsWorld.crystallize(); // Just expands net
                this.input.value = '';
            }
        });

        this.btnNext.addEventListener('click', () => {
            this.physicsWorld.shiftOrigin();
            this.input.focus();
        });

        this.btnReset.addEventListener('click', () => {
            this.physicsWorld.reset();
            this.input.value = '';
            this.input.focus();
        });
    }

    animate = () => {
        requestAnimationFrame(this.animate);

        const time = performance.now();
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

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
