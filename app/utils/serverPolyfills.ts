

// DOMMatrix polyfill (required by pdfjs-dist used inside pdf-parse)
if (typeof globalThis.DOMMatrix === 'undefined') {
    class DOMMatrixPolyfill {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true;
        isIdentity = true;

        constructor(init?: string | number[]) {
            if (Array.isArray(init)) {
                if (init.length === 6) {
                    [this.a, this.b, this.c, this.d, this.e, this.f] = init;
                    this.m11 = this.a; this.m12 = this.b;
                    this.m21 = this.c; this.m22 = this.d;
                    this.m41 = this.e; this.m42 = this.f;
                } else if (init.length === 16) {
                    [
                        this.m11, this.m12, this.m13, this.m14,
                        this.m21, this.m22, this.m23, this.m24,
                        this.m31, this.m32, this.m33, this.m34,
                        this.m41, this.m42, this.m43, this.m44
                    ] = init;
                    this.a = this.m11; this.b = this.m12;
                    this.c = this.m21; this.d = this.m22;
                    this.e = this.m41; this.f = this.m42;
                    this.is2D = false;
                }
            }
        }

        inverse() { return new DOMMatrixPolyfill(); }
        multiply(_other?: any) { return new DOMMatrixPolyfill(); }
        multiplySelf(_other?: any) { return this; }
        preMultiplySelf(_other?: any) { return this; }
        translate(_tx?: number, _ty?: number, _tz?: number) { return new DOMMatrixPolyfill(); }
        translateSelf(_tx?: number, _ty?: number, _tz?: number) { return this; }
        scale(_sx?: number, _sy?: number, _sz?: number, _ox?: number, _oy?: number, _oz?: number) { return new DOMMatrixPolyfill(); }
        scaleSelf(_sx?: number, _sy?: number, _sz?: number, _ox?: number, _oy?: number, _oz?: number) { return this; }
        scale3d(_s?: number, _ox?: number, _oy?: number, _oz?: number) { return new DOMMatrixPolyfill(); }
        scale3dSelf(_s?: number, _ox?: number, _oy?: number, _oz?: number) { return this; }
        rotate(_rx?: number, _ry?: number, _rz?: number) { return new DOMMatrixPolyfill(); }
        rotateSelf(_rx?: number, _ry?: number, _rz?: number) { return this; }
        rotateFromVector(_x?: number, _y?: number) { return new DOMMatrixPolyfill(); }
        rotateAxisAngle(_x?: number, _y?: number, _z?: number, _a?: number) { return new DOMMatrixPolyfill(); }
        rotateAxisAngleSelf(_x?: number, _y?: number, _z?: number, _a?: number) { return this; }
        skewX(_sx?: number) { return new DOMMatrixPolyfill(); }
        skewY(_sy?: number) { return new DOMMatrixPolyfill(); }
        flipX() { return new DOMMatrixPolyfill(); }
        flipY() { return new DOMMatrixPolyfill(); }
        setMatrixValue(_transformList: string) { return this; }
        transformPoint(_point?: any) { return { x: 0, y: 0, z: 0, w: 1 }; }
        toFloat64Array() {
            return new Float64Array([
                this.m11, this.m12, this.m13, this.m14,
                this.m21, this.m22, this.m23, this.m24,
                this.m31, this.m32, this.m33, this.m34,
                this.m41, this.m42, this.m43, this.m44
            ]);
        }
        toFloat32Array() {
            return new Float32Array([
                this.m11, this.m12, this.m13, this.m14,
                this.m21, this.m22, this.m23, this.m24,
                this.m31, this.m32, this.m33, this.m34,
                this.m41, this.m42, this.m43, this.m44
            ]);
        }
        toJSON() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f }; }
        toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }

        static fromMatrix(_other?: any) { return new DOMMatrixPolyfill(); }
        static fromFloat64Array(arr: Float64Array) { return new DOMMatrixPolyfill(Array.from(arr)); }
        static fromFloat32Array(arr: Float32Array) { return new DOMMatrixPolyfill(Array.from(arr)); }
    }
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
    (globalThis as any).DOMMatrixReadOnly = DOMMatrixPolyfill;
}

// Path2D polyfill
if (typeof globalThis.Path2D === 'undefined') {
    (globalThis as any).Path2D = class Path2D {
        constructor(_path?: Path2D | string) {}
        addPath() {} closePath() {} moveTo() {} lineTo() {}
        bezierCurveTo() {} quadraticCurveTo() {} arc() {}
        arcTo() {} ellipse() {} rect() {} roundRect() {}
    };
}

// ImageData polyfill
if (typeof globalThis.ImageData === 'undefined') {
    (globalThis as any).ImageData = class ImageData {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        colorSpace: string;
        constructor(sw: number | Uint8ClampedArray, sh: number, _settings?: any) {
            if (sw instanceof Uint8ClampedArray) {
                this.data = sw;
                this.width = sh;
                this.height = sw.length / (sh * 4);
            } else {
                this.width = sw;
                this.height = sh;
                this.data = new Uint8ClampedArray(sw * sh * 4);
            }
            this.colorSpace = 'srgb';
        }
    };
}

// DOMPoint polyfill
if (typeof globalThis.DOMPoint === 'undefined') {
    (globalThis as any).DOMPoint = class DOMPoint {
        x: number; y: number; z: number; w: number;
        constructor(x = 0, y = 0, z = 0, w = 1) {
            this.x = x; this.y = y; this.z = z; this.w = w;
        }
        static fromPoint(o?: any) { return new DOMPoint(o?.x, o?.y, o?.z, o?.w); }
        toJSON() { return { x: this.x, y: this.y, z: this.z, w: this.w }; }
    };
    (globalThis as any).DOMPointReadOnly = (globalThis as any).DOMPoint;
}

console.log('✅ [ServerPolyfills] Loaded: DOMMatrix, Path2D, ImageData, DOMPoint');

export {};