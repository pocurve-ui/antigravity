import * as CANNON from 'cannon-es';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

export class PhysicsWorld {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, 0, 0); // Zero gravity
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;

        // List of active nodes { body, id, timestamp }
        this.nodes = [];
        this.springs = [];

        // Constants in the Heptapod universe
        this.REPULSION_FORCE = 40.0;
        this.REPULSION_RADIUS = 0.225; // Scaled up 50% (0.15 * 1.5)
        this.SPRING_REST_LENGTH = 0.15; // Scaled up 50%
        this.SPRING_STIFFNESS_LOOSE = 1.0;
        this.SPRING_STIFFNESS_TIGHT = 15.0;
        this.SPRING_STIFFNESS_TIGHT = 15.0;
        this.SPRING_DAMPING = 0.5;

        this.MAX_NODE_CAPACITY = 100; // Limit total nodes to 100

        this.isCrystallized = false;

        // State tracking
        this.currentClusterID = 0;
        this.spawnCenter = new CANNON.Vec3(0, 0, 0);
        this.lastSymbolNodeCount = 0;

        // Single global listener for all springs
        this.world.addEventListener('postStep', () => {
            for (const spring of this.springs) {
                spring.applyForce();
            }
        });

        // Ambient Motion Setup
        this.simplex = new SimplexNoise();
        // Create 3 Phantom Cursors with different noise offsets
        this.phantomCursors = [
            { pos: new CANNON.Vec3(0, 0, 0), offset: 0 },
            { pos: new CANNON.Vec3(0, 0, 0), offset: 1000 },
            { pos: new CANNON.Vec3(0, 0, 0), offset: 2000 }
        ];
    }

    step(dt) {
        // Accumulate running time for noise/oscillation
        if (!this.time) this.time = 0;
        this.time += dt;

        // Apply Ambient Current ("The Current")
        this.applyAmbientCurrent(this.time);

        // Phantom Interaction (Ghost Mice)
        this.updatePhantoms(this.time);
        for (const phantom of this.phantomCursors) {
            this.applyMouseInteraction(phantom.pos);
        }

        // Apply Repulsive Forces (Anti-overlap & Breathing)
        this.applyRepulsiveForces(this.time);

        // Fixed time step
        this.world.step(1 / 60, dt, 3);
    }

    addSpring(bodyA, bodyB, stiffness) {
        const spring = new CANNON.Spring(bodyA, bodyB, {
            localAnchorA: new CANNON.Vec3(0, 0, 0),
            localAnchorB: new CANNON.Vec3(0, 0, 0),
            restLength: this.SPRING_REST_LENGTH,
            stiffness: stiffness,
            damping: this.SPRING_DAMPING,
        });

        this.springs.push(spring);
    }

    applyRepulsiveForces(time) {
        // Breathing Oscillation
        // sin(time * slow_speed) -> -1 to 1
        // Map to e.g. 0.5 to 2.0 multiplier for repulsion
        const breathingSpeed = 0.5; // Slow breath
        const oscillation = Math.sin(time * breathingSpeed);
        const breathingFactor = 1.0 + oscillation * 0.8; // Range 0.2 to 1.8 roughly

        // Repulsion continues, allowing independent clusters to push each other
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nodeA = this.nodes[i];
                const nodeB = this.nodes[j];
                const bodyA = nodeA.body;
                const bodyB = nodeB.body;

                const distVec = bodyA.position.vsub(bodyB.position);
                const dist = distVec.length();

                // Dynamic Repulsion Radius? Maybe keep fixed for stability, modulate force.
                if (dist < this.REPULSION_RADIUS && dist > 0.001) {
                    let forceMagnitude = this.REPULSION_FORCE * (1 - dist / this.REPULSION_RADIUS);

                    // Apply Breathing ONLY between different clusters
                    if (nodeA.clusterID !== nodeB.clusterID) {
                        forceMagnitude *= breathingFactor;
                    }

                    const force = distVec.unit().scale(forceMagnitude);

                    bodyA.applyForce(force, bodyA.position);
                    bodyB.applyForce(force.negate(), bodyB.position);
                }
            }
        }
    }

    updatePhantoms(time) {
        // Move the phantom cursors around the screen using noise
        const speed = 0.3;

        // Map noise (-1 to 1) to screen coordinates approx +/- 12 width, +/- 8 height
        // Use different noise coordinates for each phantom so they don't move in sync
        for (let i = 0; i < this.phantomCursors.length; i++) {
            const phantom = this.phantomCursors[i];
            const offset = phantom.offset;

            const x = this.simplex.noise(time * speed + offset, 100 + i * 10) * 12.0;
            const y = this.simplex.noise(time * speed + offset, 200 + i * 10) * 8.0;

            phantom.pos.set(x, y, 0);
        }
    }

    applyAmbientCurrent(time) {
        // Calculate cluster sizes for inertia
        const clusterCounts = {};
        for (const node of this.nodes) {
            clusterCounts[node.clusterID] = (clusterCounts[node.clusterID] || 0) + 1;
        }

        const noiseScale = 0.15; // Spatial scale of the current
        const timeScale = 0.2;   // Speed of the current evolution
        const baseForce = 2.0;   // Base strength of the current

        for (const node of this.nodes) {
            const body = node.body;

            // Simplex Noise Field
            // use x, y + time to make it flow/evolve
            const noiseValX = this.simplex.noise(body.position.x * noiseScale, body.position.y * noiseScale + time * timeScale);
            const noiseValY = this.simplex.noise(body.position.x * noiseScale + 100, body.position.y * noiseScale + time * timeScale); // Offset for Y

            // Inertia: Larger clusters move less
            const count = clusterCounts[node.clusterID] || 1;
            // Mass factor: 1 / sqrt(count) or similar. Let's try 1 / count for strong effect, or clamp.
            // Let's use a milder falloff: 1 / (1 + count * 0.2)
            const inertiaFactor = 1.0 / (1 + count * 0.1);

            const force = new CANNON.Vec3(noiseValX, noiseValY, 0).scale(baseForce * inertiaFactor);

            body.applyForce(force, body.position);
        }
    }

    addNode(char, position = { x: 0, y: 0, z: 0 }) {
        // Position relative to current spawn center
        const spawnPos = this.spawnCenter.clone();
        // Add random scatter around the spawn center (Reduced for scale)
        spawnPos.x += (Math.random() - 0.5) * 0.6;
        spawnPos.y += (Math.random() - 0.5) * 0.6;

        const radius = 0.075; // Scaled up (0.05 * 1.5)
        const body = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Sphere(radius),
            linearDamping: 0.95,
            angularDamping: 0.95,
            position: spawnPos
        });

        this.world.addBody(body);

        const nodeData = { body, char, clusterID: this.currentClusterID };

        // Connect to previous nodes IN THE SAME CLUSTER
        const currentNodeCount = this.nodes.length;
        if (currentNodeCount > 0) {
            const lastNode = this.nodes[currentNodeCount - 1];

            // Primary connection: Sequential
            if (lastNode.clusterID === this.currentClusterID) {
                this.addSpring(body, lastNode.body, this.SPRING_STIFFNESS_LOOSE);

                // Secondary connection: Random within cluster
                // Find start index of this cluster
                let clusterStartIdx = currentNodeCount - 1;
                while (clusterStartIdx >= 0 && this.nodes[clusterStartIdx].clusterID === this.currentClusterID) {
                    clusterStartIdx--;
                }
                clusterStartIdx++; // First node of this cluster

                if (currentNodeCount > clusterStartIdx + 2) {
                    const minIdx = clusterStartIdx;
                    const maxIdx = currentNodeCount - 1;
                    const randomIdx = Math.floor(Math.random() * (maxIdx - minIdx)) + minIdx;
                    const randomNode = this.nodes[randomIdx];
                    if (randomNode.clusterID === this.currentClusterID) {
                        this.addSpring(body, randomNode.body, this.SPRING_STIFFNESS_LOOSE * 0.5);
                    }
                }
            }
        }

        this.nodes.push(nodeData);
        this.enforceNodeLimit();
    }

    enforceNodeLimit() {
        while (this.nodes.length > this.MAX_NODE_CAPACITY) {
            const removedNode = this.nodes.shift(); // Remove oldest (FIFO)
            this.world.removeBody(removedNode.body); // Remove from physics world

            // Remove associated springs
            this.springs = this.springs.filter(spring => {
                if (spring.bodyA === removedNode.body || spring.bodyB === removedNode.body) {
                    // For global listeners, we just remove the object reference from our array
                    return false;
                }
                return true;
            });
        }
    }

    finalizeCluster() {
        console.log(`Finalizing Cluster ${this.currentClusterID}. Spawning new center.`);

        // 2. Move Spawn Center RELATIVE to current center (Drift)
        // 300px approx equals 8.0 physics units in this camera setup (dist 20)
        const maxDist = 8.0;
        const minDist = 3.0; // Don't spawn ON TOP of previous

        let newX, newY;
        let attempts = 0;
        const visibleRangeX = 14; // Approximate visible bounds
        const visibleRangeY = 10;

        do {
            const angle = Math.random() * Math.PI * 2;
            const dist = minDist + Math.random() * (maxDist - minDist);

            newX = this.spawnCenter.x + Math.cos(angle) * dist;
            newY = this.spawnCenter.y + Math.sin(angle) * dist;

            // Clamp to stay somewhat visible, bouncing back if hitting edge
            if (newX > visibleRangeX) newX -= dist * 1.5;
            if (newX < -visibleRangeX) newX += dist * 1.5;
            if (newY > visibleRangeY) newY -= dist * 1.5;
            if (newY < -visibleRangeY) newY += dist * 1.5;

            attempts++;
        } while (attempts < 5); // Simple retry, but clamping handles most cases

        this.spawnCenter.set(newX, newY, 0);

        // 3. Optional: Gentle Drift Impulse
        // Apply a gentle random drift to all existing nodes
        for (const node of this.nodes) {
            // Ensure damping supports drift (not frozen)
            node.body.linearDamping = 0.95;
            node.body.angularDamping = 0.95;
            node.body.angularVelocity.set(0, 0, 0);

            // Add slight random drift
            const drift = new CANNON.Vec3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                0
            );
            node.body.applyImpulse(drift, node.body.position);
        }

        this.isCrystallized = false;
    }

    shiftOrigin() {
        // Redundant with finalizeCluster logic now, but kept for compatibility if needed.
        // Or redirect to finalizeCluster?
        this.finalizeCluster();
    }

    reset() {
        // Remove all bodies and constraints
        for (const node of this.nodes) {
            this.world.removeBody(node.body);
        }

        this.nodes = [];
        this.springs = [];

        // Reset state
        this.lastSymbolNodeCount = 0;
        this.currentSpawnOrigin.set(0, 0, 0);
        this.spawnCenter.set(0, 0, 0);
        this.currentClusterID = 0;
        this.isCrystallized = false;
    }

    getNodes() {
        return this.nodes;
    }

    getSprings() {
        return this.springs;
    }

    getCentroid() {
        if (this.nodes.length === 0) return { x: 0, y: 0 };

        let sumX = 0;
        let sumY = 0;

        for (const node of this.nodes) {
            sumX += node.body.position.x;
            sumY += node.body.position.y;
        }

        return {
            x: sumX / this.nodes.length,
            y: sumY / this.nodes.length
        };
    }

    applyMouseInteraction(mousePoint) {
        if (!mousePoint) return;
        const radius = 5.0;
        const strength = 10.0;

        for (const node of this.nodes) {
            const distSq = node.body.position.distanceSquared(mousePoint);
            if (distSq < radius * radius && distSq > 0.001) {
                const dist = Math.sqrt(distSq);
                const force = node.body.position.vsub(mousePoint);
                force.normalize();
                // Push harder when closer
                force.scale(strength * (1 - dist / radius), force);
                node.body.applyForce(force, node.body.position);
            }
        }
    }

    applyIdleMotion(time) {
        // Subtle waviness - SLOW organic breathing
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const force = new CANNON.Vec3(
                Math.sin(time * 0.5 + i * 0.2) * 0.1,
                Math.cos(time * 0.3 + i * 0.1) * 0.1,
                0
            );
            node.body.applyForce(force, node.body.position);
        }
    }
}
