// === Map Drawing Logic ===

class MapEditor {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.regions = [];
    this.currentPoints = [];
    this.hovering = false;
    this.CLOSE_THRESHOLD = 15;
    
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.canvas.addEventListener('click', (e) => this._onClick(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    for (const region of this.regions) {
      region.points = region.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
      region.center = this._centroid(region.points);
    }
    this.currentPoints = this.currentPoints.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
    this.canvas.width = Math.round(rect.width);
    this.canvas.height = Math.round(rect.height);
    this.render();
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _onClick(e) {
    const pos = this._getPos(e);
    
    // Check if closing the polygon
    if (this.currentPoints.length >= 3) {
      const first = this.currentPoints[0];
      const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
      if (dist < this.CLOSE_THRESHOLD) {
        this._finishRegion();
        return;
      }
    }
    
    this.currentPoints.push(pos);
    this.render();
    this._updateStatus();
  }

  _onMouseMove(e) {
    if (this.currentPoints.length < 3) return;
    const pos = this._getPos(e);
    const first = this.currentPoints[0];
    const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
    const wasHovering = this.hovering;
    this.hovering = dist < this.CLOSE_THRESHOLD;
    if (wasHovering !== this.hovering) {
      this.canvas.style.cursor = this.hovering ? 'pointer' : 'crosshair';
      this.render();
    }
  }

  _finishRegion() {
    const name = document.getElementById('region-name').value.trim() || `Region ${this.regions.length + 1}`;
    const color = document.getElementById('region-color').value;
    
    this.regions.push({
      name,
      color,
      points: [...this.currentPoints],
      center: this._centroid(this.currentPoints)
    });
    
    this.currentPoints = [];
    this.hovering = false;
    this.canvas.style.cursor = 'crosshair';
    
    // Reset name input, cycle color
    document.getElementById('region-name').value = '';
    document.getElementById('region-color').value = this._nextColor();
    
    this.render();
    this._updateStatus();
  }

  _centroid(points) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    return { x: cx, y: cy };
  }

  _nextColor() {
    const palette = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ec407a', '#26c6da', '#ff7043'];
    return palette[this.regions.length % palette.length];
  }

  undoPoint() {
    if (this.currentPoints.length > 0) {
      this.currentPoints.pop();
      this.render();
      this._updateStatus();
    }
  }

  clear() {
    this.regions = [];
    this.currentPoints = [];
    this.render();
    this._updateStatus();
  }

  _updateStatus() {
    const status = document.getElementById('map-status');
    if (this.currentPoints.length === 0 && this.regions.length === 0) {
      status.textContent = 'Click on the canvas to draw region boundaries. Close a polygon by clicking near the first point.';
    } else if (this.currentPoints.length > 0) {
      status.textContent = `Drawing: ${this.currentPoints.length} points. ${this.currentPoints.length >= 3 ? 'Click near the first point to close.' : 'Keep clicking to add points.'}`;
    } else {
      status.textContent = `${this.regions.length} region${this.regions.length !== 1 ? 's' : ''} defined. Draw more or start the simulation.`;
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);
    
    // Grid
    ctx.strokeStyle = '#1a1a3a';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    
    // Completed regions
    for (const region of this.regions) {
      this._drawRegion(region.points, region.color, region.name, region.center);
    }
    
    // Current drawing
    if (this.currentPoints.length > 0) {
      const color = document.getElementById('region-color').value;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(this.currentPoints[0].x, this.currentPoints[0].y);
      for (let i = 1; i < this.currentPoints.length; i++) {
        ctx.lineTo(this.currentPoints[i].x, this.currentPoints[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Points
      for (const p of this.currentPoints) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // First point highlight when hovering
      if (this.hovering && this.currentPoints.length >= 3) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.currentPoints[0].x, this.currentPoints[0].y, this.CLOSE_THRESHOLD, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  _drawRegion(points, color, name, center) {
    const ctx = this.ctx;
    
    // Fill
    ctx.fillStyle = color + '44';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Label
    if (center) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, center.x, center.y);
    }
  }

  getRegions() {
    return this.regions.map(r => ({
      name: r.name,
      color: r.color,
      points: r.points,
      center: r.center
    }));
  }
}
