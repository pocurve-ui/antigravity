import * as THREE from 'three';

export class InkRenderer {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        this.MAX_NODES = 200;

        // Visual Parameters
        this.color = new THREE.Color(0xffffff);

        // Fullscreen Quad for Shader
        // We use a plane that covers the camera view at z=0
        // Since camera is at z=20, we need a plane that fills the frustum.
        // A simple way is to make it huge or attach it to the camera, 
        // but a fixed large plane at z=0 works for this 2D-on-3D setup.
        const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(75) / 2) * 20; // 20 is cam dist
        const frustumWidth = frustumHeight * (window.innerWidth / window.innerHeight);

        this.geometry = new THREE.PlaneGeometry(frustumWidth * 4, frustumHeight * 4); // 4x for safety padding against clipping

        this.uniforms = {
            uTime: { value: 0 },
            uColor: { value: this.color },
            uNodes: { value: new Float32Array(this.MAX_NODES * 3) }, // Flattened vec3 array
            uCount: { value: 0 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false, // Don't block background
            blending: THREE.AdditiveBlending,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorldPos;
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPos = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform vec3 uNodes[${this.MAX_NODES}];
                uniform int uCount;
                uniform vec2 uResolution;
                
                varying vec2 vUv;
                varying vec3 vWorldPos;

                // Simplex 2D noise
                vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
                float snoise(vec2 v){
                    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                            -0.577350269189626, 0.024390243902439);
                    vec2 i  = floor(v + dot(v, C.yy) );
                    vec2 x0 = v -   i + dot(i, C.xx);
                    vec2 i1;
                    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                    vec4 x12 = x0.xyxy + C.xxzz;
                    x12.xy -= i1;
                    i = mod(i, 289.0);
                    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                    + i.x + vec3(0.0, i1.x, 1.0 ));
                    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                        dot(x12.zw,x12.zw)), 0.0);
                    m = m*m ;
                    m = m*m ;
                    vec3 x = 2.0 * fract(p * C.www) - 1.0;
                    vec3 h = abs(x) - 0.5;
                    vec3 ox = floor(x + 0.5);
                    vec3 a0 = x - ox;
                    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                    vec3 g;
                    g.x  = a0.x  * x0.x  + h.x  * x0.y;
                    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                    return 130.0 * dot(m, g);
                }

                void main() {
                    float field = 0.0;
                    float radius = 0.15; // Increased by 50% from 0.1
                    
                    // Domain Warping / Turbulence
                    // We distort the position we check against the nodes
                    vec2 pos = vWorldPos.xy;
                    float noiseScale = 3.0;
                    float timeScale = uTime * 0.5;
                    
                    // Simple curl-ish noise distortion
                    float n1 = snoise(pos * noiseScale + vec2(timeScale));
                    float n2 = snoise(pos * noiseScale - vec2(timeScale));
                    
                    // Apply strong distortion for "Rorschach" jaggedness
                    vec2 distortion = vec2(n1, n2) * 0.15;
                    pos += distortion;

                    // Metaball Summation with warped position
                    for(int i = 0; i < ${this.MAX_NODES}; i++) {
                        if (i >= uCount) break;
                        vec3 nodePos = uNodes[i];
                        float dist = distance(pos, nodePos.xy); // Use warped pos
                        if (dist > 0.001) {
                            field += (radius * radius) / (dist * dist); 
                        } else {
                            field += 100.0; 
                        }
                    }

                    // Irregular Thresholding
                    // Add noise to the threshold/field itself for internal detail
                    float detailNoise = snoise(vWorldPos.xy * 10.0 + uTime);
                    field += detailNoise * 0.1;

                    // Thresholding
                    float threshold = 0.6; // Lower threshold to catch more warped fluid
                    float alpha = 0.0;
                    if (field > threshold) {
                        alpha = 1.0;
                    } else if (field > threshold * 0.5) {
                        alpha = smoothstep(threshold * 0.5, threshold, field);
                    }

                    if (alpha < 0.01) discard;

                    // Gradient & Vignette Logic
                    vec3 finalColor = uColor;
                    
                    // Screen Space Vignette
                    float distFromCenter = distance(vUv, vec2(0.5));
                    float diagonalMix = (vUv.x + vUv.y) * 0.5;
                    vec3 gradientColor = mix(vec3(1.0, 0.0, 0.3), vec3(0.0, 0.5, 1.0), diagonalMix);
                    float vignetteStrength = smoothstep(0.3, 0.75, distFromCenter); 
                    
                    finalColor = mix(finalColor, gradientColor, vignetteStrength);

                    gl_FragColor = vec4(finalColor, alpha * 0.9);
                }
            `
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);

        console.log("InkRenderer (Metaball Shader) Initialized");

        // We don't need lines anymore as the metaballs imply connection
        // But keeping them faint adds to the "constellation" feel if desired.
        // For Heptapod B looking pure fluid, let's remove lines for now or make them very subtle.
        // I will remove them to match the "Ink" request strictly.
    }

    update(nodes, dt, springs) {
        this.uniforms.uTime.value += dt;

        const count = Math.min(nodes.length, this.MAX_NODES);
        this.uniforms.uCount.value = count;

        // Update Node Positions Uniform
        const positions = this.uniforms.uNodes.value;
        for (let i = 0; i < count; i++) {
            const body = nodes[i].body;
            positions[i * 3 + 0] = body.position.x;
            positions[i * 3 + 1] = body.position.y;
            positions[i * 3 + 2] = body.position.z;
        }

        // No need to set needsUpdate for uniform values unless replacing the object
    }

    resize() {
        this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

        // Recalculate plane size to cover frustum if aspect ratio changes effectively
        const dist = 20;
        const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(75) / 2) * dist;
        const frustumWidth = frustumHeight * (window.innerWidth / window.innerHeight);
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(frustumWidth * 4, frustumHeight * 4);
    }
}
