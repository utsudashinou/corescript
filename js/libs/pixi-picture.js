var pixi_picture;
(function (pixi_picture) {
    function filterManagerMixin() {
        const fm = PIXI.systems.FilterSystem.prototype;
        if (fm.prepareBackdrop)
            return;
        fm.pushFilter = pushFilter;
        fm.popFilter = popFilter;
        fm.syncUniforms = syncUniforms;
        fm.prepareBackdrop = prepareBackdrop;
    }
    pixi_picture.filterManagerMixin = filterManagerMixin;
    function pushFilter(target, filters) {
        const renderer = this.renderer;
        let filterData = this.filterData;
        if (!filterData) {
            filterData = this.renderer._activeRenderTarget.filterStack;
            const filterState = new FilterState();
            filterState.sourceFrame = filterState.destinationFrame = this.renderer._activeRenderTarget.size;
            filterState.renderTarget = renderer._activeRenderTarget;
            this.renderer._activeRenderTarget.filterData = filterData = {
                index: 0,
                stack: [filterState],
            };
            this.filterData = filterData;
        }
        let currentState = filterData.stack[++filterData.index];
        const renderTargetFrame = filterData.stack[0].destinationFrame;
        if (!currentState) {
            currentState = filterData.stack[filterData.index] = new FilterState();
        }
        const fullScreen = target.filterArea
            && target.filterArea.x === 0
            && target.filterArea.y === 0
            && target.filterArea.width === renderer.screen.width
            && target.filterArea.height === renderer.screen.height;
        const resolution = filters[0].resolution;
        const padding = filters[0].padding | 0;
        const targetBounds = fullScreen ? renderer.screen : (target.filterArea || target.getBounds(true));
        const sourceFrame = currentState.sourceFrame;
        const destinationFrame = currentState.destinationFrame;
        sourceFrame.x = ((targetBounds.x * resolution) | 0) / resolution;
        sourceFrame.y = ((targetBounds.y * resolution) | 0) / resolution;
        sourceFrame.width = ((targetBounds.width * resolution) | 0) / resolution;
        sourceFrame.height = ((targetBounds.height * resolution) | 0) / resolution;
        if (!fullScreen) {
            if (filterData.stack[0].renderTarget.transform) {
            }
            else if (filters[0].autoFit) {
                sourceFrame.fit(renderTargetFrame);
            }
            sourceFrame.pad(padding);
        }
        for (let i = 0; i < filters.length; i++) {
            let backdrop = null;
            if (filters[i].backdropUniformName) {
                if (backdrop === null) {
                    backdrop = this.prepareBackdrop(sourceFrame);
                }
                filters[i]._backdropRenderTarget = backdrop;
            }
        }
        destinationFrame.width = sourceFrame.width;
        destinationFrame.height = sourceFrame.height;
        const renderTarget = this.getPotRenderTarget(renderer.gl, sourceFrame.width, sourceFrame.height, resolution);
        currentState.target = target;
        currentState.filters = filters;
        currentState.resolution = resolution;
        currentState.renderTarget = renderTarget;
        renderTarget.setFrame(destinationFrame, sourceFrame);
        renderer.bindRenderTarget(renderTarget);
        renderTarget.clear(filters[filters.length - 1].clearColor);
    }
    function popFilter() {
        const filterData = this.filterData;
        const lastState = filterData.stack[filterData.index - 1];
        const currentState = filterData.stack[filterData.index];
        this.quad.map(currentState.renderTarget.size, currentState.sourceFrame).upload();
        const filters = currentState.filters;
        if (filters.length === 1) {
            filters[0].apply(this, currentState.renderTarget, lastState.renderTarget, false, currentState);
            this.freePotRenderTarget(currentState.renderTarget);
        }
        else {
            let flip = currentState.renderTarget;
            let flop = this.getPotRenderTarget(this.renderer.gl, currentState.sourceFrame.width, currentState.sourceFrame.height, currentState.resolution);
            flop.setFrame(currentState.destinationFrame, currentState.sourceFrame);
            flop.clear();
            let i = 0;
            for (i = 0; i < filters.length - 1; ++i) {
                filters[i].apply(this, flip, flop, true, currentState);
                const t = flip;
                flip = flop;
                flop = t;
            }
            filters[i].apply(this, flip, lastState.renderTarget, false, currentState);
            this.freePotRenderTarget(flip);
            this.freePotRenderTarget(flop);
        }
        currentState.clear();
        let backdropFree = false;
        for (let i = 0; i < filters.length; i++) {
            if (filters[i]._backdropRenderTarget) {
                if (!backdropFree) {
                    this.freePotRenderTarget(filters[i]._backdropRenderTarget);
                    backdropFree = true;
                }
                filters[i]._backdropRenderTarget = null;
            }
        }
        filterData.index--;
        if (filterData.index === 0) {
            this.filterData = null;
        }
    }
    function syncUniforms(shader, filter) {
        const renderer = this.renderer;
        const gl = renderer.gl;
        const uniforms = filter.uniforms;
        let textureCount = 1;
        let currentState;
        if (shader.uniforms.filterArea) {
            currentState = this.filterData.stack[this.filterData.index];
            const filterArea = shader.uniforms.filterArea;
            filterArea[0] = currentState.renderTarget.size.width;
            filterArea[1] = currentState.renderTarget.size.height;
            filterArea[2] = currentState.sourceFrame.x;
            filterArea[3] = currentState.sourceFrame.y;
            shader.uniforms.filterArea = filterArea;
        }
        if (shader.uniforms.filterClamp) {
            currentState = currentState || this.filterData.stack[this.filterData.index];
            const filterClamp = shader.uniforms.filterClamp;
            filterClamp[0] = 0;
            filterClamp[1] = 0;
            filterClamp[2] = (currentState.sourceFrame.width - 1) / currentState.renderTarget.size.width;
            filterClamp[3] = (currentState.sourceFrame.height - 1) / currentState.renderTarget.size.height;
            shader.uniforms.filterClamp = filterClamp;
        }
    }
    function prepareBackdrop(bounds) {
        const renderer = this.renderer;
        const renderTarget = renderer._activeRenderTarget;
        if (renderTarget.root) {
            return null;
        }
        const resolution = renderTarget.resolution;
        const fr = renderTarget.sourceFrame || renderTarget.destinationFrame;
        bounds.fit(fr);
        const x = (bounds.x - fr.x) * resolution;
        const y = (bounds.y - fr.y) * resolution;
        const w = (bounds.width) * resolution;
        const h = (bounds.height) * resolution;
        const gl = renderer.gl;
        const rt = this.getPotRenderTarget(gl, w, h, 1);
        renderer.boundTextures[1] = renderer.emptyTextures[1];
        gl.activeTexture(gl.TEXTURE0 + 1);
        gl.bindTexture(gl.TEXTURE_2D, rt.texture.texture);
        if (!rt.rebound) {
            renderer._activeRenderTarget = null;
            renderer.bindRenderTarget(renderTarget);
            rt.rebound = true;
        }
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, x, y, w, h);
        return rt;
    }
    class FilterState {
        constructor() {
            this.renderTarget = null;
            this.target = null;
            this.resolution = 1;
            this.sourceFrame = new PIXI.Rectangle();
            this.destinationFrame = new PIXI.Rectangle();
            this.filters = [];
        }
        clear() {
            this.filters = null;
            this.target = null;
            this.renderTarget = null;
        }
    }
    class BackdropFilter extends PIXI.Filter {
        constructor() {
            super(...arguments);
            this.backdropUniformName = null;
            this._backdropRenderTarget = null;
            this.clearColor = null;
        }
    }
    pixi_picture.BackdropFilter = BackdropFilter;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    const shaderLib = [
        {
            vertUniforms: "",
            vertCode: "vTextureCoord = aTextureCoord;",
            fragUniforms: "uniform vec4 uTextureClamp;",
            fragCode: "vec2 textureCoord = clamp(vTextureCoord, uTextureClamp.xy, uTextureClamp.zw);"
        },
        {
            vertUniforms: "uniform mat3 uTransform;",
            vertCode: "vTextureCoord = (uTransform * vec3(aTextureCoord, 1.0)).xy;",
            fragUniforms: "",
            fragCode: "vec2 textureCoord = vTextureCoord;"
        },
        {
            vertUniforms: "uniform mat3 uTransform;",
            vertCode: "vTextureCoord = (uTransform * vec3(aTextureCoord, 1.0)).xy;",
            fragUniforms: "uniform mat3 uMapCoord;\nuniform vec4 uClampFrame;\nuniform vec2 uClampOffset;",
            fragCode: "vec2 textureCoord = mod(vTextureCoord - uClampOffset, vec2(1.0, 1.0)) + uClampOffset;" +
                "\ntextureCoord = (uMapCoord * vec3(textureCoord, 1.0)).xy;" +
                "\ntextureCoord = clamp(textureCoord, uClampFrame.xy, uClampFrame.zw);"
        }
    ];
    class PictureShader extends PIXI.Shader {
        constructor(vert, frag, tilingMode) {
            const lib = shaderLib[tilingMode];
            const vertexSrc = vert.replace(/%SPRITE_UNIFORMS%/gi, lib.vertUniforms)
                .replace(/%SPRITE_CODE%/gi, lib.vertCode);
            const fragmentSrc = frag.replace(/%SPRITE_UNIFORMS%/gi, lib.fragUniforms)
                .replace(/%SPRITE_CODE%/gi, lib.fragCode);
            const program = PIXI.Program.from(vertexSrc, fragmentSrc);
            const uniforms = {
                uColor: new Float32Array([1, 1, 1, 1]),
                uSampler: [0, 1],
            };
            super(program, uniforms);
            this.tilingMode = tilingMode;
            this.tempQuad = new PIXI.QuadUv();
        }
    }
    PictureShader.blendVert = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec4 aColor;

uniform mat3 projectionMatrix;
uniform mat3 mapMatrix;

varying vec2 vTextureCoord;
varying vec2 vMapCoord;
%SPRITE_UNIFORMS%

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    %SPRITE_CODE%
    vMapCoord = (mapMatrix * vec3(aVertexPosition, 1.0)).xy;
}
`;
    pixi_picture.PictureShader = PictureShader;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    const overlayFrag = `
varying vec2 vTextureCoord;
varying vec2 vMapCoord;
varying vec4 vColor;

uniform sampler2D uSampler[2];
uniform vec4 uColor;
%SPRITE_UNIFORMS%

void main(void)
{
    %SPRITE_CODE%
    vec4 source = texture2D(uSampler[0], textureCoord) * uColor;
    vec4 target = texture2D(uSampler[1], vMapCoord);

    //reverse hardlight
    if (source.a == 0.0) {
        gl_FragColor = vec4(0, 0, 0, 0);
        return;
    }
    //yeah, premultiplied
    vec3 Cb = source.rgb/source.a, Cs;
    if (target.a > 0.0) {
        Cs = target.rgb / target.a;
    }
    vec3 multiply = Cb * Cs * 2.0;
    vec3 Cs2 = Cs * 2.0 - 1.0;
    vec3 screen = Cb + Cs2 - Cb * Cs2;
    vec3 B;
    if (Cb.r <= 0.5) {
        B.r = multiply.r;
    } else {
        B.r = screen.r;
    }
    if (Cb.g <= 0.5) {
        B.g = multiply.g;
    } else {
        B.g = screen.g;
    }
    if (Cb.b <= 0.5) {
        B.b = multiply.b;
    } else {
        B.b = screen.b;
    }
    vec4 res;
    res.xyz = (1.0 - source.a) * Cs + source.a * B;
    res.a = source.a + target.a * (1.0-source.a);
    gl_FragColor = vec4(res.xyz * res.a, res.a);
}
`;
    class HardLightShader extends pixi_picture.PictureShader {
        constructor(tilingMode) {
            super(pixi_picture.PictureShader.blendVert, overlayFrag, tilingMode);
        }
    }
    pixi_picture.HardLightShader = HardLightShader;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    function mapFilterBlendModesToPixi(array = []) {
        array[PIXI.BLEND_MODES.OVERLAY] = [new pixi_picture.OverlayShader(0), new pixi_picture.OverlayShader(1), new pixi_picture.OverlayShader(2)];
        array[PIXI.BLEND_MODES.HARD_LIGHT] = [new pixi_picture.HardLightShader(0), new pixi_picture.HardLightShader(1), new pixi_picture.HardLightShader(2)];
        array[PIXI.BLEND_MODES.SOFT_LIGHT] = [new pixi_picture.SoftLightShader(0), new pixi_picture.SoftLightShader(1), new pixi_picture.SoftLightShader(2)];
        return array;
    }
    pixi_picture.mapFilterBlendModesToPixi = mapFilterBlendModesToPixi;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    var normalFrag = `
varying vec2 vTextureCoord;
varying vec4 vColor;

uniform sampler2D uSampler[2];
uniform vec4 uColor;
%SPRITE_UNIFORMS%

void main(void)
{
    %SPRITE_CODE%

    vec4 sample = texture2D(uSampler[0], textureCoord);
    gl_FragColor = sample * uColor;
}
`;
    var normalVert = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec4 aColor;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;
%SPRITE_UNIFORMS%

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    %SPRITE_CODE%
}
`;
    class NormalShader extends pixi_picture.PictureShader {
        constructor(tilingMode) {
            super(normalVert, normalFrag, tilingMode);
        }
    }
    pixi_picture.NormalShader = NormalShader;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    const overlayFrag = `
varying vec2 vTextureCoord;
varying vec2 vMapCoord;
varying vec4 vColor;

uniform sampler2D uSampler[2];
uniform vec4 uColor;
%SPRITE_UNIFORMS%

void main(void)
{
    %SPRITE_CODE%
    vec4 source = texture2D(uSampler[0], textureCoord) * uColor;
    vec4 target = texture2D(uSampler[1], vMapCoord);

    //reverse hardlight
    if (source.a == 0.0) {
        gl_FragColor = vec4(0, 0, 0, 0);
        return;
    }
    //yeah, premultiplied
    vec3 Cb = source.rgb/source.a, Cs;
    if (target.a > 0.0) {
        Cs = target.rgb / target.a;
    }
    vec3 multiply = Cb * Cs * 2.0;
    vec3 Cb2 = Cb * 2.0 - 1.0;
    vec3 screen = Cb2 + Cs - Cb2 * Cs;
    vec3 B;
    if (Cs.r <= 0.5) {
        B.r = multiply.r;
    } else {
        B.r = screen.r;
    }
    if (Cs.g <= 0.5) {
        B.g = multiply.g;
    } else {
        B.g = screen.g;
    }
    if (Cs.b <= 0.5) {
        B.b = multiply.b;
    } else {
        B.b = screen.b;
    }
    vec4 res;
    res.xyz = (1.0 - source.a) * Cs + source.a * B;
    res.a = source.a + target.a * (1.0-source.a);
    gl_FragColor = vec4(res.xyz * res.a, res.a);
}
`;
    class OverlayShader extends pixi_picture.PictureShader {
        constructor(tilingMode) {
            super(pixi_picture.PictureShader.blendVert, overlayFrag, tilingMode);
        }
    }
    pixi_picture.OverlayShader = OverlayShader;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    var WRAP_MODES = PIXI.WRAP_MODES;
    function nextPow2(v) {
        v += (v === 0) ? 1 : 0;
        --v;
        v |= v >>> 1;
        v |= v >>> 2;
        v |= v >>> 4;
        v |= v >>> 8;
        v |= v >>> 16;
        return v + 1;
    }
    class PictureRenderer extends PIXI.ObjectRenderer {
        constructor(renderer) {
            super(renderer);
            this.onContextChange();
        }
        onContextChange() {
            pixi_picture.filterManagerMixin();
            const gl = this.renderer.gl;
            this.drawModes = pixi_picture.mapFilterBlendModesToPixi();
            this.normalShader = [new pixi_picture.NormalShader(0), new pixi_picture.NormalShader(1), new pixi_picture.NormalShader(2)];
            this._tempClamp = new Float32Array(4);
            this._tempColor = new Float32Array(4);
            this._tempRect = new PIXI.Rectangle();
            this._tempRect2 = new PIXI.Rectangle();
            this._tempRect3 = new PIXI.Rectangle();
            this._tempMatrix = new PIXI.Matrix();
            this._tempMatrix2 = new PIXI.Matrix();
            this._bigBuf = new Uint8Array(1 << 20);
            this._renderTexture = new PIXI.BaseRenderTexture({ width: 1024, height: 1024 });
        }
        start() {
        }
        flush() {
        }
        _getRenderTexture(minWidth, minHeight) {
            if (this._renderTexture.width < minWidth ||
                this._renderTexture.height < minHeight) {
                minWidth = nextPow2(minWidth);
                minHeight = nextPow2(minHeight);
                this._renderTexture.resize(minWidth, minHeight);
            }
            return this._renderTexture;
        }
        _getBuf(size) {
            let buf = this._bigBuf;
            if (buf.length < size) {
                size = nextPow2(size);
                buf = new Uint8Array(size);
                this._bigBuf = buf;
            }
            return buf;
        }
        render(sprite) {
            if (!sprite.texture.valid) {
                return;
            }
            let tilingMode = 0;
            if (sprite.tileTransform) {
                tilingMode = this._isSimpleSprite(sprite) ? 1 : 2;
            }
            const blendShader = this.drawModes[sprite.blendMode];
            if (blendShader) {
                this._renderBlend(sprite, blendShader[tilingMode]);
            }
            else {
                this._renderNormal(sprite, this.normalShader[tilingMode]);
            }
        }
        _renderNormal(sprite, shader) {
            const renderer = this.renderer;
            renderer.state.setBlendMode(sprite.blendMode);
            this._renderInner(sprite, shader);
        }
        _renderBlend(sprite, shader) {
            const renderer = this.renderer;
            const spriteBounds = sprite.getBounds();
            const renderTarget = renderer;
            const matrix = renderer.globalUniforms.uniforms.projectionMatrix;
            const flipX = matrix.a < 0;
            const flipY = matrix.d < 0;
            const resolution = renderer.options.resolution;
            const screen = this._tempRect;
            screen.x = 0;
            screen.y = 0;
            screen.width = renderer.options.width;
            screen.height = renderer.options.height;
            const bounds = this._tempRect2;
            const fbw = screen.width * resolution, fbh = screen.height * resolution;
            bounds.x = (spriteBounds.x + matrix.tx / matrix.a) * resolution + fbw / 2;
            bounds.y = (spriteBounds.y + matrix.ty / matrix.d) * resolution + fbh / 2;
            bounds.width = spriteBounds.width * resolution;
            bounds.height = spriteBounds.height * resolution;
            if (flipX) {
                bounds.y = fbw - bounds.width - bounds.x;
            }
            if (flipY) {
                bounds.y = fbh - bounds.height - bounds.y;
            }
            const screenBounds = this._tempRect3;
            const x_1 = Math.floor(Math.max(screen.x, bounds.x));
            const x_2 = Math.ceil(Math.min(screen.x + screen.width, bounds.x + bounds.width));
            const y_1 = Math.floor(Math.max(screen.y, bounds.y));
            const y_2 = Math.ceil(Math.min(screen.y + screen.height, bounds.y + bounds.height));
            const pixelsWidth = x_2 - x_1;
            const pixelsHeight = y_2 - y_1;
            if (pixelsWidth <= 0 || pixelsHeight <= 0) {
                return;
            }
            const rt = this._getRenderTexture(pixelsWidth, pixelsHeight);
            const gl = renderer.gl;
            if (renderer.renderingToScreen && renderTarget.root) {
                const buf = this._getBuf(pixelsWidth * pixelsHeight * 4);
                gl.readPixels(x_1, y_1, pixelsWidth, pixelsHeight, gl.RGBA, gl.UNSIGNED_BYTE, this._bigBuf);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pixelsWidth, pixelsHeight, gl.RGBA, gl.UNSIGNED_BYTE, this._bigBuf);
            }
            else {
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, x_1, y_1, pixelsWidth, pixelsHeight);
            }
            renderer.state.setBlendMode(PIXI.BLEND_MODES.NORMAL);
            if (shader.uniforms.mapMatrix) {
                const mapMatrix = this._tempMatrix;
                mapMatrix.a = bounds.width / rt.width / spriteBounds.width;
                if (flipX) {
                    mapMatrix.a = -mapMatrix.a;
                    mapMatrix.tx = (bounds.x - x_1) / rt.width - (spriteBounds.x + spriteBounds.width) * mapMatrix.a;
                }
                else {
                    mapMatrix.tx = (bounds.x - x_1) / rt.width - spriteBounds.x * mapMatrix.a;
                }
                mapMatrix.d = bounds.height / rt.height / spriteBounds.height;
                if (flipY) {
                    mapMatrix.d = -mapMatrix.d;
                    mapMatrix.ty = (bounds.y - y_1) / rt.height - (spriteBounds.y + spriteBounds.height) * mapMatrix.d;
                }
                else {
                    mapMatrix.ty = (bounds.y - y_1) / rt.height - spriteBounds.y * mapMatrix.d;
                }
                shader.uniforms.mapMatrix = mapMatrix.toArray(true);
            }
            this._renderInner(sprite, shader);
        }
        _renderInner(sprite, shader) {
            const renderer = this.renderer;
            if (shader.tilingMode > 0) {
                this._renderWithShader(sprite, shader.tilingMode === 1, shader);
            }
            else {
                this._renderSprite(sprite, shader);
            }
        }
        _renderWithShader(ts, isSimple, shader) {
            const quad = shader.tempQuad;
            const renderer = this.renderer;
            let vertices = quad.vertices;
            const _width = ts._width;
            const _height = ts._height;
            const _anchorX = ts._anchor._x;
            const _anchorY = ts._anchor._y;
            const w0 = _width * (1 - _anchorX);
            const w1 = _width * -_anchorX;
            const h0 = _height * (1 - _anchorY);
            const h1 = _height * -_anchorY;
            const wt = ts.transform.worldTransform;
            const a = wt.a;
            const b = wt.b;
            const c = wt.c;
            const d = wt.d;
            const tx = wt.tx;
            const ty = wt.ty;
            vertices[0] = (a * w1) + (c * h1) + tx;
            vertices[1] = (d * h1) + (b * w1) + ty;
            vertices[2] = (a * w0) + (c * h1) + tx;
            vertices[3] = (d * h1) + (b * w0) + ty;
            vertices[4] = (a * w0) + (c * h0) + tx;
            vertices[5] = (d * h0) + (b * w0) + ty;
            vertices[6] = (a * w1) + (c * h0) + tx;
            vertices[7] = (d * h0) + (b * w1) + ty;
            vertices = quad.uvs;
            vertices[0] = vertices[6] = -ts.anchor.x;
            vertices[1] = vertices[3] = -ts.anchor.y;
            vertices[2] = vertices[4] = 1.0 - ts.anchor.x;
            vertices[5] = vertices[7] = 1.0 - ts.anchor.y;
            const tex = ts._texture;
            const lt = ts.tileTransform.localTransform;
            const uv = ts.transform;
            const mapCoord = uv.mapCoord;
            const uClampFrame = uv.uClampFrame;
            const uClampOffset = uv.uClampOffset;
            const w = tex.width;
            const h = tex.height;
            const W = _width;
            const H = _height;
            const tempMat = this._tempMatrix2;
            tempMat.set(lt.a * w / W, lt.b * w / H, lt.c * h / W, lt.d * h / H, lt.tx / W, lt.ty / H);
            tempMat.invert();
            if (isSimple) {
                tempMat.append(mapCoord);
            }
            else {
                shader.uniforms.uMapCoord = mapCoord.toArray(true);
                shader.uniforms.uClampFrame = uClampFrame;
                shader.uniforms.uClampOffset = uClampOffset;
            }
            shader.uniforms.uTransform = tempMat.toArray(true);
            const color = this._tempColor;
            const alpha = ts.worldAlpha;
            PIXI.utils.hex2rgb(ts.tint, color);
            color[0] *= alpha;
            color[1] *= alpha;
            color[2] *= alpha;
            color[3] = alpha;
            shader.uniforms.uColor = color;
        }
        _renderSprite(sprite, shader) {
            const renderer = this.renderer;
            const quad = shader.tempQuad;
            const uvs = sprite.texture._uvs;
            const vertices = quad.vertices;
            quad.uvs[0] = uvs.x0;
            quad.uvs[1] = uvs.y0;
            quad.uvs[2] = uvs.x1;
            quad.uvs[3] = uvs.y1;
            quad.uvs[4] = uvs.x2;
            quad.uvs[5] = uvs.y2;
            quad.uvs[6] = uvs.x3;
            quad.uvs[7] = uvs.y3;
            const frame = sprite.texture.frame;
            const base = sprite.texture.baseTexture;
            const clamp = this._tempClamp;
            const eps = 0.5 / base.resolution;
            clamp[0] = (frame.x + eps) / base.width;
            clamp[1] = (frame.y + eps) / base.height;
            clamp[2] = (frame.x + frame.width - eps) / base.width;
            clamp[3] = (frame.y + frame.height - eps) / base.height;
            shader.uniforms.uTextureClamp = clamp;
            const color = this._tempColor;
            PIXI.utils.hex2rgb(sprite.tint, color);
            const alpha = sprite.worldAlpha;
            color[0] *= alpha;
            color[1] *= alpha;
            color[2] *= alpha;
            color[3] = alpha;
            shader.uniforms.uColor = color;
        }
        _isSimpleSprite(ts) {
            const renderer = this.renderer;
            const tex = ts._texture;
            const baseTex = tex.baseTexture;
            let isSimple = baseTex.isPowerOfTwo && tex.frame.width === baseTex.width && tex.frame.height === baseTex.height;
            if (isSimple) {
                if (!baseTex._glTextures[renderer.CONTEXT_UID]) {
                    if (baseTex.wrapMode === WRAP_MODES.CLAMP) {
                        baseTex.wrapMode = WRAP_MODES.REPEAT;
                    }
                }
                else {
                    isSimple = baseTex.wrapMode !== WRAP_MODES.CLAMP;
                }
            }
            return isSimple;
        }
    }
    pixi_picture.PictureRenderer = PictureRenderer;
    PIXI.Renderer.registerPlugin('picture', PictureRenderer);
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    const softLightFrag = `
varying vec2 vTextureCoord;
varying vec2 vMapCoord;
varying vec4 vColor;
 
uniform sampler2D uSampler[2];
uniform vec4 uColor;
%SPRITE_UNIFORMS%

void main(void)
{
    %SPRITE_CODE%
    vec4 source = texture2D(uSampler[0], textureCoord) * uColor;
    vec4 target = texture2D(uSampler[1], vMapCoord);

    if (source.a == 0.0) {
        gl_FragColor = vec4(0, 0, 0, 0);
        return;
    }
    vec3 Cb = source.rgb/source.a, Cs;
    if (target.a > 0.0) {
        Cs = target.rgb / target.a;
    }
    
    vec3 first = Cb - (1.0 - 2.0 * Cs) * Cb * (1.0 - Cb);

    vec3 B;
    vec3 D;
    if (Cs.r <= 0.5)
    {
        B.r = first.r;
    }
    else
    {
        if (Cb.r <= 0.25)
        {
            D.r = ((16.0 * Cb.r - 12.0) * Cb.r + 4.0) * Cb.r;    
        }
        else
        {
            D.r = sqrt(Cb.r);
        }
        B.r = Cb.r + (2.0 * Cs.r - 1.0) * (D.r - Cb.r);
    }
    if (Cs.g <= 0.5)
    {
        B.g = first.g;
    }
    else
    {
        if (Cb.g <= 0.25)
        {
            D.g = ((16.0 * Cb.g - 12.0) * Cb.g + 4.0) * Cb.g;    
        }
        else
        {
            D.g = sqrt(Cb.g);
        }
        B.g = Cb.g + (2.0 * Cs.g - 1.0) * (D.g - Cb.g);
    }
    if (Cs.b <= 0.5)
    {
        B.b = first.b;
    }
    else
    {
        if (Cb.b <= 0.25)
        {
            D.b = ((16.0 * Cb.b - 12.0) * Cb.b + 4.0) * Cb.b;    
        }
        else
        {
            D.b = sqrt(Cb.b);
        }
        B.b = Cb.b + (2.0 * Cs.b - 1.0) * (D.b - Cb.b);
    }   

    vec4 res;

    res.xyz = (1.0 - source.a) * Cs + source.a * B;
    res.a = source.a + target.a * (1.0-source.a);
    gl_FragColor = vec4(res.xyz * res.a, res.a);
}
`;
    class SoftLightShader extends pixi_picture.PictureShader {
        constructor(tilingMode) {
            super(pixi_picture.PictureShader.blendVert, softLightFrag, tilingMode);
        }
    }
    pixi_picture.SoftLightShader = SoftLightShader;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    class Sprite extends PIXI.Sprite {
        constructor(texture) {
            super(texture);
            this.pluginName = 'picture';
        }
    }
    pixi_picture.Sprite = Sprite;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    class TilingSprite extends PIXI.TilingSprite {
        constructor(texture) {
            super(texture);
            this.pluginName = 'picture';
        }
    }
    pixi_picture.TilingSprite = TilingSprite;
})(pixi_picture || (pixi_picture = {}));
var pixi_picture;
(function (pixi_picture) {
    PIXI.picture = pixi_picture;
})(pixi_picture || (pixi_picture = {}));
//# sourceMappingURL=pixi-picture.js.map