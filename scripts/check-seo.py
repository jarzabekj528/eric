"""Offline regression checks. Run: npm run check (Python 3 standard library)."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://www.saywhencontracting.com'
class Page(HTMLParser):
    def __init__(self,text):
        super().__init__(convert_charrefs=True);self.tags=[];self.ids=[];self.ld=[];self.in_ld=False;self.chunk='';self.title='';self.in_title=False;self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.tags.append((tag,a))
        if 'id' in a:self.ids.append(a['id'])
        if tag=='script' and a.get('type')=='application/ld+json':self.in_ld=True;self.chunk=''
        if tag=='title':self.in_title=True
    def handle_endtag(self,tag):
        if tag=='script' and self.in_ld:self.ld.append(json.loads(self.chunk));self.in_ld=False
        if tag=='title':self.in_title=False
    def handle_data(self,data):
        if self.in_ld:self.chunk+=data
        if self.in_title:self.title+=data
    def find(self,tag,**attrs):return [a for t,a in self.tags if t==tag and all(a.get(k)==v for k,v in attrs.items())]
pages={p:Page(p.read_text()) for p in ROOT.rglob('*.html') if not any(x in p.parts for x in ['node_modules','.git','.wrangler','dist'])}
errors=[]
def check(value,msg):
    if not value:errors.append(msg)
sitemap=ET.parse(ROOT/'sitemap.xml')
urls=[el.text for el in sitemap.findall('.//{*}loc')]
titles=set();descs=set();links=0
for file,p in pages.items():
    rel=str(file.relative_to(ROOT)); indexed=file.name not in ['404.html','thank-you.html']
    check(len(p.find('h1'))==1,rel+': exactly one H1')
    check(len(p.find('main'))==1,rel+': exactly one main')
    check(len(p.ids)==len(set(p.ids)),rel+': duplicate IDs')
    if indexed:
        canonical=p.find('link',rel='canonical');check(len(canonical)==1,rel+': canonical count')
        url=canonical[0].get('href','') if canonical else ''
        check(url in urls,rel+': missing sitemap entry')
        check(p.title not in titles,rel+': duplicate title');titles.add(p.title)
        desc=p.find('meta',name='description')[0]['content'];check(desc not in descs,rel+': duplicate description');descs.add(desc)
        check(p.find('meta',property='og:url')[0]['content']==url,rel+': OG URL mismatch')
        check(bool(p.find('meta',name='twitter:card')),rel+': missing Twitter card')
        check(bool(p.ld),rel+': missing structured data')
        nodes=[n for g in p.ld for n in g.get('@graph',[g])]
        types=[n['@type'] for n in nodes]
        for typ in ['GeneralContractor','WebSite','WebPage']:check(typ in types,rel+': missing '+typ)
        if '/services/' in str(file):
            check('Service' in types and 'FAQPage' in types and 'BreadcrumbList' in types,rel+': incomplete service graph')
            targets=[a.get('href') for a in p.find('a')]
            for target in ['/contact/','/estimate/','/#gallery','/#reviews']:check(target in targets,rel+': missing '+target)
        for n in nodes:
            if n['@type']=='FAQPage':
                for q in n['mainEntity']:
                    check(bool(q['name']) and bool(q['acceptedAnswer']['text']),rel+': empty FAQ')
                    check(q['acceptedAnswer']['text'] in file.read_text().replace('&amp;','&').replace('&#x27;',"'"),rel+': FAQ not present in HTML')
            if n['@type']=='GeneralContractor':
                check(n['openingHoursSpecification']['opens']=='08:00',rel+': inconsistent hours')
                check('geo' not in n,rel+': unverified map coordinates')
    else:check('noindex' in p.find('meta',name='robots')[0]['content'],rel+': utility page must be noindex')
    check('YOUR_PLACE_ID' not in file.read_text(),rel+': placeholder review destination')
    for tag,a in p.tags:
        if tag=='img':
            check('alt' in a and a.get('width') and a.get('height'),rel+': missing image metadata')
        for key in ['href','src']:
            if key not in a:continue
            u=urlsplit(a[key]);
            if u.scheme in ['mailto','tel','sms','data','javascript'] or u.netloc and u.netloc!='www.saywhencontracting.com':continue
            if u.path.startswith('/api/'):continue
            target=(ROOT/unquote(u.path).lstrip('/')) if u.path.startswith('/') else file.parent/unquote(u.path)
            if not u.path:target=file
            elif target.is_dir():target=target/'index.html'
            elif not target.exists() and target.with_suffix('.html').exists():target=target.with_suffix('.html')
            check(target.exists(),rel+': missing local target '+a[key]);links+=1
            if u.fragment and target in pages:check(unquote(u.fragment) in pages[target].ids,rel+': missing fragment '+a[key])
        if 'srcset' in a:
            for candidate in a['srcset'].split(','):
                u=candidate.strip().split()[0];target=ROOT/u.lstrip('/') if u.startswith('/') else file.parent/u
                check(target.exists(),rel+': missing responsive image '+u)
check(len(urls)==len(titles),'Sitemap does not match indexable pages')
check(ORIGIN+'/sitemap.xml' in (ROOT/'robots.txt').read_text(),'robots sitemap origin mismatch')
check(not any('thank-you' in u or '404' in u for u in urls),'Utility URL in sitemap')
if errors:
    print('\n'.join(errors));raise SystemExit(1)
print(f'PASS: {len(pages)} HTML pages, {len(urls)} sitemap URLs, {links} local references; metadata, schema, images, landmarks and fragments valid.')
