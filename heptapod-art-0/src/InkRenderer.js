import * as THREE from 'three';

export class InkRenderer {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Limit max nodes for shader performance array allocation
        this.MAX_NODES = 110;

        // Uniforms for the Shader
        this.uniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uNodes: { value: new Float32Array(this.MAX_NODES * 4) },
            uNodeCount: { value: 0 },
            uCameraPosition: { value: new THREE.Vector3() },
            uCameraQuaternion: { value: new THREE.Quaternion() }
        };

        // Create a full-screen quad for raymarching
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec2 uResolution;
                uniform float uTime;
                uniform vec4 uNodes[${this.MAX_NODES}];
                uniform int uNodeCount;
                uniform vec3 uCameraPosition;
                uniform vec4 uCameraQuaternion;

                varying vec2 vUv;

                vec3 applyQuaternion(vec3 v, vec4 q) {
                    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
                }

                float smin(float a, float b, float k) {
                    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
                    return mix(b, a, h) - k * h * (1.0 - h);
                }

                float sceneSDF(vec3 p) {
                    float minDist = 100.0;
                    if (uNodeCount == 0) return 100.0;

                    for (int i = 0; i < ${this.MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 nodePos = uNodes[i].xyz;
                        float radius = uNodes[i].w;
                        float dist = length(p - nodePos) - radius;  
                        if (i == 0) minDist = dist;
                        else minDist = smin(minDist, dist, 1.3);
                    }
                    return minDist;
                }

                void main() {
                    float aspect = uResolution.x / uResolution.y;
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= aspect;
                    
                    // Dynamic Camera Setup
                    vec3 ro = uCameraPosition;
                    // FOV scale ~0.76 for 75 deg
                    vec3 localDir = normalize(vec3(uv * 0.76, -1.0));
                    vec3 rd = applyQuaternion(localDir, uCameraQuaternion);

                    float t = 0.0;
                    float tMax = 100.0;
                    float d = 0.0;
                    
                    vec3 col = vec3(0.0);
                    float accumulatedGlow = 0.0;

                    for (int i = 0; i < 64; i++) {
                        vec3 p = ro + t * rd;
                        d = sceneSDF(p);
                        
                        if(d < 2.0) {
                            accumulatedGlow += (0.05 / (d * d + 0.1)); 
                        }

                        if (d < 0.01) {
                            col = vec3(1.0);
                            break;
                        }
                        
                        t += d;
                        if (t > tMax) break;
                    }
                    
                    col += vec3(accumulatedGlow * 0.15);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: false
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        // Important: renderOrder or frustum culling might be tricky for FS quad
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        // Lines Setup - DISABLED
        /*
        this.maxLines = 500; // Max connections
        this.lineGeometry = new THREE.BufferGeometry();
        this.linePositions = new Float32Array(this.maxLines * 2 * 3); // 2 vertices per line, 3 coords
        this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));

        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            depthTest: false, // Draw on top or inside ink
            blending: THREE.AdditiveBlending
        });

        this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
        this.lines.frustumCulled = false;
        this.scene.add(this.lines);
        */
    }

    update(nodes, dt, springs) { // Added springs argument
        // Update Time
        this.uniforms.uTime.value += dt;

        // Sync Camera
        this.uniforms.uCameraPosition.value.copy(this.camera.position);
        this.uniforms.uCameraQuaternion.value.copy(this.camera.quaternion);

        // Update Nodes Uniforms
        const count = Math.min(nodes.length, this.MAX_NODES);
        this.uniforms.uNodeCount.value = count;

        const positions = this.uniforms.uNodes.value;
        for (let i = 0; i < count; i++) {
            const pos = nodes[i].body.position;
            const radius = nodes[i].radius !== undefined ? nodes[i].radius : 0.35; // Use node radius or default
            positions[i * 4] = pos.x;
            positions[i * 4 + 1] = pos.y;
            positions[i * 4 + 2] = pos.z;
            positions[i * 4 + 3] = radius;
        }

        // Update Lines - DISABLED
        /*
        if (springs) {
            let lineIdx = 0;
            for (const spring of springs) {
                if (spring.visible) {
                    const bodyA = spring.bodyA;
                    const bodyB = spring.bodyB;

                    // Vertex 1
                    this.linePositions[lineIdx++] = bodyA.position.x;
                    this.linePositions[lineIdx++] = bodyA.position.y;
                    this.linePositions[lineIdx++] = bodyA.position.z;

                    // Vertex 2
                    this.linePositions[lineIdx++] = bodyB.position.x;
                    this.linePositions[lineIdx++] = bodyB.position.y;
                    this.linePositions[lineIdx++] = bodyB.position.z;

                    if (lineIdx >= this.linePositions.length) break;
                }
            }

            this.lineGeometry.setDrawRange(0, lineIdx / 3); // DrawRange uses count of Vertices
            this.lineGeometry.attributes.position.needsUpdate = true;
        }
        */
    }

    resize() {
        if (this.uniforms && this.uniforms.uResolution) {
            this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        }
    }
}
