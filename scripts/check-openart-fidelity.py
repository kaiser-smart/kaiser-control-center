"""Compare source pixels to rendered SVGs; no artwork is modified."""
import argparse, json
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw
p=argparse.ArgumentParser();p.add_argument('review',type=Path);args=p.parse_args();root=args.review
rows=[]
def masks(a):
    b,g,r=[a[:,:,i].astype('int16') for i in range(3)]
    green=(g-r>25)&(g-b>30)&(r<210)
    return [(a.mean(axis=2)<150)&~green,green]
for item in json.loads((root/'provenance.json').read_text()):
    name=item['name'];source=cv2.imread(str(root/(name+'-source.png')));vector=cv2.imread(str(root/(name+'-vector.png')))
    layers=[]
    for a,b in zip(masks(source),masks(vector)):
        def edge(x):return x&~cv2.erode(x.astype('uint8'),np.ones((3,3),np.uint8)).astype(bool)
        ea,eb=edge(a),edge(b)
        da=cv2.distanceTransform((~ea).astype('uint8'),cv2.DIST_L2,5)
        db=cv2.distanceTransform((~eb).astype('uint8'),cv2.DIST_L2,5)
        distances=np.concatenate([da[eb],db[ea]])*24/512
        layers.append({'intersectionOverUnion':float((a&b).sum()/(a|b).sum()),'edge95At24px':float(np.quantile(distances,.95)),'edgeMaxAt24px':float(distances.max())})
    small=[]
    for size in [20,24,28]:
        a=cv2.resize(source,(size,size),interpolation=cv2.INTER_AREA).astype(float)
        b=cv2.resize(vector,(size,size),interpolation=cv2.INTER_AREA).astype(float)
        small.append({'size':size,'meanAbsoluteRgbDifference':float(np.abs(a-b).mean())})
    row={'name':name,'layers':layers,'smallSizes':small,'svgBytes':(root/(name+'.svg')).stat().st_size}
    rows.append(row)
    adjustment=item.get('vectorAdjustment')
    if adjustment:
        # Do not call an intentional width correction a pixel-identical trace.
        assert name=='pause' and adjustment['type']=='measured-straight-bars-uniform-width'
        import xml.etree.ElementTree as ET
        rects=ET.fromstring((root/(name+'.svg')).read_text()).findall('.//{http://www.w3.org/2000/svg}rect')
        assert len(rects)==2
        for rect,bar in zip(rects,adjustment['bars']):
            x,y,w,h,rx=[float(rect.get(k)) for k in ['x','y','width','height','rx']]
            x0,y0,x1,y1=bar['sourceBoundsAt24']
            assert abs(w-1)<.0001 and abs(rx-.5)<.0001
            assert abs(x+w/2-(x0+x1)/2)<.0001
            assert abs(y-y0)<.0001 and abs(y+h-y1)<.0001
        row['validation']='explicit-width-normalization-axes-and-extents-preserved'
    else:
        assert all(layer['edge95At24px']<=.19 for layer in layers),(name,layers)
        assert all(result['meanAbsoluteRgbDifference']<=6 for result in small),(name,small)
        row['validation']='source-pixel-fidelity-passed'
traced=[r for r in rows if r['validation']=='source-pixel-fidelity-passed']
(root/'fidelity.json').write_text(json.dumps({'status':'passed','icons':len(rows),'pixelFidelityPassed':len(traced),'explicitWidthCorrections':len(rows)-len(traced),'method':'Symmetric contour distance for direct traces; explicit geometric axes, height and 1px width checks for the documented pause normalization. Raster source antialiasing and SVG antialiasing differ.','rows':rows},indent=2)+'\n')
for page in range((len(rows)+11)//12):
    entries=rows[page*12:(page+1)*12];sheet=Image.new('RGB',(1080,((len(entries)+2)//3)*205),'white');draw=ImageDraw.Draw(sheet)
    for i,row in enumerate(entries):
        x=(i%3)*360;y=(i//3)*205
        for j,suffix in enumerate(['source','vector']):
            im=Image.open(root/(row['name']+'-'+suffix+'.png'));im.thumbnail((165,165));sheet.paste(im,(x+j*175,y))
        draw.text((x+8,y+170),row['name']+' | OpenArt / SVG',fill='#243128')
    sheet.save(root/f'comparison-{page+1}.png')
print(json.dumps({'icons':len(rows),'pixelFidelityPassed':len(traced),'explicitWidthCorrections':len(rows)-len(traced),'worstTracedEdge95At24px':max(layer['edge95At24px'] for r in traced for layer in r['layers']),'maxTracedSmallRgbDifference':max(s['meanAbsoluteRgbDifference'] for r in traced for s in r['smallSizes']),'maxSvgBytes':max(r['svgBytes'] for r in rows),'status':'passed'}))
