// Isolated test double for the Google API surface used by the PRODUCTION renderer.
// Never imported by production src. This is not a map provider or a visual map reference.
const registry = new WeakMap();
const instances = [];
const polygons = [];
const polylines = []; // Test-only inspection of history route lifecycle.
const event = {
  addListener(obj, name, fn) { if (!registry.has(obj)) registry.set(obj, new Map()); const events = registry.get(obj); if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); return { remove: () => events.get(name).delete(fn) }; },
  addListenerOnce(obj, name, fn) { const l = this.addListener(obj, name, (...args) => { l.remove(); fn(...args); }); return l; },
  trigger(obj, name, ...args) { for (const fn of registry.get(obj)?.get(name) || []) fn(...args); }
};
class LatLng {
  constructor(lat, lng) { if (typeof lat === 'object') { this.latitude = lat.lat; this.longitude = lat.lng; } else { this.latitude = lat; this.longitude = lng; } }
  lat() { return this.latitude; } lng() { return this.longitude; }
  toJSON() { return { lat: this.lat(), lng: this.lng() }; }
}
class LatLngBounds { constructor() { this.points = []; } extend(p) { this.points.push(p instanceof LatLng ? p.toJSON() : p); return this; } }
class TestMap {
  constructor(node, options) {
    this.node = node; this.options = options; this.center = new LatLng(options.center); this.zoom = options.zoom; this.heading = 0; this.tilt = 0; this.mapTypeId = options.mapTypeId; this.overlays = new Set(); this.calls = [];
    this.pane = document.createElement('div'); this.pane.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    node.style.background = 'repeating-linear-gradient(0deg,transparent,transparent 79px,#d9e0d4 80px),repeating-linear-gradient(90deg,#eef0e9,#eef0e9 79px,#d9e0d4 80px)';
    node.append(this.pane);
    const attribution = document.createElement('div'); attribution.className = 'test-attribution'; attribution.textContent = 'Testovací mapový adaptér · bez Google podkladu'; attribution.style.cssText = 'position:absolute;bottom:2px;right:4px;font:11px sans-serif;color:#465244;background:#fff;'; node.append(attribution);
    instances.push(this); this.draw();
    let drag;
    node.addEventListener('pointerdown', e => { if (e.target.closest('button,select')) return; drag = { x:e.clientX,y:e.clientY,center:this.center }; event.trigger(this,'dragstart'); });
    node.addEventListener('pointermove', e => { if (!drag) return; const scale=this.scale(); this.center=new LatLng(drag.center.lat()+(e.clientY-drag.y)/scale,drag.center.lng()-(e.clientX-drag.x)/scale); this.draw(false); });
    const end=()=>{if(drag){drag=null;this.draw();}}; node.addEventListener('pointerup',end);node.addEventListener('pointerleave',end);
    node.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.zoom+(e.deltaY<0?1:-1));},{passive:false});
  }
  scale() { return 256 * 2 ** this.zoom / 360; }
  getCenter() { return this.center; } getZoom() { return this.zoom; } getHeading() { return this.heading; } getTilt() { return this.tilt; } getMapTypeId() { return this.mapTypeId; }
  setOptions(options) { Object.assign(this.options,options); }
  setHeading(value) { this.heading=value;this.calls.push(['heading',value]); } setTilt(value) { this.tilt=value;this.calls.push(['tilt',value]); }
  setMapTypeId(value) { this.mapTypeId=value;this.calls.push(['layer',value]); }
  panTo(value) { this.center=new LatLng(value);this.calls.push(['panTo',value]);this.draw(); }
  panBy(x,y) { const scale=this.scale();this.center=new LatLng(this.center.lat()-y/scale,this.center.lng()+x/scale);this.calls.push(['panBy',x,y]);this.draw(); }
  setZoom(value) { this.zoom=Math.max(1,Math.min(21,value));this.calls.push(['zoom',this.zoom]);event.trigger(this,'zoom_changed');this.draw(); }
  moveCamera(options) { this.center=new LatLng(options.center);this.zoom=options.zoom;this.heading=options.heading;this.tilt=options.tilt;this.calls.push(['fit',options]);event.trigger(this,'zoom_changed');this.draw(); }
  fitBounds(bounds,padding) {
    const ps=bounds.points; if(!ps.length)return; const minLat=Math.min(...ps.map(p=>p.lat)),maxLat=Math.max(...ps.map(p=>p.lat)),minLng=Math.min(...ps.map(p=>p.lng)),maxLng=Math.max(...ps.map(p=>p.lng));
    this.center=new LatLng((minLat+maxLat)/2,(minLng+maxLng)/2);
    const scale=Math.min((this.node.clientWidth-padding*2)/Math.max(.001,maxLng-minLng),(this.node.clientHeight-padding*2)/Math.max(.001,maxLat-minLat));
    this.zoom=Math.min(20,Math.max(1,Math.log2(scale*360/256)));this.calls.push(['fit',ps.length]);event.trigger(this,'zoom_changed');this.draw();
  }
  draw(idle=true) { this.overlays.forEach(o=>o.draw());if(idle) {clearTimeout(this.idle);this.idle=setTimeout(()=>event.trigger(this,'idle'),16);} }
  projection() { return { fromLatLngToContainerPixel:p=>({x:this.node.clientWidth/2+(p.lng()-this.center.lng())*this.scale(),y:this.node.clientHeight/2-(p.lat()-this.center.lat())*this.scale()}),fromLatLngToDivPixel:p=>({x:this.node.clientWidth/2+(p.lng()-this.center.lng())*this.scale(),y:this.node.clientHeight/2-(p.lat()-this.center.lat())*this.scale()}) }; }
}
class OverlayView {
  setMap(map) { if(this.map){this.map.overlays.delete(this);this.onRemove();}this.map=map;if(map){map.overlays.add(this);this.onAdd();this.draw();map.draw();} }
  getProjection(){return this.map?.projection();} getPanes(){return {overlayMouseTarget:this.map.pane};}
  static preventMapHitsAndGesturesFrom(){}
}
class Polyline { constructor(options){this.options=options;this.map=options.map;polylines.push(this);}setMap(map){this.map=map;} }
class Polygon { constructor(options){this.options=options;this.map=options.map;polygons.push(this);}setMap(map){this.map=map;} }
export const testMaps={ Map:TestMap,LatLng,LatLngBounds,OverlayView,Polyline,Polygon,event,RenderingType:{RASTER:'RASTER'},MapTypeId:{ROADMAP:'roadmap',HYBRID:'hybrid'},_instances:instances, _polylines:polylines, _polygons:polygons };
