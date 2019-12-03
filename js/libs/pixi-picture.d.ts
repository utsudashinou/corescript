/// <reference types="pixi.js" />
declare namespace pixi_picture {
    function filterManagerMixin(): void;
    class BackdropFilter<T> extends PIXI.Filter {
        backdropUniformName: string;
        _backdropRenderTarget: PIXI.RenderTexture;
        clearColor: Float32Array;
    }
}
declare namespace pixi_picture {
    class PictureShader extends PIXI.Shader {
        tempQuad: PIXI.QuadUv;
        tilingMode: number;
        static blendVert: string;
        constructor(vert: string, frag: string, tilingMode: number);
    }
}
declare namespace pixi_picture {
    class HardLightShader extends PictureShader {
        constructor(tilingMode: number);
    }
}
declare namespace pixi_picture {
    function mapFilterBlendModesToPixi(array?: Array<Array<PictureShader>>): Array<Array<PictureShader>>;
}
declare namespace pixi_picture {
    class NormalShader extends PictureShader {
        constructor(tilingMode: number);
    }
}
declare namespace pixi_picture {
    class OverlayShader extends PictureShader {
        constructor(tilingMode: number);
    }
}
declare namespace pixi_picture {
    import Sprite = PIXI.Sprite;
    import TilingSprite = PIXI.TilingSprite;
    class PictureRenderer extends PIXI.ObjectRenderer {
        constructor(renderer: PIXI.Renderer);
        drawModes: Array<Array<PictureShader>>;
        normalShader: Array<PictureShader>;
        _tempClamp: Float32Array;
        _tempColor: Float32Array;
        _tempRect: PIXI.Rectangle;
        _tempRect2: PIXI.Rectangle;
        _tempRect3: PIXI.Rectangle;
        _tempMatrix: PIXI.Matrix;
        _tempMatrix2: PIXI.Matrix;
        _bigBuf: Uint8Array;
        _renderTexture: PIXI.BaseRenderTexture;
        onContextChange(): void;
        start(): void;
        flush(): void;
        _getRenderTexture(minWidth: number, minHeight: number): PIXI.BaseRenderTexture;
        _getBuf(size: number): Uint8Array;
        render(sprite: Sprite): void;
        _renderNormal(sprite: Sprite, shader: PictureShader): void;
        _renderBlend(sprite: Sprite, shader: PictureShader): void;
        _renderInner(sprite: Sprite, shader: PictureShader): void;
        _renderWithShader(ts: TilingSprite, isSimple: boolean, shader: PictureShader): void;
        _renderSprite(sprite: Sprite, shader: PictureShader): void;
        _isSimpleSprite(ts: Sprite): boolean;
    }
}
declare namespace pixi_picture {
    class SoftLightShader extends PictureShader {
        constructor(tilingMode: number);
    }
}
declare namespace pixi_picture {
    class Sprite extends PIXI.Sprite {
        constructor(texture: PIXI.Texture);
    }
}
declare namespace pixi_picture {
    class TilingSprite extends PIXI.TilingSprite {
        constructor(texture: PIXI.Texture);
    }
}
declare namespace pixi_picture {
}
