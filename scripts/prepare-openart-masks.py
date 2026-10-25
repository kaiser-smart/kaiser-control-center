"""Trace actual OpenArt pixels, never reconstruct icon geometry by hand.

Requires Pillow, numpy and opencv-python-headless.
Input is the saved OpenArt manifest, generation readbacks and source PNGs.
Only background removal, palette normalization and uniform scaling are applied.
"""
import argparse, hashlib, json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

parser=argparse.ArgumentParser()
parser.add_argument('sources',type=Path)
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parent.parent)
args=parser.parse_args()
recorded=json.loads((args.repo/'docs/openart-source-input.json').read_text())
manifest=recorded['manifest']
generations={x['historyId']:x for x in recorded['generations']}
review=args.sources/'review';review.mkdir(parents=True,exist_ok=True)
provenance=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def clean(mask):
    count,labels,stats,_=cv2.connectedComponentsWithStats(mask.astype('uint8'),8)
    keep=np.zeros(count,dtype=bool)
    keep[1:]=stats[1:,cv2.CC_STAT_AREA]>=8
    return keep[labels]
for item in manifest['reused']+manifest['submitted']:
    name=item['name'];generation=generations[item['historyId']]
    assert generation['status']=='COMPLETED' and not generation.get('warning'),name
    source=args.sources/'sources'/(item['historyId']+'.png')
    image=Image.open(source).convert('RGB');w,h=image.size;crop=(0,0,w,h)
    if 'cell' in item:
        column=(item['cell']-1)%3;row=(item['cell']-1)//3
        crop=(column*w//3,row*h//2,(column+1)*w//3,(row+1)*h//2)
        image=image.crop(crop)
    rgb=np.array(image).astype('int16');r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    green=clean((g-r>25)&(g-b>30)&(r<210))
    dark=clean((rgb.mean(axis=2)<150)&~green)
    foreground=dark|green;ys,xs=np.where(foreground);assert len(xs)>100 and green.sum()>20,name
    bounds=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
    x0,y0,x1,y1=bounds;side=max(x1-x0,y1-y0)*1.2
    ox=(x0+x1-side)/2;oy=(y0+y1-side)/2;scale=24/side
    transform=f'matrix({scale:.8f} 0 0 {scale:.8f} {-ox*scale:.6f} {-oy*scale:.6f})'
    matrix=np.array([[384/side,0,-ox*384/side],[0,384/side,-oy*384/side]],dtype=float)
    normalized_masks=[cv2.warpAffine(layer.astype('uint8')*255,matrix,(384,384),flags=cv2.INTER_LINEAR)>127 for layer in [dark,green]]
    for channel,layer in zip(['graphite','green'],normalized_masks):
        Image.fromarray(np.where(layer,0,255).astype('uint8')).save(review/(name+'-'+channel+'-mask.png'))
    # Same uniform framing for the untouched raster and the vector preview.
    normalized=image.transform((512,512),Image.Transform.AFFINE,(side/512,0,ox,0,side/512,oy),Image.Resampling.BICUBIC,fillcolor='white')
    normalized.save(review/(name+'-source.png'))
    provenance.append({'name':name,'historyId':item['historyId'],'resourceId':generation['resources'][0]['id'],'sourceUrl':generation['resources'][0]['url'],'sourceSha256':sha(source),'sourceFile':'sources/'+source.name,'cellCrop':crop,'foregroundBounds':bounds,'transform':transform,'svgFile':'public/icons/ui/'+name+'.svg','userApprovedExact':name in manifest['approvedReference']['scope'],'conversion':'Potrace 2.1.8 on two 384px source colour masks, alphaMax 1, optTolerance 0.2; uniform scale to 24px; no hand-authored geometry','maskPixels':{'graphite':int(dark.sum()),'green':int(green.sum())}})
    print(name,flush=True)
(review/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
# Inspection contact sheets: every source remains separate in review/.
for page in range(3):
    entries=provenance[page*24:(page+1)*24]
    sheet=Image.new('RGB',(1200,((len(entries)+5)//6)*210),'white');draw=ImageDraw.Draw(sheet)
    for i,p in enumerate(entries):
        thumb=Image.open(review/(p['name']+'-source.png'));thumb.thumbnail((175,175))
        x=(i%6)*200;y=(i//6)*210;sheet.paste(thumb,(x+12,y));draw.text((x+12,y+178),p['name'],fill='#243128')
    sheet.save(review/f'sources-{page+1}.png')
print('Prepared',len(provenance),'OpenArt source masks.')
