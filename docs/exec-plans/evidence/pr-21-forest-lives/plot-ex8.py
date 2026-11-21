"""Render retained formal numeric evidence; requires matplotlib 3.11.2, not a simulator policy."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
out=Path(__file__).resolve().parent
data=json.loads((out/'formal-ex8-outcomes.json').read_text())
last=data['observedRounds']; events=[]; worlds=[]
for i in range(last+1):
 actors=[]
 for aid,series in data['actors'].items():
  row=series[i]; actors.append({'id':aid,'vitals':dict(zip(['health','satiety','energy','temperature'],row[1:5])),'wellbeing':dict(zip(['physical','mental','total'],row[5:8])),'life':{'deaths':row[8]}})
 worlds.append({'tick':i,'actors':actors})
colors={'lin':'#a46726','moss':'#27736c','sol':'#97516a'}
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#25483e','text.color':'#25483e','xtick.color':'#526b62','ytick.color':'#526b62','svg.fonttype':'none'})
fig,axes=plt.subplots(4,1,figsize=(12,10),sharex=True,layout='constrained');fig.set_facecolor('#f5f5ef')
for axis in axes:
 axis.set_facecolor('#fcfcf8');axis.grid(axis='y',color='#dfe4db',linewidth=.6);axis.set_xlim(0,last)
 for i in range(last//200+1):axis.axvspan(i*200,min(last,(i+1)*200),color=['#ecf1df','#fff1d2','#eee3d5','#dce8ee'][i%4],alpha=.3,zorder=0)
for aid,c in colors.items():
 points=[(w['tick'],next(a for a in w['actors'] if a['id']==aid)) for w in worlds];xs=[p[0] for p in points]
 for axis,key in zip(axes[:3],['health','satiety','temperature']):axis.plot(xs,[a['vitals'][key] for _,a in points],color=c,lw=1.4,label=aid.title())
 axes[3].plot(xs,[a['wellbeing']['total'] for _,a in points],color=c,lw=1.1)
 axes[3].plot(xs,[a['wellbeing']['mental'] for _,a in points],color=c,lw=.9,alpha=.75,ls='--')
for i,name in enumerate(['Health','Satiety','Body temperature','Experienced wellbeing']):axes[i].set_ylabel(name)
axes[0].set_ylim(0,105);axes[1].set_ylim(0,105);axes[2].set_ylim(0,32);axes[3].set_ylim(0,max(15,max(a['wellbeing']['total'] for w in worlds for a in w['actors'])+1))
axes[2].axhline(7,color='#9b5c55',lw=.8,ls=':');axes[2].text(2,7.6,'Cold injury boundary',fontsize=8,color='#9b5c55')
axes[3].axhline(10,color='#677a70',lw=.8,ls=':');axes[3].text(2,10.4,'Physical cap: 10',fontsize=8)
axes[-1].set_xlabel('Committed simulation round (model and development waiting time excluded)')
axes[0].legend(loc='lower left',ncol=3,frameon=False)
axes[3].legend(handles=[Line2D([0],[0],color='#526b62',label='Total'),Line2D([0],[0],color='#526b62',ls='--',label='Mental sources')],loc='upper right',ncol=2,frameon=False)
for i in range(last//200+1):axes[0].text((i*200+min(last,(i+1)*200))/2,102,['Spring','Summer','Autumn','Winter'][i%4],ha='center',fontsize=9)
for e in events:
 if e['type']=='died':
  for axis in axes:axis.axvline(e['tick'],color=colors[e['actor']],ls=':',alpha=.55,lw=.9)
fig.suptitle(f'Formal ex8 · {last} recorded rounds\nObserved states from one exploratory run; no causal treatment comparison',fontsize=15,weight='bold',ha='left',x=.06)
fig.savefig(out/'formal-ex8-outcomes.png',dpi=150)
fig.savefig(out/'formal-ex8-outcomes.svg')
