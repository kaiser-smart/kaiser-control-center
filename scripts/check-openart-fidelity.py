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
    assert all(layer['edge95At24px']<=.19 for layer in layers),(name,layers)
    assert all(result['meanAbsoluteRgbDifference']<=6 for result in small),(name,small)
(root/'fidelity.json').write_text(json.dumps({'status':'passed','icons':len(rows),'method':'Symmetric source/vector contour distance, normalized to a 24px icon; final colour palette fixed to approved hex values. Raster source antialiasing and SVG antialiasing differ.','rows':rows},indent=2)+'\n')
for page in range((len(rows)+11)//12):
    entries=rows[page*12:(page+1)*12];sheet=Image.new('RGB',(1080,((len(entries)+2)//3)*205),'white');draw=ImageDraw.Draw(sheet)
    for i,row in enumerate(entries):
        x=(i%3)*360;y=(i//3)*205
        for j,suffix in enumerate(['source','vector']):
            im=Image.open(root/(row['name']+'-'+suffix+'.png'));im.thumbnail((165,165));sheet.paste(im,(x+j*175,y))
        draw.text((x+8,y+170),row['name']+' | OpenArt / SVG',fill='#243128')
    sheet.save(root/f'comparison-{page+1}.png')
print(json.dumps({'icons':len(rows),'worstEdge95At24px':max(layer['edge95At24px'] for r in rows for layer in r['layers']),'maxSmallRgbDifference':max(s['meanAbsoluteRgbDifference'] for r in rows for s in r['smallSizes']),'maxSvgBytes':max(r['svgBytes'] for r in rows),'status':'passed'}))
