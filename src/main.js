import { Renderer, Camera, Transform, Geometry, Plane, Box, Program, Vec2, Mesh, Orbit, Vec3, Texture } from 'ogl';

const createFloor = (gl) => {
    const geometry = new Plane(gl, {
        width: 20,
        height: 20
    });

    const program = new Program(gl, {
        cullFaces: null,
        vertex: `
            attribute vec3 position;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;

            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragment: `
            precision highp float;

            void main() {
                gl_FragColor = vec4(vec3(140., 160., 100.) / 255., 1.0);
            }
        `
    });

    const mesh = new Mesh(gl, { geometry, program });
    mesh.rotation.x = -Math.PI / 2;

    return {
        mesh,
        program,
        geometry
    }
}

const createGrass = (gl, texture, {
    rows,
    columns,
    area,
}) => {
    const hr = 2;
    const size = 0.1;

    let offset = new Float32Array(rows * columns * 2);

    for (let i = 0; i < rows; i++) {
        for (let ii = 0; ii < columns; ii++) {
            offset.set([i / rows, ii / columns], (i * columns + ii) * 2);
        }
    }

    const geometry = new Box(gl, {
        width: size,
        height: size * hr,
        depth: size,
        heightSegments: 4,
        attributes: {
            offset: { data: offset, size: 2, instanced: 1, },
        }
    });

    const program = new Program(gl, {
        cullFace: null,
        uniforms: {
            moved: { value: new Vec2(0, 0) },

            texture: { value: texture },
            time: { value: 0 },
            area: { value: area },
            height: { value: size * hr },

            planeNoiseScale: { value: 0.2 },
            planeNoiseAmplitude: { value: 2.0 },

            minorHeightNoiseScale: { value: 10. },
            minorHeightNoiseAmplitude: { value: 0.6 },

            majorHeightNoiseScale: { value: 0.2 },
            majorHeightNoiseAmplitude: { value: 2. },

            windNoiseScale: { value: 0.2 },
            windStrength: { value: 5.0 },

            wind: { value: 1. },
        },
        vertex: /* glsl */ `
            attribute vec2 uv;
            attribute vec3 position;
            
            attribute vec2 offset;

            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            
            uniform sampler2D texture;
            uniform vec2 area;
            uniform vec2 moved;
            uniform float time;
            uniform float height;
            
            uniform float planeNoiseScale;
            uniform float planeNoiseAmplitude;

            uniform float minorHeightNoiseScale;
            uniform float minorHeightNoiseAmplitude;

            uniform float majorHeightNoiseScale;
            uniform float majorHeightNoiseAmplitude;

            uniform float windNoiseScale;
            uniform float windStrength;

            varying vec2 vUv;
            varying vec3 vNormal;
            varying float noise;
            varying float h;
            varying float hDiff;
            varying vec4 vPos;

            float sampleNoise(vec2 offset, float scale, float amplitude) {
                return texture2D(texture, fract(offset * scale)).r * amplitude;
            }

            void main() {
                vUv = uv;

                // 0-x scale from bottom vertex to top.
                h = (position.y + height / 2.) / height;

                vec2 offsetAdjusted = offset + moved;

                // Noise samplers
                float rand = sin(offset.x * 100000.);
                float planeNoise = sampleNoise(offsetAdjusted, planeNoiseScale, planeNoiseAmplitude);
                float shuffle = mix(-2., 2., sampleNoise(sin(offset * 100.), 1.0, 1.0));
                float minorHeightNoise = sampleNoise(offset, minorHeightNoiseScale, minorHeightNoiseAmplitude);
                float majorHeightNoise = sampleNoise(offset, majorHeightNoiseScale, majorHeightNoiseAmplitude);
                float windNoise = sampleNoise(offset + time * 0.5, windNoiseScale, 1.0);

                float curvedAdjust = (1.0 - ((cos(h) + 1.0) / 2.0)) * windNoise * windStrength;

                float blow = (sin(h * 3.141 * 0.5 * windNoise) + 1.) / 2. * windNoise * h * windStrength;

                // 2D grid grass coords
                vec2 gridPosition = (offset - 0.5) * area;

                // LOCAL VECTOR POSITION MODIFICATION
                float heightPinch = mix(1.0, 0.01, h);
                vec2 adjustedVectorPosition = position.xz * heightPinch;

                // GLOBAL TRANSFORM MODIFICATION
                vec2 adjustedGridPosition = (gridPosition + shuffle) + adjustedVectorPosition - vec2(curvedAdjust + (rand * 0.2), curvedAdjust);

                // SCALING TRANSFORM
                float scaledY = (position.y * h) + (minorHeightNoise * h) + (majorHeightNoise * h);
                
                vec3 pos = vec3(
                    adjustedGridPosition.x,
                    position.y + scaledY + planeNoise,
                    adjustedGridPosition.y
                );
                
                vPos = modelViewMatrix * vec4(pos, 1.0);
                hDiff = majorHeightNoise / majorHeightNoiseAmplitude; 
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragment: /* glsl */ `
            precision highp float;

            varying vec2 vUv;
            varying float h;
            varying float hDiff;
            varying vec4 vPos;
        
            void main() {
                float dist = length(vPos);
                float fog = smoothstep(-5.0, 25.0, dist);

                vec3 c = mix(
                    vec3(40.,80.,5.) / 255.0,
                    vec3(65.,152.,10.) / 255.0,
                    h
                );

                vec3 c2 = mix(
                    vec3(90., 100., 2.) / 255.0,
                    vec3(216., 242., 100.) / 255.0,
                    h
                );

                vec3 wcp = mix(c, c2, hDiff * 1.5);
                vec3 wc = mix(wcp, vec3(1.0,1.0,1.0), fog);
    
                gl_FragColor = vec4(wc, 1.0);
            }
        `,
    });

    const mesh = new Mesh(gl, { geometry, program });
    mesh.position.y = size * hr / 2;

    return {
        program,
        mesh,
        geometry
    }
}


const createParticles = (gl, {
    num,
    area,
}) => {
    const position = new Float32Array(num * 3);
    const random = new Float32Array(num * 4);

    for (let i = 0; i < num; i++) {
        position.set([Math.random(), Math.random(), Math.random()], i * 3);
        random.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }

    const geometry = new Geometry(gl, {
        position: { size: 3, data: position },
        random: { size: 4, data: random },
    });

    const program = new Program(gl, {
        uniforms: {
            time: { value: 0 },
            area: { value: area },
        },
        transparent: true,
        depthTest: false,
        vertex: `
            attribute vec3 position;
            attribute vec4 random;
            uniform mat4 modelMatrix;
            uniform mat4 viewMatrix;
            uniform mat4 projectionMatrix;
            uniform float time;
            varying vec4 vRandom;
            uniform vec2 area;

            void main() {
                vRandom = random;
                
                // positions are 0->1, so make -1->1
                vec3 pos = position * 2.0 - 1.0;
                
                // Scale towards camera to be more interesting
                pos.z *= 10.0;
                
                // modelMatrix is one of the automatically attached uniforms when using the Mesh class
                vec4 mPos = modelMatrix * vec4(pos, 1.0);
                // add some movement in world space
                float t = time * 0.2;
                mPos.x += sin(t * random.x + 6.28 * random.x) * mix(0.1, 1.5, random.x) * area.x;
                mPos.y += sin(t * random.y + 6.28 * random.y) * mix(0.1, 1.5, random.y) * 4.0;
                mPos.z += sin(t * random.z + 6.28 * random.z) * mix(0.1, 1.5, random.z) * area.y;
                
                // get the model view position so that we can scale the points off into the distance
                vec4 mvPos = viewMatrix * mPos;
                gl_PointSize = 300.0 / length(mvPos.xyz) * (random.x + 0.1);
                gl_Position = projectionMatrix * mvPos;
            }
        `,
        fragment: /* glsl */ `
            precision highp float;
            uniform float time;
            varying vec4 vRandom;
            void main() {
                vec2 uv = gl_PointCoord.xy;
                
                float circle = smoothstep(0.5, 0.4, length(uv - 0.5)) * 0.2;
                
                gl_FragColor.rgb = vec3(1.0, 1.0, 1.0);
                gl_FragColor.a = circle;
            }
        `,
    });

    const mesh = new Mesh(gl, { mode: gl.POINTS, geometry, program });

    return {
        program,
        mesh,
        geometry
    }
}

{
    const renderer = new Renderer();
    const gl = renderer.gl;
    gl.clearColor(1, 1, 1, 1);
    document.body.appendChild(gl.canvas);

    const camera = new Camera(gl);
    camera.position.z = 10;
    camera.position.x = -5;
    camera.position.y = 4;

    camera.lookAt(new Vec3(0, 5, 0))

    function resize() {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.perspective({
            fov: 90,
            aspect: gl.canvas.width / gl.canvas.height,
        });
    }
    window.addEventListener('resize', resize, false);
    resize();

    // Load assets
    const texture = new Texture(gl);
    const img = new Image();
    img.src = 'noise.png';
    img.onload = () => (texture.image = img);

    const scene = new Transform();

    const plane = createFloor(gl);
    plane.mesh.setParent(scene);

    const particles = createParticles(gl, {
        num: 100,
        area: new Vec2(30, 30),
    });
    particles.mesh.setParent(scene);

    const grass = createGrass(gl, texture, {
        rows: 175,
        columns: 175,
        area: new Vec2(30, 30)
    })
    grass.mesh.setParent(scene);

    requestAnimationFrame(update);
    function update(t) {
        requestAnimationFrame(update);
        camera.updateMatrixWorld();

        const tAdj = t * 0.001;
        grass.program.uniforms.time.value = tAdj;
        particles.program.uniforms.time.value = tAdj;

        if (texture.image) {
            renderer.render({ scene, camera });
        }
    }
}