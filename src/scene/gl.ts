/*
 * A few lines of WebGL2 in place of three.js: every scene on the site is a stack of
 * fullscreen shader passes, so all we need is programs, render targets and one quad.
 *
 * The shaders are written in three's dialect (GLSL1 names, `position` / `uv` attributes);
 * the prefixes below are the ones three adds when it runs them on WebGL2.
 */

const VERT_PREFIX = `#version 300 es
precision highp float;
precision highp int;
#define attribute in
#define varying out
#define texture2D texture
in vec3 position;
in vec2 uv;
`

const FRAG_PREFIX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
`

type ParallelCompile = { COMPLETION_STATUS_KHR: number }

export interface Program {
  readonly handle: WebGLProgram
  /** Compiled and linked. With KHR_parallel_shader_compile this never blocks the main thread. */
  ready(): boolean
  use(): void
  u1f(name: string, x: number): void
  u2f(name: string, x: number, y: number): void
  u3f(name: string, x: number, y: number, z: number): void
  u4f(name: string, x: number, y: number, z: number, w: number): void
  u1i(name: string, x: number): void
  u1fv(name: string, v: Float32Array | number[]): void
  u3fv(name: string, v: Float32Array | number[]): void
  uMat3(name: string, columnMajor: Float32Array | number[]): void
  dispose(): void
}

export interface Target {
  fb: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

interface TargetOptions {
  /** RGBA16F instead of RGBA8 (HDR). */
  half?: boolean
  mipmaps?: boolean
  repeatS?: boolean
  anisotropy?: number
}

export class GL {
  readonly gl: WebGL2RenderingContext
  readonly parallel: ParallelCompile | null
  /** Half-float render targets are renderable (needed for HDR + bloom). */
  readonly hdr: boolean
  readonly maxAnisotropy: number
  private anisoExt: { TEXTURE_MAX_ANISOTROPY_EXT: number } | null
  private vao: WebGLVertexArrayObject
  private buffers: WebGLBuffer[] = []
  private targetOptions = new WeakMap<Target, TargetOptions>()

  constructor(canvas: HTMLCanvasElement, attributes: WebGLContextAttributes = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      // no context if the browser would draw it in software (a blocklisted or missing GPU)
      failIfMajorPerformanceCaveat: true,
      ...attributes,
    })
    if (!gl) throw new Error('WebGL2 unavailable, or only in software')
    // …and none on a software renderer the browser doesn't flag (Mesa's llvmpipe on Linux VMs and
    // driverless machines, SwiftShader, Windows' Basic Render Driver): the ray tracing would take
    // seconds a frame and stall the page. The callers fall back to their CSS stand-ins.
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    if (/swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i.test(renderer)) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      throw new Error(`WebGL2 is software-rendered here (${renderer})`)
    }
    this.gl = gl
    this.parallel = gl.getExtension('KHR_parallel_shader_compile') as ParallelCompile | null
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
    this.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic')
    this.maxAnisotropy = this.anisoExt ? (gl.getParameter(0x84ff /* MAX_TEXTURE_MAX_ANISOTROPY_EXT */) as number) : 1

    // one quad for every pass: position at location 0, uv at 1
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const attribute = (location: number, data: number[]) => {
      const buffer = gl.createBuffer()!
      this.buffers.push(buffer)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    }
    attribute(0, [-1, -1, 1, -1, -1, 1, 1, 1])
    attribute(1, [0, 0, 1, 0, 0, 1, 1, 1])
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
  }

  program(vertex: string, fragment: string, defines: Record<string, number> = {}): Program {
    const { gl, parallel } = this
    const header = Object.entries(defines)
      .map(([k, v]) => `#define ${k} ${v}\n`)
      .join('')
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      return s
    }
    const vs = shader(gl.VERTEX_SHADER, VERT_PREFIX + header + vertex)
    const fs = shader(gl.FRAGMENT_SHADER, FRAG_PREFIX + header + fragment)
    const handle = gl.createProgram()!
    gl.attachShader(handle, vs)
    gl.attachShader(handle, fs)
    gl.bindAttribLocation(handle, 0, 'position')
    gl.bindAttribLocation(handle, 1, 'uv')
    gl.linkProgram(handle)

    let linked = false
    const locations = new Map<string, WebGLUniformLocation | null>()
    const at = (name: string) => {
      let l = locations.get(name)
      if (l === undefined) {
        l = gl.getUniformLocation(handle, name)
        locations.set(name, l)
      }
      return l
    }

    return {
      handle,
      ready() {
        if (linked) return true
        if (parallel && !gl.getProgramParameter(handle, parallel.COMPLETION_STATUS_KHR)) return false
        if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
          const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(handle)
          throw new Error(`shader failed to compile: ${log}`)
        }
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        linked = true
        return true
      },
      use: () => gl.useProgram(handle),
      u1f: (n, x) => gl.uniform1f(at(n), x),
      u2f: (n, x, y) => gl.uniform2f(at(n), x, y),
      u3f: (n, x, y, z) => gl.uniform3f(at(n), x, y, z),
      u4f: (n, x, y, z, w) => gl.uniform4f(at(n), x, y, z, w),
      u1i: (n, x) => gl.uniform1i(at(n), x),
      u1fv: (n, v) => gl.uniform1fv(at(n), v),
      u3fv: (n, v) => gl.uniform3fv(at(n), v),
      uMat3: (n, m) => gl.uniformMatrix3fv(at(n), false, m),
      dispose: () => gl.deleteProgram(handle),
    }
  }

  target(w: number, h: number, options: TargetOptions = {}): Target {
    const { gl } = this
    const tex = gl.createTexture()!
    const fb = gl.createFramebuffer()!
    const t: Target = { fb, tex, w: 0, h: 0 }
    this.targetOptions.set(t, options)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (this.anisoExt && options.anisotropy && options.anisotropy > 1) {
      gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, options.anisotropy)
    }
    this.resize(t, w, h)
    return t
  }

  resize(t: Target, w: number, h: number) {
    if (t.w === w && t.h === h) return
    const { gl } = this
    const half = this.targetOptions.get(t)?.half && this.hdr
    t.w = w
    t.h = h
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Point the next draw at a target (or the canvas), covering all of it. */
  bind(t: Target | null, width = 0, height = 0) {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null)
    gl.viewport(0, 0, t ? t.w : width, t ? t.h : height)
  }

  texture(unit: number, t: Target) {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
  }

  mipmaps(t: Target) {
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.generateMipmap(gl.TEXTURE_2D)
  }

  draw() {
    const { gl } = this
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  disposeTarget(t: Target) {
    this.gl.deleteTexture(t.tex)
    this.gl.deleteFramebuffer(t.fb)
  }

  dispose() {
    const { gl } = this
    this.buffers.forEach((b) => gl.deleteBuffer(b))
    gl.deleteVertexArray(this.vao)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
