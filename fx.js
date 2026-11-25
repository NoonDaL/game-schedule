/* 게임 일정 v2: 홈 상단 셰이더 배경.
   참고: scrollshaders.com 의 'Ember Bloom' 같은 따뜻한 빛 번짐. 셰이더 코드는 직접 작성했다
   (도메인 워핑 fbm 노이즈 + 그레인). 의존성 없음.
   - 화면 밖이거나 탭이 숨겨지면 멈춘다 (배터리·발열).
   - 움직임 줄이기 설정이면 한 장면만 그리고 멈춘다.
   - WebGL 이 없으면 아무것도 안 한다. CSS 빛 번짐(.hero::before)이 그대로 남는다. */
(() => {
  "use strict";
  const host = document.querySelector("[data-shader]");
  if (!host) return;
  const canvas = document.createElement("canvas");
  canvas.className = "shader";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return;

  const vert = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const frag = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLight;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x),
             mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= .5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  // 낮은 주파수: 무늬가 아니라 번지는 빛이어야 한다. 1.5 에선 대리석 결처럼 촘촘했다.
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.) * .55;
  float t = uTime * .025;
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p + 2.2 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.2 * r);

  vec3 dark  = vec3(.047, .047, .059);
  vec3 light = vec3(.953, .949, .937);
  vec3 base  = mix(dark, light, uLight);
  vec3 ember = vec3(1., .5, .24);
  vec3 rose  = vec3(1., .30, .52);
  vec3 cobalt = vec3(.34, .44, 1.);

  vec3 glow = mix(ember, rose, smoothstep(.25, .85, q.x));
  glow = mix(glow, cobalt, smoothstep(.45, .95, r.y) * .55);
  float amt = smoothstep(.18, .78, f);
  // 아래로 갈수록 페이지 바탕으로 녹인다. 경계선이 보이면 안 된다.
  amt *= smoothstep(.0, .5, uv.y) * mix(1., .6, uLight);
  vec3 col = mix(base, glow, amt);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - .5) * mix(.05, .03, uLight);
  gl_FragColor = vec4(col, 1.);
}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  const vs = shader(gl.VERTEX_SHADER, vert), fs = shader(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uLight = gl.getUniformLocation(prog, "uLight");

  host.prepend(canvas);
  host.classList.add("has-shader");

  const lightQ = matchMedia("(prefers-color-scheme: light)");
  const reduceQ = matchMedia("(prefers-reduced-motion: reduce)");
  // 해상도는 1/3 로 그린다. 흐릿한 빛이라 차이가 안 보인다. 절반일 때 사용자 화면에서
  // FPS 가 19~30 까지 떨어졌다 — 픽셀 수가 절반의 0.44배가 된다.
  const SCALE = 0.34;
  // 빛은 천천히 움직이므로 초당 30번이면 충분하다. 매 프레임 그리면 GPU 를 쓸데없이 쓴다.
  const FRAME_MS = 1000 / 30;
  let last = 0;

  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * SCALE));
    const h = Math.max(1, Math.floor(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  }

  const t0 = performance.now();
  let raf = 0, visible = true;
  function draw(now) {
    resize();
    gl.uniform1f(uLight, lightQ.matches ? 1 : 0);
    gl.uniform1f(uTime, reduceQ.matches ? 14 : (now - t0) / 1000 + 14);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    if (now - last >= FRAME_MS) { last = now; draw(now); }
    raf = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (reduceQ.matches) { draw(performance.now()); return; }   // 한 장면만
    if (visible && !document.hidden) raf = requestAnimationFrame(loop);
  }
  new IntersectionObserver(([it]) => { visible = it.isIntersecting; sync(); }).observe(host);
  document.addEventListener("visibilitychange", sync);
  reduceQ.addEventListener("change", sync);
  lightQ.addEventListener("change", () => draw(performance.now()));
  new ResizeObserver(() => draw(performance.now())).observe(canvas);
  sync();
})();
