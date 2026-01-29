import * as CANNON from 'cannon-es';

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
        this.REPULSION_FORCE = 15;
        this.REPULSION_RADIUS = 3.5;
        this.SPRING_REST_LENGTH = 2.5;
        this.SPRING_STIFFNESS_LOOSE = 1.0;
        this.SPRING_STIFFNESS_TIGHT = 15.0;
        this.SPRING_DAMPING = 0.5;
        this.NODE_FADE_SPEED = 0.2; // Radius decrease per second
        this.MAX_ACTIVE_NODES = 100;

        this.isCrystallized = false;


        // Single global listener for all springs
        this.world.addEventListener('postStep', () => {
            for (const spring of this.springs) {
                spring.applyForce();
            }
        });
    }

    step(dt) {
        // Apply Repulsive Forces (Anti-overlap)
        this.applyRepulsiveForces();

        // Manage Node Lifecycle (Fading)
        this.manageNodeLifecycle(dt);

        // Fixed time step
        this.world.step(1 / 60, dt, 3);
    }

    // ... (rest of class)

    manageNodeLifecycle(dt) {
        // 1. Identify dying candidates
        if (this.nodes.length > this.MAX_ACTIVE_NODES) {
            // Mark oldest non-dying nodes as dying
            const excess = this.nodes.length - this.MAX_ACTIVE_NODES;
            let markedCount = 0;
            for (let i = 0; i < this.nodes.length; i++) {
                if (!this.nodes[i].isDying) {
                    this.nodes[i].isDying = true;
                    markedCount++;
                    if (markedCount >= excess) break;
                }
            }
        }

        // 2. Update dying nodes
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (node.isDying) {
                node.radius -= this.NODE_FADE_SPEED * dt;

                // Remove if fully faded
                if (node.radius <= 0) {
                    this.removeNode(i);
                }
            }
        }
    }

    removeNode(index) {
        const node = this.nodes[index];
        this.world.removeBody(node.body);

        // Remove associated springs
        // This is tricky because we track springs in a simple list. 
        // We'll iterate and remove springs connected to this body.
        for (let i = this.springs.length - 1; i >= 0; i--) {
            const spring = this.springs[i];
            if (spring.bodyA === node.body || spring.bodyB === node.body) {
                this.springs.splice(i, 1);
            }
        }

        this.nodes.splice(index, 1);
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
        // Listener is now global loop
    }

    applyRepulsiveForces() {
        // if (this.isCrystallized) return; // Removed to allow interaction after enter
        // Or if we want to freeze old nodes but allow new ones, we'd need per-node state.
        // For now, let's keep repulsion active so they don't collapse if springs pull them.


        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const bodyA = this.nodes[i].body;
                const bodyB = this.nodes[j].body;

                const distVec = bodyA.position.vsub(bodyB.position);
                const dist = distVec.length();

                if (dist < this.REPULSION_RADIUS && dist > 0.001) {
                    const forceMagnitude = this.REPULSION_FORCE * (1 - dist / this.REPULSION_RADIUS);
                    const force = distVec.unit().scale(forceMagnitude);

                    bodyA.applyForce(force, bodyA.position);
                    bodyB.applyForce(force.negate(), bodyB.position);
                }
            }
        }
    }

    addNode(char) {
        if (this.isCrystallized) return; // Stop adding if crystallized

        const radius = 0.5;
        const body = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Sphere(radius),
            linearDamping: 0.9, // High drag (thick fluid)
            angularDamping: 0.9,
            position: new CANNON.Vec3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                0
            )
        });

        this.world.addBody(body);

        // Connect to previous nodes
        // Strategy: Connect to the last node strongly, and random others weakly
        if (this.nodes.length > 0) {
            const lastNode = this.nodes[this.nodes.length - 1];
            this.addSpring(body, lastNode.body, this.SPRING_STIFFNESS_LOOSE);

            // Randomly connect to another existing node for complexity/lattice
            if (this.nodes.length > 2) {
                const randomNode = this.nodes[Math.floor(Math.random() * (this.nodes.length - 1))];
                this.addSpring(body, randomNode.body, this.SPRING_STIFFNESS_LOOSE * 0.5);
            }
        }

        this.nodes.push({ body, char, radius: 0.35, isDying: false });
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

    crystallize() {
        console.log("Crystallizing: Expanding network...");

        // "Net-like" expansion: Significantly increase rest length
        // This will push nodes apart into a wider mesh
        for (const spring of this.springs) {
            spring.stiffness = 5.0; // Moderate stiffness
            spring.restLength = this.SPRING_REST_LENGTH * 3.0; // Expand to 3x size
            spring.damping = 0.8; // Higher damping to stop expanding wobbles quickly
            spring.visible = true; // Mark for rendering
        }

        // Optional: Apply a small outwards explosion to kickstart expansion if they are clumped
        const center = this.currentSpawnOrigin.clone();
        for (let i = this.lastSymbolNodeCount; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const dir = node.body.position.vsub(center);
            dir.normalize();
            // Gentle outward push
            node.body.applyImpulse(dir.scale(1.0), node.body.position);
        }
    }

    shiftOrigin() {
        console.log("Shifting origin for next symbol...");
        // Shift Origin for NEXT symbol
        this.currentSpawnOrigin.x += 12.0;
        // Add random Y variation to make it feel organic, but bounded
        this.currentSpawnOrigin.y = (Math.random() - 0.5) * 8.0;

        // Update symbol start index
        this.lastSymbolNodeCount = this.nodes.length;
    }

    reset() {
        // Remove all bodies and constraints
        for (const node of this.nodes) {
            this.world.removeBody(node.body);
        }
        // Cannon doesn't track springs in world needed for removal, 
        // but we are managing them manually in postStep.
        // We just clear our lists.

        this.nodes = [];
        this.springs = []; // This effectively stops the postStep force application

        // Reset state
        this.lastSymbolNodeCount = 0;
        this.currentSpawnOrigin.set(0, 0, 0);
        this.isCrystallized = false;

        // Clear listeners if necessary? SInce we used arrow funcs in addSpring, 
        // they might linger in world.addEventListener('postStep').
        // Cannon doesn't easily remove specific anonymous listeners.
        // Better strategy: Remove ALL postStep listeners or manage a single listener that iterates springs.
    }

    getNodes() {
        return this.nodes;
    }

    getSprings() {
        return this.springs;
    }
}
