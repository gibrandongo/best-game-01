// input.js — mouse position / clicks and keyboard state, translated into
// canvas coordinates. One clear job: raw input, no game decisions.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = { x: -1, y: -1, inside: false };
    this.clicked = null;      // {x, y, button} consumed once per frame
    this.rightClicked = null;
    this.keys = new Set();    // currently held codes
    this.pressed = new Set(); // codes pressed since last consume
    this._bind();
  }

  _toCanvas(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height),
    };
  }

  _bind() {
    this.canvas.addEventListener("mousemove", (e) => {
      const p = this._toCanvas(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = true;
    });
    this.canvas.addEventListener("mouseleave", () => { this.mouse.inside = false; });
    this.canvas.addEventListener("mousedown", (e) => {
      const p = this._toCanvas(e);
      if (e.button === 2) this.rightClicked = p;
      else this.clicked = { x: p.x, y: p.y, button: e.button };
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = null;
    return c;
  }
  consumeRightClick() {
    const c = this.rightClicked;
    this.rightClicked = null;
    return c;
  }
  consumePressed() {
    const p = this.pressed;
    this.pressed = new Set();
    return p;
  }
}
