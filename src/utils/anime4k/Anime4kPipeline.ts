// Anime4K WebGL2 Multi-Pass Upscaler Pipeline
import { VERTEX_SHADER, RESTORE_FRAGMENT_SHADER, UPSCALE_FRAGMENT_SHADER } from './shaders';
import { createProgram, createTexture, createFramebuffer } from './glUtils';

export class Anime4kPipeline {
  private gl: WebGL2RenderingContext;
  private restoreProgram: WebGLProgram;
  private upscaleProgram: WebGLProgram;

  private quadVao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  private videoTexture: WebGLTexture | null = null;
  private intermediateTexture: WebGLTexture | null = null;
  private intermediateFbo: WebGLFramebuffer | null = null;

  private lastInputWidth = 0;
  private lastInputHeight = 0;
  private outputWidth = 1920;
  private outputHeight = 1080;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser.');
    }
    this.gl = gl;

    this.restoreProgram = createProgram(gl, VERTEX_SHADER, RESTORE_FRAGMENT_SHADER);
    this.upscaleProgram = createProgram(gl, VERTEX_SHADER, UPSCALE_FRAGMENT_SHADER);

    this.setupGeometry();
  }

  private setupGeometry() {
    const gl = this.gl;
    // Full screen quad (-1 to 1)
    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]);

    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Bind attribute pointer 0 (a_position)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private updateTexturesAndFbos(inWidth: number, inHeight: number) {
    const gl = this.gl;

    if (this.lastInputWidth === inWidth && this.lastInputHeight === inHeight) {
      return;
    }

    this.lastInputWidth = inWidth;
    this.lastInputHeight = inHeight;

    // Delete existing textures/FBOs if any
    if (this.videoTexture) gl.deleteTexture(this.videoTexture);
    if (this.intermediateTexture) gl.deleteTexture(this.intermediateTexture);
    if (this.intermediateFbo) gl.deleteFramebuffer(this.intermediateFbo);

    // Input texture from video
    this.videoTexture = createTexture(gl, inWidth, inHeight, gl.LINEAR);

    // Pass 1 target texture & FBO (native input resolution)
    this.intermediateTexture = createTexture(gl, inWidth, inHeight, gl.LINEAR);
    this.intermediateFbo = createFramebuffer(gl, this.intermediateTexture);
  }

  public setOutputSize(width: number, height: number) {
    this.outputWidth = width;
    this.outputHeight = height;
  }

  public renderFrame(video: HTMLVideoElement) {
    const gl = this.gl;
    const inWidth = video.videoWidth || 1280;
    const inHeight = video.videoHeight || 720;

    if (inWidth === 0 || inHeight === 0) return;

    this.updateTexturesAndFbos(inWidth, inHeight);

    // 1. Upload video frame to videoTexture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindVertexArray(this.quadVao);

    // --- Pass 1: Restore / Thin Lines (Render to intermediate FBO) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.intermediateFbo);
    gl.viewport(0, 0, inWidth, inHeight);
    gl.useProgram(this.restoreProgram);

    const restoreTexLoc = gl.getUniformLocation(this.restoreProgram, 'u_texture');
    const restoreSizeLoc = gl.getUniformLocation(this.restoreProgram, 'u_texSize');
    gl.uniform1i(restoreTexLoc, 0);
    gl.uniform2f(restoreSizeLoc, inWidth, inHeight);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- Pass 2: Upscale 2x & Push Gradients (Render to Canvas screen) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outputWidth, this.outputHeight);
    gl.useProgram(this.upscaleProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.intermediateTexture);

    const upscaleTexLoc = gl.getUniformLocation(this.upscaleProgram, 'u_texture');
    const upscaleSizeLoc = gl.getUniformLocation(this.upscaleProgram, 'u_texSize');
    gl.uniform1i(upscaleTexLoc, 0);
    gl.uniform2f(upscaleSizeLoc, inWidth, inHeight);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
  }

  public destroy() {
    const gl = this.gl;
    if (this.videoTexture) gl.deleteTexture(this.videoTexture);
    if (this.intermediateTexture) gl.deleteTexture(this.intermediateTexture);
    if (this.intermediateFbo) gl.deleteFramebuffer(this.intermediateFbo);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.quadVao) gl.deleteVertexArray(this.quadVao);
    if (this.restoreProgram) gl.deleteProgram(this.restoreProgram);
    if (this.upscaleProgram) gl.deleteProgram(this.upscaleProgram);
  }
}
